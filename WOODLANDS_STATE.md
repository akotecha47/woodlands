# WOODLANDS — STATE

*Current state, live commitments, next action. Updated at the end of every session that changed state.*

**Last updated: 10 August 2026**
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

Full detail — all four runs, every divergence found and fixed, and the residual cleanup item — in `WOODLANDS_FOLLOWUPS.md`. `045`–`050` are filed but **not yet rolled into production's migration history** (`supabase migration repair --status applied 045 046 047 048 049 050` — not `db push`); that rollout is separate from the gate being closed.

---

## KNOWN BUGS / BROKEN PATHS

- **Transfers don't deduct stock.** Found 27 July browser test. Requisitions deduct correctly; department transfers don't. Directly relevant to two-tier inventory — store→department movement is the core mechanic.
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

**Forward path — build order:**
1. **transfer_stock primitive** — the store→department mechanic and the fix for the transfers-don't-deduct bug. The foundation is in; this is the next build. Then `movement_type` widening → Movement Ledger → RLS pass → real-data dedupe + table split.
2. **Remaining Phase 2 features** — bar par levels + end-of-day cycle; consumption attribution + rooms + laundry retention; Farmers Market taxonomy + waiting list + fees; QR attendance; Events UX fixes (payments editable, revenue display — revenue blocked on Dhiren).
3. **Per-role UI pass** — deferred to end.
4. **Production cleanup** — drop the 2 legacy duplicate `service_role` policies (`departments`, `user_profiles`) from production. Cosmetic, not blocking.
5. **045–050 rollout** — `supabase migration repair --status applied 045 046 047 048 049 050` (not `db push`) next time schema is touched.

Every new table ships with placeholder seed in its own step.

---

## BLOCKING

Revenue display is blocked on Dhiren (what "different" means). Everything else is internal — the migration gate is closed and no longer blocks anything; two-tier inventory is next.

---

## STATUS SUMMARY

Hardening done, real data live, migration gate closed, role model live, department vocabulary reconciled. Building Phase 2 to functional-complete on placeholder data by the 15th — two-tier inventory next, then the remaining module work.
