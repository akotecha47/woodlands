# WOODLANDS — FIX PLAN

*The single merged remediation tracker. Live document — updated as blocks land, not rewritten.*

**Created: 19 August 2026** · **Last updated: 19 August 2026**

---

## WHAT THIS DOC IS

The one queue. Two audits ran in parallel ahead of the client walkthrough and produced two ID series that had to be worked as one list:

| Source | IDs | What it is |
|---|---|---|
| **Aman's browser pass** | `U-nn` | Role-by-role click-through of the live app. Runtime behaviour — what a person actually sees and cannot do. There is no separate file for this pass; the findings live here. |
| **`WOODLANDS_AUDIT_3.md`** (18 Aug) | `C-nn` | Read-only code audit. Every file under `src/`, both Edge Functions, targeted migrations, plus a measured read-only dump of production. Every live claim in it quotes a measured result. |

The two halves are complementary by design: AUDIT_3 §8 explicitly records "behaviour as each role in a browser" as **not audited**, because the browser pass was the runtime half. Neither is complete alone.

**IDs are stable. Never reused, never renumbered.** A finding that turns out to be wrong is marked so, not deleted.

**Deadline:** full-system walkthrough with Dhiren **Mon 31 Aug / Tue 1 Sep 2026**. Feedback call **28 August**. Severity throughout is judged against that walkthrough, not against a general standard: P1 = will visibly break or mislead in front of the client · P2 = wrong, survivable in a demo · P3 = cleanup, post-walkthrough.

---

## THE PLAN — THREE BLOCKS, THEN CURATION

| Block | Scope | Status |
|---|---|---|
| **Block 1 — Correctness** | Everything that is *wrong*: wrong numbers, wrong names, screens that throw, controls that bypass their own pipeline, tabs a role cannot use. Frontend + exactly one data-op. **No DDL.** | ✅ **DONE** — committed `5d340b2`, 19 August |
| **Block 2 — Look** | Everything that is *right but reads wrong*: internal project narrative in client-facing UI, decorative controls that imply function, display halves left behind by their data layer. | ⬜ PLANNED |
| **Block 3 — Fee wiring** | `fm_fee_schedule` is authoritative in name only — no charging surface reads it (C-08 / D-5). Wire the four surfaces, or soften FeesTab's on-screen claim. One decision, then one build. | ⬜ PLANNED |
| **Demo curation** | Walkthrough script, the data the client will actually be shown, placeholder purge decisions. | ⬜ PLANNED |

**Block 1 carried a hard constraint worth recording:** no DDL, no migration, no new SQL object. That was deliberate — the **062 rebuild proof is still owed**, and it gates any `063`. Block 1 shipped without touching that clock. Blocks 2 and 3 must respect the same gate unless the proof is run first.

---

## STATUS TABLE

`DONE` = shipped and proven · `PLANNED` = queued into a named block · `PARKED` = deliberately not doing before the walkthrough, with a reason.

### Block 1 — Correctness · DONE (commit `5d340b2`, 19 August 2026)

| ID | Src | What | Status | Dec |
|---|---|---|---|---|
| **C-43** | C | Admin → Users header was the string literal `System Users (4)` while the table listed 8 | ✅ **DONE** — `UsersTab.jsx:92` now renders `{users.length}`. Header reads **(8)**, matching the 8 live profiles | — |
| **U-07** | U | Table Bookings → All Bookings: every row's Date read `Invalid Date` while Time rendered fine | ✅ **DONE** — **root cause: `table_bookings.booking_date` is `timestamp with time zone`, not `date`.** PostgREST returns `"2026-07-26T00:00:00+00:00"`; `fmtDate` appended `'T12:00:00'` → `Invalid Date`. Today escaped it only because it passes its own `YYYY-MM-DD`; Upcoming carried the same latent bug but matches no rows today. Fixed at source: `toDateStr()` + hardened `fmtDate` in `TableBookingsUI.jsx:23-40`, wired at `AllBookingsTab.jsx:8,55-61,70` and `UpcomingTab.jsx:8,69`. All 3 live rows now show **26 Jul 2026 / 28 Jul 2026 / 01 Aug 2026**. Also fixed the To-filter (which excluded a booking on its own day) and the Edit modal's date input | — |
| **C-07** | C | Movement Ledger showed every requisition fulfil **twice** — 94 live ± pairs typed `'requisition'` that `collapsePairs` did not collapse (188 of ~194 routed rows) | ✅ **DONE** — `ledger.js:24`, `'requisition'` added to `PAIRED_TYPES`. **Display-only: no data touched, no RPC changed.** 7 new regression tests prove both the collapse *and* that the 1 unmatched pre-055 leg still renders rather than vanishing. Suite 38/38 | **D-1(a)** |
| **C-12** | C | `shift_settings.department` never re-tagged by data-ops/003 — Main Bar and Front Office staff matched no shift: Shift `—`, no late calc, no coverage alert | ✅ **DONE** — `scripts/data-ops/009_shift_settings_retag.sql`. **STEP 0 printed all 12 rows live and found THREE stale values, not the two AUDIT_3 named:** `Restaurant Bar` ×2 (rotating) → `Main Bar`, `Front Desk` ×2 → `Front Office`, **and `Grounds` ×1 → `Grounds & Landscape`** (5 further staff stranded, same cause). Dry-run first inside a transaction that **rolled back**; `shift_settings` re-queried and confirmed at baseline before applying for real. Post-apply: 12 rows, **0** holding a name absent from `departments`, **0** mojibake. Shift resolution simulated in SQL exactly as `getShiftForDept` does it — **Main Bar staff (Benard Gama, Nenenji Khumbo Chikafa) now resolve `Week A 08:30–22:00`**, Front Office `Shift 1 06:00–14:00`, Grounds & Landscape `Standard 08:30–16:30`. Real data unchanged: 62 staff / 311 stallholders / 15 attendance | **D-2** + Grounds |
| **C-12.2** | C | `DEPT_CODES` in `StockItemsTab` keyed on pre-003 names, so Main Bar and 5 other departments generated colliding `GEN-` SKUs | ✅ **DONE** — `StockItemsTab.jsx:11-38`, all 11 canonical keys. Main Bar → **`MBA-nnn`** | — |
| **C-12.3** | C | `defaultUnit` in the same file keyed on `Restaurant Bar`-era names | ✅ **DONE** — same edit; the `'bar'` substring test already covered both bars under either vocabulary, named cases now spelled canonically | — |
| **C-10** | C | Events List **Edit modal** Status dropdown wrote `events.status` directly — confirm via Edit deducted no stock and built no BEO; cancel via Edit returned no stock, leaving allocations `deducted` forever | ✅ **DONE** — control **removed** from form state, update payload and modal (`EventsListTab.jsx:90,197,224,459`). `changeStatus()` in the detail view is now the only writer. A short note in the modal says where status is changed and why | **D-4** |
| **C-11** | C | The same modal's Deposit Paid Yes/No was a **third writer** of `deposit_paid`, able to contradict the 062 payment ledger | ✅ **DONE** — same edit, same removal. Add Payment and `reverse_event_payment()` are again the only writers. The dead `deposit_paid: 'false'` default was also removed from `BLANK_EDIT` | **D-4** |
| **C-37** | C | Delete Event: `event_payments.event_id` is `ON DELETE NO ACTION` and the one live event has 5 payments — the modal promised payments would be deleted, then a raw FK string appeared | ✅ **DONE** — block **kept** (money history must survive). `EventsListTab.jsx:514-522` modal text now states plainly that an event with payments cannot be deleted; `:246-259` catches `23503` and shows that same sentence. Any other error still surfaces verbatim. **FK unchanged, no cascade** | **D-3** |
| **C-18** | C | Event confirm threw on any item holding two department-tier balances — `.eq('tier','department').maybeSingle()`; HK-005/006/007 are live examples. The `qtyMap` half silently let one row overwrite the other | ✅ **DONE** — both paths. New `allocatableQuantities()` in `stock.js:98-134` reads the exact row the deduction lands on (the item's catalogue department, `sub_location IS NULL`); `applyStockDelta` gained `location`/`subLocation` passthrough so read and write provably name the same row. Wired at `EventDetailTab.jsx:4,84-92,119-124,145-152,180-186` and `EventStockSection.jsx:4,44-62,111-117,180-186`. **Proved live, rolled back:** HK-006 old read → **2 rows** (`Housekeeping`/null qty 20, `Housekeeping`/`Laundry` qty 30) so `maybeSingle()` throws; new read → **1 row, qty 20, byte-identical to the `apply_stock_delta` deduct target** | — |
| **C-01** | C | Dashboard "deposit unpaid" card was doubly dead — gated on `deposit_amount` (written by no code, `0` live) and rendered `e.title` (NULL everywhere; the app writes `name`) | ✅ **DONE** — `OwnerDashboard.jsx:145-152` regated on `status === 'confirmed' && !deposit_paid`, **character-for-character the Events-List amber rule** (`EventsListTab.jsx:39`), so the two surfaces cannot disagree. Renders `e.name`; the secondary line shows `deposit_required` (240,000 live). All three facts confirmed live on the wedding row: `deposit_amount: 0`, `title: NULL`, `name` populated | — |
| **C-27** | C | Unverified-attendance cards joined `user_profiles!user_id`, NULL on every manager-written row → card titled **"Unknown staff"** | ✅ **DONE** — **STEP 0 measured the real shape first:** 15/15 rows `user_id IS NULL`, **0/15** `staff_id` NULL; FKs are `staff_id → staff(id)`, `user_id → auth.users(id)`, `recorded_by → user_profiles(id)`; the display name is `staff.full_name` (there is no `staff.name`). Rewired to a bare `staff(full_name, department)` embed at `OwnerDashboard.jsx:162-176` — bare, not `staff!staff_id(...)`, because the `!column` hint form's only instance in this codebase was the broken one, while every working embed here is bare and `attendance_records` has exactly one FK to `staff`. The card now names the person and their department; keyed on record id, not name | — |
| **C-40 / D-6** | C | Deliveries credited the item's **department tier**, not the Main Store — `LogDeliveryTab` passed no location, so `apply_stock_delta` fell back to `stock_items.department`. FUNCTIONAL_SPEC §2.1 says the main store is the single inbound point | ✅ **DONE** — `LogDeliveryTab.jsx:6,48` passes `location: MAIN_STORE`. One argument on one call, exactly as scoped. A logged delivery now raises **Main Store**, not the department balance | **D-6** |
| **U-12** | U | A `department_head` was offered Inventory tabs they have no permission for — a Main Bar head could click **Log Delivery** and be refused by the screen just offered | ✅ **DONE** — `Inventory.jsx` rewritten to a role-aware tab list. Log Delivery, Transfers and Adjustments are now hidden from `department_head`. Each `roles` entry **mirrors the gate that tab already applies to itself** — nothing widened, every component-level check left exactly where it was as the real guard. Fails closed: a tab with no `roles` entry is hidden, not shown. **The other five modules were checked and do not have this pattern** — in Attendance, Events, Table Bookings, Farmers Market and Admin every tab's own gate is the same constant as its `ROUTE_ACCESS` entry, so no role that reaches those pages can be refused a tab on them | — |
| **U-01** | U | The four Dashboard stat cards (Today's Attendance, Low Stock, Upcoming Events, Next Market Day) were not clickable | ✅ **DONE** — `OwnerDashboard.jsx:56-82` plus the four call sites. Navigation only, no data change. Each card was already `ROUTE_ACCESS`-gated, so none can land a role on a route it lacks | — |
| **U-11** | U | Sign-in demanded a full email address; the owner wants staff to type a plain name | ✅ **DONE** — **STEP 0 established the real mechanism before touching it:** `supabase.auth.signInWithPassword({ email, password })`, **no `username` column exists** on `user_profiles`, and all 8 `auth.users` rows are `@woodlands.com`. So the fix is entirely client-side and the stored identity is unchanged: `Login.jsx:7-21,30-33,62-79` appends the domain when the typed string has no `@`, and passes anything containing one through untouched. Input `type` changed `email` → `text`, because the browser's own validation rejected a bare `rose` before submit ever ran. Typing **`rose`** now signs in | — |
| **C-47#3** | C | New-user temporary password was `type=text` in the form and echoed in plaintext on screen after creation. Open since AUDIT_1 | ✅ **DONE** — `AddUserTab.jsx:127-133` input masked; `:75-79` the password is no longer carried into the success object at all; `:95-100` the panel now tells the owner to pass it on themselves | — |

**Block 1 verification, whole-block:** `vite build` clean (1954 modules) · `ledger.test.mjs` 38/38 · `revenue.test.mjs` 68/68 · ESLint 159 → 160 errors, the single addition being a 4th `react-refresh/only-export-components` in `TableBookingsUI.jsx` from exporting `toDateStr` — a rule already firing 3× in that file by design. All other apparent new entries are pre-existing errors whose line numbers shifted.

---

### Block 2 — Look · PLANNED

| ID | Src | What | Status | Dec |
|---|---|---|---|---|
| **C-47#4** | C | Internal project narrative in client-facing UI: `EventsUI.jsx:258-266` `ProvisionalRevenueNote` ("…raised on 27 July and never made specific… **Dhiren** picks one on his return"), `FeesTab.jsx:65` ("All six confirmed by Dhiren, 18 August 2026"), `HoldersTab.jsx:818` ("From the Feb 2026 register: …") | ⬜ PLANNED — deliberate for the walkthrough; the revenue note is *designed* non-dismissible and will be read aloud. Must be rewritten before handover | — |
| **C-47#5** | C | Decorative search pill and a notification bell with a hard-coded red "unread" dot (`OwnerDashboard.jsx:249-263`). The fake unread dot is the misleading part | ⬜ PLANNED — wire or remove | — |
| **C-09** | C | Two payment-type lists that disagree — `PaymentsTab.jsx:8-22` is missing `product_change`, so a real product change renders as raw `product_change` in the history | ⬜ PLANNED — fixable by deletion (C-48.2): drop the local copies, import `FM_PAY_TYPES` | — |
| **§7 taxonomy display half** | C | The 3-level taxonomy is wired, but the Holders summary strip, filter tabs, Add and Edit forms still run on deprecated `stall_type` (311/311 = `'Other'`). The walkthrough will show "Produce: 0 · Crafts: 0 · … Other: 311" | ⬜ PLANNED — the data layer moved and the display did not | — |
| **C-23** | C | Systemic: ~20 reads destructure `{ data }` only, so a failed read is indistinguishable from an empty table — including `EventsListTab.load` (the Events List itself renders "No records found" on a failed read) and all six `OwnerDashboard` queries | ⬜ PLANNED — P2 as a class. The reference pattern already exists in `StockLevelsTab`/`MovementLedgerTab`/`ConsumptionTab`. During a walkthrough a transient failure on any silent screen looks like missing data | — |
| **C-22** | C | `HoldersTab.jsx:111-112` swallows attendance/taxonomy errors **by design** (`.catch(() => …)`). If `v_fm_attendance` fails for any reason every holder shows "No attendance window available", and it reads as data rather than failure | ⬜ PLANNED — same class as C-23, called out separately because the swallow is deliberate | — |
| **Ledger `sub_location`** | C | The Movement Ledger neither selects nor shows `sub_location` (060), so a Laundry movement reads as plain Housekeeping | ⬜ PLANNED — P3, but it is a visibly wrong label now that Housekeeping/Laundry holds real balances | — |

---

### Block 3 — Fee wiring · PLANNED

| ID | Src | What | Status | Dec |
|---|---|---|---|---|
| **C-08** | C | **The fee schedule is decorative.** `fm_fee_schedule` (6 rows, owner-editable in FeesTab, declared authoritative) is read by **no charging surface** — Market Day fee log, Holders card fees, Payments tab and Messages all charge from constants; only `change_holder_products()` reads the table. FeesTab states on screen "Changing an amount here takes effect immediately — no deploy needed" (`FeesTab.jsx:67`). All five copies agree *today*, so nothing is visibly wrong until the owner edits a fee — then it is a self-contradiction demonstrable in two clicks | ⬜ PLANNED | **D-5 — OPEN** |
| **C-48.1** | C | `feeAmount()` in `fm.js:114-118` is exported and imported by nothing — either the seam D-5 wires through, or dead code. Its current state is the worst of both | ⬜ PLANNED — resolves with D-5 either way | **D-5** |
| **C-48.3** | C | `VISIT_FEE` in `MarketDayTab.jsx:8` and the bare `* 10000` in `HoldersTab.jsx:131` — two of C-08's five copies, deletable in favour of `FM_FEES.visit` | ⬜ PLANNED | **D-5** |

---

### PARKED — not before the walkthrough

| ID | Src | What | Why parked |
|---|---|---|---|
| **C-02** | C | **There is no staff clock-in surface at all.** `ClockInOutTab` — the only self-service clock-in and the only GPS code in the app — is imported by nothing. All 15 live attendance rows are manager-written | ⏸ Superseded by the attendance-capture decision. The QR build it was retained for is **no longer the plan** — see `WOODLANDS_CLIENT_INPUTS.md`, FA03H item. Nothing gets built here until Dhiren decides on the 28th |
| **C-44** | C | Lodge coordinates and the 100 m radius are code constants with no DB source, and a browser constant is trivially spoofable | ⏸ Inert — only consumed by the unmounted C-02. Becomes live work only if the attendance decision lands on something that geofences |
| **C-29** | C | Requisition **Fulfil is non-atomic**: stock issues, then a separate status update. A failure between them leaves the button clickable and a second click issues stock again | ⏸ Real defect, but the window is narrow and the fix is a transaction boundary that wants an RPC — i.e. DDL, which the 062 proof gates |
| **C-30 – C-36** | C | Six further non-atomic multi-write sequences: Add Payment, add-allocation-when-confirmed, the clearance loop, event confirm (C-33, known and logged), ID card issue, Log Fee, Log Payment | ⏸ Same reason as C-29 — each wants a server-side transaction. Catalogued so the class is visible, not fixed piecemeal in the frontend |
| **C-39 / D-7** | C | `fm_approved_items` still carries INSERT and DELETE policies for owner/admin, against 061's stated design that the RPC is the only write path so the fee cannot be skipped | ⏸ **Needs a migration** → blocked behind the 062 rebuild proof. UI-only enforcement holds meanwhile (the direct-write UI was deleted) |
| **C-40** *(policy half)* | C | `event_payments_manage_update_v2` survives 062 — owner/admin can still UPDATE payment rows via PostgREST although the whole design is corrections-by-reversal | ⏸ Same: a migration, behind the same gate. No UI edits payments, so this is a latent contradiction rather than a live one |
| **C-41** | C | Renaming a department in Admin ripples nowhere — six tables store the name as plain text, and the guard trigger makes the aftermath worse. That department's head loses all stock visibility | ⏸ **Do not demonstrate this on production.** A consequence of the standing plain-text rule, not a bug in the tab. Needs a design decision, not a patch |
| **C-03** | C | Log Delivery's Date field is decorative — collected, required, passed nowhere; `apply_stock_delta` stamps `now()` | ⏸ P3. Delete it or wire it; the current state is the worst option, but it misleads only someone back-dating a delivery |
| **C-04** | C | Unreachable `!canManage` branch in `EventSetupSection.jsx:110-149` | ⏸ Dead code, no browser symptom. C-48.4 |
| **C-05** | C | `bar_week` residue from the dead bar1/bar2 model — `getShiftForUser` (caller unmounted), `TodayTab.getShift` hard-codes week `'A'`, `create-user` still accepts a `bar_week` body field | ⏸ **Explicitly accepted as-is for Block 1 (D-2).** Now live for Main Bar after the C-12 re-tag — but both Main Bar rotating rows are `08:30–22:00` with the same late threshold, so the hardcode is a real bug and an invisible one |
| **C-06** | C | Four dead tables (`deliveries`, `inventory_items`, `stock_adjustments`, `stock_transfers`) — RLS on, **0 policies**, 0 rows, no reader or writer in `src/` | ⏸ Drop-or-wire decision, already logged in FOLLOWUPS. Fail-closed today |
| **C-13 / C-19 / C-20 / C-21 / C-46** | C | Duplication that currently **agrees**: market-day maths ×3, the five near-identical helper sets, the outstanding-fees rule ×2, market hours ×3, enumerable status literals | ⏸ Traps, not defects. Recorded so the browser pass doesn't re-derive them and a future session doesn't "discover" them again |
| **C-14 / C-15** | C | `movement_type` ×4 and "today's attendance" keyed on two different columns — both verified to **agree** | ⏸ Same: recorded as traps. C-15's split-brain machinery is dormant, not dead |
| **C-16** | C | `src/lib/standards.md` — the current, follow-me doctrine file — names the **dead** role set (`owner, manager, kitchen_manager, restaurant_manager`) and its policy template gates on `IN ('owner','manager')` | ⏸ **Doc trap with a track record.** No browser symptom, but a future session writing a policy from that template would silently exclude `admin`. Worth doing early in Block 2 — it costs nothing and this exact class of failure has already happened once |
| **C-17** | C | `events.title` / `events.total_amount` have no writer and no other reader — pure schema residue | ⏸ The visible half was C-01, now fixed. Dropping columns is DDL |
| **C-24** | C | `AuthContext.jsx:6-13` — a failed profile fetch silently becomes "no role" and bounces a validly-signed-in user to `/login` with no message | ⏸ Sporadic and hard to stage, but this is the one C-23-class instance with a *login* symptom. Promote if it is seen during walkthrough rehearsal |
| **C-25 / C-26 / C-28** | C | Role-scoped and correct-empty blanks that read as missing data | ⏸ **Correct behaviour — do not file these as bugs.** Listed so the browser pass recognises them |
| **C-38** | C | Shift delete is offered to `hr` and permitted (`shift_settings_manage_delete_v2` includes hr) | ⏸ Flagged to **verify intent**, not asserted wrong |
| **C-42** | C | UI gates narrower than RLS — e.g. hr cannot bulk Mark All Absent though the policy permits it | ⏸ Fails closed. Cosmetic, listed for completeness |
| **C-45** | C | Supabase project URL hard-coded in `AddUserTab.jsx:63` instead of `VITE_SUPABASE_URL`. Open since AUDIT_1 | ⏸ P3, one-line fix, no symptom |
| **C-47#1 / #2** | C | The `detail` field on public error responses (`public-checkin/index.ts:142`) and the raw error text rendered on the public check-in page (`CheckIn.jsx:155-157`) | ⏸ **Handover blocker** — the two strip together. Known and logged twice already |
| **C-47#6 / #7** | C | Placeholder FM demo data live in production (6 `Z00n` holders, 687 visits, 8 waiting-list rows, 72 approved items) and placeholder rooms / Housekeeping catalogue / flat bar quantities | ⏸ **By design until real data.** The purge is a demo-curation decision, not a fix |
| **C-47#8** | C | Demo residue in Requisitions/Ledger: 190 par-refill requisitions (94 fulfilled / 96 rejected) and their 188 ledger rows from the 17 Aug test counts | ⏸ Decide with demo curation whether these are kept, re-typed or purged as test data |
| **C-47#10** | C | Real staff PII in a git-tracked migration (`016_staff_restructure.sql`) | ⏸ Known since AUDIT_2 §2.7. A handover-repo decision, not a code fix |
| **C-47#12** | C | Deactivated users would still appear in the Events "Received By" picker (`EventPaymentsSection.jsx:40`, no `is_active` filter) | ⏸ Latent until someone is deactivated |
| **C-48** | C | Delete-only simplification: 8 items, nothing touching a proven-live RPC or an RLS policy | ⏸ Post-walkthrough; churny. Items .1 / .2 / .3 ride along with Blocks 2–3 |

---

## DECISIONS LEDGER

Every fork the two audits raised, and what was actually done. A decision here is **closed** — do not re-litigate it; open a new one if circumstances change.

### D-1 — Movement Ledger requisition pairs: fix the display or the data?

**Fork.** 94 fulfilled requisitions had written ± ledger pairs typed `'requisition'`; `collapsePairs` only collapsed `issue`/`transfer`, so every fulfil rendered twice.
(a) add `'requisition'` to `PAIRED_TYPES` — display-only, no data touched; (b) make fulfil pass `'issue'` the way `transfer_stock` does and re-type the 188 existing rows in a data-op (the 057 "one physical event, one ledger type" doctrine); (c) both.

**RESOLVED → (a).** Display-only. (b) is the doctrinally purer answer, but it changes what the Requisition type filter shows and it mutates 188 real rows for a cosmetic gain, days before a walkthrough. Shipped in Block 1; the tension with the 057 doctrine is **recorded, not resolved**.

### D-2 — `shift_settings` re-tag

**Fork.** Re-tag by data-op (extending 003), or hand-edit in Attendance → Settings? Side effect: once `Restaurant Bar` becomes `Main Bar`, Main Bar staff start matching **rotating** Week A/B shifts, and the rotating-week selection is hard-coded to `'A'` (C-05) — so should the rotating rows survive at all?

**RESOLVED → data-op, extending 003's pattern; rotating rows kept; the C-05 hardcode accepted as-is for this block.** A visible correct shift beats `—`, and both Main Bar rotating rows are `08:30–22:00` with an identical late threshold, so the hardcode changes nothing on screen today. Shipped as `data-ops/009`. C-05 stays PARKED.

### D-3 — Delete Event vs payments

**Fork.** `event_payments.event_id` is `ON DELETE NO ACTION`, so deleting an event with payments fails with a raw FK error while the modal promises payments are deleted. Keep the block and fix the words, or cascade?

**RESOLVED → keep the block.** Payment history must survive; a cascade would let a mis-click erase the money record. Modal text and error message rewritten in Block 1. **FK unchanged, no cascade.**

### D-4 — Events List Edit modal

**Fork.** Its Status dropdown and Deposit Paid Yes/No bypass the stock pipeline and 062's deposit machinery. Remove both controls, or route Status through `changeStatus()`?

**RESOLVED → remove both, entirely.** Routing Status through `changeStatus()` would have kept a second entry point to a pipeline that has exactly one correct order of operations. `changeStatus()` and the payment ledger are now the only writers. Shipped in Block 1.

### D-5 — Fee schedule wiring

**Fork.** `fm_fee_schedule` is editable and read by no charging surface. Wire the four charging surfaces to the table now, or (cheaper pre-walkthrough) soften FeesTab's on-screen claim that a change "takes effect immediately" until the wiring lands?

**⬜ OPEN — this is Block 3.** Not decided. Note the asymmetry: softening the claim takes minutes and removes the self-contradiction; wiring is the right answer and is a real build. The walkthrough only breaks if someone edits a fee on screen.

### D-6 — Deliveries land on the department tier, not the Main Store

**Fork.** Point deliveries at `'Main Store'` (one option on one call), or accept department-direct deliveries and amend FUNCTIONAL_SPEC §2.1?

**RESOLVED → point them at `'Main Store'`.** The spec's "one inflow, many outflows" is the design the two-tier build exists to serve; amending the spec to match a defect would have been the tail wagging the dog. Shipped in Block 1.

### D-7 — `fm_approved_items` direct-write policies

**Fork.** 061's stated design is "the RPC is the only write path so the fee cannot be skipped", enforced on `fm_stall_forfeitures` but **not** on `fm_approved_items`, which still carries INSERT and DELETE policies for owner/admin. Drop them, or accept UI-only enforcement?

**⬜ OPEN — PARKED behind the 062 rebuild proof.** Dropping them is a migration. UI-only enforcement holds meanwhile because the direct-write UI was deleted in 061.

### The Grounds re-tag (19 August)

**Fork raised during Block 1 STEP 0, not by either audit.** AUDIT_3 C-12 named `Restaurant Bar` and `Front Desk` as the stale `shift_settings` values ("measured live values **include** …"). Printing all 12 rows live found a **third**: `Grounds`, 1 row, canonical target `Grounds & Landscape` — the same rename data-ops/003 had already applied to the `departments` table itself, stranding **5 further staff** on `—` for identical reasons.

**RESOLVED → re-tag all three.** Fixing two of three would have left the bug half-live and produced a second session to finish the same job. Recorded here because it is a deviation from the literal wording of the finding, and the deviation should be visible rather than buried in a data-op comment.

---

## HOW TO UPDATE THIS DOC

- A finding moves between sections; its **ID never changes**.
- When a block lands, change its rows to ✅ **DONE** and paste the *proof*, not the intent — "3 stale shift values re-tagged, Main Bar staff now resolve Week A", not "shift re-tag done".
- New findings get the next free number in their series (`C-49`+, `U-nn`+) and a row, not a rewrite.
- A decision that gets reopened gets a **new** D-number with a pointer back. Resolved `D-n` entries are never edited.
