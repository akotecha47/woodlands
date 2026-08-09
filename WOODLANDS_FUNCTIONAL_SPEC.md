# WOODLANDS FUNCTIONAL SPEC — END-GOAL SYSTEM

*What the finished Woodlands system is: every module, screen, and rule at the target state. This is the build reference — Claude Code reads it to know what to build toward, not just what exists today.*

**Rewritten 9 August 2026** to the end goal. Supersedes the 31 May 2026 version (which described the pre-hardening single-tier build with roles that no longer exist).

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

## 0. THE GATE — MIGRATION HISTORY RECONCILIATION [NEW / P1]

**Nothing schema-heavy below is safe until this is done.** Remote migration history records only versions 001–007 while 001–030 have run. `supabase db push` is disqualified — it would replay migration 016's staff INSERT and duplicate all 62 real staff rows — so every migration from 021 on has been applied by hand through the SQL Editor. Five ghost-schema bugs have already come from that.

Phase 2 adds roughly 8–12 tables (departmental stock, par levels, rooms, consumption, taxonomy, waiting list, fees). Hand-applying that many guarantees more ghost schema. Fix the history, get `db push` working and proven, then build. Scope: `supabase migration repair --status applied` for 008–030; write the three missing `CREATE TABLE` migrations (`event_checklists`, `shift_settings`, `tables`); renumber the duplicate `008` pair; verify `db push` is safe and the schema rebuilds from files alone (closes Standard §2.6).

---

## 1. ROLES

### Current — authoritative in `src/lib/roles.js` [DONE]

`owner`, `manager`, `kitchen_manager`, `restaurant_manager`. Four login roles. The `staff` table (62 rows) is disjoint from login roles — it is the roster the manager-facing Attendance screens operate on, no FK to `user_profiles`.

### Target model [NEW — PROPOSED, confirm before the role migration runs]

The meeting requires owner, front-desk admin, multiple restaurant heads, one head per other department, and HR. The right architecture is **one `department_head` role scoped by the existing `department` field, not a role per department** — role-per-department is role explosion and can't cleanly express "Restaurant has three or four heads."

Target roles:

| Role | Who | Scope |
|---|---|---|
| `owner` | Dhiren | Everything |
| `admin` | Rose, Secret (front desk) | Bookings, events, Farmers Market, front-desk operations. Confirm exact surface. |
| `department_head` | Sanjay/Patrick/Daniel + heads of Housekeeping, Laundry, Grounds, Restaurant Bar, Sports Bar | Scoped to their `department`: that department's sub-store, consumption, requisitions, par levels (bars), their staff's attendance. **Multiple heads per department allowed.** |
| `hr` | Martin | Staff, roster, shifts, attendance. **Not** stock or revenue. Confirm. |

**Collapse mapping (confirm):** `manager` → absorbed by `owner`/`admin`; `kitchen_manager` → `department_head` (Kitchen); `restaurant_manager` → `department_head` (Restaurant) or `admin`. Whether a general cross-department `manager` role survives below owner is Aman's call — do not delete it unilaterally.

Departments stay plain text, never FK to a departments table (standing rule).

### Route access — target

| Route | Roles |
|---|---|
| `/login`, `/checkin` (FM), `/attend` (staff QR) | Public |
| `/dashboard` | All authenticated |
| `/inventory` | owner, admin, department_head (own dept view) |
| `/attendance` | owner, admin, hr; department_head (own staff) |
| `/events` | owner, admin |
| `/table-bookings` | owner, admin |
| `/farmers-market` | owner, admin |
| `/admin` | owner |

**[VERIFY]** the old spec claimed a GPS geofence on clock-in (100 m radius, `unverified` status). AUDIT (4 July) corroborates "GPS-flagged clock in/out," so it likely exists — but confirm against live code before relying on it, and decide how it coexists with QR check-in (§4).

---

## 2. NEW CROSS-CUTTING CONCEPTS [NEW]

Three things Phase 2 introduces that don't map to a single existing module.

### 2.1 Two-tier inventory

One main store is the single inbound point — everything logged in on arrival. Stock then distributes out to departments as needed: **one inflow, many outflows.** Each department holds its own stock, consumed from its own dedicated list.

Data-model direction: an item carries a main-store balance and a per-department balance. Reorder levels and low-stock alerts are per-tier — a department can be empty while the store is full, and that's a different alert. The requisition flow becomes the store→department transfer mechanism (requisitions already deduct on Fulfil). The existing `TransfersTab` net-zero assumption must be revisited under two tiers.

Departments (exist in system; item lists empty): Kitchen, Restaurant, Housekeeping, Grounds, Security, plus the two bars which hold stock. **Laundry** is required by the meeting but not yet a department — add it. **Security** exists but wasn't named in the meeting — confirm it stays.

### 2.2 Rooms

Not currently a concept anywhere in the system. Required so stock consumption can be attributed to a room (housekeeping, laundry). A rooms reference list must exist before §2.3 works. Room list (numbers or names) comes from Dhiren.

### 2.3 Consumption ledger

Every consumption event records three dimensions: **what** (item + quantity), **where** (department, and room for housekeeping/laundry), **who** (staff member who drew it). Named as a real current pain: they cannot see which rooms used which stock. Laundry history retained one year minimum — treat 12 months as the floor for the whole ledger.

---

## 3. INVENTORY MODULE

**File:** `src/pages/Inventory.jsx`

### Existing tabs [DONE unless marked]

- **Stock Levels** — department filter, columns Item/SKU/Dept/Unit/Current Stock/Reorder/Status, "Low" badge when qty ≤ reorder. Read-only. *(An item with no `current_stock` row is invisible here, not shown as zero — any import must write a row per item.)*
- **Log Delivery** — Item/Qty/Supplier/Date/Received By/Notes; inserts `stock_movements` (delivery) and adds to `current_stock`.
- **Requisitions** — raise (Item/Dept/Qty/Reason); manager Approve → Reject → **Fulfil**. Stock deducts on **Fulfil only**. Non-managers see only their own.
- **Transfers [BUG]** — records a matched movement pair (−from/+to) and, per the old design, does not touch `current_stock`. **Found not to deduct stock in browser test 27 July.** Under two-tier (§2.1) this is the core store→department mechanic and must move real balances. Fix here.
- **Adjustments** — set new quantity; writes signed `stock_movements` (adjustment) + upserts `current_stock`.
- **Delivery Log** — shows `movement_type = delivery` only. Open question: keep delivery-only or make a consolidated **Movement Ledger** (deliveries, adjustments, requisitions, transfers, event allocations, with +/− direction). Two-tier makes consolidation more attractive; if consolidated, widen `movement_type` CHECK to add `event_allocation`/`event_return`.

### End-goal additions

- **Two-tier stock [NEW]** — per §2.1. Per-department sub-stores, per-department stock lists, store→department issue recorded, dual balances.
- **Bar par levels + end-of-day cycle [NEW]** — each bar holds a minimum per item before opening. Nightly: bartender counts → reports levels → system computes shortfall against par → generates a refill requisition (confirm a pre-filled request, don't compose one) → fulfilled from main store before next open. Par quantities come from the bar heads.
- **Consumption attribution [NEW]** — per §2.3. Draw-from-department writes a consumption row (what/where/who, room where relevant).

**[VERIFY]** `stock_movements.movement_type` CHECK: FOLLOWUPS (bar-import probe) says the live CHECK permits only `delivery/transfer/adjustment/requisition` and that migration 030 did **not** add `opening_balance`. HISTORY/ARTIFACTS say 030 *did* add `opening_balance`. **These contradict — probe the live CHECK before trusting either, and correct whichever doc is wrong.**

---

## 4. ATTENDANCE MODULE

**File:** `src/pages/Attendance.jsx`

### Existing [DONE]

- **Clock In/Out** — states idle/working/break/done; live net hours. On Clock In, GPS compared to lodge coords (100 m); outside/unavailable → `unverified`; inside → `present`/`late` vs shift_start + late_threshold. **[VERIFY] the GPS behaviour against live code.**
- **Today** (owner/manager/restaurant_manager) — Present/Late/Absent/Unverified/Not-arrived cards, department filter, Mark All Absent (after 11:00), Override, Note. Absence + coverage alerts.
- **History** (same access) — Daily and Weekly Summary views, filters, 14-day default.
- **Settings** (same access) — shift definitions per department (start/end/late threshold/days/type).

### End-goal additions

- **QR staff check-in [NEW]** — QR code per staff member, scanned at a **fixed on-premises station** (reception the obvious spot) at shift start/end. Scanner on site only → no remote check-in; combats lateness and no-shows. Scan writes clock-in/out; lateness computed vs roster; no scan by threshold after roster start → no-show flag. **Reuses the FM `public-checkin` pattern** (public endpoint, QR payload, scan writes a row). Confirm: does QR replace the manual clock-in flow or supplement it? Optional non-biometric hardening — capture a photo on scan to deter card-sharing (stores an image, doesn't match one) — offer, don't build unasked.

**Doctrine note:** the standing rule "manual clock in/out only" is superseded by the QR decision. QR is not biometrics, so no conflict there.

---

## 5. EVENTS MODULE

**File:** `src/pages/Events.jsx` · Access: owner, manager (target: owner, admin)

### Existing [DONE unless marked]

- **Events List** — summary strip, status/deposit filters, sort, amber highlight for ≤7-day or confirmed-unpaid. View/Edit/Delete.
- **Create Event** — full form; new events `enquiry`, `deposit_paid=false`.
- **Event Detail** — status pipeline (enquiry→confirm→start→complete, cancel); info grid; **BEO checklists** auto-generated on confirm/in_progress, grouped by department, progress bars.
- **Bill Section** — categorised line items, bill total.
- **Payments Section [BUG for edit]** — summary cards (Bill Total/Total Paid/Balance Due); add payment (Deposit/Balance/Additional/Refund); deposit auto-sets `deposit_paid`. `recorded_by` is written but not displayed.

### End-goal fixes

- **Payments tab editable [NEW]** — payments can be recorded but not corrected. Add edit; decide delete vs reversing-entry. If editable, surface `recorded_by` / last-amended-by (stops being cosmetic).
- **Revenue display [NEW — BLOCKED]** — "revenue should be different." Not specific enough to build. Three readings: recognise on payment received vs net-of-cost vs break-down-by-line. **Resolve with Dhiren** (point at the number on screen) or build toggleable and let him choose. Do not guess.

---

## 6. TABLE BOOKINGS MODULE [DONE]

**File:** `src/pages/TableBookings.jsx` · Access target: owner, admin

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
- **Add User** — creates via `create-user` Edge Function (authenticated, owner-only, CORS pinned). **[VERIFY]** old spec references bar1/bar2 `bar_week` logic — those roles are gone; confirm the form no longer branches on them.
- **Departments** — add/edit/delete (plain text).
- **Stock Items** — list, inline edit, deactivate; SKU auto-gen `{DeptCode}-{PaddedCount}`.

### End-goal additions

- **Expanded role model [NEW]** — per §1 (owner/admin/department_head/hr). Add-User and Users must support assigning `department_head` scoped by department, and `hr`. Confirm the model before the migration.
- **Rooms management [NEW]** — per §2.2. A place to maintain the rooms reference list.

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
| One inflow, many outflows (main store → depts) | Inventory | [NEW] |
| Bar par level enforced before open | Inventory / bars | [NEW] |
| Consumption records what/where/who | Inventory / consumption | [NEW] |
| 3-month no-attendance → stall forfeit to waiting list | Farmers Market | [NEW] |
| Product change raises 10k fee at point of change | Farmers Market | [NEW] |
| QR scan writes clock-in/out at fixed station | Attendance | [NEW] |

---

## 10. ITEMS REQUIRING LIVE VERIFICATION (do not trust the doc — probe)

1. **`stock_movements.movement_type` CHECK** — does it permit `opening_balance`? FOLLOWUPS and HISTORY/ARTIFACTS contradict each other. First thing to settle; one of those docs is wrong.
2. **GPS clock-in geofence** — does the 100 m radius / `unverified` logic exist in live code?
3. **Stall-number regex** in Add Holder — two-digit or three-digit? If two-digit, the 305 imported stalls are un-editable through the form.
4. **Add User role branching** — does it still reference the dead bar1/bar2 `bar_week` logic?

---

## 11. WHAT THIS DOC IS NOT

Not a data-accuracy spec — real data is out of scope until Dhiren verifies the modules. Not a sequencing plan — build order lives in STATE / the session. Not doctrine — measured against `STREAMLINE_BUILD_STANDARD.md` and the meeting record, not the other way round. When a [NEW] feature is built, its screen/field/rule detail gets written back here at the level the existing modules are documented.
