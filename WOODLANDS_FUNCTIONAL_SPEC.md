# WOODLANDS FUNCTIONAL SPEC — END-GOAL SYSTEM

*What the finished Woodlands system is: every module, screen, and rule at the target state. This is the build reference — Claude Code reads it to know what to build toward, not just what exists today.*

**Rewritten 9 August 2026** to the end goal. Supersedes the 31 May 2026 version (which described the pre-hardening single-tier build with roles that no longer exist).

**Updated 20 August 2026** — **there is no [NEW] work left.** Every Phase 2 feature is built (`051`–`063`), and the three remediation blocks have shipped. The remaining markers to read carefully are the ones that are *not* [DONE]:

- **[NOT WIRED]** — Clock In/Out (§4). Built, imported by nothing.
- **[SUPERSEDED]** — QR staff check-in (§4). Never built; not the plan.
- **[REMOVED]** — Events revenue display (§5) and the Farmers Market 3-level taxonomy / `stall_type` (§7). **Built, shipped, then deleted.** Both were in the original Phase 2 scope; neither is live. A `[DONE]` marker does not expire on its own — see §12.

**Scope source:** the Phase 2 additions below come from `WOODLANDS_MEETING_FEEDBACK_2026-07-27.md`. Where that doc and this one disagree, the meeting doc is the record of what Dhiren asked for; this doc is the build interpretation of it.

---

## STATUS LEGEND

Every feature below carries one marker:

- **[DONE]** — built and working today.
- **[BUG]** — built but broken; fix required.
- **[NEW]** — Phase 2, not yet built. **Nothing carries this marker any more.**
- **[VERIFY]** — a claim carried from the old spec or a session note that has NOT been confirmed against the live code or DB. Do not trust it until probed.
- **[NOT WIRED]** — built and working *as code*, but reachable from no screen. Distinct from [DONE], which is a claim about the UI, and from [NEW], which is a claim about the code. Added 19 August after AUDIT_3 §9 found `[DONE]` being used for a component nothing imports.
- **[SUPERSEDED]** — specified here, deliberately no longer the plan, and **never built**. The text is kept, not deleted: what was specified and why it changed is worth more than a clean page.
- **[REMOVED]** — **built, shipped, then deleted.** Distinct from [SUPERSEDED], which was never built. Added 20 August after two features (Events revenue, the FM taxonomy) were cut while their [DONE] markers stayed standing — see §12.

The target for end of the week of 11 August: **every screen works on placeholder data.** Real data (bar stocktake, department stock lists, staff reconciliation, menus, real stallholder details) is explicitly out of scope until Dhiren verifies the system works. Blank screens fail the bar — every [NEW] table ships with placeholder seed as part of its own build step.

---

## 0. THE GATE — MIGRATION HISTORY RECONCILIATION [DONE — historical]

**✅ GATE CLOSED.** History reconciled and schema provably rebuildable from files. Migration history is now **`001`–`063`**, 63 rows, no gaps. `db push` is trustworthy for new schema. **This section no longer blocks anything** — retained for provenance.

**The live rule is the standing one:** Standard §2.6 requires the current file range to be rebuild-proven **before the next migration is written**. Ten runs have been done; **run 10 (20 August) proved `001`–`062`**, and `063` was written on that proven base. **`063` is the proof now owed, before any `064`.** Full detail in `WOODLANDS_STATE.md` §2.6 and `WOODLANDS_FOLLOWUPS.md`; run 10’s record is in `WOODLANDS_FIX_PLAN.md`.

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
| `/login`, `/checkin` (FM) | Public |
| ~~`/attend` (staff QR)~~ | **[SUPERSEDED]** — does not exist in `App.jsx` and will not be added (§4) |
| `/dashboard` | All authenticated |
| `/inventory` | owner, admin, department_head (own dept view) |
| `/attendance` | owner, admin, hr |
| `/events` | owner, admin |
| `/table-bookings` | owner, admin |
| `/farmers-market` | owner, admin |
| `/admin` | owner |

**[ANSWERED, 18 August — AUDIT_3 §9]** the GPS geofence is real and the logic is sound (100 m haversine, `unverified` outside or unavailable) — **but it is reachable only through `ClockInOutTab`, which nothing mounts, so it is dead code.** Detail in §4. The "how does it coexist with QR" half of this question is **moot**: QR is [SUPERSEDED].

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

### Existing [DONE unless marked]

- **Clock In/Out — [NOT WIRED]** *(was `[DONE]`; corrected 19 August, AUDIT_3 §9 / FIX_PLAN C-02)*. States idle/working/break/done; live net hours. On Clock In, GPS compared to lodge coords (100 m); outside/unavailable → `unverified`; inside → `present`/`late` vs shift_start + late_threshold.

  **The component is built and works. Nothing imports it.** `ClockInOutTab.jsx` has no mount point anywhere in the app — the two `Attendance.jsx` branches that once rendered it required roles `RouteGuard` blocked, and those dead branches were deleted in Phase 2 without a replacement route. The `[DONE]` marker was a claim about the code being true and a claim about the UI being false.

  **Consequence, stated plainly because it will be asked at the walkthrough: there is no screen anywhere, for any role, from which a staff member can clock themselves in.** All 15 live `attendance_records` rows are manager-written (`user_id` NULL on 15/15, measured). The manager-facing Today / History / Settings tabs below are genuinely [DONE] and unaffected.

  **What happens to this component is not a build decision — it is the FA03H decision.** See the QR entry below and `WOODLANDS_CLIENT_INPUTS.md`.

- **GPS geofence — [ANSWERED, currently dead code]** *(was `[VERIFY]`; resolved 19 August, AUDIT_3 §9)*. **The logic is sound**: 100 m haversine against `LODGE_LAT`/`LODGE_LNG`, 5 s timeout, outside-or-unavailable → `unverified` + `within_radius = false`, inside → late-vs-present (`ClockInOutTab.jsx:81-142`). The four GPS columns exist live (migration 035) and the manager views do render the radius flag (`TodayTab`).

  **But it is reachable only through the unmounted component above, so no GPS check runs today.** It is correct code that never executes. Two further notes for whoever picks this up: `LODGE_LAT`/`LODGE_LNG`/`RADIUS_M` are **code constants with no DB source** (FIX_PLAN C-44), and a browser-side geofence is trivially spoofable — which is half the reason the geofence exists, so it wants to be server-side on any path that keeps it.
- **Today** — Present/Late/Absent/Unverified/Not-arrived cards, department filter, Mark All Absent (after 11:00), Override, Note. Absence + coverage alerts. Access: owner, admin, hr.
- **History** (same access) — Daily and Weekly Summary views, filters, 14-day default.
- **Settings** (same access) — shift definitions per department (start/end/late threshold/days/type).

### End-goal additions

- **~~QR staff check-in~~ — [SUPERSEDED]** *(was `[NEW]`; superseded 19 August). Never built — it was the one Phase 2 feature not started, and it is now not the plan. The `/attend` route this section implied does not exist in `App.jsx` and will not be added.*

  **What was specified, kept as the record:** a QR code per staff member, scanned at a **fixed on-premises station** (reception the obvious spot) at shift start/end. Scanner on site only → no remote check-in; combats lateness and no-shows. Scan writes clock-in/out; lateness computed vs roster; no scan by threshold after roster start → no-show flag. Reusing the FM `public-checkin` pattern. Optional non-biometric hardening: a photo on scan to deter card-sharing (stores an image, doesn't match one).

  **Why it was superseded.** The design went QR → card-and-scanner → PIN, and then the premise collapsed: **Dhiren already owns an FA03H face-and-fingerprint machine.** Building a parallel capture mechanism next to a device already on site, already installed and already used by staff, is a worse system than reading the one he has. Full arc in `WOODLANDS_HISTORY.md` (19 August).

  **What replaces it is a decision, not a design.** Two paths, and he has to establish which is available:
  - **(a) export / import** — the FA03H's records come off the device (USB or vendor export) and we import them into `attendance_records` on a schedule, reconciling against the roster. No new hardware, no new spend.
  - **(b) invest** — a networked unit with PC software we can read from directly.

  **Pending the 28 August call.** Nothing gets built in this module until it is answered — the ask, and everything it blocks, is in `WOODLANDS_CLIENT_INPUTS.md`.

  **The requirement is unchanged**, and it is worth separating from the technology: *no login from home; catch lateness and no-shows; the owner should not have to sit and check.* QR was one answer to that. It was never the requirement.

**Doctrine note — REVISED 19 August, and this needs saying out loud rather than assumed.** The standing `CLAUDE.md` rule is "no biometrics this phase — manual clock in/out only." The QR decision superseded the *manual-only* half on the reasoning that QR is not biometrics. **That reasoning does not carry over to the FA03H path**, because path (a) reads data off a face-and-fingerprint device.

The honest position: **the system would not perform biometric matching. It would import the result of matching already performed on a device the client already owns and already operates.** No biometric template, image or comparison would enter this codebase — only a staff identifier and a timestamp. That is a defensible distinction, but it is **not the same claim** as "QR is not biometrics", and it should be put to Dhiren in those words rather than left implicit in a doc.

---

## 5. EVENTS MODULE

**File:** `src/pages/Events.jsx` · Access: owner, admin

### Existing [DONE unless marked]

- **Events List** — summary strip, status/deposit filters, sort, amber highlight for ≤7-day or confirmed-unpaid. View/Edit/Delete. Header tile reads **"Payments Received · This Month"** (see the revenue entry under End-goal fixes).
  - **The Edit modal no longer writes `status` or `deposit_paid`** *(Block 1, C-10 / C-11, decision D-4)*. Both controls are **removed from the form, the update payload and the modal**. Status via Edit deducted no stock and built no BEO; cancel via Edit returned no stock, leaving allocations `deducted` for ever; and the Deposit Paid Yes/No was a **third writer** of `deposit_paid`, able to contradict the `062` payment ledger. **`changeStatus()` is now the only writer of status, and Add Payment / `reverse_event_payment()` the only writers of `deposit_paid`.** A short note in the modal says where status is changed and why.
- **Create Event** — full form; new events `enquiry`, `deposit_paid=false`.
- **Event Detail** — status pipeline (enquiry→confirm→start→complete, cancel); info grid; **BEO checklists** auto-generated on confirm/in_progress, grouped by department, progress bars. Stock Allocations section: allocate on confirm (writes `event_allocation`, deducts department tier), return/clearance writes `event_return`.
- **Bill Section** — categorised line items, bill total.
- **Payments Section [DONE]** — summary cards (Bill Total/Total Paid/Balance Due); add payment (Deposit/Balance/Additional/Refund); deposit auto-sets `deposit_paid`. `recorded_by` is now **displayed** as its own column (written since Sprint E, rendered nowhere until 18 August, so verification used to be by SQL).

### End-goal fixes

- **Payments tab editable [DONE — REVERSING ENTRY, 18 August]** (migration `062`) — a correction is a **new row**, never an edit and never a delete. The fork was decided by the schema, which had already answered it once: `event_payments` has **no DELETE grant and no DELETE policy** for `authenticated`, while `events` and `event_bill_items` both do — an append-only money ledger. Edit-in-place would make the one table nobody may delete from silently mutable, destroy the original figure, and still need new `amended_by`/`amended_at` columns to surface "last amended by" — it does not avoid the DDL, it spends it on worse columns. A reversal carries its own `recorded_by`/`created_at`, so the audit trail is the ledger itself.
  - **`062` adds one nullable `reverses_payment_id`** FK to `event_payments(id)` `ON DELETE RESTRICT`, a **partial UNIQUE index** (one reversal per payment), two CHECKs (no self-reference; `payment_type='reversal'` **iff** the pointer is set, so a reversal always names its original and a pointer always announces itself), and a BEFORE trigger for the three rules a CHECK cannot express because they need a subquery — same event, target is not itself a reversal, amount matches exactly. **No new policies and no new grants**: the existing insert/select/update policies are already gated `owner`/`admin` and cover the new column.
  - **Why the link column is not gold-plating:** without it `deposit_paid` cannot be recomputed — you cannot tell whether a reversal cancelled a deposit or a balance payment, so a reversed deposit would read as paid for ever and the Events List's amber "confirmed · unpaid deposit" highlight would silently lie. Same class as the `data-ops/006` filter that quietly hid every event draw.
  - **`reverse_event_payment()`** (SECURITY DEFINER, gated owner/admin) writes the reversal **and** recomputes `events.deposit_paid` from the surviving rows in ONE transaction — the browser cannot do that across two PostgREST calls, and this repo already carries that scar (`LogDeliveryTab` inserted the movement first and updated the balance second).
  - **Reversals are stored POSITIVE**, like refunds, because `CHECK (amount > 0)` makes a negative row impossible — and are reported **separately** from refunds throughout: a refund is money going back to the client, a reversal is money that never arrived in the shape recorded.
  - **11/11 live role scenarios passed, rolled back.** Reversing the only deposit moved Total Paid 1,300,000 → 1,000,000, Balance Due 500,000 → 800,000 **and `deposit_paid` true → false**; a second reversal of the same payment was refused (`23505`), reversing a reversal refused (`23514`), a hand-rolled direct insert with the wrong amount refused by the trigger and an untyped pointer by the CHECK; admin reversed a balance payment with `deposit_paid` correctly staying false; `department_head` and `hr` both denied `42501`.
  - **`reversal` is deliberately NOT in the Add Payment dropdown.** It is only ever written by the RPC, which pairs it with the row it reverses.
- **~~Revenue display~~ — [REMOVED]** *(was `[DONE — PROVISIONAL, 18 August]`; **cut in Block 3, 20 August**)*. **There is no revenue surface anywhere in the app.** The three toggleable readings (Cash Received / Net of Cost / By Line), the shared selector on the Events List strip, the read-only Revenue section on Event Detail, `useRevenueReading`, `RevenueReadingPicker` and the non-dismissible provisional note are **all deleted**; `EventRevenueSection.jsx` is gone.
  - **Why it went.** It was built toggleable rather than guessed, because "revenue should be different in Events" was never made specific — the intention being that Dhiren would pick one reading on 28 August and the other two would come out. Re-reading the 27 July record, that ask sits among requests about **recording payments**. Building a revenue-tracking apparatus he never asked for, then requiring him to adjudicate it, was solving the wrong problem. The honest cut was the whole feature, not two thirds of it.
  - **What replaced it.** The Events List header tile — which was never on the dashboard — reads **"Payments Received · This Month"**: the same money under an honest label, net of refunds and reversals via `summarisePayments`, with no toggle and no provisional badge because there is nothing left to choose.
  - **Nothing in the payment path changed.** Record Payment, payment history, Total Paid, Balance Due, the Reverse flow, Recorded By and `deposit_paid` are byte-for-byte what Block 1 left.
  - **`src/lib/revenue.js` is deliberately KEPT as a library, and no test was deleted** — the pure logic still passes, and it is what a genuinely-requested costed revenue view would be built from. **A retained library is not a live feature. Do not read the file's existence as a screen.**
  - **One finding from that build SURVIVES the removal and is still open:** the only cost column in the schema is `deliveries.unit_cost`, on a table with **0 rows, RLS enabled and zero policies, and no reader or writer in the app**. A delivery is really a `stock_movements` row, and `stock_movements` has no price. **The system does not know what anything costs, structurally** — that is a schema fact, not a revenue-display detail. See FOLLOWUPS.
  - **Still owed from Dhiren, and now the only surviving question from this work:** `events.total_amount` is a stale `0` against a MWK 1,800,000 bill that no Events code reads or maintains. Authoritative or vestigial? See `WOODLANDS_CLIENT_INPUTS.md`.

---

## 6. TABLE BOOKINGS MODULE [DONE]

**File:** `src/pages/TableBookings.jsx` · Access: owner, admin

Today / Upcoming / New Booking / All Bookings. Statuses pending/confirmed/seated/completed/cancelled/no_show; locations Indoor/Outdoor/Terrace/Private Room. Walk-ins seat immediately; 45-min conflict + no-show flagging; party size ≤ table capacity. No Phase 2 changes requested. Leave as-is.

---

## 7. FARMERS MARKET MODULE

**File:** `src/pages/FarmersMarket.jsx`

### Existing [DONE]

- **Market Day** — date picker, live indicator, market-conditions autosave, fee reconciliation strip, holders table (check-in / log fee / remove), realtime on `fm_visits`+`fm_payments`. Market day = last Saturday of month.
- **Holders (Businesses)** — summary strip, at-risk banner, filter tabs, search, per-holder expand, Edit, QR code (→ `/checkin?holder={id}`), Approve, Deactivate. **At-risk auto-flag: active >90 days with 0 visits in last 3 market days** — now read from `v_fm_attendance`, no longer a browser write-on-read.
  - **Summary strip reports approved-product lists**, not categories *(063)*: **approved lists on record · no list yet · total approved products**. The category chip row that briefly replaced the old `stall_type` strip is gone with the taxonomy.
  - **The table's product column is `Products`** *(063)* — free-text approved items. It was `Type` (`stall_type`, `'Other'` on 311/311 rows), then briefly `Category` (`category_id`, populated on 50 of 311). Both are dropped.
- **Add Holder** — Name/Business/Stall/Phone/Email/Notes. **No Type field** *(063 — `stall_type` is dropped; the field is gone from Add Business and from the Holders Edit modal alike)*. Stall regex is settled — see **Stall-number regex [FIXED]** under End-goal additions.
- **Payments** — Application/Registration fees; visit fees logged from Market Day.
- **Public QR check-in** (`CheckIn.jsx`) — public, `holder` param, within 1 day of market day, duplicate-blocked.

### End-goal additions

- **3-month attendance history + waiting-list forfeiture [DONE]** (migration `061`, 18 August) — `v_fm_attendance` is a `security_invoker` view over `fm_visits` giving attended/not-attended per holder across the last three market days (a monthly market, so three market days *is* three months). It **replaces** the client-side write-on-read that used to UPDATE `fm_holders.status` to `at_risk` from a browser page load. At-risk is the warning state and forfeiture the action on it — one concept, not two. `fm_waiting_list` (new; nothing of the kind existed) orders by `(applied_at, created_at, id)` with position **derived, never stored**. `forfeit_stall()` is SECURITY DEFINER, gated owner/admin, **flag + manual confirm — never automatic**; it re-checks eligibility server-side, releases the stall number (the outgoing holder is renamed `A0nn-FFyyyymmdd` because `stall_number` is UNIQUE NOT NULL and could otherwise never be reissued), writes `fm_stall_forfeitures`, and marks the head of the queue `offered` — all atomically or not at all. `fm_stall_forfeitures` has **no INSERT policy and no INSERT grant**, so the RPC is the only write path.
- **Per-holder approved products list [DONE]** (migration `063`, 20 August) — **each business has its own approved list of free-text products, one row per product**, in `fm_holder_products` (`holder_id`, `item_name`, `added_at`, `added_by`; CASCADE on holder delete; case-insensitive unique per holder).
  - **Backfilled from the February 2026 register.** `fm_holders.products` — free text, populated on **289 of 311** holders — was comma-split into **663 item rows covering 100% of those holders**, de-duplicated case-insensitively (A009's register carried both "soup"/"Soup" and "tarts"/"Tarts", which would otherwise have aborted the migration on the unique index). `fm_holders.products` is **preserved untouched** as the source it came from.
  - **The INITIAL list is free.** Recording what a business is already confirmed to sell is not a change — it is the starting position. **The backfill IS that initial list**, so merging or splitting an item at the walkthrough costs the stallholder nothing. `fm_holders.products_set_at` makes this a **stored fact**, not an inference from row count: without it, an owner could empty a list (chargeable) and re-add it as a fresh free one.
  - **Every edit after that raises the product-change fee PER ITEM CHANGED**, as **separate `fm_payments` rows** — three items changed is three rows, not one row of 30,000. Separate because each charge has to be individually visible, reversible and reconcilable in Payments.
  - **`change_holder_products()`** was DROPped and recreated on a `text[]` signature (never overloaded). It computes the diff case-insensitively, applies it, and reads the amount from **`fm_fee_schedule` inside the same transaction** — never from a constant. A no-op change raises nothing.
  - **The fee is unskippable by construction, not by convention.** `authenticated` holds **SELECT and nothing else** on `fm_holder_products` — no INSERT/UPDATE/DELETE grant and no write policy — so the SECURITY DEFINER RPC is the **only** write path. This is what `fm_approved_items` never had (finding C-39 / D-7), closed here by design rather than by dropping policies.
  - **⚠ COUNTING RULE — implemented, FLAGGED for confirmation.** Chargeable items = **`|added| + |removed|`**, so **a replace counts 2**. A replace is not a distinct database operation: the UI edits a list, so swapping A for B *is* one removal plus one addition. It is the only reading that cannot be gamed — if a replace counted 1, re-listing every item under a new spelling would be cheaper than removing them. **The brief's "(add / remove / replace)" admits a 1-count reading; Dhiren confirms on 28 August.** One line of diff arithmetic if he means otherwise. See `WOODLANDS_CLIENT_INPUTS.md`.
  - **UI:** the Businesses product picker is a **typed, editable list** with per-item remove and an **in-modal preview of what the save will cost** before it is saved. Messages reads `fm_holder_products`. The Waiting List's Intended Category picker is gone in favour of its existing free-text Products field.
- **~~3-level product taxonomy~~ — [RETIRED]** *(was `[DONE]` (migration `061`); **dropped entirely in `063`, 20 August**)*. `fm_categories` › `fm_product_types` › `fm_items`, `fm_approved_items`, `fm_holders.category_id` and `fm_waiting_list.category_id` **no longer exist**.
  - **It did not survive contact with real data.** All 311 holders sat on the deprecated `stall_type = 'Other'`; only **50 of 311** ever received a `category_id`; and the 51-item seeded catalogue could not describe what these businesses actually sell — *"Mello nana chips — Banana chips with seasoning"* is in nobody's taxonomy. Selection from a controlled list was supposed to remove the comma-splitting problem; instead it produced a screen reading "Produce: 0 · Crafts: 0 · … Other: 311".
  - **Retired rather than left dormant, deliberately: two live product models is exactly how "Other: 311" happened.**
  - Two dependencies the plan did not name, both found by the Step 0 probe and handled in `063`: `v_fm_attendance` SELECTed `category_id`, so the view was dropped and rebuilt (**`security_invoker=true` re-stated explicitly, because dropping a view drops its reloptions**); and `fm_waiting_list.category_id` was an FK populated on **8 of 8** rows, dropped with the table's existing `products_note` free text absorbing the intent.
- **~~`fm_holders.stall_type`~~ — [DROPPED]** *(063)*. `NOT NULL`, no default, `'Other'` on 311/311, read by nothing but its own CHECK. Step 0 re-confirmed no view, function, policy or index depended on it. The column **and** its CHECK are gone, and the write is removed from both FM forms.
- **Fee schedule [DONE]** (migration `061`) — `fm_fee_schedule` holds all six fees as data: application 10,000 · registration 20,000 · ID cards 30,000 (incl. 2) · replacement 20,000 · visit 10,000 · product change 10,000, **all confirmed by Dhiren 18 August**. Read owner+admin, **write owner only** — a fee change is a money action, not front-desk work. The old `FM_FEES` constants (ID card 5,000 / reprint 10,000) were **wrong, not stale**, and are corrected. **Open: card #3 onwards has no confirmed price** — charged at the replacement rate and flagged in FOLLOWUPS.
  - **✅ EXTENDED, Block 3 / C-08, 20 August: every charging surface now reads the table.** `061` wired only `change_holder_products()` to it, which meant the schedule was **authoritative in name only** — Market Day, Holders card fees, Payments and Messages all charged from constants, and FeesTab stated on screen that a change "takes effect immediately — no deploy needed". All five copies agreed *that day*, so nothing looked wrong until the owner edited a fee; then it was a self-contradiction demonstrable in two clicks.
  - **All charging surfaces now resolve through a `useFeeSchedule()` seam in `fm.js`:** Market Day (visit fee, and the expected/collected reconciliation), Businesses (ID-card issue at initial / second-free / replacement rates, reprint, the product-change blurb, the last-market-day collected figure), Payments (type list, amount pre-fill, outstanding column and total) and Messages (the amounts quoted to a stallholder). There turned out to be **five** frontend copies, not four — `FM_PAY_TYPES` carried an uncounted fifth, each entry holding its own `amount`; it now carries a fee **code** instead, because a payment type and its fee code are not always the same word (a `reprint` payment is the `id_card_replace` fee).
  - **`FM_FEES` survives only as a first-paint fallback**, which is what its own comment always claimed it was. **Proven live as the roles, rolled back:** admin read 10,000 → the admin's own edit **REFUSED** (owner-only policy, 0 rows through RLS) → owner set 12,345 → **the next charge read 12,345**. The on-screen claim is now true.
- **Stall-number regex [FIXED]** (18 August) — was `/^[A-Za-z]+\d{2}$/`, which **no live stall could satisfy** (305/305 are three-digit `A001`–`A347`), so Add Business was unusable for every real stall; Edit meanwhile validated **nothing at all**. One `STALL_RE = /^[A-Za-z]+\d{3}$/` in `FarmersMarketUI.jsx`, used by both.

---

## 8. ADMIN MODULE

**File:** `src/pages/Admin.jsx` · Access: owner

### Existing [DONE]

- **Users** — list + Edit + Deactivate/Reactivate.
- **Add User** — creates via `create-user` Edge Function (authenticated, owner-only, CORS pinned). Dropdown derives from `Object.keys(ROLE_LABELS)` → offers exactly the four live roles. **[ANSWERED, 18 August]** the dead bar1/bar2 `bar_week` branching **is gone from the UI**; rotating shifts are excluded from selection. Two inert residues only: `create-user` still accepts a `bar_week` body field the UI never sends, and `AttendanceUI` still carries bar-week shift logic whose only caller is dead code (FIX_PLAN C-05, PARKED).
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
| At-risk flag: 0 visits across last 3 market days | Farmers Market | [DONE] (061) — a VIEW, no longer a browser write |
| GPS outside radius → unverified clock-in | Attendance | [ANSWERED — logic sound, but DEAD CODE: only `ClockInOutTab` reaches it, and nothing mounts it (§4)] |
| One inflow, many outflows (main store → depts) | Inventory | [DONE] (051–057) |
| Movement Ledger shows all types with +/− direction | Inventory | [DONE] (058 + 006) |
| Bar par level enforced before open | Inventory / bars | [DONE] (059) |
| Consumption records what/where/who | Inventory / consumption | [DONE] (060) |
| 3-month no-attendance → stall forfeit to waiting list | Farmers Market | [DONE] (061) — flag + manual confirm |
| Product change raises the fee at point of change | Farmers Market | [DONE] (063) — **per item changed**, amount read from `fm_fee_schedule` in the same transaction, one `fm_payments` row per item. A replace counts 2 — **flagged for Dhiren** |
| ~~QR scan writes clock-in/out at fixed station~~ | Attendance | **[SUPERSEDED]** — never built, not the plan (§4) |

---

## 10. ITEMS REQUIRING LIVE VERIFICATION (do not trust the doc — probe)

1. **~~`stock_movements.movement_type` CHECK~~ — SETTLED.** Live constraint is `_v4` (permits `opening_balance`, `issue`, `event_allocation`, `event_return`); migrations 030/055/058 ran.
2. **~~GPS clock-in geofence~~ — ANSWERED 19 August.** Logic confirmed sound in code and re-marked in §4 above. It is **dead code** — reachable only through the unmounted `ClockInOutTab`.
3. **~~Stall-number regex~~ — SETTLED 18 August.** Was two-digit; no live stall could satisfy it, so Add was unusable and Edit validated nothing. Both now share a three-digit `STALL_RE`.
4. **~~Add User role branching~~ — ANSWERED 19 August.** Gone from `AddUserTab`; the dropdown derives from `ROLE_LABELS` and rotating shifts are excluded from selection. Residue only, both inert: `create-user` still accepts a `bar_week` body field the UI never sends, and `AttendanceUI` still carries bar-week shift logic whose only caller is dead code (FIX_PLAN C-05, PARKED).

**All four items in this section are now settled.** Add to it when a new unverified claim enters the doc — the section earns its keep only if it is populated honestly.

---

## 12. WHAT THIS DOC GOT WRONG, AND THE LESSON

Recorded because it is the second time a marker in this project has been trusted over the code.

`§4 Clock In/Out` carried **[DONE]** while nothing imported the component. The marker was not a lie — the code *is* done — but **[DONE] in this doc has always meant "built and working today", which a reader takes as a claim about the running app.** A feature reachable from no screen is not working today in any sense a client would accept.

`[NOT WIRED]` exists from 19 August to make that distinction impossible to fudge. **When marking something [DONE], the test is "can a person reach it in a browser", not "does the file exist and compile."**

The same failure in the other direction was worth watching for, and `§7 fee schedule` was the case: the table and its editor were wired while **no charging surface read it** (FIX_PLAN C-08), so `fm_fee_schedule` was authoritative in name only. The honest fix was **not** to soften FeesTab’s on-screen claim that a change takes effect immediately — it was to make the claim true. Block 3 did that. **When a marker and the code disagree, change the code where the doc describes the right behaviour, and the doc where it does not.**

### The third instance, 20 August: **a [DONE] marker outlives the feature it describes.**

Both of this cycle's removals left their `[DONE]` markers standing:

- **§5 Revenue display** carried `[DONE — PROVISIONAL, 18 August]` and the sentence *"Dhiren picks one on 28 August"* for a feature that had been **deleted from the codebase** — the single most misleading line in the repo at the time. A reader preparing the walkthrough would have scripted a demo of a screen that does not exist, in front of the client.
- **§7 3-level product taxonomy** carried `[DONE] (migration 061)` describing five database objects that `063` had **dropped**.

**The lesson is not "update the docs". It is structural:** `[DONE]` is a claim about *the present*, but it is written *once, in the past*, and nothing in the doc makes it decay. A feature's marker is only ever revisited by whoever deletes the feature — and deleting code feels finished when the code is gone.

**So: `[REMOVED]` exists from 20 August, and the rule is that a build which deletes a feature is not complete until the marker is deleted with it.** Same discipline as `[NOT WIRED]`: make the gap between the doc and the app impossible to fudge, rather than trusting anyone to remember.

**Corollary, learned the same day:** a retained library is not a live feature. `src/lib/revenue.js` and its passing tests survive the removal deliberately — but the file existing, and its tests going green in CI, are **not** evidence that a revenue screen exists. Test suites keep a deleted feature's ghost alive convincingly.

---

## 11. WHAT THIS DOC IS NOT

Not a data-accuracy spec — real data is out of scope until Dhiren verifies the modules. Not a sequencing plan — build order lives in STATE / the session. Not doctrine — measured against `STREAMLINE_BUILD_STANDARD.md` and the meeting record, not the other way round. When a [NEW] feature is built, its screen/field/rule detail gets written back here at the level the existing modules are documented.
