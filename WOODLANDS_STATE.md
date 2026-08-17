# WOODLANDS — STATE

*Current state, live commitments, next action. Updated at the end of every session that changed state.*

**Last updated: 17 August 2026**
**Governing doctrine:** STREAMLINE_BUILD_STANDARD.md v1.5, STREAMLINE_MATERIALS.md v2.4, STREAMLINE_SESSION.md v2.0.

---

## WHAT IT IS

Lodge in Lilongwe. Family relationship — Dhiren is Aman's uncle.

- **Owner:** Dhiren (Aman's uncle)
- **Ops manager:** Rose Ngalawango
- **HR:** Martin Lisilira
- **Staff:** 62 in `staff` table
- **Modules built (6):** Inventory, Attendance, Events, Table Bookings, Farmers Market, Admin
- **Roles (4):** `owner`, `admin`, `department_head`, `hr`
- **System users:** 4

---

## THE GOAL — PHASE 2, FUNCTIONAL-COMPLETE ON PLACEHOLDER DATA

**Target: a fully functioning app on placeholder data by the week of 11 August (deadline 15th).** Every screen works and is populated. Once Dhiren verifies the modules work to his satisfaction, real data goes in — not before.

**The end-goal system is specified in `WOODLANDS_FUNCTIONAL_SPEC.md`.** Scope source is `WOODLANDS_MEETING_FEEDBACK_2026-07-27.md`. Read the spec for what "finished" looks like module by module.

**Client framing decision (Dhiren, 27 July):** prove the modules work before perfecting the data. Existing real data (305 stallholders, 62 staff, 559 stock items) stays as the test bed; the missing-data chase (bar stocktake, department stock lists, staff reconciliation, menus, 12 missing phone numbers) is off the critical path for this week.

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

---

## WHAT'S LIVE — REAL VS PLACEHOLDER

**Real:** 305 Farmers Market stallholders (via `scripts/data-ops/001`); 559 bar item catalogue — 276 Restaurant Bar + 283 Sports Bar (via `scripts/data-ops/002`), names + SKUs real; 62 staff roster; 4 system users.

**Placeholder / demo:** bar stock quantities (pending stocktake); attendance (2–3 seed days); 1 seeded event; a few table bookings.

**Empty / not there:** Kitchen, Restaurant, Housekeeping, Grounds, Security stock lists (departments exist, items don't); Laundry (not yet a department); Farmers Market visits + payments; menu items from POS PDFs.

---

## THE GATE — MIGRATION HISTORY RECONCILIATION (P1)

**✅ CLOSED — schema provably rebuildable from files (001–050), verified 12 August 2026 by full rebuild-and-diff. `db push` trustworthy for new schema.**

**Done in Session A:**
- Duplicate `008` resolved (merged to one file, one version).
- Ghost tables `event_checklists`/`shift_settings`/`tables` now have real CREATE migrations (`031`/`032`/`033`), applied live as no-ops (tables + rows preserved).
- Missing attendance indexes created for real (`034`): `attendance_records` went 1 → 3 indexes.
- Ghost GPS columns migrated out of `seed.sql` into `035`; `seed.sql` rebuild landmines removed (`bar_week_config`, `shift_settings` blocks, GPS columns).
- `021` ordering bug fixed (ghost-table grants/policies moved to `031`–`033`) so a from-files rebuild orders correctly.
- `010` FK documented to live (`auth.users(id)`), file-only, no live ALTER.
- History repaired to **001–035 minus 010, 012, 017** — verified on a fresh connection. `030` confirmed to widen the `movement_type` CHECK (not just comment).
- Real data unchanged: 559 stock items, 305 stallholders, 62 staff.

**Done in Session B (012 auth):** blanket `ALL/authenticated/USING(true)` policy dropped from `attendance_records`; the three unfiled "staff can… own attendance" policies reconciled under canonical names; `017`'s policy-name drift fixed; `seed.sql`'s attendance block removed; the two `010` default divergences documented to live, file-only. History repaired to **001–036**.

**Closed by the rebuild proof — 4 runs, 12 August 2026.** A clean `db push --dry-run` only proves the history table is recorded, not that the files reproduce the database — runs 1–3 found real unfiled drift a dry-run couldn't see: `016`'s `staff.full_name` nullability, ~20 unfiled columns on `events`/`table_bookings`/`event_payments`, `user_profiles`'s FK missing `DEFERRABLE INITIALLY DEFERRED`, and the GRANT/default-privileges layer — all hand-applied to production over months, never filed. Fixed as migrations `045`–`050`. **Run 4 pushed `001`–`050` into an empty throwaway and diffed byte-identical against production**: 28/28 tables, 302/302 columns, 101/101 constraints, 41/41 indexes, 435/435 grants, `pg_default_acl` and all four core functions byte-identical. RLS policies matched except 2 known production-only legacy duplicates (`departments`, `user_profiles`) — a production-cleanup item, not a file gap.

Full detail — all four runs, every divergence found and fixed, and the residual cleanup item — in `WOODLANDS_FOLLOWUPS.md`. `045`–`050` were rolled into production's migration history on 13 August via `migration repair` (never `db push` — `050`'s revoke/re-grant window must not run against live data).

**The proof covers `001`–`050` directly; `051`–`057` were re-proven by run 5 (14 August).** `058` is post-run-5 and has not been rebuild-proven — it is owed on the next migration written. See "§2.6 RE-PROOF" below.

---

## KNOWN BUGS / BROKEN PATHS

- **~~Transfers don't deduct stock~~ — FIXED AND PROVEN LIVE, 14 August 2026.** Migration `057` added `transfer_stock` (a thin delegation to `issue_stock`); `TransfersTab` now calls it instead of inserting two ledger rows directly. Proved as the `admin` role, rolled back: Sports Bar 17 → 10 with the Main Bar row created at 7, 2 ledger rows, `movement_type` `'transfer'`. The 2 orphan ledger rows the bug wrote on 27 July were deleted via `scripts/data-ops/005`.
- **Events payments tab not editable.** Recordable, not correctable. Phase 2 UX fix.
- **`public-checkin` returns an internal `detail` field on failure.** Aids diagnosis; drop before handover.

---

## VERIFY-AGAINST-LIVE (don't trust the docs)

- **~~`stock_movements.movement_type` CHECK~~ — SETTLED 9 August.** Live constraint permits `opening_balance`; migration 030 ran. FOLLOWUPS was the wrong doc (a stale pre-apply probe); HISTORY/ARTIFACTS were right. Now corrected.
- **GPS clock-in geofence** — the four GPS columns are now migrated (035); three attendance components read them. Confirm the geofence *logic* in code before relying on it.
- **Stall-number regex** in Add Holder — two-digit vs live three-digit `A001`–`A347`.
- **Add User** — does it still branch on dead bar1/bar2 `bar_week` logic?

---

## PHASE 2 SCOPE (see FUNCTIONAL_SPEC for detail)

Two-tier inventory + per-department stock lists · bar par levels + end-of-day refill cycle · consumption attribution (what/where/who) + rooms + 1-year laundry retention · QR staff attendance · Farmers Market 3-month attendance history + waiting-list forfeiture + 3-level product taxonomy + fee schedule (10k / 30k / 20k) · Events payments editable + revenue display.

**Role model (`department_head` scoped, `admin`, `hr`) — DONE**, out of open scope. See "NEXT ACTION" above.

---

## LIVE COMMITMENTS

- **Full working system delivered no different from a paying client.**
- **Something to show on return, and a call with Dhiren.** Made 27 July. Aman back in Malawi; call likely early in the week of 11 August, exact day TBC.
- **Testimonial + referrals** post-handover. Nothing specific discussed yet.

---

## CADENCE

- **26–27 July** — hardening (Sprints A–E) + FM import + bar import + feedback meeting.
- **28 July – 7 August** — Aman travelling (South Africa, medical). No dev work.
- **9 August** — docs brought current to end goal; migration diagnosis + Session A (history repaired).
- **10 August (today)** — docs updated post-Session A; Session B (012 auth) next to close the gate.
- **10–15 August** — Session B closes the gate, then Phase 2 build to functional-complete on placeholder data. Deadline 15th.
- **Call with Dhiren** — early in the week, day TBC; then the full working app for verification.
- **After Dhiren verifies** — real data goes in (joint session with Rose + Martin), then `WOODLANDS_AUDIT_3.md` against real data, then Sprint F handover mechanics.

---

## NEXT ACTION

**Migration gate closed, role model live, department vocabulary reconciled — none of these block anything anymore.** Two-tier inventory is the actual next build.

**Done since the last update (12 August 2026):**
- **Migration gate — CLOSED.** See "THE GATE" above; `db push` trustworthy for new schema.
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

  Main Bar head 276 rows / 0 store (via a rolled-back re-point — no Main Bar head profile exists yet); Restaurant head 0 rows, still data-absence not policy failure; owner and admin both 1118 rows across both tiers. The `current_stock → stock_items` join a head reads returns **0 null catalogue rows**, so `StockLevelsTab`'s unguarded `r.stock_items.name` cannot throw.
- **`057` `transfer_stock` + `TransfersTab` wiring** — the transfers bug is closed; see KNOWN BUGS above. `movement_type` is derived server-side (`'issue'` when either end is `'Main Store'`, else `'transfer'`) so a manual store→department move and the identical requisition fulfil cannot disagree in the ledger. Proved live: `Main Store → Sports Bar` returns `'issue'`, `Sports Bar → Main Bar` returns `'transfer'`, a `department_head` is denied `42501`.
- **`scripts/data-ops/005`** deleted the 2 orphan ledger rows from 27 July. `movement_type='transfer'` count is now 0; balances untouched (the movement never happened, so there was nothing to correct).
- **Migration history repaired to a clean `001`–`057`, 57 rows, no gaps.** `db push --dry-run` reports "Remote database is up to date."

**Done 14 August 2026 — Movement Ledger (`058`) + event department fix (`006`):**
- **`058` — applied per-file, proven live as roles (rolled back).** `movement_type` CHECK widened `_v3`→`_v4` (adds `event_allocation`, `event_return`); both added to `apply_stock_delta`'s allowlist via in-place replace — **same oid `42385`, byte-identical signature, `proacl` unchanged, one signature in `pg_proc`** (the grant-survival trap this project has hit twice, closed with evidence). 1 event `adjustment` row backfilled → `event_allocation` (−10 preserved), 0 adjustment rows left, 536 total unchanged. Three indexes added to `stock_movements` (was pkey-only): `created_at DESC`, `stock_item_id`, `(from_department, to_department)`. **Migration history now `001`–`058`.**
- **Event confirm/return code re-typed** `'adjustment'` → `event_allocation`/`event_return` (4 sites: `EventDetailTab` confirm/cancel, `EventStockSection` add/clearance). Runtime-proven in the browser: an event allocation wrote `event_allocation` at 09:38.
- **Movement Ledger tab** replaces `DeliveryLogTab` — all movement types, ±pair-collapse (`src/lib/ledger.js`, tests 31/31), filters (item/type/department/date), Delivery-only preset. Browser-verified 14 Aug: renders, filters, preset, backfill row, and the event path emitting `event_allocation`.
- **`scripts/data-ops/006` (data-op, NOT a migration).** Event call sites wrote `from_department`/`to_department` as NULL, so the Movement Ledger department filter **silently dropped every event draw** (filtering Main Bar showed a −2 requisition and hid −10 and −13 event allocations on Main Bar — the ledger lying when filtered). Fixed: `event_allocation` sets `from_department`, `event_return` sets `to_department`; existing rows backfilled keyed on the **event-allocation join, not the deprecated `stock_items.department`** (both derivations confirmed to agree before writing), idempotent, 0 inserts/deletes. Proved live: owner Main Bar filter now returns all 3 rows; Main Bar head sees the event draws (was 0); Restaurant/Sports Bar heads 0 — isolation holds; fresh-connection re-read clean. **data-ops now `001`–`006`.** Browser-verified: the Main Bar filter that was lying now shows the event draws.
- **Delivery render fix:** `delivery`/`opening_balance` rows suppress the bogus `From → To` (a self-introduced render bug put `parseSupplier(notes)` in the From slot — "Aman → —"; no row was mutated).

**Done 17 August 2026 — §2.6 re-proof run 6, history repair, and BAR PAR LEVELS (`059`):**

- **§2.6 run 6 — PASS, and run BEFORE `059` was written**, as the gate required. Throwaway `ezdzuncwptlslclxepii` (eu-west-1), confirmed empty, `001`–`058` pushed clean via `--db-url` (never re-linking), diffed against production, then deleted. **Tables 28/28, constraints 101/101, indexes 46/46, privileges 631/631, `pg_default_acl` 24/24, RLS 28/28, triggers 1/1 — all exact; every function body byte-identical by `md5(prosrc)`.** Production read-only throughout; data unchanged.
- **🔴 The proof caught a real files gap `058` had hidden: a rebuild grants `anon` EXECUTE on `current_app_role`/`current_app_department`; production does not.** `050` resets already-created *tables* but never already-created *functions*, and `021`/`037`'s `revoke … from public` strips only the PUBLIC grant, not the explicit anon one. **This contradicted a FOLLOWUPS entry saying the debt "does not exist, do not re-litigate"** — that entry was right about production and wrong about the files, because it was written from a production-only probe. Fixed in `059` §10 (a no-op against production, a real fix on a rebuild) and the entry corrected. **Doctrine: a claim that a debt is absent must say which database it was measured on.**
- **🔴 The proof also caught the record being wrong: production's migration history stopped at `057`.** `058` had been applied by hand and never recorded — exactly one gap, while its objects were live. STATE and FOLLOWUPS both claimed `001`–`058`. Repaired, re-read on a fresh connection: **58 rows, no gaps**, dry-run clean. `059` was written on a proven base, not a believed one.
- **🟡 Accepted divergence:** `attendance_records` columns 14–18 are the same five columns in a different ordinal order. Set-identical, needs a table rewrite to align, no app effect (PostgREST returns keyed JSON). Recorded, not chased.
- **`059` bar par levels — applied per-file (dry-run with ROLLBACK first, negative control confirmed the dry-run really executes), then proven live as the roles.** `current_stock.par_level` (per item per location, NULL = not on the cycle); `bar_count_sessions` + `bar_count_lines` with RLS, policies and grants in the same migration; `requisitions.count_session_id` + `source`; `post_bar_count` (SECURITY DEFINER, gated) and `fulfil_requisition_batch` (INVOKER). **`set_stock_quantity` replaced in place — oid `42386` and `proacl` unchanged**, the grant-survival trap closed with evidence for the third time.
- **`set_stock_quantity` was writing NULL departments on every adjustment** — the exact fault `data-ops/006` fixed for events, which would have made hundreds of nightly count rows vanish from the Movement Ledger's department filter. Fixed in the same migration (sign decides the side). 0 existing adjustment rows, so no backfill; asserted rather than assumed.
- **19/19 live role scenarios passed, rolled back.** Sports Bar head: creates a draft for its own bar ✅, denied for another bar (42501) ✅, denied for Main Store (guard) ✅, cannot mark a session posted directly (42501) ✅, posts its own count ✅, cannot re-post ✅, **cannot fulfil the approved refill (42501 on `current_stock`)** ✅. Main Bar head sees 0 of Sports Bar's sessions and lines, and is denied posting a Sports Bar draft on **authorisation** ✅. admin approves and fulfils the batch ✅. End to end: SBA-1001 bar 17 → counted 1 → refilled to par 10, store 100 → 91; one item counted *up* (0 → 1) correctly wrote `to_department` not `from_department`.
- **Two tests were wrong before the code was** — one denial test was **vacuous** (it fulfilled a batch that was still `pending`, so the loop selected 0 rows and "passed"), and one asserted all three adjustments would be `from_department`. Both corrected and re-run rather than accepted. That is the "a passing test proves the configuration live when it ran" lesson, hit again.
- **Frontend:** new **Bar Count** tab (pre-filled count sheet, live shortfall preview, recent counts); **Par** column on Stock Levels; **Bar Refills** batch panel in Requisitions with Approve all / Fulfil all. Build clean, ledger tests 31/31.
- **Folded in:** the delivery **Supplier column** is restored as a real column in the Movement Ledger (and `Route` no longer tries to render a supplier as a route). **Main Bar DOES have a `department_head`** (`mainbar@woodlands.com`) — that STATE/FOLLOWUPS note was stale, and the account was used as a real denial subject in the `059` proof.

**OPEN — carry into next session (none blocking):**
- **Browser-verify the Bar Count tab.** DB layer proven live as the roles and the build is clean, but the new tab has not been exercised in a browser — needs an owner or bar-head session.
- **No par-level editing UI.** Par is seeded and visible but only changeable by UPDATE. Fine while placeholder; needed at real-data time.
- **~~`AdjustmentsTab` is location-blind~~ — FIXED AND PROVEN LIVE, 17 August 2026.** Frontend-only, no migration: `setStockQuantity()` now takes `{ location, subLocation }` and `AdjustmentsTab` has a Location selector (plus a Sub-location selector where `SUB_LOCATIONS` defines one), its `stockMap` keyed on `(item, location, sub_location)`, and the `tier='department'` filter that hid all 559 main-store balances removed. Proved as `admin` (`SET LOCAL ROLE`, rolled back): a Main Store take moved Main Store 100 → 42 with **Main Bar unchanged at 5** and wrote `adjustment −58, from_department='Main Store'`; the same call with no location still falls back to the item's department (Main Bar 5 → 7, store untouched) — the old bug, demonstrated rather than described. A `department_head` is still denied `42501` at the store, and `054`'s guard still rejects an invalid location. Rollback re-verified on a fresh connection: 1118 balances, 725 movements, 0 adjustment rows.
- **`059` is not rebuild-proven.** Owed on the next migration written.

**Forward path — build order:**
1. ~~**`movement_type` widening**~~ ✅ (`058`) → ~~**Movement Ledger**~~ ✅ (`058` + data-ops/`006`) → ~~**bar par levels + end-of-day cycle**~~ ✅ (`059`) → **rooms + consumption ledger** ← next feature → **real-data dedupe + table split** (deferred to real-data).
2. **Remaining Phase 2 features** — consumption attribution + rooms + laundry retention; Farmers Market taxonomy + waiting list + fees; QR attendance; Events UX fixes (payments editable, revenue display — revenue blocked on Dhiren).
3. **Per-role UI pass** — deferred to end.
4. **Production cleanup** — drop the 2 legacy duplicate `service_role` policies (`departments`, `user_profiles`) from production. Cosmetic, not blocking.

---

## §2.6 RE-PROOF — status

**`001`–`058` — CLOSED by run 6, 17 August 2026, on evidence.** Full table in `WOODLANDS_FOLLOWUPS.md`. Everything exact except two known production-only residuals (2 legacy duplicate `service_role` policies, the `handle_new_user` orphan), one accepted ordinal-order divergence on `attendance_records`, and one **real files gap the proof existed to catch** — a rebuild granting `anon` EXECUTE on the two role functions — now fixed in `059`. Run 6 also found production's history had never recorded `058`; repaired, verified 58 rows with no gaps.

*(Historical: gate closed on `001`–`050` at run 4, 12 August; `051`–`057` re-proven at run 5, 14 August — that closure rested on a verbal, and run 6 has now superseded it with a measured artefact covering the whole range. `056` executed out of order in production — `057` ran first — but the two files are disjoint at statement level and commute; confirmed after the fact that applying `056` second left `transfer_stock`/`issue_stock`/`apply_stock_delta` byte-identical by `md5(prosrc)`.)*

**`059` — CLOSED by run 7, 17 August 2026, before any `060` DDL was written.** Throwaway `tnseclavqwijhtmljgui` (eu-west-1), confirmed empty first, `001`–`059` pushed clean via the session pooler (the direct host was IPv6-only again), never re-linked — local link verified `gttsjmxltrxxfplqjans` before *and* after. **Tables 30/30, columns 328/328 (set), constraints 114/114, indexes 54/54, privileges 678/678, `pg_default_acl` 24/24, RLS enablement 30/30, triggers 2/2 — all exact.** Policies 122/120 and the `handle_new_user` orphan are the known production-only residuals; `attendance_records` ordinal order 14–18 the known accepted one.

- **✅ `059` §10 confirmed working — the thing this run existed to test.** `has_function_privilege` for `anon` **and** `public` on `current_app_role`/`current_app_department` is now **false on both databases**. The files gap run 6 found is closed.
- **🔴 Run 7 caught a new one, and it was on PRODUCTION, not the files: two function bodies and two column comments carried mojibake.** `post_bar_count` held 92 × `U+00E2` where the file has 92 × `U+2500`; `set_stock_quantity` 1 × `U+00E2` for an em-dash; plus the `current_stock.par_level` and `event_stock_allocations.deducted_qty` comments. Cause reproduced, not inferred: the apply helper read files with bare `Get-Content`, which decodes UTF-8 as Windows-1252 on PS 5.1. Cosmetic in effect — every corrupted character sat inside a `--` comment, all 123/73 body lines present, **0 executable lines differed** — but it made `md5(prosrc)` unmatchable forever. `standards.md` §4 already carried the rule; it had been applied to the import path and never to the apply path. **Fixed in `scripts/apply-sql.ps1` (UTF-8 read + a mojibake refusal guard) and healed by `scripts/data-ops/007_encoding_heal.sql`** — tooling first, then the heal, in that order, because a heal through the broken path re-corrupts silently. Both functions now carry the rebuild's exact md5; `oid` (42712 / 42386) and `proacl` unchanged; 0 mojibake anywhere in `pg_description`.
- **🟡 Noted, not a gap:** a fresh Supabase project now ships an `ensure_rls` event trigger (`rls_auto_enable`) that production predates. It means RLS enablement on a rebuild is not self-evidencing — closed from the other side, since production has no such trigger and still carries RLS on all 30 tables.

**Now owed: `060` will not be rebuild-proven.** The next migration written after it triggers a full throwaway rebuild of `001`–`060` diffed against production. **Before the next migration is written, not after.** A rebuild proof expires — it is a claim about a file range on a date, not a permanent property of the project. Code-only and data-op changes do not touch this clock.



Every new table ships with placeholder seed in its own step.

---

## BLOCKING

Revenue display is blocked on Dhiren (what "different" means). Everything else is internal — the migration gate is closed and no longer blocks anything; two-tier inventory is next.

---

## STATUS SUMMARY

Hardening done, real data live, migration gate closed, role model live, department vocabulary reconciled. **Two-tier inventory is functionally complete end to end** — location dimension, main store, store→department issuing, department↔department transfers, and the RLS scoping that lets a receiving department *see* what it holds, all proven live as the roles. **Movement Ledger done (`058` + data-ops/`006`)**, with the delivery Supplier column restored. **Bar par levels + the end-of-day count/refill cycle done (`059`, 17 August)** — count sheet pre-filled, posting reconciles the bar balance and raises a pre-filled refill in one transaction, batch approve/fulfil through the existing `issue_stock` path; 19/19 live role scenarios passed. **§2.6 re-proof run 6 closed `001`–`058` on measured evidence** and caught both a real files gap (anon EXECUTE on the role functions) and an unrecorded `058` in production's history — both fixed. Building the rest of Phase 2 to functional-complete on placeholder data — **rooms + consumption ledger next**, with `bar_count_lines` as its natural feed. Re-proof: `059` owed on the next migration written. Deadline: full-system walkthrough with Dhiren Mon 31 Aug / Tue 1 Sep.
