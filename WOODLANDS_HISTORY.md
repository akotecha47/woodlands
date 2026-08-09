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

---

## LOOKING AHEAD (not commitments, orientation only)

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
