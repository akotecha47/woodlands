# WOODLANDS — HISTORY

*Chronological record of decisions, meetings, pivots, and lessons. Append-only. Terse.*

---

## ORIGIN

**Family relationship — Dhiren is Aman's uncle.** Warm intro by definition. The build exists because a family member wanted a system built for his lodge, and Aman said yes.

**Commercial framing decided at inception:** free. Aman cannot charge his uncle. This was never a commercial deal.

**Non-cash exchange:** a professionally built, working, secured system delivered no different from a paying client's. In return: a genuine testimonial and referrals to Dhiren's contacts if the delivery earns them.

---

## TIMELINE

**9 May 2026 — Meeting 1.**
First proper meeting with Dhiren. Modules scoped — Inventory, Events, Farmers Market, Table Bookings, Attendance, Admin. Six modules, four system logins, four roles, 62 staff.

**May–June 2026 — Build.**
Built with the old workflow (pre-Standard). Aman's own characterisation: *"your guess is as good as mine — I did it on old workflow, just take it as it comes, fuck it we ball type."* Rough timeline detail is not preserved. The modules got built; migration files and RLS discipline didn't.

**Standing rules embedded in `CLAUDE.md`** (established during build):
- All department references are plain text, never FK to a departments table
- Stock is deducted on requisition approval only, not on submission
- No biometrics this phase — manual clock in/out only

**July 2026 — Fable 5 audit.**
Read-only audit found 5 CRITICAL/HIGH compliance failures against what would later become the Standard v1.0:
- Service role key in the client bundle
- Admin RLS broken
- Public create-user endpoint — a stranger who finds the URL can self-promote to admin
- Migration files ≠ live schema
- No safe-testing separation

`WOODLANDS_AUDIT.md` written as output. Verified untracked (`U`) in repo as of 15 July screenshot. Needs committing.

**Mid-July 2026 — Hardening started.**
Aman began hardening but did not complete. Paused because Phalombe emerged as a live paying opportunity and became priority.

**24 July 2026 — Doctrine restructure.**
Whole project decomposed from single "Streamline One" project into Workspace + 3 client projects. This file created as part of the restructure.

**26 July 2026 — Second audit (AUDIT_2), morning.**
Fresh Fable 5 read-only audit against Standard v1.5. Zero source commits between 4 July and 26 July — all 7 CRITICAL/HIGH from the first audit still open. 7 new findings surfaced. Highlights: three tables (`events`, `event_payments`, `table_bookings`) had RLS on with zero policies (fail-closed but a dependency for the key strip); `staff` writable by any authenticated user via a stale 004 blanket policy; `is_active` never enforced (deactivation was cosmetic); `/inventory` route unreachable (roles.js key vs App.jsx mount mismatch); stock clamp created phantom inventory on cancel; `src/lib/standards.md` itself mandated the anti-pattern that produced the service-key spread. AUDIT_2 committed to repo alongside the 4 July audit; both retained for the diff.

**26 July 2026 — Pre-sprint cleanup.**
CLAUDE.md rewritten (correct 4-role list, correct stock deduction triggers, pointers to Standard/state/audits/followups). Standard v1.5 confirmed in repo root. State doc header synced (was v1.3, drift caught late). `SYSTEM_AUDIT.md` renamed to `WOODLANDS_FUNCTIONAL_SPEC.md` with staleness note. `WOODLANDS_FOLLOWUPS.md` created. `src/lib/standards.md` prepended with superseded warning pending Sprint B rewrite.

**26 July 2026 — Sprint A (Foundations).**
Migration `021_sprint_a_policies.sql`: RLS policies for events, event_payments, table_bookings, user_profiles, plus grants + policies for event_checklists, shift_settings, tables; stale 004 staff blanket dropped; `current_app_role()` SECURITY DEFINER function added. `create-user` Edge Function authenticated + CORS pinned. `is_active` enforced in RouteGuard, Login.jsx, and SQL. Verified live: 43 policies across 9 tables. Per-role sidebar walkthrough confirmed for all four roles. `db push` disqualified for this and future work because remote history records only 001–007 — 008–020 ran directly and would replay on push, duplicating the 62 real staff rows. All migrations from 021 onward applied through Supabase SQL Editor or Management API.

**26 July 2026 — Sprint B (Strip the service role key).**
`src/lib/standards.md` rewritten (mandates anon client + Edge Functions, forbids `supabaseAdmin` in browser). `CheckIn.jsx` migrated to a new `public-checkin` Edge Function. Migration 022 added policies + authenticated DML grants for 14 more tables — 11 of them had unreachable SELECT policies due to missing GRANTs, a defect invisible to source-only audits. 35 files migrated off `supabaseAdmin` to the anon client, module by module. Legacy JWT-based API keys disabled — the exposed key from before permanently invalid. Migrated to the new key pair (`sb_publishable_*` + `sb_secret_*`). `SERVICE_ROLE_KEY` project secret rotated. `src/lib/supabaseAdmin.js` deleted. `VITE_SUPABASE_SERVICE_ROLE_KEY` removed from `.env.local` and Vercel. Verified: fresh `dist/` grep for old key returns zero; only JWT in bundle decodes to `role=anon`. Five CRITICALs open since 4 July — closed.

**26 July 2026 — Sprint C (Money and quantity guards).**
Task 1: Event Add Payment fixed — dropdown source changed from `staff` to `user_profiles`, matching the `auth.users` FK and existing read path. Bug had existed since 28 May, invisible until Sprint B's smoke test. Task 2: Migration 023 added positive-amount CHECK constraints on event_payments, fm_payments, event_bill_items — pre-validated against live data (all 31 rows clean). Task 3: Migration 024 added `returned_qty` and `deducted_qty` columns to event_stock_allocations; stock clamp changed from "warn and continue" to "fail closed" at three sites. Task 4: Migration 025 added `apply_stock_delta` and `set_stock_quantity` RPCs; five sites refactored (a fourth stock-writing site — AdjustmentsTab — surfaced mid-sprint per stopping rules). Event stock now writes stock_movements rows where it previously wrote none (audit-trail improvement, flagged as behaviour change for Delivery Log consumers).

**26 July 2026 — Sprints D + E (compressed for demo scope).**
Sprint D Priority 1: `fm_market_days` created (migration 026) — the only ghost table that didn't exist at all. Previously-unapplied migration 014 (`checked_in_at`/`checked_out_at` on fm_visits) run. `fm_visits.notes` ghost column added (migration 027). Sprint E must-ships: `/inventory` route fix, dead `store_supervisor` gates deleted, Farmers Market cards gated to owner/manager on Dashboard, `event_payments.recorded_by` populated, "Needs Attention" cards navigating correctly. Six ghost tables + three ghost columns closed. Three ghost tables (`event_checklists`, `shift_settings`, `tables`) still uncreatable from migrations — Standard §2.6 rebuild test still fails, deferred to post-meeting.

**26 July 2026 — Browser bug hunt (seven bugs found, all fixed and retested).**
Every bug tonight was invisible to source audits and surfaced only in browser verification:
1. Attendance manager Override crashed on `date` NOT NULL — two-write-path structural fault from AUDIT_2 §4.1.
2. Task 6 card gating only partial — kitchen and restaurant managers still saw Attendance/Events cards.
3. Market Conditions field not editable — MarketDayTab component bug.
4. QR check-in lookup returned "Business not found" — public-checkin Edge Function outage from a stale `SERVICE_ROLE_KEY` project secret (still held the legacy JWT after legacy keys were disabled).
5. QR check-in write failed after lookup fixed — `fm_visits.notes` ghost column referenced by MarketDayTab (migration 027).
6. Requisitions Submit threw schema-cache error — `reason` column missing; deeper analysis showed six-column drift between the live `requisitions` table and the `008_inventory.sql` intent, because `008`'s comment said "drop table first" and no session had (migration 028).
7. Add User `sb_secret_*` verification claim was false — the passing test had actually run with the legacy JWT still in the secret. Corrected in doctrine.

All seven fixed, browser-verified end-to-end (including QR scan on phone, per-role smoke, deactivated user rejection). Sprint C RPC surface UI-verified for the first time via the requisition path — no double stock_movements rows.

**26 July 2026 — Client data files received.**
Dhiren provided the real operational data: `Stallholders_Database.xlsx` (Feb 2026 sheet with the real Farmers Market register), `STAFF_SALARIES_AS_25_03_2026.xlsx` + `STAFF_SHIFTS.xlsx` (58 real staff across 10 departments), `Bar_Stock.xlsx` + `Sports_Bar_Stock.xlsx` (559 items across two bars), `Kitchen_POS.pdf` + `RECEPTION_POS.pdf` (menus). Aman's policy call: real client data never enters the repo — only structured import SQL after analysis in the Claude project.

**26 July 2026 — Test data purge and Farmers Market data import.**
Test data purged: all transactional tables (events, event_payments, event_bill_items, event_stock_allocations, table_bookings, attendance_records, requisitions, stock_movements, fm_visits, fm_payments, fm_market_days) plus fm_holders (replaced entirely). Preserved: user_profiles, staff, stock_items master, departments, shift_settings. Current_stock reset to 0. Realistic seed added: 2–3 days attendance, one confirmed upcoming event, table bookings for the coming week. Farmers Market import: 305 of 319 stallholders live (12 skipped for missing phone, 1 for missing name, 1 duplicate 226 deferred to Rose). Migration 029 added `fm_holders.products` as text blob (post-meeting normalisation into `fm_approved_items` pending Rose's disambiguation of comma-vs-internal-comma product names). Import SQL committed to `scripts/data-ops/` — separate from `supabase/migrations/` so a rebuild-from-migrations doesn't replay data-mutating operations.

**26–27 July 2026 — Bar stock import.**
Two-bar question resolved as separate bars (Restaurant Bar + Sports Bar), not merged. 559 items imported — 276 Restaurant Bar + 283 Sports Bar — from `Bar_Stock.xlsx` + `Sports_Bar_Stock.xlsx` via `scripts/data-ops/002_bar_stock_reset_and_import.sql`. Migration 030 widened `stock_movements.movement_type` to permit `opening_balance`. Item names + SKUs real; quantities are deterministic demo values pending Dhiren's stocktake.

**27 July 2026 — Known bug surfaced: transfers don't deduct stock.**
Browser test on the morning of the meeting. Requisitions deduct correctly (Sprint C RPC verified); department-to-department transfers don't. Not investigated further — post-meeting fix. Directly relevant to the two-tier inventory scope that came out of the meeting, where store→department movement is the core mechanic.

**27 July 2026 — Feedback meeting with Dhiren.**
Walkthrough of the six modules across roles. Went well — Dhiren approved the direction and gave substantial feedback that amounts to a second phase of work. Full capture in `WOODLANDS_MEETING_FEEDBACK_2026-07-27.md`.

Headline client decision: **prove the modules work before perfecting the data.** Real names of customers, clients, stallholders and staff are deprioritised until the modules are confirmed working the way Dhiren wants. The existing 305 stallholders / 62 staff / 559 stock items stay as the test bed; the missing-data chase (12 phone-NULL stallholders, stall 205, duplicate 226, joint Rose+Martin session) moves off the critical path.

Feedback themes: two-tier inventory (one main store → per-department sub-stores, one-in-many-out); bar par levels + end-of-day count/refill cycle; consumption attribution by department/room/staff with one-year laundry retention; expanded role model (owner, front-desk admin, multiple restaurant heads, one head per other department, HR); QR staff attendance check-in against lateness and no-shows; Farmers Market three-month attendance history + waiting-list forfeiture, three-level product taxonomy, fee schedule (product change 10k, ID cards 30k inclusive of two, replacement 20k); two UX defects (Events payments tab not editable, revenue display needs clarification).

Commitment to Dhiren: something to show on return, and a call on Monday 10 August with feedback. Post-meeting owed regardless of new scope: staff reconciliation with Martin, migration history reconciliation, stall 205 gap for Rose.

**9 August 2026 — Docs brought current to the end goal.**
Aman back in Malawi; deadline set as functional-complete on placeholder data by 15 August. All repo-facing markdown updated so Claude Code reads toward the end goal, not backward: `WOODLANDS_FUNCTIONAL_SPEC.md` rewritten from the stale 31 May version into the full end-goal system spec (target modules, [DONE]/[BUG]/[NEW]/[VERIFY] markers); `CLAUDE.md` re-pointed at Phase 2 as the current goal, roles/scope corrected, audits marked historical, QR-supersedes-manual rule added; `WOODLANDS_STATE.md` re-dated and re-aligned to the end goal; `WOODLANDS_FOLLOWUPS.md` reconciled (migration-030/`opening_balance` contradiction flagged for live probe, resolved items marked, Phase 2 absorptions tagged); the two audits given historical-snapshot banners rather than being rewritten. Four items flagged for live verification rather than trusted: the `movement_type` CHECK contradiction, GPS clock-in, the stall-number regex, and Add-User role branching.

**9 August 2026 — Migration reconciliation: read-only live diagnosis (Claude Code, Fable 5).** Probe before repair, nothing mutated. Settled the `movement_type` question (030 ran; FOLLOWUPS was the stale doc). Found four things the docs missed or understated: (1) `009_farmers_market.sql` opens `DROP TABLE fm_holders CASCADE` and would destroy all 305 stallholders on `db push` *before* `016` duplicates staff — every doc had named only `016`; (2) the duplicate `008` must be merged before any repair because `version` is a PK; (3) `supabase/seed.sql` is a misfiled migration carrying schema DDL and four ghost GPS columns, breaking `db reset`; (4) attendance migrations `010`/`012`/`017` drifted, with `012` never applied — a blanket `ALL/authenticated/USING(true)` RLS policy still on real staff attendance. Repair not run — strategic docs corrected first (this session). Repair queued as its own Claude Code session, snapshot first, 012's auth work split out.

**9 August 2026 — Migration reconciliation Session A (execution, Claude Code, Fable/Opus).** Snapshot taken first (Sprint B's skip not repeated). File-only fixes: merged the duplicate 008 into one file; fixed the 021 rebuild-order bug (ghost-table grants/policies moved into 031/032/033); documented the 010 FK to live (`auth.users(id)`), no live ALTER. Applied live and verified on fresh connections: 034 created the two genuinely-missing attendance indexes (1 → 3 indexes); 031/032/033/035 no-op'd against existing objects, rows preserved (22/12/12); 030 confirmed to widen the `movement_type` CHECK in-file, not just comment. History repaired to 001–035 minus 010/012/017 (verified by reading `schema_migrations` back, not the CLI). Real data unchanged (559/305/62). `db push` deliberately NOT run — 010/012/017 sit unrecorded below 031–035, so a push would execute 012 and rewrite live attendance RLS. Two new file-vs-live divergences surfaced on 010 (`shift_date`/`within_radius` defaults) — queued for Session B. **Gate not closed by design — Session B (012 auth) closes it.**

**13 August 2026 — Two-tier inventory built, in three sessions.** Foundation (`051`–`054`): a `location`/`sub_location` dimension on `current_stock` with a generated `tier`, the main store seeded at 559 rows, RPCs made location-aware, and a guard trigger rejecting any location that is not `'Main Store'` or a live department. Issuing (`055`): `issue_stock` moves stock between any two locations atomically by orchestrating two `apply_stock_delta` calls in deterministic lock order — the store genuinely depletes, and Requisition Fulfil was rewired onto it (it had been deducting the item's *own* department and crediting nobody, so fulfilling a Kitchen requisition deducted Sports Bar). The `055` proofs then surfaced a blocker: a department issued stock **could not see it**, because the RLS policies still scoped on the deprecated `stock_items.department` rather than `current_stock.location`. RLS was fenced out of that session, so `056` was written to fix it and the RLS pass was moved to the front of the queue.

**13–14 August 2026 — A session interrupted mid-apply, and the cleanup that followed.** The session that was to apply `056` and then fix transfers stopped part-way through, leaving production, git and the state docs in three different states. Nothing was corrupted, but nothing agreed either. A read-only assessment ran first — no fixes, no applies — and found: `057`'s `transfer_stock` applied **and** recorded; `data-ops/005` run, the 2 orphan ledger rows from 27 July gone; but **`056` never executed at all**, its policies still in their `039` form, leaving the visibility blocker live. Migration history read `001`–`057` with exactly one hole at `056`. The frontend fix existed only in the working tree, so `HEAD` still shipped the broken `TransfersTab` against a database that already had the fix. `057` and `data-ops/005` were untracked. `STATE`, `HISTORY` and `ARTIFACTS` had been deleted from the working tree, uncommitted.

The interrupted session's own commit message (`1f2d19e`) asserted the RLS pass had landed — "issued stock now visible to head, main-store rows hidden, old policies dropped." None of it was true against production. **A commit message is a claim about a file, never evidence about a database.** The assessment caught it only because it verified live instead of reading the log.

**14 August 2026 — Cleanup: `056` applied out of order, and reconciled.** Production had already run `057`; the files order `056` → `057`. Rather than assume the ordering was harmless, the two files were compared statement by statement: `056` is 2 policy drops + 2 policy creates + 1 column comment, `057` is one function create + grants + a comment. Disjoint object sets, so they commute — and after applying `056` second, `md5(prosrc)` on `transfer_stock`, `issue_stock` and `apply_stock_delta` was **byte-identical** to the pre-apply baseline, proving `057`'s work was undisturbed. History was then repaired to a clean `001`–`057` with no gaps, and `db push --dry-run` came back "up to date."

Blocker 4c was killed and proved on the same scenario before and after: issue Main Store → Kitchen 9 units, read as each head, rolled back. Before, the Kitchen head that *held* the stock saw **0 rows** while the Sports Bar head that had given it away saw **567** — including the Kitchen destination row and every Main Store row. After, Kitchen sees its 1 row and Sports Bar sees its own 283 and no store rows at all. **The over-exposure was the more dangerous half and it was the half nobody had named** — the original blocker was written up as "a head cannot see what it holds," which is a visibility failure; the same policy was simultaneously showing each head other departments' balances, which is a scoping failure. One clause fixed both.

**Lesson — a rebuild proof expires.** The §2.6 gate closed on `001`–`050` on 12 August. Seven migrations have landed since and **none has been through a from-files rebuild**. The gate is not a permanent property of the project; it is a statement about a specific range of files on a specific date. Logged as owed before the next migration is written.

**14 August 2026 — `051`–`057` re-proven (run 5).** Aman confirmed run 5 rebuilt `001`–`057` clean against production, closing the re-proof debt those seven migrations carried. Verbal confirm — the output is not yet in the record, so the closure should be re-anchored to the pasted artefact when convenient. `058` (below) is post-run-5 and now carries the owed-before-next-migration flag in its place.

**14 August 2026 — Movement Ledger built and committed (`058` + data-ops/`006`).** The Delivery Log (delivery-only) became a consolidated Movement Ledger showing every movement type with +/− direction: deliveries, adjustments, requisitions, issues, transfers, and — newly typed this session — event allocations and returns. `058` widened the `movement_type` CHECK `_v3`→`_v4` and the `apply_stock_delta` allowlist to add `event_allocation`/`event_return`, replacing the function in place so its oid and grants survived (the overload/grant trap this project has twice been bitten by, closed with `md5`/`oid`/`proacl` evidence); it backfilled the one historical event row from `adjustment`, and indexed `stock_movements`, which had carried only a pkey. Four event code sites were re-typed off `adjustment`. Pair-collapse (an issue/transfer writes a ±pair sharing item/type/created_at/from/to) was extracted to `src/lib/ledger.js` and unit-tested 31/31 rather than exercised in the browser, because production holds zero issue/transfer pairs by the standing no-placeholder-writes call.

**Lesson (⚑ DOCTRINE FLAG for Workspace) — a filter predicated on a nullable column silently excludes null rows, and "passes at the data layer" is not "the filtered view is honest."** The ledger's department filter is `from_department = D OR to_department = D`. The four event call sites wrote both columns NULL, so every event stock draw was **dropped from any filtered view** — the unfiltered ledger and the data-layer role proofs all passed, because nothing exercised the filter with data that should match through a null column. It surfaced only in a *filtered* browser check: Department = Main Bar returned a −2 requisition and hid a −13 event draw on the same department — the exact trust-in-the-numbers failure the ledger exists to prevent. Fixed in `data-ops/006` (allocations set `from_department`, returns set `to_department`; existing rows backfilled from the event-allocation join, **not** the deprecated `stock_items.department` — both derivations confirmed to agree before writing). **Candidate rule:** when a filter is added to a view, a proof must exercise the filter with data that should match *through* the nullable column, not merely confirm the unfiltered set. Belongs in the Standard's verification section, not just this project.

**Also logged (positive):** the "prove live as the role, rolled back, never as postgres" discipline held throughout — `058`'s function replace kept the same oid so grants survived, and the `006` backfill refused to trust `stock_items.department`, deriving department from the allocation record and stopping-if-ambiguous instead of guessing.

---

**18 August 2026 — two audits, run in parallel, deliberately.** Aman ran a role-by-role **browser pass** over the live app while Claude Code ran `WOODLANDS_AUDIT_3.md`, a read-only **code audit** — every file under `src/` (all 69), both Edge Functions, targeted migrations, plus a measured read-only dump of production through `scripts/apply-sql.ps1 -ReadOnly`. Two ID series: `U-nn` for the browser findings, `C-nn` for the code ones. The split was the point, and AUDIT_3 §8 says so in its own words: *"behaviour as each role in a browser"* is listed as **not audited**, because the browser pass was the runtime half. Neither half is complete alone — the code audit found 48 findings including things no amount of clicking would reveal (a `maybeSingle()` that throws only for items holding two department-tier rows; a pair-collapse rule that had never had live data to exercise), while the browser pass found things no amount of reading would (`Invalid Date` on every All Bookings row; a department head being offered a tab that then refuses them). The two lists were merged into one queue.

**19 August 2026 — attendance: QR is dead, and the reason is that the client already owns the machine.** The design went through four positions in one conversation, and the arc is worth keeping because the ending invalidates the beginning:

1. **QR code per staff member** — the 27 July meeting proposal, specified in FUNCTIONAL_SPEC §4, reusing the Farmers Market `public-checkin` pattern.
2. **Card-and-scanner** — the design correction raised at the time: staff hold the card, *the lodge holds the scanner*, at a fixed on-premises point. A wall of QR codes scanned by staff phones fails twice over — not every staff member has a smartphone, and anyone can scan anyone's code off a wall.
3. **PIN** — considered as the no-hardware fallback, and rejected on the same ground that kills shared cards: a PIN is trivially given to a colleague, which defeats the entire stated requirement.
4. **The FA03H.** Dhiren **already owns a face-and-fingerprint machine.** Building a parallel capture mechanism next to a device already installed, already on site, and already used by staff would have produced a worse system than reading the one he has.

**Recommendation put to him: export/import, or invest.** Either the FA03H's records come off the device (USB or a vendor export) and we import them into `attendance_records` on a schedule, reconciling against the roster — no new hardware, no new spend — or it cannot export, and he invests in a networked unit with PC software we can read from. **He has to establish which; that is a question for the device or its supplier, not for us.** Pending the 28 August call. The whole module is frozen until it is answered.

**The requirement never changed, and separating it from the technology is the lesson.** Dhiren's own framing — *no login from home; catch lateness and no-shows; the owner should not have to sit and check* — is what QR, cards, PINs and the FA03H were all candidate answers to. Three months of design work sat on a solution nobody had checked against the hardware already in the building.

**Doctrine note, revised and not glossed.** The standing `CLAUDE.md` rule reads *"no biometrics this phase — manual clock in/out only."* The QR decision superseded the manual-only half on the reasoning that QR is not biometrics. **That reasoning does not carry to the FA03H path**, because the export path reads data off a face-and-fingerprint device. The honest position: **the system would not perform biometric matching — it would import the result of matching already performed on a device the client owns and operates.** No template, image or comparison would enter this codebase; only a staff identifier and a timestamp. That is defensible, but it is a *different* claim from the QR one, and it goes to Dhiren in those words rather than sitting implicit in a doc.

**19 August 2026 — Block 1 (correctness) landed** (`5d340b2`). The merged audit queue was split into three blocks — **Block 1 correctness · Block 2 look · Block 3 fee wiring**, then demo curation — and the first shipped: 17 findings, frontend plus exactly one data-op, **no DDL**, so the owed `062` rebuild proof was never triggered and still gates any `063`.

The corrections worth naming: the Movement Ledger had been rendering **every requisition fulfil twice** (94 live pairs, 188 of ~194 routed rows — the collapse rule had never had live data to exercise, so the defect shipped invisible); the Events List Edit modal was writing `status` and `deposit_paid` **directly**, bypassing the stock pipeline and 062's deposit machinery entirely, so confirming via Edit deducted nothing and cancelling returned nothing; Delete Event promised to delete payments and then threw a raw foreign-key string, because `event_payments.event_id` is `ON DELETE NO ACTION` by design; and event confirm **threw outright** for any item holding two department-tier balances, which HK-005/006/007 do.

**`scripts/data-ops/009_shift_settings_retag.sql`** finished a job `data-ops/003` left half-done on 12 August: 003 re-tagged `departments`, `staff` and `stock_items` to the canonical vocabulary and **missed `shift_settings`**, so staff in the affected departments matched no shift at all — Shift `—`, no late calculation, no coverage alert. AUDIT_3 named two stale values; **printing all twelve rows live found three** (`Grounds` → `Grounds & Landscape` was the third, stranding five further staff for identical reasons), and all three were re-tagged rather than leaving the bug half-live.

**Lesson (⚑ DOCTRINE FLAG for Workspace) — run the code audit BEFORE the fix pass, not alongside it.** This session fixed 17 findings and *then* wrote the plan that tracks them (`WOODLANDS_FIX_PLAN.md`, created after the work landed). It came out right, but only because the fix session was handed decisions D-1 through D-7 pre-made and a per-finding brief. That is the audit doing the plan's job informally. The failure mode it courts is real and was visibly close: **the Grounds re-tag was a scope deviation decided mid-execution** — correct, but decided by the executor because there was no plan document to amend and no reviewer between finding and fix. Writing the tracker first costs an hour and buys the thing the Standard's own sequencing exists for: **a decision recorded before the code moves, not reconstructed after it.** The audit → merged plan → block execution order should be the doctrine, with the plan doc as a required artefact between audit and fix.

**Lesson — a `[DONE]` marker that means "the code compiles" is a lie to the reader.** FUNCTIONAL_SPEC §4 carried Clock In/Out as `[DONE]` while **nothing in the app imports the component**. The marker was defensible as a claim about the code and false as a claim about the running system — and "how does a staff member clock in?" is precisely the question a client asks. Fixed by adding a `[NOT WIRED]` marker to the spec's legend and re-marking. **The test for `[DONE]` is "can a person reach it in a browser", never "does the file exist."** Worth noting the spec got this *right* elsewhere in the same document: §7's fee schedule is marked **PARTIAL** precisely because the table is wired and no charging surface reads it. The honest marker already existed; it just wasn't applied consistently.

**Also logged (positive) — the read-before-write discipline paid twice in one session.** STEP 0 diagnosis before any fix caught two things that would otherwise have shipped wrong: the C-27 attendance join turned out to need `staff.full_name` via `staff_id` (there is no `staff.name`, and `user_id` is NULL on 15/15 live rows), and the U-11 login fix was verified safe only *after* confirming there is no `username` column and all 8 auth rows share the domain. The shift re-tag was dry-run inside a rolled-back transaction, the baseline re-queried and confirmed before applying for real, and C-18's fix was proven against the actual HK-006 rows — old read returns 2 rows, new read returns 1, byte-identical to the row `apply_stock_delta` targets.

---

## EXEC DECISIONS

- **Free build at inception (implicit but decided).** Aman will not charge Dhiren. Non-negotiable.
- **Delivered to paying-client standard regardless (May 2026).** The commercial framing does not lower the technical standard. The system Dhiren gets is the system a paying client would get — same security, same handover discipline, same follow-through.
- **Hardening paused mid-July, resumed 26–27 July (24 July decision).** Phalombe took priority through late July; Woodlands returned to the front of the queue.
- **Sprint plan revised on 26 July per AUDIT_2 dependency graph.** Original W1–W4 (strip key → kill signup → RLS rewrite → schema reconciliation) superseded by A–F because the audit revealed policies had to precede the strip and `src/lib/standards.md` had to be rewritten in the same change as the key removal or the fix regresses.
- **26 July, mid-afternoon: meeting frame reset from "handover-track demo" to "feedback session."** Aman not confident everything is 100% under scrutiny; real stock data absent even if every screen worked; travel Tuesday–Thursday makes any bug found tomorrow wait 10 days. Under-promise, over-deliver. Real handover targeted for week of 11 August after Aman returns.
- **Client data segregation policy (26 July).** Real Woodlands data files never enter the repo. Analysis, correction, and mapping happen in the Claude project; only the resulting structured SQL leaves. Applies to stallholders (import done), staff (post-meeting), bar stock (post-Dhiren-decision), and menus.
- **Snapshot posture (26 July).** Pro tier scheduled backups only (7-day retention). No on-demand snapshots taken; PITR add-on declined at $100/7 days. Restore point for every sprint is the previous scheduled backup + git for code. Accepted with the reasoning that a lost sprint restarts from git in an evening.
- **Test data purge scope (26 July).** Transactional tables + fm_holders purged, user/staff/master reference data preserved, current_stock reset to 0. Realistic starter seed rather than pure emptiness. Alternative — leaving test data and framing it at the meeting — considered and rejected once real stallholder data was available.
- **User lifecycle: deactivate as default, hard-delete deferred as an option (26 July).** Preserves FK integrity across `recorded_by` / `created_by` / `received_by` etc. Hard-delete Edge Function is post-meeting scope if Dhiren wants it.
- **Migration history reconciliation promoted to post-meeting Priority 1 (26 July).** Was "post-demo cleanup" — after three ghost-schema bugs in one night all traced to unrecorded migrations, it stopped being a cleanup task and became a systemic root cause. Standard §2.6 rebuild-from-migrations test still fails until this closes.
- **Scope questions deferred to Dhiren at meeting:** two-bar inventory (separate or merged), comped bill items (allow zero-value lines?), stall number format sign-off (three-digit A001-A347), outstanding-balance visibility after event completion, delete-user needed, whether to consolidate Delivery Log into a Movement Ledger.
- **Data questions deferred to Dhiren at meeting:** when he can do a stocktake for bar stock import, whether the Feb 2026 stallholder register is still current, whether Kitchen POS + Reception POS PDFs are current menus, when he sets up his own Supabase/Vercel/GitHub accounts for handover.
- **Two-bar inventory resolved as separate (27 July).** Restaurant Bar and Sports Bar are distinct stock locations, not merged. The bar import ran on this basis.
- **Prove modules before perfecting data (27 July, Dhiren's call).** Data accuracy is deprioritised until every module is confirmed working per his requirements. Existing real data retained as the test bed; the missing-data chase moves off the critical path. Reinforced by the fact that the feedback scope changes the schema substantially — reclassifying 305 stallholders or assigning 62 staff to departments before the taxonomy and role model exist would be work done twice.

---

## LESSONS EARNED

**⚑ DOCTRINE FLAG (for Workspace) — a disqualified `db push` must enumerate EVERY destructive replay, not the first one found.** For weeks every Woodlands doc stated "`db push` is disqualified because `016` duplicates 62 staff." The 9 August diagnosis found `009` drops all 305 stallholders and runs *before* `016`, and `028` drops requisitions — so anyone who "handled 016" and then pushed would still have lost the largest body of real data. The failure was analytical: naming a representative hazard instead of scanning the whole migration set for `DROP`/`INSERT`-without-`ON CONFLICT`/`DELETE`. Candidate Standard rule: when `db push` is disqualified, the disqualifying analysis must list all destructive statements across all unrecorded migrations before the reason is considered documented. Belongs in the Standard's migration/rebuild section, not just this project.

**Security concerns is the biggest thing.** Aman's own single-line takeaway from the original build. The public create-user vulnerability specifically — anyone finding the URL can create themselves a privileged account — is the kind of thing that would have been caught at Stage 3 (SET UP) under the Standard, not discovered at Stage 5 by an audit. A direct piece of the argument for building Standard-native from Stage 1.

**"Fuck it we ball" builds are technical debt at scale.** The build works — modules function, the audit found genuine skill in the code — but the absence of migration files, staging discipline, and RLS-at-creation means every remediation is now more expensive than it needed to be. Not a criticism of the effort; a data point supporting the Standard's existence.

**Family clients are commercially different but technically identical.** The temptation with a free family build is to skimp — "it's for family, they won't push, they trust you." Doing the opposite (fully hardened, professionally handed over) is what makes Woodlands actually useful as a reference case for future commercial clients.

**Three verification methodology lessons — all learned the hard way on 26 July, all now written into `src/lib/standards.md` §4:**

1. **A passing test proves the configuration live when it ran, not the one you believe you set.** Add User succeeding was recorded as verifying the new `sb_secret_*` key. It actually ran while `SERVICE_ROLE_KEY` still held the legacy JWT, so it verified the old key. The false claim then sat in doctrine until a probe of the "new" configuration revealed the Edge Functions were dead.

2. **Never probe with a secret value read from the Supabase Management API.** Publishable keys come back usable; secret keys come back as non-functional placeholders. A probe using one produces an indistinguishable 401. Verify a secret only through something that already holds it — an Edge Function call, or the app itself. A working credential was deleted on 26 July on the strength of a probe that couldn't actually see what it claimed to see.

3. **Verification via rendered text is unreliable when console codepage differs from source file encoding.** Mojibake in a terminal may be the terminal's fault, not the data's. Verify by stored codepoints — `char_length` vs `octet_length`, expected Unicode points at expected positions. During the Farmers Market import, apostrophes rendered as `â` in the console but were correctly stored as U+2019 — caught by checking byte-level state, not by trusting the eye.

**Ghost schema is a systemic symptom of broken migration history.** Three ghost-column faults in one night — `fm_visits` missing `checked_in_at`/`checked_out_at`, `fm_visits.notes` missing, `requisitions` column set drift — all traced to the same cause: migrations that were never applied or never written. The rebuild-from-migrations test in Standard §2.6 is the immune system for this class of bug; while migration history is unreconciled, that immune system is disabled. Migration history reconciliation deserves the same seriousness as a security finding.

**Source audits don't replace runtime verification.** Every one of the seven bugs found on 26 July was invisible to source-only review. Some (like the GRANT vs POLICY gap on 11 tables) were invisible without running SQL against the live DB. Others (Add User `sb_secret_*` verification) required an end-to-end test in the browser because the code path involved manually-set project secrets whose state can't be inferred from source. Audit + probe + browser is three layers, and skipping any one of them ships bugs the other two can't catch.

**Reachability > module ownership when scoping fixes.** Sprint C Task 4 was scoped for three stock-writing sites (identified from the modules named in AUDIT_2 findings). A fourth (AdjustmentsTab) surfaced during work because it wrote to `stock_movements` and had a similar ordering flaw, even though it wasn't in the same "module" as the others. Fixing by "which module owns the bug" misses cross-cutting root causes. Fixing by "which code paths touch this surface" catches them.

**Doctrine drift is silent and time-consuming.** The state doc header claimed Standard v1.3; the on-disk Standard was v1.5. The rest of the state doc was internally consistent with v1.5, so the drift was only caught by a Fable audit that quoted specific §numbers. Small fault, but hours of "did we regress?" debugging until it was diagnosed. Version-sync during doctrine propagation deserves a mechanical check, not a trust step.

**Under-promising is stronger than reaching.** Frame changed mid-afternoon on 26 July from "demo a fully working system" to "feedback session, real handover after I'm back." That reframe made every subsequent decision easier — what to fix tonight, what to defer, what to ask Dhiren, how to answer "is it ready?" honestly. Materials §Client Communication Doctrine says as much; today made it concrete.

---

## RETIRED / SUPERSEDED

- **Original W1–W4 sprint plan** (strip key → kill public signup → RLS rewrite → schema reconciliation). Superseded by Sprints A–F on 26 July per AUDIT_2's dependency graph. Preserved in state doc's Sprint Plan section as historical.
- **"Woodlands demo-ready as fully working system for Monday 27 July"** (mid-morning framing). Superseded mid-afternoon by "feedback session, working towards mid-August formal handover." Reason: honest capacity assessment plus real-data absence.
- **"WOODLANDS_DEMO_PREP.md as project-context-only document"** (26 July afternoon). Superseded — needs to live in the repo for provenance and for Claude Code to read directly.

**Retired 20 August 2026 — three things that were built, shipped, and then deliberately removed.** Recorded here because each was in the Phase 2 scope and a reader will otherwise go looking for it:

- **Events revenue tracking** (`f452a39`, 18 August → removed in Block 3, 20 August). Three toggleable readings — Cash Received / Net of Cost / By Line — with a non-dismissible provisional note, built rather than guessed because "revenue should be different in Events" was never made specific. **Removed rather than resolved:** re-reading the 27 July record, that ask sits among requests about *recording payments*, and building a revenue apparatus he never asked for and then making him adjudicate it was solving the wrong problem. The Events-List tile is now "Payments Received · This Month". No payment path changed; `src/lib/revenue.js` is kept as a library.
- **The Farmers Market 3-level product taxonomy** (`061`, 18 August → dropped in `063`, 20 August). `fm_categories` › `fm_product_types` › `fm_items`, plus `fm_approved_items` and `fm_holders.category_id`. **It did not survive contact with real data:** 311 of 311 holders sat on `stall_type = 'Other'`, only 50 ever received a `category_id`, and the 51-item catalogue could not describe what these businesses actually sell. Replaced by a per-holder free-text approved list (`fm_holder_products`), backfilled from the register text that had been in the database the whole time. **Retired outright rather than left dormant — two live product models is exactly how "Other: 311" happened.**
- **`fm_holders.stall_type`** (dropped in `063`). A five-value CHECK column, `NOT NULL`, `'Other'` on every row since the February 2026 import, read by nothing but its own constraint. Deprecated in place by `061` because dropping a `NOT NULL` column is DDL; dropped once the gate allowed it.

---

## LOOKING AHEAD (not commitments, orientation only)

**⚠ The list below was written pre-11-August and is now historical — the dates in it have passed and AUDIT_3 ran on 18 August, ahead of real data rather than after it. Current forward plan:**

- **~~19–27 August — Block 2 and Block 3~~ — both SHIPPED 20 August**, along with migration `063`. `WOODLANDS_FIX_PLAN.md` carries the per-finding record. **Nothing is left to build.** What remains before the walkthrough is demo curation, a full role-by-role run-through, and a final audit pass.
- **Fri 28 August — feedback call.** Dhiren owes **decisions, not data**. The three that matter: the **FA03H export-or-invest answer**; **whether a product REPLACE counts as one change or two** (`063` charges `|added| + |removed|`, so a swap costs 2× the fee — a money rule on real stallholders, and the brief's wording admits the other reading); and **Rose's shift times** for Administration, Maintenance and Transport (8 staff currently resolving to `—`). Full ask list in `WOODLANDS_CLIENT_INPUTS.md`.
  - *"Which revenue reading" is no longer on that list.* It was, until 20 August — Events shipped three toggleable readings for him to choose between. **Block 3 removed the feature instead**, on the reading that he asked to record payments rather than to track revenue. Resolved by removal, not by his answer.
- **Mon 31 Aug / Tue 1 Sep — full-system walkthrough.** The deadline everything is judged against.
- **Then:** real-data load (joint session with Rose + Martin), an audit against real data, and Sprint F handover mechanics.
- **The rebuild-proof gate has moved, not closed.** §2.6 run 10 discharged `062` on 20 August, before `063` was written. **`063` is the proof now owed, before any `064`.** It is a standing per-migration discipline — a proof expires the moment the next migration exists.
- **Attendance is frozen** until the FA03H answer lands. QR is superseded and will not be built.

*Historical, kept as written:*


- **27 July — Feedback meeting held.** Went well. Produced a second phase of scope, captured in `WOODLANDS_MEETING_FEEDBACK_2026-07-27.md`. Forward planning of that phase is the next working session; the items below predate the meeting and remain broadly valid, but the 8–10 August window now also carries the feedback scope, sequenced behind migration reconciliation.
- **28 July → 6 August — Aman travelling.** No dev work. Meeting notes marinate.
- **7 August — Aman back in Lilongwe.**
- **8–10 August — Any scope changes from Dhiren's feedback plus post-meeting priorities:** three ghost-table CREATEs, migration history reconciliation, attendance UTC boundary, widen `stock_movements.movement_type` for event allocations, drop dead tables, `public-checkin` `detail` field hardening.
- **11–14 August — Joint session with Rose (market + stock) and Martin (staff).** Sprint E½ data migration: 12 phone-NULL stallholders resolved, stall 205 filled, duplicate 226 clarified, real bar stock loaded (schema shape per Dhiren's two-bar decision), staff roster reconciled against 58 real vs 62 in migration 016.
- **Post-data-load: AUDIT_3.** Fresh Fable audit against Standard v1.5 with real data loaded. First audit against a system that reflects operational reality.
- **Sprint F — Handover mechanics.** Transfer Supabase / Vercel / GitHub ownership to Dhiren's own accounts (requires him to have set them up beforehand — asked at 27 July meeting). One-page reference doc. Warranty statement.
- **Final handover meeting — target week of 11 August.** Dhiren gets the working system with real data live. Testimonial + referrals ask happens after handover, not at any prior meeting.
- **`WOODLANDS_RETROSPECTIVE.md`** per Standard Stage 7 after handover. Three questions:
  1. What did this build teach us?
  2. What should the Standard / Materials / Session doctrine now say that it didn't?
  3. What is now templatable? (Especially: hospitality template — six-module lodge structure is directly re-usable. Also: the Sprint A–F retrofit playbook, if it turns out other legacy builds need the same treatment.)
