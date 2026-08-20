# WOODLANDS — STATE

*Current state, live commitments, next action. Updated at the end of every session that changed state.*

**Last updated: 20 August 2026**
**Governing doctrine:** STREAMLINE_BUILD_STANDARD.md v1.5, STREAMLINE_MATERIALS.md v2.4, STREAMLINE_SESSION.md v2.0.

> **This doc lagged three shipped commits between 19 and 20 August** — it still described Block 2 and Block 3 as "planned", Events revenue as live, and the Farmers Market taxonomy as the product model, all of which were false. Rewritten from measured truth on 20 August. **If this doc and `WOODLANDS_FIX_PLAN.md` ever disagree again, believe FIX_PLAN** — it is updated as blocks land, this one at end of session.

---

## WHAT IT IS

Lodge in Lilongwe. Family relationship — Dhiren is Aman's uncle.

- **Owner:** Dhiren (Aman's uncle)
- **Ops manager:** Rose Ngalawango
- **HR:** Martin Lisilira
- **Staff:** 62 in `staff` table
- **Modules built (6):** Inventory, Attendance, Events, Table Bookings, Farmers Market, Admin
- **Roles (4):** `owner`, `admin`, `department_head`, `hr` — authoritative in `src/lib/roles.js`
- **System users: 8** — measured live 20 August. 5 department heads (one per department), plus owner, admin and hr. All active. **8 accounts, 4 roles; do not conflate the two counts.**
- **Migrations: `001`–`063`**, 63 rows, no gaps.

---

## THE GOAL — PHASE 2, FUNCTIONAL-COMPLETE ON PLACEHOLDER DATA

**✅ MET, and remediation is now done too.** Every Phase 2 build feature exists (last one `063`, 20 August). The original target — *a fully functioning app on placeholder data by the week of 11 August* — landed on time, and the three remediation blocks that followed it have all shipped.

**The live target is the walkthrough: Mon 31 Aug / Tue 1 Sep 2026**, with a feedback call on **28 August**.

**There is nothing left to BUILD.** What remains between here and the walkthrough is:

1. **The 28 August feedback call** — Dhiren owes decisions, not data. Full ask list in `WOODLANDS_CLIENT_INPUTS.md`.
2. **Demo curation** — the walkthrough script, the data the client will actually be shown, the placeholder-purge decisions.
3. **A walkthrough run-through** — the full role-by-role pass, rehearsed.
4. **A final audit pass** before the walkthrough.

Once Dhiren verifies the modules work to his satisfaction, real data goes in — not before.

**The end-goal system is specified in `WOODLANDS_FUNCTIONAL_SPEC.md`.** Scope source is `WOODLANDS_MEETING_FEEDBACK_2026-07-27.md`. Remediation is tracked in `WOODLANDS_FIX_PLAN.md`.

**Client framing decision (Dhiren, 27 July):** prove the modules work before perfecting the data. Existing real data (305 real stallholders, 62 staff, 559 stock items) stays as the test bed; the missing-data chase (bar stocktake, department stock lists, staff reconciliation, menus, 12 missing phone numbers) is off the critical path.

---

## WHERE THE BUILD IS — 20 AUGUST 2026

**All three remediation blocks have shipped, plus one migration.** Two audits ran in parallel ahead of the walkthrough — Aman's role-by-role **browser pass** (`U-nn`) and `WOODLANDS_AUDIT_3.md`, a read-only **code audit** (`C-nn`) — and were merged into one queue in **`WOODLANDS_FIX_PLAN.md`**. That is the tracker; per-finding file:line and live proof live there and are not duplicated here.

| Block | What | Commit | Status |
|---|---|---|---|
| **Block 1 — Correctness** | Wrong numbers, wrong names, screens that throw, controls bypassing their own pipeline, tabs a role cannot use. Frontend + one data-op, **no DDL** | `5d340b2` | ✅ **DONE** 19 Aug |
| **Block 2 — Look** (+ finish pass) | One shell, one component kit, one palette; internal project narrative out of client-facing UI; decorative controls removed. Frontend only | `8ca3378` | ✅ **DONE** 20 Aug |
| **Block 3 — Fees, revenue, dropdown, polish** | Fee schedule wired live; Events revenue removed; custom dropdown; sub-page search; page descriptions stripped | `fae6738` | ✅ **DONE** 20 Aug |
| **`063` — FM products redesign** | Per-holder approved-items table, per-item change fee, taxonomy retired, `stall_type` dropped | `846a5a6` | ✅ **DONE** 20 Aug |
| **Demo curation** | Walkthrough script, data shown, placeholder purge | — | ⬜ **NEXT** |

### What Block 1 shipped (19 August)

- Admin → Users header reads the **live** count (8, was a literal `4`).
- Movement Ledger collapses requisition fulfil pairs — **94 double-rendered movements**, display-only fix, no data touched.
- **`scripts/data-ops/009_shift_settings_retag.sql`** — the shift re-tag. See below.
- Events List Edit modal no longer writes `status` or `deposit_paid`; Delete Event tells the truth about payments instead of throwing a raw FK string.
- Event confirm no longer throws for items holding two department-tier balances (HK-005/006/007).
- Dashboard: the unpaid-deposit card can actually fire and names the event; unverified-attendance cards name the real person instead of "Unknown staff"; the four stat cards navigate.
- Deliveries land on **Main Store**, per FUNCTIONAL_SPEC §2.1, not the department tier.
- A `department_head` is no longer offered Inventory tabs they will be refused.
- Table Bookings → All Bookings shows real dates (`booking_date` is `timestamptz`, not `date` — see the trap in FOLLOWUPS).
- Login accepts a bare username; the new-user temporary password is masked and no longer echoed on screen.

### What Block 2 shipped (20 August, two passes)

- **One shell on every route** — `AppShell` (sidebar + top bar + one content frame) replaced `Layout`. `TopBar` renders everywhere with breadcrumb, jump-to-section box, avatar and a **working Sign out** (`signOut()` now falls back to `{ scope: 'local' }` and clears state regardless, so an expired refresh token can no longer leave a user signed in after clicking).
- **One component kit** — `FormPanel`/`FormGrid`/`Field`, `Sel`, `Tabs`, `TableWrap`, `EmptyRow`, `Button`. Self-hosted Inter (CDN removed — no live font dependency on a system demoed in Lilongwe).
- **The finish pass corrected three false DONEs.** A kit component existing is not adoption: 19 raw `<select>` elements survived across 12 files (one shadowing the kit's own `selectCls` export with a different value), four screens hand-wrote the grid `FormGrid` exists to remove, and ~15 tables hand-rolled their empty row — two printing the kit's *default* placeholder on the first two screens of the walkthrough. **Only a grep proves adoption.**
- Decorative search pill made real; fake notification bell removed.

### What Block 3 shipped (20 August)

- **Events revenue REMOVED.** The three toggleable readings, the shared selector, the Event Detail Revenue section and the non-dismissible provisional note are all gone. The client asked to **record payments**, not to track revenue. The Events-List tile is now **"Payments Received · This Month"** — same money, honest label, net of refunds and reversals. **Every payment path is byte-for-byte what Block 1 left.**
- **`fm_fee_schedule` is now genuinely authoritative.** Every charging surface reads it through a new `useFeeSchedule()` seam — Market Day, Businesses, Payments and Messages. There were **five** frontend copies of the schedule, not four. Proven live as the roles and rolled back: an owner's edit changed what the next charge used; an admin's edit was refused. `FM_FEES` survives as a first-paint fallback only.
- **Custom dropdown** — the OS-drawn `<select>` popup is suppressed and our own listbox opens in its place, with full keyboard support, opening *at* the selected option. The control underneath is still a real `<select>` (23 of 73 call sites pass `required`), and all 73 call sites are untouched.
- **Search reaches sub-pages** — `src/lib/sections.js` is now the single source for every module's tab list, so the search index cannot drift from the screens. 30 tabs indexed; access mirrored on `ROUTE_ACCESS`, never widened.
- Six page descriptions stripped; internal-note strings rewritten; the dead `RADIUS` column hidden (not deleted).

### What `063` shipped (20 August)

**The Farmers Market product model was replaced, and the old one retired rather than left dormant.**

- **`fm_holder_products`** — one free-text row per approved product per holder. **Backfilled from `fm_holders.products`, the February 2026 register text: 663 item rows across all 289 holders that had text, 100% covered.**
- **The initial list is free.** `fm_holders.products_set_at` makes that a stored fact rather than an inference from row count, so a holder's list cannot be emptied and re-added to dodge the fee.
- **`change_holder_products()`** recreated on a `text[]` signature (dropped first, never overloaded). It computes the per-item diff case-insensitively and raises **one `fm_payments` row per item changed**, amount read from `fm_fee_schedule` **inside the same transaction**.
- **The fee is unskippable by construction:** `authenticated` holds SELECT and nothing else on the new table — no write grant, no write policy — so the SECURITY DEFINER RPC is the only write path.
- **The taxonomy is gone.** `fm_categories`, `fm_product_types`, `fm_items`, `fm_approved_items`, `fm_holders.category_id`, `fm_waiting_list.category_id` and `fm_holders.stall_type` are all dropped. Two live product models is exactly how "Other: 311" happened.
- **⚠ One money rule is FLAGGED, not settled:** chargeable items = `|added| + |removed|`, so **a replace counts 2**. The brief's "(add / remove / replace)" admits a reading where it counts 1. **This needs Dhiren's confirmation on 28 August** — see `WOODLANDS_CLIENT_INPUTS.md`.

**`scripts/data-ops/009_shift_settings_retag.sql` — applied 19 August.** data-ops/003 re-tagged `departments`, `staff` and `stock_items` on 12 August and **missed `shift_settings`**, so staff in the affected departments matched no shift at all. Three stale values found live and re-tagged: `Restaurant Bar` → `Main Bar`, `Front Desk` → `Front Office`, `Grounds` → `Grounds & Landscape`. Dry-run first inside a rolled-back transaction, baseline re-confirmed, then applied. 12 rows, 0 stale, 0 mojibake. **8 staff still show `—`** (Administration 3, Maintenance 3, Transport 2) because those departments have **no `shift_settings` row at all** — a data gap needing Rose's real times, logged in `WOODLANDS_CLIENT_INPUTS.md`.

---

## ATTENDANCE — THE PLAN CHANGED. QR IS NO LONGER IT.

**QR staff attendance is superseded.** It was the plan out of the 27 July meeting and is marked `[SUPERSEDED]` in `WOODLANDS_FUNCTIONAL_SPEC.md` §4. It is not what gets built.

**The pivot:** Dhiren already owns an **FA03H face-and-fingerprint machine**. The open question is now a **procurement decision, not a build decision**:

- **(a)** the FA03H's records can be exported (USB or a vendor export) → we import them into `attendance_records` and reconcile against the roster. No new hardware, no new spend.
- **(b)** they cannot → he invests in a networked unit with PC software that we can read from.

**He has to find out which.** That is a question for the device or its supplier; we cannot answer it from here. **Pending the 28 August call.** Design arc in `WOODLANDS_HISTORY.md` (19 August); the ask, and what it blocks, in `WOODLANDS_CLIENT_INPUTS.md`.

**Consequence to be honest about at the walkthrough:** there is **no staff clock-in surface in the app today.** `ClockInOutTab` — the only self-service clock-in and the only GPS code in the codebase — is built and **mounted nowhere** (`[NOT WIRED]`). All 15 live attendance rows are manager-written. Whether that component is wired, rewritten or deleted depends entirely on the answer above.

**PARKED means parked, not deleted.** The built Attendance module (Today / History / Settings) and manual clock-in stay in the codebase; manual marking by front desk / ops is the working fallback. Whether anything is *hidden* for the walkthrough is a presentation decision, never a code deletion.

**No biometrics in this system.** It performs no biometric capture, storage or matching of its own. If attendance data is ever taken in, what enters is the **already-matched result** from a device the client owns and operates — a staff identifier and a timestamp. Worth stating to Dhiren in those words rather than leaving it implicit, because path (a) reads data off a face/fingerprint device and that is a materially different claim from the old QR-era reasoning.

---

## COMMERCIAL SHAPE — GIFT BUILD

**Aman is not charging Dhiren.** Uncle. Decided at inception.

- Delivered no different from a paying client — full working system, security compliance, professional handover.
- Exchange: a delivered testimonial, and referrals to Dhiren's contacts.
- Reference value under Materials methodology for an equivalent paying client: ~MWK 6–9M. Internal only, never quoted. Shapes polish budget — full professional delivery, not infinite polish.

---

## STACK

- React + Vite + Tailwind + Supabase (Pro, ref `gttsjmxltrxxfplqjans`) + Vercel
- Live: `woodlands-beta.vercel.app`
- Repo: `akotecha47/woodlands`
- Auth: Supabase Auth on `sb_publishable_*` + `sb_secret_*` key pair. Legacy JWT keys disabled 26 July — the previously-exposed key is permanently invalid.
- Departments plain text, never FK.
- SQL applied via `scripts/apply-sql.ps1` (UTF-8 read + mojibake refusal). Never a bare `Get-Content` one-liner — that corrupted `059` on 17 August.

---

## WHAT'S LIVE — REAL VS PLACEHOLDER

**Real:** 305 Farmers Market stallholders (via `scripts/data-ops/001`); 559 bar item catalogue — 276 Restaurant Bar + 283 Sports Bar (via `scripts/data-ops/002`), names + SKUs real; 62 staff roster; **8 system users**; 663 approved-product rows backfilled from the February 2026 register (`063`).

**Placeholder / demo:** bar stock quantities (pending stocktake); bar par levels (2× catalogue reorder); attendance (2–3 seed days); 1 seeded event; a few table bookings; **6 `Z00n` Farmers Market holders** plus their visits and 8 waiting-list rows (`data-ops/008`) — total holders therefore **311** (305 real + 6 placeholder).

**Empty / not there:** Kitchen, Restaurant, Grounds, Security stock lists (departments exist, items don't); menu items from POS PDFs. **Housekeeping holds a 7-item placeholder catalogue** (`060`) at Main Store / Housekeeping / Housekeeping-Laundry — Laundry is a sub-location, deliberately never a department. **24 placeholder rooms** (`060`), real list still owed by Dhiren.

---

## MIGRATIONS AND THE §2.6 REBUILD-PROOF DISCIPLINE

**History is `001`–`063`, 63 rows, no gaps.** The migration-history reconciliation that was Priority 1 through Sessions A and B (9–10 August) is long closed, and `db push` is no longer a standing hazard — history is fully recorded, so a push has nothing to replay.

**Standard §2.6 is a STANDING PER-MIGRATION DISCIPLINE, not a one-off task.** A rebuild proof is a claim about a file range on a date, never a permanent property of the project. It expires the moment a new migration is written.

- **The rule: prove the current range BEFORE writing the next migration.**
- **Ten runs done.** Docker is unavailable here, so every run pushes `001`–`0nn` into a throwaway Supabase project via `--db-url` on the **session pooler** (`db.<ref>` has been IPv6-unresolvable for five runs running — treat the direct host as unavailable, not as first choice), never by re-linking, with the local link verified as production before *and* after, and the throwaway deleted via the Management API and confirmed gone.
- **Run 10 (20 August) proved `001`–`062` — PASSED, no new finding.** `063` was then written, applied and recorded on that proven base.

### ⚠ `063` IS THE PROOF NOW OWED, before any `064` is written.

It gives that run new things to check: the `fm_holder_products` table with its **SELECT-only grant to `authenticated`** (if a rebuild grants more, the fee becomes skippable while production still looks fine), the rebuilt `v_fm_attendance` (**`security_invoker=true` must be re-stated — dropping a view drops its reloptions**), `change_holder_products()` on its new `text[]` signature with exactly one signature in `pg_proc`, and the **absence** of the four retired taxonomy tables. Code-only and data-op changes do not touch this clock.

**Known-expected residuals, so they are not misread as new findings:** the 2 legacy duplicate `service_role` policies (`departments`, `user_profiles`), the `handle_new_user` orphan (production-only) against `rls_auto_enable()` + the `ensure_rls` event trigger (rebuild-only, a platform default production predates — so RLS enablement must be argued from production's side), and the `attendance_records` ordinal divergence 14–18.

**Run history:** runs 1–4 closed `001`–`050` (12 Aug) after finding real unfiled drift a dry-run could not see, fixed as `045`–`050` · run 5 `051`–`057` (14 Aug) · run 6 `001`–`058` (17 Aug), which caught a files gap granting `anon` EXECUTE on the role functions **and** production's history never having recorded `058` · run 7 `059` (17 Aug), which caught mojibake in **production** written by the apply path · run 8 `060` (18 Aug), first with no new finding · run 9 `061` (18 Aug) · run 10 `001`–`062` (20 Aug). Full per-run detail in `WOODLANDS_FOLLOWUPS.md`; run 10's record is in `WOODLANDS_FIX_PLAN.md`.

---

## KNOWN BUGS / BROKEN PATHS

- **~~Transfers don't deduct stock~~ — FIXED AND PROVEN LIVE, 14 August 2026.** Migration `057` added `transfer_stock` (a thin delegation to `issue_stock`); `TransfersTab` now calls it instead of inserting two ledger rows directly. Proved as the `admin` role, rolled back: Sports Bar 17 → 10 with the Main Bar row created at 7, 2 ledger rows, `movement_type` `'transfer'`. The 2 orphan ledger rows the bug wrote on 27 July were deleted via `scripts/data-ops/005`.
- **~~Events payments tab not editable~~ — FIXED AND PROVEN LIVE, 18 August 2026** (`062`). A correction is a **reversing entry**, not an edit: `event_payments` has no DELETE grant and no DELETE policy by design, so the original figure survives its own correction. 11/11 live role scenarios passed, rolled back.
- **~~`fm_fee_schedule` is decorative~~ — FIXED 20 August (Block 3).** Every charging surface now reads the table. FeesTab's on-screen claim that a change takes effect immediately is now true.
- **`public-checkin` returns an internal `detail` field on failure.** Aids diagnosis; drop before handover. **Handover blocker.**
- **`booking_date` / `event_date` are `timestamptz`, not `date`** — every `.eq(date)` in the app works only because every live row is stored at midnight UTC. Not urgent before the walkthrough; **must not survive real data entry.** Detail in FOLLOWUPS.

---

## VERIFY-AGAINST-LIVE (don't trust the docs)

- **~~`stock_movements.movement_type` CHECK~~ — SETTLED 9 August.** Live constraint permits `opening_balance`; migration 030 ran.
- **~~GPS clock-in geofence~~ — ANSWERED 18 August (AUDIT_3 §9).** The logic exists and is **sound**: 100 m haversine against `LODGE_LAT`/`LODGE_LNG`, 5 s timeout, outside-or-unavailable → `unverified` + `within_radius = false`, inside → late-vs-present (`ClockInOutTab.jsx:81-142`). **But it is reachable only through `ClockInOutTab`, which is mounted nowhere — so GPS clock-in is currently dead code.** Whether this survives at all depends on the FA03H decision above.
- **~~Stall-number regex~~ — SETTLED 18 August.** One shared three-digit `STALL_RE = /^[A-Za-z]+\d{3}$/`, used by **both** Add and Edit.
- **~~Add User bar1/bar2 branching~~ — ANSWERED 18 August.** Gone from the UI. Residue only: `create-user` still accepts an inert `bar_week` body field the UI never sends, and `AttendanceUI` still carries bar-week shift logic used solely by dead code (FIX_PLAN C-05, PARKED).

**Nothing is currently open in this section.** Add to it when a new claim enters the docs unverified.

---

## PHASE 2 SCOPE — AS BUILT

Two-tier inventory + per-department stock lists · bar par levels + end-of-day refill cycle · consumption attribution (what/where/who) + rooms + 1-year laundry retention · expanded role model · ~~QR staff attendance~~ **→ SUPERSEDED, see ATTENDANCE above** · Farmers Market 3-month attendance history + waiting-list forfeiture + **per-holder approved-products list** + fee schedule · Events payments editable by reversing entry.

**Two items in the original Phase 2 scope were built and then REMOVED. Do not describe either as live:**

- ~~**Events revenue display**~~ — cut in Block 3 (20 August). `src/lib/revenue.js` is **kept as a library with its tests**; no revenue surface exists anywhere in the app.
- ~~**Farmers Market 3-level product taxonomy**~~ — retired in `063` (20 August). `fm_categories` / `fm_product_types` / `fm_items` / `fm_approved_items` / `fm_holders.category_id` / `fm_holders.stall_type` are all **dropped**. Replaced by the `fm_holder_products` approved-list model with a per-item change fee.

---

## LIVE COMMITMENTS

- **Full working system delivered no different from a paying client.**
- **Testimonial + referrals** post-handover. Nothing specific discussed yet.

---

## CADENCE

- **26–27 July** — hardening (Sprints A–E) + FM import + bar import + feedback meeting.
- **28 July – 7 August** — Aman travelling (South Africa, medical). No dev work.
- **9–10 August** — docs brought current to end goal; Sessions A and B closed the migration gate.
- **10–18 August** — Phase 2 built to functional-complete on placeholder data: two-tier inventory (`051`–`057`), Movement Ledger (`058`), bar par cycle (`059`), rooms + consumption (`060`), Farmers Market waiting list + fees (`061`), Events payments by reversing entry (`062`).
- **18 August** — two audits run in parallel: Aman's role-by-role browser pass and `WOODLANDS_AUDIT_3.md`.
- **19 August** — **Block 1 (correctness) committed** (`5d340b2`); `data-ops/009` applied; attendance pivoted off QR to the FA03H decision; `WOODLANDS_FIX_PLAN.md` and `WOODLANDS_CLIENT_INPUTS.md` created.
- **20 August (today)** — **Block 2 (`8ca3378`), Block 3 (`fae6738`) and `063` (`846a5a6`) all shipped.** §2.6 run 10 passed `001`–`062` before `063` was written. Events revenue removed; fee schedule wired live; FM taxonomy retired. Docs synced to this reality.
- **21–27 August** — demo curation, walkthrough rehearsal, final audit pass.
- **Fri 28 August** — **feedback call with Dhiren.** He owes **decisions, not data**: the FA03H export-or-invest answer, the **replace-counts-2 fee rule**, Rose's shift times for three departments. Full ask list in `WOODLANDS_CLIENT_INPUTS.md`.
- **Mon 31 Aug / Tue 1 Sep** — **full-system walkthrough.** The deadline everything is judged against.
- **After Dhiren verifies** — real data goes in (joint session with Rose + Martin), then an audit against real data, then Sprint F handover mechanics.

---

## NEXT ACTION

**→ Demo curation.** Nothing is left to build. The tracker is `WOODLANDS_FIX_PLAN.md`; the open client questions are `WOODLANDS_CLIENT_INPUTS.md`.

The three things that most want a decision before the walkthrough:

1. **The placeholder purge** — 6 `Z00n` holders, 8 waiting-list rows, ~687 seeded visits, 190 par-refill requisitions and their 188 ledger rows from the 17 August test counts, 24 placeholder rooms, the 7-item Housekeeping catalogue. Keep, re-type or purge? (FIX_PLAN C-47#6/#7/#8.)
2. **The Hannah Gondwe mojibake** — a one-row heal on a live table booking that is very likely to be on screen. A *when*, not a *whether*.
3. **`fm_holders.products` still renders under a "Products:" label** beside the new Approved Products list on the same card. Two product displays on one screen; lean is to hide the old one.

**⚠ If anything below turns into a migration, the `063` rebuild proof is owed first.** That gate has not moved.

---

*Everything below this line is the dated build record of how Phase 2 landed — kept as provenance, not as a queue. Nothing in it is outstanding except where explicitly marked. **Read each entry as true on its date, not as current state.***

**Migration gate closed, role model live, department vocabulary reconciled — none of these block anything anymore.**

**Done since 12 August 2026:**
- **Migration gate — CLOSED.** `db push` trustworthy for new schema.
- **Role model.** Migrations `037`–`044` applied and proven live — `owner` / `admin` / `hr` / `department_head` all verified in-browser (`department_head` scoped by `user_profiles.department`).
- **Department vocabulary re-tag.** `scripts/data-ops/003_department_retag.sql` applied live — `departments` table, `staff.department` (62 rows), and `stock_items.department` (559 rows) reconciled to one canonical 11-value list. `department_head` scoping proven live: Main Bar head sees exactly 276 Main Bar items (0 Sports Bar), Sports Bar head exactly 283 (0 Main Bar), Kitchen head correctly sees 0 — confirmed as data-absence, not a policy failure.

**Done 13 August 2026 — two-tier inventory FOUNDATION:**
- **Migration history now 001–053.** `045`–`050` recorded via `migration repair` (never `db push` — `050`'s revoke/re-grant window must not run against live data). `051`–`053` applied per-file and each verified live before the next.
- **`051` location dimension.** `current_stock` is now keyed by `(stock_item_id, location, sub_location)` — `UNIQUE NULLS NOT DISTINCT` — with a generated `tier` column (`store`/`department`) and per-tier `reorder_level` (NULL inherits the catalogue default). `'Main Store'` is a reserved location, never a department row; `'Laundry'` is a Housekeeping sub-location.
- **`052` RPCs made location-aware.** `apply_stock_delta`/`set_stock_quantity` took `p_location` (NULL → the item's department tier, so every existing caller is unaffected). Two traps caught live: adding parameters would have left the old, now-corrupting overload callable, and the recreated functions would have granted `authenticated` nothing under this project's restricted function default privileges.
- **`053` main store seeded** — 559 rows at a flat placeholder 100, store reorder 4× catalogue. Contributes **0** low-stock alerts.
- **`054` location guard.** A `BEFORE INSERT OR UPDATE OF location, sub_location` trigger rejects any location that is not `'Main Store'` or a live `departments` name, and forbids a `sub_location` on the store tier. Closes the *invalid-value* case — a non-null but wrong location reads as a normal `tier='department'` row while matching no head's department, which is the exact orphan class `data-ops/004` had to clean up hours earlier. A trigger, not a CHECK (no subqueries) and not an FK (departments are plain text by standing rule), so there is still one department vocabulary. NULL was already impossible via `NOT NULL` + generated `tier`.
- **Loss-free, proven row-by-row:** the department-tier balance fingerprint is byte-identical before and after (`348a48f4…`), 559 rows / 10385 units, 0 orphans, every item holds both tiers.
- **Proved as the roles** (never as `postgres`): Sports Bar head sees exactly 283 department balances, Main Bar head 276 (via a rolled-back re-point), zero cross-department leakage — plus main-store rows, a known widening logged in FOLLOWUPS.
- **App pass:** 5 `current_stock` readers filtered to `tier='department'` (two were `maybeSingle()` calls that would have thrown on every event confirm); Stock Levels now shows a Location column and filters by location.
- **Deferred as one real-data operation:** catalogue dedupe (559 → 283) **and** the `stock_catalogue`/`stock_locations` split. See FOLLOWUPS — and note the merge key **does** exist (`RBA-`/`SBA-` + shared numeric suffix, 0 attribute mismatches across all 276 pairs); the deferral is about timing, not feasibility.

**Done 13 August 2026 — store→department issuing (`055`):**
- **`issue_stock`** moves stock between any two locations atomically, orchestrating two `apply_stock_delta` calls in deterministic lock order — no duplicated locking or fail-closed logic. Store **depletes**: proved live 100 → 90 with Sports Bar 17 → 27 on one 10-unit call.
- **`movement_type = 'issue'` widened in all three places** in the one migration: table CHECK `_v3` (replacing `_v2`), the RPC allowlist, and `MOVEMENT_TYPES` in `src/lib/stock.js`.
- **Requisition Fulfil rewired** — previously deducted the item's *own* department tier and credited nobody (fulfilling the Kitchen requisition deducted Sports Bar); now issues Main Store → the requesting department.
- **Fail-closed, no partial issue** (Dhiren-revisit logged). Department→store returns deferred; `issue_stock` is already direction-agnostic.
- **`pg_proc`: one signature per function, no overloads.** `apply_stock_delta` was replaced in place with a byte-identical parameter list, so its grants survived.

**Done 14 August 2026 — RLS visibility pass (`056`) + transfers fix (`057`), and the cleanup of a half-applied session:**

- **`056` RLS pass — APPLIED AND PROVEN (it had never executed).** `current_stock_dept_select` and `stock_items_dept_select` now scope on `current_stock.location`, not the deprecated `stock_items.department`. Policy count unchanged, 19 before and after; both old policies dropped, not left beside the new ones; no blanket `USING(true)` for `authenticated` anywhere (only the 2 pre-existing `service_role` ones).
- **FOLLOWUPS blocker 4c is DEAD**, proved before-and-after on the same scenario (issue Main Store → Kitchen 9 units, read as each head, rolled back):

  | Viewer | Before `056` | After `056` |
  |---|---|---|
  | Kitchen head (holds the stock) | **0 rows** | **1 row**, the Kitchen row, qty 9 |
  | Sports Bar head (gave it away) | **567 rows** — incl. the Kitchen row + all Main Store rows | **283 rows**, Sports Bar only, **0 store rows** |

  Main Bar head 276 rows / 0 store (via a rolled-back re-point — no Main Bar head profile existed yet); Restaurant head 0 rows, still data-absence not policy failure; owner and admin both 1118 rows across both tiers. The `current_stock → stock_items` join a head reads returns **0 null catalogue rows**, so `StockLevelsTab`'s unguarded `r.stock_items.name` cannot throw.
- **`057` `transfer_stock` + `TransfersTab` wiring** — the transfers bug is closed; see KNOWN BUGS above. `movement_type` is derived server-side (`'issue'` when either end is `'Main Store'`, else `'transfer'`) so a manual store→department move and the identical requisition fulfil cannot disagree in the ledger. Proved live: `Main Store → Sports Bar` returns `'issue'`, `Sports Bar → Main Bar` returns `'transfer'`, a `department_head` is denied `42501`.
- **`scripts/data-ops/005`** deleted the 2 orphan ledger rows from 27 July. `movement_type='transfer'` count is now 0; balances untouched (the movement never happened, so there was nothing to correct).
- **Migration history repaired to a clean `001`–`057`, 57 rows, no gaps.**

**Done 14 August 2026 — Movement Ledger (`058`) + event department fix (`006`):**
- **`058` — applied per-file, proven live as roles (rolled back).** `movement_type` CHECK widened `_v3`→`_v4` (adds `event_allocation`, `event_return`); both added to `apply_stock_delta`'s allowlist via in-place replace — **same oid `42385`, byte-identical signature, `proacl` unchanged, one signature in `pg_proc`** (the grant-survival trap this project has hit twice, closed with evidence). 1 event `adjustment` row backfilled → `event_allocation` (−10 preserved), 0 adjustment rows left, 536 total unchanged. Three indexes added to `stock_movements` (was pkey-only): `created_at DESC`, `stock_item_id`, `(from_department, to_department)`. **Migration history now `001`–`058`.**
- **Event confirm/return code re-typed** `'adjustment'` → `event_allocation`/`event_return` (4 sites). Runtime-proven in the browser: an event allocation wrote `event_allocation` at 09:38.
- **Movement Ledger tab** replaces `DeliveryLogTab` — all movement types, ±pair-collapse (`src/lib/ledger.js`), filters (item/type/department/date), Delivery-only preset.
- **`scripts/data-ops/006` (data-op, NOT a migration).** Event call sites wrote `from_department`/`to_department` as NULL, so the Movement Ledger department filter **silently dropped every event draw** (filtering Main Bar showed a −2 requisition and hid −10 and −13 event allocations on Main Bar — the ledger lying when filtered). Fixed and backfilled keyed on the **event-allocation join, not the deprecated `stock_items.department`** (both derivations confirmed to agree before writing), idempotent, 0 inserts/deletes. **data-ops now `001`–`006`.**
- **Delivery render fix:** `delivery`/`opening_balance` rows suppress the bogus `From → To`.

**Done 17 August 2026 — §2.6 re-proof run 6, history repair, and BAR PAR LEVELS (`059`):**

- **§2.6 run 6 — PASS, and run BEFORE `059` was written**, as the gate required. Throwaway `ezdzuncwptlslclxepii` (eu-west-1), confirmed empty, `001`–`058` pushed clean via `--db-url` (never re-linking), diffed against production, then deleted. **Tables 28/28, constraints 101/101, indexes 46/46, privileges 631/631, `pg_default_acl` 24/24, RLS 28/28, triggers 1/1 — all exact; every function body byte-identical by `md5(prosrc)`.**
- **🔴 The proof caught a real files gap `058` had hidden: a rebuild grants `anon` EXECUTE on `current_app_role`/`current_app_department`; production does not.** `050` resets already-created *tables* but never already-created *functions*, and `021`/`037`'s `revoke … from public` strips only the PUBLIC grant, not the explicit anon one. **This contradicted a FOLLOWUPS entry saying the debt "does not exist, do not re-litigate"** — that entry was right about production and wrong about the files, because it was written from a production-only probe. Fixed in `059` §10. **Doctrine: a claim that a debt is absent must say which database it was measured on.**
- **🔴 The proof also caught the record being wrong: production's migration history stopped at `057`.** `058` had been applied by hand and never recorded — exactly one gap, while its objects were live. STATE and FOLLOWUPS both claimed `001`–`058`. Repaired, re-read on a fresh connection: **58 rows, no gaps**. `059` was written on a proven base, not a believed one.
- **🟡 Accepted divergence:** `attendance_records` columns 14–18 are the same five columns in a different ordinal order. Set-identical, needs a table rewrite to align, no app effect.
- **`059` bar par levels — applied per-file** (dry-run with ROLLBACK first, negative control confirmed the dry-run really executes), then proven live as the roles. `current_stock.par_level`; `bar_count_sessions` + `bar_count_lines` with RLS, policies and grants in the same migration; `requisitions.count_session_id` + `source`; `post_bar_count` (SECURITY DEFINER, gated) and `fulfil_requisition_batch` (INVOKER). **`set_stock_quantity` replaced in place — oid `42386` and `proacl` unchanged.**
- **`set_stock_quantity` was writing NULL departments on every adjustment** — the exact fault `data-ops/006` fixed for events, which would have made hundreds of nightly count rows vanish from the Movement Ledger's department filter. Fixed in the same migration.
- **19/19 live role scenarios passed, rolled back.** End to end: SBA-1001 bar 17 → counted 1 → refilled to par 10, store 100 → 91.
- **Two tests were wrong before the code was** — one denial test was **vacuous** (it fulfilled a batch still `pending`, so the loop selected 0 rows and "passed"). Both corrected and re-run rather than accepted. That is the "a passing test proves the configuration live when it ran" lesson, hit again.
- **Frontend:** new **Bar Count** tab; **Par** column on Stock Levels; **Bar Refills** batch panel in Requisitions.
- **Folded in:** the delivery **Supplier column** restored in the Movement Ledger. **Main Bar DOES have a `department_head`** (`mainbar@woodlands.com`) — that STATE/FOLLOWUPS note was stale.

**Done 18 August 2026 — ROOMS + CONSUMPTION LEDGER (`060`):**

- **Applied per-file via `scripts/apply-sql.ps1`** (the UTF-8 + mojibake-refusal path from the 17 August tooling fix), dry-run-with-rollback first, then proven live as the roles. **Migration history now `001`–`060`**, recorded via `migration repair` immediately after applying — run 6's "applied but never recorded" finding is not repeated. **0 mojibake** in every function body and every comment, checked after applying.
- **`rooms`** — 24 placeholder rows, RLS in the same migration: SELECT to all authenticated, write owner/admin, **no DELETE policy and no DELETE grant**. **Not wired to Table Bookings' Private Room**, deliberately. **Admin → Rooms** tab manages it.
- **`v_stock_consumption`** — the consumption ledger as a **VIEW**, `security_invoker = true`, unioning the bar leg (posted `bar_count_lines` where `system_qty > counted_qty`) with the draw leg (`stock_movements` where `movement_type='consumption'`). No second copy of a number the system already holds, and base-table RLS is its access control.
- **`record_consumption`** (SECURITY DEFINER, gated owner/admin or the head whose department IS the location; Main Store refused) delegates the balance write to `apply_stock_delta` — one implementation of locking. `staff_dept_select` added so a head can read their own roster for the "who" picker.
- **`movement_type` CHECK `_v4` → `_v5`** (adds `consumption`), widened in all three places in the one migration, plus the Movement Ledger's own `TYPES` list — a fourth place that silently loses the *filter* when it drifts.
- **🔴 `apply_stock_delta`'s oid CHANGED, 42385 → 42960, and that is expected.** Adding `p_room_id`/`p_consumed_by` is a signature change; `CREATE OR REPLACE` with extra parameters overloads rather than replaces (the 052 trap). **`proacl` was asserted identical in-migration instead**, plus **exactly one signature in `pg_proc`**, plus a live `apply_stock_delta` call as `admin` under RLS, which is the only thing that proves the re-GRANT worked. Compare `proacl` and `md5(prosrc)` from here on, never oid.
- **🔴 The guard fired on the first dry run and caught a real defect in the file.** It granted without `revoke execute … from public`, so `proacl` came back with a leading `=X/postgres` — i.e. **anon** — on the function performing every stock write. Migration aborted, file fixed at source, re-run clean. Production never saw it.
- **Proven live as the roles, rolled back, on a REAL depletion — not a flat sheet.** Both 17 August counts are 100% flat, so they generate no consumption at all: a pre-filled sheet posted unchanged passes every test while measuring nothing. The proof therefore posted a fresh Sports Bar count with three items counted genuinely DOWN, and recorded two attributed draws. 12 scenarios, all passed — including a Housekeeping head denied at another department's location (42501), at Main Store (23514), attributing a Kitchen staff member (42501), and calling `apply_stock_delta` **directly** (42501 — the DEFINER wrapper is the only path), while `admin` calling it directly **succeeded**, which is the grant-survival proof.

  > **⚠ Read that rollback proof as dated (18 August), not as current state.** **Measured live 18 August: 727 `stock_movements`, 2 `v_stock_consumption` rows, 1135 `current_stock` balances** — real usage happened after the rollback. AUDIT_3 §7 flagged this exact line as a stale-reading claim; annotated rather than rewritten, because the proof itself was true.
- **Frontend:** Inventory gains a **Consumption** tab; Admin gains a **Rooms** tab.
- **Placeholder Housekeeping catalogue shipped in the same step** — Housekeeping held **zero** stock items, so the tab would have shipped empty for the one department that asked for the feature. 7 items. Self-contained, so unlike `053`/`059` it applies on a from-files rebuild too.

**Done 18 August 2026 — FARMERS MARKET PHASE 2 (`061` + data-ops/`008`):**

- `fm_waiting_list` + `fm_stall_forfeitures` (neither existed in any form before), `v_fm_attendance` as a `security_invoker` view that **replaces the client-side write-on-read that mutated `fm_holders.status` from a browser page load**, `fm_fee_schedule` with Dhiren's six confirmed fees, and two gated SECURITY DEFINER RPCs — `forfeit_stall()` (flag → owner/admin confirms → releases the stall number, records the forfeiture, offers it to the head of the queue, atomically) and `change_holder_products()`. **32/32 live role scenarios passed, rolled back.**
- `src/lib/constants.js`'s ID-card fees were **wrong, not stale** (5,000/10,000 against Dhiren's 30,000/20,000) and are corrected.
- Also fixed: the stall-number regex, which was two-digit and could not accept a single one of the 305 live `A001`–`A347` stalls, while Edit validated nothing at all.
- **⚠ `061` also shipped a fixed 3-level product taxonomy (`fm_categories` › `fm_product_types` › `fm_items`) and `fm_holders.category_id`. ALL OF IT WAS RETIRED IN `063` on 20 August** — it did not survive contact with real data (311/311 holders sat on `stall_type='Other'`, only 50 ever got a `category_id`, and the 51-item catalogue could not describe what these businesses actually sell). See the `063` entry in WHERE THE BUILD IS. **Nothing in this paragraph describes a live object.**

**Done 18 August 2026 — EVENTS UX (`062`):**

- **Two-phase session, gate first.** The `061` rebuild proof ran **before a line of `062` DDL existed** — run 9, PASS. **No new finding.**
- **`062` payments-editable — REVERSING ENTRY, applied per-file and proven live.** Dry-run-with-rollback first, and the **negative control fired** (a deliberately wrong policy-count assertion raised, proving the guards really execute inside the dry run rather than being skipped). Then applied and **recorded in the migration history immediately via `migration repair`**. **History now `001`–`062`, 62 rows, no gaps.**
- **The fork was decided by the schema, not by preference.** `event_payments` has **no DELETE grant and no DELETE policy** for `authenticated`, while `events` and `event_bill_items` both do — that absence is a decision. Edit-in-place would make the one table nobody may delete from silently mutable, destroy the original figure, and *still* need new `amended_by`/`amended_at` columns: it does not avoid the DDL, it spends it on worse columns.
- **One nullable `reverses_payment_id`**, FK `ON DELETE RESTRICT`, plus a **partial UNIQUE index** (one reversal per payment), two CHECKs, and a BEFORE trigger for the three rules a CHECK cannot express because they need a subquery. **No new policies and no new grants**, asserted in-migration.
- **Why the link column is not gold-plating:** without it `deposit_paid` cannot be recomputed — you cannot tell whether a reversal cancelled a deposit or a balance payment, so a reversed deposit would read as paid for ever and the Events List amber highlight would silently lie.
- **11/11 live role scenarios passed, rolled back:** reversing the deposit moved paid 1,300,000 → 1,000,000 and `deposit_paid` true → **false**; the same payment reversed twice refused `23505`; reversing a reversal refused `23514`; a hand-rolled direct insert refused by the trigger and an untyped pointer by the paired CHECK; admin reversing a *balance* correctly left `deposit_paid` false; `department_head` and `hr` both denied `42501`.
- **Frontend:** the Payments table gained a **Recorded By** column and a **Reverse** action per row, with reversed rows struck through and badged. `reversal` is deliberately **not** in the Add Payment dropdown.
- **🟡 Adjacent fix:** `OwnerDashboard` derived "deposit paid" as *a deposit row exists*, which after `062` would keep reporting a **reversed** deposit as paid. It now reads `events.deposit_paid` — removing a second, now-wrong definition rather than adding one.
- **⚠ `062` also shipped the toggleable Events revenue display (`f452a39`). IT WAS REMOVED in Block 3 on 20 August.** `src/lib/revenue.js` and its tests are kept as a library; no revenue surface exists. **Every payment path above is unchanged by that removal.**
- **🔴 The revenue work found a dead table, and this finding SURVIVES the removal: `deliveries`.** 0 rows, **RLS enabled with ZERO policies**, `authenticated` holding SELECT/INSERT/UPDATE it cannot use, and **no reader or writer anywhere in the app** — a delivery is really a `stock_movements` row, and `stock_movements` has no price column. `deliveries.unit_cost` is the only cost column in the schema, so **the system does not know what anything costs**, structurally. Drop-or-wire is a handover decision, logged in FOLLOWUPS.

**Production cleanup, still outstanding (cosmetic, not blocking):** drop the 2 legacy duplicate `service_role` policies (`departments`, `user_profiles`) from production.
