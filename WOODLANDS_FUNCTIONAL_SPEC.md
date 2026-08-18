# WOODLANDS FUNCTIONAL SPEC — END-GOAL SYSTEM

*What the finished Woodlands system is: every module, screen, and rule at the target state. This is the build reference — Claude Code reads it to know what to build toward, not just what exists today.*

**Rewritten 9 August 2026** to the end goal. Supersedes the 31 May 2026 version (which described the pre-hardening single-tier build with roles that no longer exist).

**Updated 14 August 2026** — gate closed, role model built, two-tier inventory built, Movement Ledger built (`058` + data-ops/`006`). The corresponding [NEW]/[PROPOSED]/[BUG] markers below are flipped to [DONE]. Remaining [NEW] work: bar par levels, consumption attribution, rooms, QR attendance, Farmers Market taxonomy/waiting-list/fees, Events payments-editable + revenue.

**Scope source:** the Phase 2 additions below come from `WOODLANDS_MEETING_FEEDBACK_2026-07-27.md`. Where that doc and this one disagree, the meeting doc is the record of what Dhiren asked for; this doc is the build interpretation of it.

---

## STATUS LEGEND

Every feature below carries one marker:

- **[DONE]** — built and working today.
- **[BUG]** — built but broken; fix required.
- **[NEW]** — Phase 2, not yet built. This is the bulk of the remaining work.
- **[VERIFY]** — a claim carried from the old spec or a session note that has NOT been confirmed against the live code or DB. Do not trust it until probed.

The target for end of the week of 11 August: **every screen works on placeholder data.** Real data (bar stocktake, department stock lists, staff reconciliation, menus, real stallholder details) is explicitly out of scope until Dhiren verifies the system works. Blank screens fail the bar — every [NEW] table ships with placeholder seed as part of its own build step.

---

## 0. THE GATE — MIGRATION HISTORY RECONCILIATION [DONE — historical]

**✅ GATE CLOSED.** History reconciled and schema provably rebuildable from files: `001`–`050` rebuild-proven (run 4, 12 August); `051`–`057` re-proven (run 5, 14 August). Migration history now **`001`–`058`**. `db push` is trustworthy for new schema. **This section no longer blocks anything** — retained for provenance. The one live re-proof item: `058` is post-run-5 and owed a from-files rebuild before the next migration is written (see `WOODLANDS_STATE.md` §2.6). Full detail in `WOODLANDS_STATE.md` and `WOODLANDS_FOLLOWUPS.md`.

---

## 1. ROLES

### Role model — BUILT AND PROVEN [DONE] (migrations 037–044, 12 August)

Live roles: `owner`, `admin`, `department_head` (scoped by `user_profiles.department`), `hr`. The old `owner`/`manager`/`kitchen_manager`/`restaurant_manager` set no longer exists. Authoritative in `src/lib/roles.js`. The `staff` table (62 rows) is disjoint from login roles — it is the roster the manager-facing Attendance screens operate on, no FK to `user_profiles`.

The model implements the meeting requirement (owner, front-desk admin, multiple restaurant heads, one head per other department, HR) as **one `department_head` role scoped by the existing `department` field, not a role per department** — role-per-department is role explosion and can't cleanly express "Restaurant has three or four heads."

| Role | Who | Scope |
|---|---|---|
| `owner` | Dhiren | Everything, including event payment write. Except the Admin page (owner-only anyway). |
| `admin` | Rose, Secret (front desk) | Full access to all modules including event payment write, **except** the Admin page (owner-only). |
| `department_head` | Heads of Main Bar, Sports Bar, Kitchen, Restaurant, Housekeeping, Grounds, etc. | Scoped to their `user_profiles.department`: that department's sub-store, requisitions (raise + view own dept, cannot approve), stock. **No attendance scope.** **Multiple heads per department allowed.** |
| `hr` | Martin | Staff, roster, shifts, attendance. **Not** stock or revenue. |

Attendance is **admin + hr only** (plus owner) — no department-scoped attendance. The two bars (Main Bar, Sports Bar) are scoped independently.

Departments stay plain text, never FK to a departments table (standing rule).

### Route access — target

| Route | Roles |
|---|---|
| `/login`, `/checkin` (FM), `/attend` (staff QR) | Public |
| `/dashboard` | All authenticated |
| `/inventory` | owner, admin, department_head (own dept view) |
| `/attendance` | owner, admin, hr |
| `/events` | owner, admin |
| `/table-bookings` | owner, admin |
| `/farmers-market` | owner, admin |
| `/admin` | owner |

**[VERIFY]** the old spec claimed a GPS geofence on clock-in (100 m radius, `unverified` status). AUDIT (4 July) corroborates "GPS-flagged clock in/out," so it likely exists — but confirm against live code before relying on it, and decide how it coexists with QR check-in (§4).

**Known deferred surfaces (see FOLLOWUPS "PHASE 2 ROLE MODEL — deferred items"):** `hr` has `staff` write in RLS but no reachable UI (StaffTab lives under owner-only `/admin`); `RequisitionsTab` shows a head only their OWN requisitions where RLS now permits the whole department (fails closed, one-line fix); remaining `department_head` accounts (incl. a **Main Bar head**) deferred to real-data time with Rose.

---

## 2. NEW CROSS-CUTTING CONCEPTS

Three things Phase 2 introduces that don't map to a single existing module.

### 2.1 Two-tier inventory [DONE — foundation + issuing + transfers + RLS] (migrations 051–057)

One main store is the single inbound point — everything logged in on arrival. Stock then distributes out to departments as needed: **one inflow, many outflows.** Each department holds its own stock, consumed from its own dedicated list.

**Built and proven live (051–057):** a `location`/`sub_location` dimension on `current_stock` with a generated `tier` (`store`/`department`) and per-tier `reorder_level`; `'Main Store'` reserved, `'Laundry'` a Housekeeping sub-location; a guard trigger (`054`) rejecting any location that is not `'Main Store'` or a live department; the main store seeded (559 rows, placeholder 100); location-aware RPCs (`052`); `issue_stock` moving stock between any two locations atomically (`055`, store depletes); `transfer_stock` for department↔department (`057`, derives `issue`/`transfer` server-side); and the RLS pass (`056`) scoping heads on `current_stock.location` so a receiving department can *see* what it holds with zero cross-department leakage. Requisition Fulfil is wired to `issue_stock` (Main Store → requesting department).

**Deferred to the real-data session (see FOLLOWUPS "TWO-TIER INVENTORY — DEFERRED"):** catalogue dedupe (559 → 283; 276 products duplicated RBA/SBA, lossless suffix key exists) **and** the `stock_catalogue`/`stock_locations` table split, done as one data operation. `stock_items.department` is deprecated but still populated (no longer the location authority). Until dedupe runs, each product shows twice in the main store (559 store rows) — accepted deliberately; frame for Dhiren as placeholder-pending-stocktake.

### 2.2 Rooms [DONE] (migration 060, 18 August)

`rooms` — `room_number` (unique), name, `room_type` (**plain text, no CHECK**, same reasoning that keeps departments plain text), block, `is_active`, notes. RLS in the same migration: SELECT to every authenticated role (a room list is not sensitive, and the draw form needs it for `department_head`), write owner/admin, **no DELETE policy and no DELETE grant** — a room stock was consumed against is audit trail, so it is deactivated, never removed (`stock_movements.room_id` is `ON DELETE RESTRICT`). Seeded with 24 placeholders: 20 rooms across Block A / Block B / Cottages plus 4 public areas (`PUB-REST`, `PUB-POOL`, `PUB-CONF`, `PUB-LOBBY`). **Real room list still comes from Dhiren**; replacing the placeholders is one delete-and-insert. Managed from **Admin → Rooms**.

**Deliberately NOT wired to Table Bookings' "Private Room"** — that is a dining area for restaurant tables and shares no key with this list.

### 2.3 Consumption ledger [DONE] (migration 060, 18 August)

**`v_stock_consumption` — a VIEW, not a table**, `security_invoker = true`. Consumption is already recorded by two different acts, and a third table would have to be written by both paths and kept in step with both — the exact drift class `data-ops/003`, `004` and `006` each spent a session repairing. The view has no state to drift, and base-table RLS is its access control, so it carries no policy surface of its own.

- **Bar leg** — `bar_count_lines` where `system_qty > counted_qty`, on posted sessions. 059 established that a bar count IS a stock take (nothing deducts sales), so the count-vs-system delta IS the night's consumption. Bar consumption therefore appears with no one typing it in, and carries no room or staff member — correct, not missing data.
- **Draw leg** — `stock_movements` where `movement_type = 'consumption'`, carrying `room_id`, `consumed_by` and `sub_location`.

Three dimensions per FUNCTIONAL_SPEC: **what** (item + quantity), **where** (`from_department` + `sub_location` + room), **who** (`consumed_by` → `staff.id`, one of the 62-row roster). `consumed_by` and `performed_by` are two different people in two different tables and both are kept: a housekeeper has no login, so collapsing them would make "who" unanswerable for exactly the department that asked for it.

Written through **`record_consumption`** (SECURITY DEFINER, gated owner/admin or the head whose department IS the location; Main Store refused — the store issues stock, it does not consume it), which delegates the balance write to `apply_stock_delta` so there is one implementation of locking. `apply_stock_delta` was widened with `p_room_id` / `p_consumed_by` — a signature change, so drop-and-recreate, guarded in-migration on `proacl` equality and one-signature-in-`pg_proc`.

`staff_dept_select` added so a `department_head` can read their own department's roster for the "who" picker — without it the dropdown would be empty with no error.

**Still open:** the 12-month retention floor is **not yet enforced** — nothing prunes or archives, and nothing deletes either, so history is currently kept indefinitely (which satisfies the floor by accident, not by design). Revisit at real-data time.

---

## 3. INVENTORY MODULE

**File:** `src/pages/Inventory.jsx`
**Tabs:** Stock Levels · Log Delivery · Bar Count · Requisitions · Transfers · Adjustments · Consumption · Movement Ledger

### Existing tabs [DONE unless marked]

- **Stock Levels** — location filter (Main Store / department), columns Item/SKU/Location/Unit/Current Stock/Reorder/Status, "Low" badge when qty ≤ reorder. Read-only. *(An item with no `current_stock` row is invisible here, not shown as zero — any import must write a row per item.)*
- **Log Delivery** — Item/Qty/Supplier/Date/Received By/Notes; inserts `stock_movements` (delivery) and adds to `current_stock`.
- **Requisitions** — raise (Item/Dept/Qty/Reason); manager Approve → Reject → **Fulfil**. Stock deducts on **Fulfil only**, and Fulfil now issues Main Store → the requesting department via `issue_stock`. Non-managers see only their own (RLS permits own dept; UI is the narrower gate — one-line fix pending).
- **Transfers [DONE]** — `TransfersTab` calls `transfer_stock` (`057`), which delegates to `issue_stock` and moves real balances. `movement_type` derived server-side (`issue` if either end is Main Store, else `transfer`). The "doesn't deduct stock" bug (found 27 July) is closed and proven live.
- **Adjustments** — set new quantity; writes signed `stock_movements` (adjustment) + upserts `current_stock`.
- **Movement Ledger [DONE]** (`058` + data-ops/`006`, 14 August) — replaces the delivery-only Delivery Log. Shows all movement types with +/− direction; issue/transfer ±pairs collapse to one `From → To` line (positive magnitude); single-row types (delivery, adjustment, opening_balance, event_allocation, event_return) render as-is with signed quantity. Filters: Item · Type · Department · From/To date · Clear. The delivery-only view is the **Type = Delivery** preset (replaces the old tab's job). Columns: Date · Item · SKU · Type · From → To · Qty (+/−) · Performed By. `movement_type` CHECK is `_v4` (adds `event_allocation`/`event_return`); event confirm/return code re-typed off `adjustment`. Pair-collapse logic in `src/lib/ledger.js` (31/31 tests). **Open:** restore the delivery Supplier column (parked in a tooltip when the bogus From→To was suppressed).

### End-goal additions

- **Two-tier stock [DONE]** — per §2.1 (051–057). Per-department sub-stores, per-location balances, store→department issue recorded, RLS-scoped visibility.
- **Bar par levels + end-of-day cycle [DONE]** (`059`, 17 August) — **Bar Count** tab. Each bar holds a per-item minimum before opening, stored as `current_stock.par_level` (per item per location, beside the per-tier `reorder_level` from `051`; NULL = not on the cycle, so today only Main Bar and Sports Bar). Nightly: the count sheet opens **pre-filled with the system balance** for every par-managed item; the bartender corrects what they counted; **Post Count** does everything in one server-side transaction — reconciles each balance to the counted number (a stock take: nothing deducts sales, so the balance is fiction between counts and the delta IS the night's consumption), stamps each line with system qty / par / shortfall, and raises a **pre-filled** refill requisition per short item (`source='par_refill'`, `status='pending'`, tagged with the count session). Requisitions groups those into a **Bar Refills** panel with Approve all / Fulfil all; fulfil issues Main Store → bar through the existing `issue_stock` path. Tables: `bar_count_sessions`, `bar_count_lines`. RPCs: `post_bar_count` (SECURITY DEFINER, gated to owner/admin or the head whose department IS the location), `fulfil_requisition_batch` (INVOKER, one transaction, a store-short line is skipped and named rather than aborting the refill). Par quantities are placeholder (2× catalogue reorder) until the bar heads supply real ones. **Proven live as the roles, 19/19 scenarios, rolled back.**
- **Consumption attribution [DONE]** (`060`, 18 August) — per §2.3. A new **Consumption** tab: a draw form (location → sub-location → item, with the item list narrowed to what that location actually holds, plus room, staff member, quantity, reason) writing through `record_consumption`, above a ledger reading `v_stock_consumption` with filters for department, room, item, staff and date range. Both legs render in one list, badged **Draw** or **Bar count**. A `department_head` sees only their own department's consumption and only their own roster in the "who" picker — enforced by RLS, not by the UI. Placeholder Housekeeping catalogue shipped in the same migration (7 items at Main Store, Housekeeping and Housekeeping/Laundry), or the tab would ship empty for the one department that asked for it.

**[DONE 18 Aug]** `stock_movements.movement_type` CHECK is `..._check_v5`, permitting `delivery/transfer/adjustment/requisition/opening_balance/issue/event_allocation/event_return/consumption`. Widened in all three places in `060`: the table CHECK, `apply_stock_delta`'s allowlist, and `MOVEMENT_TYPES` in `src/lib/stock.js` — plus the Movement Ledger's own `TYPES` list, which is a fourth place that silently loses the *filter* (not the row) when it drifts.

---

## 4. ATTENDANCE MODULE

**File:** `src/pages/Attendance.jsx`

### Existing [DONE]

- **Clock In/Out** — states idle/working/break/done; live net hours. On Clock In, GPS compared to lodge coords (100 m); outside/unavailable → `unverified`; inside → `present`/`late` vs shift_start + late_threshold. **[VERIFY] the GPS behaviour against live code.**
- **Today** — Present/Late/Absent/Unverified/Not-arrived cards, department filter, Mark All Absent (after 11:00), Override, Note. Absence + coverage alerts. Access: owner, admin, hr.
- **History** (same access) — Daily and Weekly Summary views, filters, 14-day default.
- **Settings** (same access) — shift definitions per department (start/end/late threshold/days/type).

### End-goal additions

- **QR staff check-in [NEW]** — QR code per staff member, scanned at a **fixed on-premises station** (reception the obvious spot) at shift start/end. Scanner on site only → no remote check-in; combats lateness and no-shows. Scan writes clock-in/out; lateness computed vs roster; no scan by threshold after roster start → no-show flag. **Reuses the FM `public-checkin` pattern** (public endpoint, QR payload, scan writes a row). Confirm: does QR replace the manual clock-in flow or supplement it? Optional non-biometric hardening — capture a photo on scan to deter card-sharing (stores an image, doesn't match one) — offer, don't build unasked.

**Doctrine note:** the standing rule "manual clock in/out only" is superseded by the QR decision. QR is not biometrics, so no conflict there.

---

## 5. EVENTS MODULE

**File:** `src/pages/Events.jsx` · Access: owner, admin

### Existing [DONE unless marked]

- **Events List** — summary strip, status/deposit filters, sort, amber highlight for ≤7-day or confirmed-unpaid. View/Edit/Delete.
- **Create Event** — full form; new events `enquiry`, `deposit_paid=false`.
- **Event Detail** — status pipeline (enquiry→confirm→start→complete, cancel); info grid; **BEO checklists** auto-generated on confirm/in_progress, grouped by department, progress bars. Stock Allocations section: allocate on confirm (writes `event_allocation`, deducts department tier), return/clearance writes `event_return`.
- **Bill Section** — categorised line items, bill total.
- **Payments Section [BUG for edit]** — summary cards (Bill Total/Total Paid/Balance Due); add payment (Deposit/Balance/Additional/Refund); deposit auto-sets `deposit_paid`. `recorded_by` is written but not displayed.

### End-goal fixes

- **Payments tab editable [NEW]** — payments can be recorded but not corrected. Add edit; decide delete vs reversing-entry. If editable, surface `recorded_by` / last-amended-by (stops being cosmetic).
- **Revenue display [NEW — BLOCKED]** — "revenue should be different." Not specific enough to build. Three readings: recognise on payment received vs net-of-cost vs break-down-by-line. **Resolve with Dhiren** (point at the number on screen) or build toggleable and let him choose. Do not guess.

---

## 6. TABLE BOOKINGS MODULE [DONE]

**File:** `src/pages/TableBookings.jsx` · Access: owner, admin

Today / Upcoming / New Booking / All Bookings. Statuses pending/confirmed/seated/completed/cancelled/no_show; locations Indoor/Outdoor/Terrace/Private Room. Walk-ins seat immediately; 45-min conflict + no-show flagging; party size ≤ table capacity. No Phase 2 changes requested. Leave as-is.

---

## 7. FARMERS MARKET MODULE

**File:** `src/pages/FarmersMarket.jsx`

### Existing [DONE]

- **Market Day** — date picker, live indicator, market-conditions autosave, fee reconciliation strip, holders table (check-in / log fee / remove), realtime on `fm_visits`+`fm_payments`. Market day = last Saturday of month.
- **Holders** — summary strip, at-risk banner, filter tabs, per-holder expand, Edit, QR code (→ `/checkin?holder={id}`), Approve, Deactivate. **At-risk auto-flag: active >90 days with 0 visits in last 3 market days.**
- **Add Holder** — Name/Business/Stall/Type/Phone/Email/Notes; **[VERIFY] stall regex `/^[A-Za-z]+\d{2}$/` is two-digit but live stalls are three-digit `A001`–`A347`; if the code regex is still two-digit, the 305 imported stalls can't be edited/re-added — check the code.**
- **Payments** — Application/Registration fees; visit fees logged from Market Day.
- **Public QR check-in** (`CheckIn.jsx`) — public, `holder` param, within 1 day of market day, duplicate-blocked.

### End-goal additions

- **3-month attendance history + waiting-list forfeiture [NEW]** — a clear attended/not-attended view over 3 months (off `fm_visits`), not a raw log. Holder with no attendance for 3 months forfeits their stall, which passes to the next waiting-list entry, recorded. Confirm whether a waiting list exists today and where. Extend the existing at-risk concept (already ~90 days), don't start a second.
- **3-level product taxonomy [NEW]** — Category → Product type → Item (e.g. Crafts → Paintings → oil/wax). Replaces the coarse 5-value `stall_type` and the `fm_holders.products` text blob. Hangs off `fm_approved_items`. Closes two FOLLOWUPS items (uniform `stall_type='Other'`; un-normalised products) — selection from a controlled list removes the comma-splitting problem.
- **Fee schedule [NEW]** — product change **MWK 10,000** (raised by the change action itself, or it won't get charged), ID cards **MWK 30,000** (inclusive of 2), replacement card **MWK 20,000**. Sits inside the full fee schedule — get the existing stall/other fees from Dhiren so these don't stand alone.

---

## 8. ADMIN MODULE

**File:** `src/pages/Admin.jsx` · Access: owner

### Existing [DONE]

- **Users** — list + Edit + Deactivate/Reactivate.
- **Add User** — creates via `create-user` Edge Function (authenticated, owner-only, CORS pinned). Dropdown derives from `Object.keys(ROLE_LABELS)` → offers exactly the four live roles. **[VERIFY]** the dead bar1/bar2 `bar_week` branching is gone (roles removed; confirm no residue).
- **Departments** — add/edit/delete (plain text).
- **Stock Items** — list, inline edit, deactivate; SKU auto-gen `{DeptCode}-{PaddedCount}`.

### End-goal additions

- **Expanded role model [DONE]** — per §1 (owner/admin/department_head/hr), migrations 037–044. Add-User and Users support assigning `department_head` scoped by department, and `hr`.
- **Rooms management [DONE]** (`060`, 18 August) — per §2.2. **Admin → Rooms**: add, inline-edit and Deactivate/Reactivate, with a "show inactive" toggle and an active/total count. **No delete control, deliberately** — the table has no DELETE policy and no DELETE grant, and `stock_movements.room_id` is `ON DELETE RESTRICT`, so a room with consumption history cannot be removed at all. `room_type` is a free-text input with a `datalist` of the seeded values: suggested, not constrained, because the real classes come from Dhiren.

---

## 9. CROSS-MODULE RULES

| Rule | Where | Status |
|---|---|---|
| Stock deducts on Fulfil only (not submit/approve) | Inventory → Requisitions | [DONE] |
| Event allocations deduct on Confirm | Events | [DONE] |
| Market day = last Saturday of month | Farmers Market | [DONE] |
| Mark All Absent only after 11:00 | Attendance → Today | [DONE] |
| No-show flag >45 min past booking | Table Bookings | [DONE] |
| BEO auto-generated on Confirm/Start | Events | [DONE] |
| At-risk auto-flag >90 days, 0 recent visits | Farmers Market | [DONE] |
| GPS outside radius → unverified clock-in | Attendance | [VERIFY] |
| One inflow, many outflows (main store → depts) | Inventory | [DONE] (051–057) |
| Movement Ledger shows all types with +/− direction | Inventory | [DONE] (058 + 006) |
| Bar par level enforced before open | Inventory / bars | [DONE] (059) |
| Consumption records what/where/who | Inventory / consumption | [NEW] |
| 3-month no-attendance → stall forfeit to waiting list | Farmers Market | [NEW] |
| Product change raises 10k fee at point of change | Farmers Market | [NEW] |
| QR scan writes clock-in/out at fixed station | Attendance | [NEW] |

---

## 10. ITEMS REQUIRING LIVE VERIFICATION (do not trust the doc — probe)

1. **~~`stock_movements.movement_type` CHECK~~ — SETTLED.** Live constraint is `_v4` (permits `opening_balance`, `issue`, `event_allocation`, `event_return`); migrations 030/055/058 ran.
2. **GPS clock-in geofence** — the four GPS columns exist live (035); confirm the geofence *logic* in code.
3. **Stall-number regex** in Add Holder — two-digit or three-digit? If two-digit, the 305 imported stalls are un-editable through the form.
4. **Add User role branching** — does it still reference the dead bar1/bar2 `bar_week` logic?

---

## 11. WHAT THIS DOC IS NOT

Not a data-accuracy spec — real data is out of scope until Dhiren verifies the modules. Not a sequencing plan — build order lives in STATE / the session. Not doctrine — measured against `STREAMLINE_BUILD_STANDARD.md` and the meeting record, not the other way round. When a [NEW] feature is built, its screen/field/rule detail gets written back here at the level the existing modules are documented.
