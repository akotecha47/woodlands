# WOODLANDS — FOLLOWUPS LOG

*Small deferred items not blocking the current sprint. Standard §5 item 7. Append-only during sprints; consolidated at retrospective.*

---

## NOTE — ITEMS NOW ABSORBED INTO PHASE 2 (tagged 9 August)

Some items below are no longer loose cleanup — they are part of the Phase 2 build specified in `WOODLANDS_FUNCTIONAL_SPEC.md`. Build them there, not as standalone followups:

- **Delivery Log → consolidated Movement Ledger**, and the **`movement_type` CHECK widening** for `event_allocation` / `event_return` — the two-tier inventory work makes store→department issues exactly what a delivery-only view hides, so consolidation is now in scope. See FUNCTIONAL_SPEC §3.
- **The five empty department stock lists** (Kitchen, Restaurant, Housekeeping, Grounds, Security) plus **Laundry** — these get populated as departmental sub-stores under two-tier inventory, on placeholder data first. See FUNCTIONAL_SPEC §2.1 / §3.
- **QR raw-UUID / signed-token weakness** (originally FM-only, below) now also applies to **QR staff attendance**, which reuses the `public-checkin` pattern. See FUNCTIONAL_SPEC §4.

Everything else below stays a genuine followup.

---

## FARMERS MARKET REGISTER — DATA QUALITY (for Rose, post-meeting)

*From the 26 July 2026 import of the Feb 2026 register. 305 of 319 stalls are live; the gaps below are source-data issues, not import faults.*

### Rows not imported — need Rose to supply data

- **12 stallholders skipped: no phone number in the register.** `phone` is `NOT NULL` on `fm_holders` and Aman's decision was to skip rather than insert a placeholder or weaken the constraint, so these are absent from the system entirely until numbers are collected:

  | Stall | Holder | Stall | Holder |
  |---|---|---|---|
  | 12 | George Laisi | 262 | Fatima Mahommed |
  | 52 | Janet Ntila | 264 | Kondwani Chavula |
  | 81 | Wanangwe Mkandawire | 307 | Lonely Makata |
  | 82 | Paul Lameck Mbawa | 308 | Tendai Shaba |
  | 133 | Nikiwe Mtema | 309 | Feboh Swalei |
  | 151 | Percy Maleta | | |
  | 170 | Boniface Ngomwa | | |

  Worth checking the register's co-holder columns first — several of these rows carry a co-holder phone, so numbers may be recoverable without contacting the stallholder.

- **Stall 205 has no holder name** in the register. Excluded upstream by the generation pipeline. Rose to identify the holder.

- **Stall 226 appears twice** — Caitlyn Herselman and Benjamin Gross. `stall_number` is UNIQUE. Benjamin Gross was kept because the surrounding row order (225, 227) puts him there; Caitlyn Herselman is **deferred pending Rose's clarification of her actual stall number** — likely 224 from row position, but not confirmed and not guessed at.

### Register itself needs correcting

- **125 rows had the EMAIL and PRODUCTS columns swapped** in the source register (the later entries). Auto-corrected on import using an `@` heuristic, so the live data is right — but **the master spreadsheet is still wrong** and will reintroduce the fault on any future export. Worth fixing at source.

### Import decisions to revisit

- **All 305 rows have `stall_type = 'Other'`.** The column is `NOT NULL` with a five-value CHECK (`Produce`, `Crafts`, `Food & Beverages`, `Clothing`, `Other`) and the register has no equivalent field. Uniform `'Other'` makes the category filter useless until reclassified — the `products` text is the obvious basis for doing so, semi-automatically.

- **`fm_holders.products` is a text blob** (migration `029`), not normalised into `fm_approved_items` where the schema already models per-holder items. Deliberate: the register's product strings are comma-joined, but several individual product names contain internal commas — e.g. stall 79's `Chocolate "Salame Slab", Focaccia Slab`. Splitting on commas would have silently fragmented real product names across hundreds of rows, invisibly. **Needs Rose to confirm the intended delimiter before normalising.**

- **Stall-number format is now `A001`–`A347`** (three-digit zero-padded, A-prefixed). The ten test rows it replaced were two-digit `A01`–`A10`. **Needs Dhiren's sign-off** — printed QR cards and the physical stall signage have to agree with whatever the system uses.

---

## FROM BAR STOCK IMPORT PREP (27 July 2026, pre-meeting)

*Findings below came from schema probing before the import ran. **Both artifacts were subsequently applied and verified — see "Applied" immediately below.***

### Applied — 27 July 2026, pre-meeting

- **`supabase/migrations/030_widen_movement_type.sql` — APPLIED.** Adds `'opening_balance'` to the `stock_movements.movement_type` CHECK. Confirmed post-apply: `stock_movements_movement_type_check_v2` exists permitting all five types, the old four-value `stock_movements_movement_type_check` was dropped, and the column comment is set. **Not recorded in the remote migration history table** — same as every migration from 008 onward; folds into the Priority 1 reconciliation below.

- **`scripts/data-ops/002_bar_stock_reset_and_import.sql` — APPLIED.** Run via the Management API query endpoint, not `db push`. Dry-run first with `ROLLBACK` (numbers checked, rollback confirmed by re-reading counts as still 25), then applied for real. Verified against **committed** state on a fresh connection, not from inside the transaction:

  | Metric | Expected | Actual |
  |---|---|---|
  | `stock_items` | 559 | ✅ 559 |
  | `stock_movements` | 533 | ✅ 533 (all `opening_balance`) |
  | `current_stock` | 559 | ✅ 559 |
  | Restaurant Bar / Sports Bar | 276 / 283 | ✅ 276 / 283 |
  | bottles / crates | 475 / 84 | ✅ 475 / 84 |
  | out-of-stock / below-reorder / ok | 26 / 78 / 455 | ✅ 26 / 78 / 455 |
  | ledger-vs-balance mismatches | 0 | ✅ 0 |
  | items with no `current_stock` row | 0 | ✅ 0 |
  | non-bar items remaining | 0 | ✅ 0 |
  | non-ASCII characters in names | 0 | ✅ 0 |

  Dashboard "Low Stock Items" will read **104** (26 out-of-stock + 78 below reorder). Quantity range 0–60.

### Findings

- **`current_stock` is a BASE TABLE, not a view.** Verified: `pg_class.relkind = 'r'`, `information_schema.tables` reports `BASE TABLE`, absent from `pg_views`, and it carries a PK, a UNIQUE on `stock_item_id`, `CHECK (quantity >= 0)`, an FK to `stock_items` and two btree indexes — none of which a view can hold. **There are also no triggers whatsoever** on `stock_items`, `stock_movements` or `current_stock`, so nothing syncs the ledger to the balances.

  A draft of the import script was written on the assumption that `current_stock` was a view over `stock_movements` and therefore only needed movement rows. Had it run, `DELETE FROM stock_items` would have cascaded `current_stock` empty and nothing would have refilled it: 559 items, 533 movements, **zero balances**, and a blank Stock Levels screen. The committed script writes both, and derives `current_stock` from the movements (STEP 4) so the two cannot disagree.

- **An item with no `current_stock` row is invisible on Stock Levels, not shown as zero.** `StockLevelsTab.jsx:16` selects from `current_stock` and joins `stock_items`, so the balances table drives the list. Any future import must write a row for every item including zero-stock ones — hence the `LEFT JOIN` in STEP 4 covering all 559 rather than only the 533 with movements.

- **~~`stock_movements.movement_type` CHECK matches migration 008 exactly~~ — SUPERSEDED. This was a pre-apply probe, written before migration 030 ran; it was never marked stale.** Settled by live diagnosis 9 August: the live constraint is `stock_movements_movement_type_check_v2` and **does** permit `opening_balance` (533 bar-import rows carry it, written in one transaction by data-ops/002; the old four-value constraint was dropped). Migration 030 ran. HISTORY and ARTIFACTS were correct. **What remains open:** the widening for `event_allocation` / `event_return` — 030 added only `opening_balance`. That part still stands for the Movement Ledger work.

- **`stock_items` has no DELETE policy, for any role except `service_role`.** RLS is enabled; policies are `SELECT` (authenticated), `stock_items_owner_insert` (INSERT, authenticated), `stock_items_owner_update` (UPDATE, authenticated), and `service role full access` (ALL, service_role). DELETE is fail-closed for every application user, which is why the data-ops wipe can only run through the Management API or an Edge Function. Probably correct as an operational default, but the asymmetry — INSERT and UPDATE present, DELETE simply absent rather than deliberately denied — looks unplanned. **Post-meeting: confirm intent and make it explicit either way.**

  Note for whoever audits this: the Management API query endpoint runs privileged and bypasses RLS entirely. Running a statement successfully through it proves nothing about what `anon` or `authenticated` may do. Policy claims must be tested as the role in question.

- **Stock Levels' department filter lists all 7 departments regardless of stock.** Populated from the `departments` table (`InventoryUI.jsx:69`), not from `DISTINCT stock_items.department`. After the bar-only import, Housekeeping / Kitchen / Grounds / Restaurant / Security will still appear in the dropdown, each showing "No items in this department." Cosmetic, and consistent with the "waiting on your other stock lists" framing — but worth knowing before demoing rather than discovering live. The `departments` table is deliberately untouched by the import: Transfers and Requisitions need all 7.

- **~~`WOODLANDS_HISTORY.md` does not exist.~~ — RESOLVED.** It exists in the repo and was updated 9 August. (Was: the third confident citation of a missing document, after `WOODLANDS_DEMO_PREP.md` and AUDIT_2 §0. The general lesson stands — write files before citing them.)

### Deferred to Dhiren / Rose, post-meeting

- **Real bar stock QUANTITIES.** All 559 quantities in the import are deterministic demo values. Load real levels from Dhiren's stocktake.
- **Stock lists for the other five departments.** Housekeeping, Kitchen, Grounds, Restaurant and Security are cleared entirely by the import. Rose and the department heads to supply.
- **Unit classification is heuristic.** Name pattern matching assigned 84 items `crates` and 475 `bottles`. Rose to sanity-check — some spirits ship in crates, some ciders in bottles.
- **Reorder levels are placeholder.** Uniform: every `crates` item 8, every `bottles` item 5. Needs per-item review with the bar manager.
- **Selling prices not imported.** Both source files carry real MWK prices; the schema has no price column and this system is inventory tracking, not accounting. If valuation is ever in scope, add `selling_price` via a migration and re-run a targeted UPDATE.
- **Item names are ALL-CAPS from source.** Same convention decision as the Farmers Market import — preserve verbatim. Normalise to Title Case if Dhiren prefers.
- **283 unique products; 276 stocked in both bars, 7 Sports-only** (`BULL DOG GIN`, `HENDRICKS GIN`, `APEROL`, `BLENDERS PRIDE`, `GLENMORANGIE 14 YRS`, `GLENMORANGIE 16 YRS`, `MONKEY SHOULDER`). Shared products are two rows, one per bar, with parallel `RBA-`/`SBA-` SKUs. If Dhiren wants one item tracked separately per bar instead, that is a schema change — the department-per-row model is what shipped.

---

## POST-MEETING PRIORITY 1 — MIGRATION HISTORY RECONCILIATION

**Promoted out of "post-demo" on 26 July 2026. This is systemic, not incidental.**

Three ghost-schema bugs in a single night, all tracing to the same root cause — migrations that were never applied, or never written:

1. **`fm_visits` missing `checked_in_at` / `checked_out_at`** — `014_fm_visits_checkin_checkout.sql` existed in the repo and had never been run. Public QR check-in failed on every scan since the page was built (Bug 5).
2. **`fm_visits.notes` missing** — used by the manager Market Day notes flow, present in no migration at all (migration `027`).
3. **`requisitions` column set drift** — `008_inventory.sql` required a manual `DROP` first, which never happened, so its `CREATE TABLE IF NOT EXISTS` silently did nothing and the live table stayed the incompatible `001_schema.sql` version. Six column differences. The entire requisition flow had never worked (Bug 6, migration `028`).

Plus two ghost columns found earlier: `event_stock_allocations.returned_qty` (`024`) and `fm_market_days` not existing at all (`026`).

**Why it keeps happening:** the remote migration history table records only versions 001–007, while 008–030 have run. `supabase db push` is therefore unusable — so every migration since has been applied by hand through the SQL editor or Management API. Hand application is where "never applied" and "applied out of order" come from, and nothing detects either.

**The gate is bigger than "reconcile history" — live diagnosis 9 August found the following.** This is the real scope; earlier docs understated it badly.

- **🔴 `db push` would destroy the 305 stallholders BEFORE it reaches the staff duplication.** Every doc named only `016_staff_restructure.sql` (duplicates 62 staff — confirmed: `staff` has only a PK on `id`, `016`'s INSERT has no ON CONFLICT). But a push replays `009_farmers_market.sql` first, which opens `DROP TABLE fm_holders CASCADE` — all 305 stallholders, `fm_visits`, `fm_payments`, `fm_id_cards`, `fm_approved_items`. `028_requisitions_reconcile.sql` also `DROP TABLE requisitions CASCADE` (2 live rows). **"016 is the reason" is wrong — 009 is the bigger bomb.**
- **🔴 Duplicate `008` must be resolved BEFORE any repair, not after.** `schema_migrations` has `PRIMARY KEY (version)`; two files (`008_event_bill_items.sql`, `008_inventory.sql`) both claim 008. Repair records one; the other becomes permanently unrecordable and invisible to `db push`. **Merge, don't renumber** — renumbering has no free slot (event_bill_items must precede 022/023; 009–030 all taken).
- **🔴 `supabase/seed.sql` is a misfiled migration and a rebuild landmine.** Git-tracked, named as a seed, but contains schema DDL (ALTER/ENABLE RLS/CREATE POLICY/GRANT). It is the actual origin of the attendance drift below, and it adds four ghost GPS columns (`clock_in_lat/lng`, `clock_out_lat/lng`) that appear in no migration but are live and read by three attendance components. `db reset` runs it after migrations and it references dropped/ghost objects (`bar_week_config`, `shift_settings`) — so **§2.6 cannot pass while it exists as-is**, independent of the three ghost tables.
- **⚠ Three attendance migrations drifted — do NOT blind-repair them.** `010` partial (missing unique index `attendance_records_user_shift_date_key`; FK points at `auth.users` not `user_profiles`). `012` **never applied** — its scoped RLS policies are absent and a blanket `ALL / authenticated / USING(true)` policy still sits on real staff attendance (this is the Sprint B Task 3 hole, now explained). `017` partial (missing `idx_attendance_staff_id`; policy name drift). Marking these "applied" freezes the RLS hole and hides the missing indexes forever. **Reconcile before repairing, and the 012 auth work gets its own session.**
- **Three ghost tables — DDL now captured, all hold live data** (`event_checklists` 22 rows, `shift_settings` 12, `tables` 12). Sweep confirmed these are the complete set — no fourth surprise. Migrations must be `CREATE TABLE IF NOT EXISTS`, no DROP.
- **🟡 Four dead legacy tables** (`deliveries`, `inventory_items`, `stock_adjustments`, `stock_transfers`) — 0 rows, RLS on, no policies (fail-closed, not an exposure). `stock_transfers` is a name Phase 2 two-tier work will reach for. Explicit drop decision needed.

**Until this closes, Standard §2.6's rebuild-from-migrations test keeps failing.**

**Scope of the fix (corrected order) — SESSION A DONE 9 August:**
snapshot ✅ → merge 008 ✅ → ghost-table CREATEs 031/032/033 ✅ (applied live, no-op, rows preserved) → 034/035 attendance indexes + GPS columns ✅ (034 created 2 indexes for real; 035 no-op) → seed.sql rebuild-landmines removed ✅ → 021 ordering bug fixed ✅ → 010 FK documented to live ✅ → `migration repair --status applied` for 001–035 minus 010/012/017 ✅ (verified on fresh connection).

**SESSION B (012 auth) — EXECUTED 10 August 2026. Steps 1–5 done and verified; step 6 half done.**

1. ✅ Blanket `"authenticated can access attendance_records"` (`ALL/authenticated/USING(true) WITH CHECK(true)`) **dropped**. Re-queried on a fresh connection: no `authenticated` policy with a `true` qualifier remains.
2. ✅ The three unfiled `"staff can … own attendance"` policies recreated under canonical names (`attendance_own_select/_insert/_update`) and the legacy names dropped. 017's `service_role_all_attendance` created; the legacy `"service role full access attendance_records"` dropped.
3. ✅ seed.sql attendance block removed — scope turned out wider, see below.
4. ✅ 010's two defaults documented to live (`shift_date DEFAULT CURRENT_DATE`, `within_radius DEFAULT false`). File-only, no live ALTER.
5. ✅ `migration repair --status applied 010 012 017 036`. Read back from `supabase_migrations.schema_migrations` on a fresh connection: **001–036, 36 rows, nothing missing, nothing extra.**
6. ⚠ `db push --dry-run` → *"Remote database is up to date."* **The staging rebuild proof was NOT run — see the deferral below. The gate is therefore NOT formally closed.**

**Four findings Session B turned up that the plan did not anticipate:**

- **🔴 There were TWO blanket policies, not one.** Alongside the `ALL` policy the plan named, live carried `"authenticated read attendance_records"` (`SELECT / authenticated / USING (true)`) from `supabase/seed.sql:56-58`. Dropping only the `ALL` policy would have left every authenticated user of every role still able to read every attendance row, while the diagnosis recorded the hole as closed. Both are now dropped.

- **🔴 Read-only manager policies would have broken the app.** The planned target was service_role + own-row + manager *read*. But **all 15 live `attendance_records` rows have `staff_id` set and `user_id` NULL** — they are manager-written roster rows, so `user_id = auth.uid()` reaches none of them. `TodayTab.jsx` *writes*: Mark All Absent (`:177`), Override (`:212`/`:195`), Note (`:240`/`:233`). Those work today only because of the blanket policy. `012`'s own premise — *"manager access goes through supabaseAdmin, so no manager policy is needed"* — was true when written and false since Sprint B deleted the browser service-role client. Managers were given SELECT **+ INSERT + UPDATE** (confirmed by Aman before applying).

- **🔴 Repairing 012 would have baked a permanent rebuild divergence.** `012_attendance_rls.sql:9,:14` create `"users can read own attendance_records"` and `"users can insert own attendance_records"`. They have never existed live (012 never ran), so `repair` is harmless to production — but a from-files rebuild *executes* 012, and nothing dropped those two names. The rebuild would finish with **nine** policies where production has **seven**, failing §2.6 on a table nobody had touched. `036` now drops both explicitly (section 4e). This is the exact class of fault the rebuild proof exists to catch, found by reading the files rather than by running it.

- **⚠ seed.sql's `ALTER COLUMN date DROP NOT NULL` never took effect, and was a live-vs-file trap in the opposite direction.** Live `attendance_records.date` is still `NOT NULL` (matching `001_schema.sql:104`; no migration relaxes it). Keeping that statement would have made a rebuild produce a *nullable* `date`. Removed from seed.sql rather than adopted into 010. `TodayTab.jsx:169,:202` already document the live `NOT NULL`.

**Final live policy set on `attendance_records` — 7, verified on a fresh connection after every step:**

| Policy | Cmd | Role | Predicate |
|---|---|---|---|
| `service_role_all_attendance` | ALL | service_role | `true` / `true` |
| `attendance_own_select` | SELECT | authenticated | `user_id = auth.uid()` |
| `attendance_own_insert` | INSERT | authenticated | `user_id = auth.uid()` |
| `attendance_own_update` | UPDATE | authenticated | `user_id = auth.uid()` (both) |
| `attendance_manage_select` | SELECT | authenticated | `current_app_role() IN ('owner','manager')` |
| `attendance_manage_insert` | INSERT | authenticated | `current_app_role() IN ('owner','manager')` |
| `attendance_manage_update` | UPDATE | authenticated | `current_app_role() IN ('owner','manager')` (both) |

No DELETE policy, deliberately: nothing in `src/` deletes an attendance record and `authenticated` holds no DELETE grant, so DELETE is fail-closed at the grant layer. Recorded as a decision, unlike the unplanned `stock_items` asymmetry noted earlier in this log.

Role set is `('owner','manager')` = `ROUTE_ACCESS['/attendance']`, not the four-role set. `kitchen_manager` and `restaurant_manager` cannot open the module. **Note: `AT_MANAGE_ROLES` in `AttendanceUI.jsx:3` lists `restaurant_manager`, whom `RouteGuard` blocks before any tab renders — a dead role gate, same class as the `store_supervisor` gates already logged. Sprint E.**

**Access proved by running as the roles themselves**, not through the Management API (which connects as `postgres`, `rolbypassrls = true` — a statement succeeding there proves nothing about what a role may do). 17 scenarios, each `SET LOCAL ROLE authenticated` with a real `sub` claim; the write scenarios wrapped in a transaction that rolled back, rollback re-verified on a fresh connection (still 15 rows, 0 with `user_id`, no test note). All passed: owner/manager read 15; kitchen_manager, restaurant_manager and an unknown-`sub` user read 0; a staff user can insert/read/update only their own row, cannot update another's (0 rows affected), cannot insert one attributed to another user (denied), cannot insert a roster row with `user_id` NULL (denied); a manager can insert and update roster rows; neither can DELETE.

### ⚠ §2.6 rebuild proof — RUN 12 August 2026, FAILED at migration 016. Fixed in files; proof not yet re-run.

Superseded the "Not run" state below — a throwaway staging project (`vymwuozlwfkwtgybpgvo`, `eu-west-3`) was created and used. `supabase db push --db-url <staging>` applied **001–015 cleanly**, then **016_staff_restructure.sql aborted**: `null value in column "full_name" of relation "staff" violates not-null constraint`. Not patched in that session — stopped and reported per plan, so the failure itself would be preserved as the finding. Staging deleted immediately after; production was read-only throughout (verified: local CLI link never left `gttsjmxltrxxfplqjans`, no `db push`/`db reset`/DDL/DML issued against it, only `SELECT`s via the Management API).

**Two entangled defects, both diagnosed against production, read-only:**

1. **016's own seed INSERT carries 4 rows with `full_name = NULL`** — `WL02352`, `WL02354`, `WL02480A`, `WL02595`. Real employees (Kitchen ×2, Security ×1, Restaurant ×1) whose names were never captured — one (`WL02480A`) is the file's own flagged "unnamed Security Guard." Confirmed live: production holds these same 4 rows with the same NULLs today, out of 62 total.
2. **`staff.full_name` is `NOT NULL` in the files (`001_schema.sql:88`, never relaxed by any later migration — grepped all 44) but nullable in production right now** (`is_nullable = YES`, confirmed live). An unfiled hand-applied `ALTER TABLE staff ALTER COLUMN full_name DROP NOT NULL` — production drifted from every file's declared schema, undocumented. This is *why* 016 aborts on a clean rebuild: the empty database gets the NOT NULL the files describe, and immediately rejects the seed rows production has been carrying nullable all along.

**Decision (Aman): Option A — reconcile the files to match production.** Keep the 4 NULL rows as legitimate (names arrive with Dhiren's real staff data later, not invented). Do not touch production — it's already in the target state.

**Fix applied (files only, not yet pushed anywhere):**
- `016_staff_restructure.sql` — added `ALTER TABLE staff ALTER COLUMN full_name DROP NOT NULL;` in its schema section, immediately before the seed INSERT. Has to live here, not in a later-numbered file: 016 runs before any file after it on a fresh rebuild, so a `045` alone cannot help 016 succeed. Naturally idempotent (dropping NOT NULL on an already-nullable column is a silent no-op).
- `045_staff_full_name_nullable_reconcile.sql` — new migration, same DDL, purely to give the drift its own dated entry in the migration history stream (the 010-defaults precedent from Session B: file-only, matches already-live state). **Not to be executed against production** — already true there; should be recorded via `migration repair`, not run as live DDL. **⚠ SUPERSEDED as to the command — do not repair 045 on its own.** 045 was never rolled out, and the 2nd proof run (12 August) added 046–050 in the same unrecorded state. All six now roll out together via the single command in the "046–050 EXECUTION STATUS" block below; production history stops at 044.

**STEP 3 sanity-check (while in 016):** scanned the rest of the seed INSERT and the schema `staff` carries by migration 015 for any other constraint the 62-row seed could trip on a clean rebuild. Found none — `staff` has no CHECK constraints and no UNIQUE on `employee_number` (confirmed live via `pg_constraint`: only `staff_pkey` and the `user_profile_id` FK), so the file's own duplicate-employee-number comments were precautionary, not constraint-driven. Row count verified at exactly 62. `is_active` explicitly `true` on every row. No FK, CHECK, or UNIQUE hazard remains in 016.

**New defect class this surfaces:** column-**constraint** drift (a hand-applied `ALTER … DROP NOT NULL`) — distinct from the ghost-table/ghost-column drift Sessions A and B reconciled. Neither session checked constraints; this one slipped through both. **Future audits should diff `pg_constraint`/`information_schema.columns.is_nullable`, not just table/column existence.**

**Superseded by the 2nd proof run below** — 016 did clear, and the run got all the way through 045.

### ⚠ §2.6 rebuild proof — 2nd RUN, 12 August 2026. Push clean through 045; diff FAILED. Fixes authored (046–050), awaiting 3rd proof run.

Fresh throwaway (`zhzcrqrkmipdpycsnnka`, `eu-west-3`), confirmed empty first. Same IPv6-only resolution problem on `db.<ref>.supabase.co` as run 1 — pooler endpoint (`aws-1-eu-west-3.pooler.supabase.com:6543`) pulled from the Management API and used instead. **All 45 migrations applied, no errors, `"Finished supabase db push."`** The 016 fix works: the 4 NULL-name rows landed fine. 017–045 were rebuild-tested for the first time and all cleared. Staging deleted; local link verified `gttsjmxltrxxfplqjans` before *and* after; production read-only throughout.

**But a clean push is not a clean rebuild.** The diff against production found five divergences. What matched: **tables 28/28**, **indexes 41/41** (incl. 034's attendance indexes), and **all four functions byte-identical** (`current_app_role`, `current_app_department`, `apply_stock_delta`, `set_stock_quantity`). RLS policies came back **essentially clean** — 106 vs 108, the only gap being production-only cruft (below), and the 037–044 role-model and 036/043 attendance policy sets matching exactly. So the `012` nine-vs-seven divergence that `036` §4e was written to close **is confirmed closed** — reasoned from files before, now actually executed.

**The five divergences, and what was authored for each (all FILES-ONLY — production already has every one of these and was not touched):**

1. **🔴 ~20 columns exist on production, in NO migration file.** `events` ×12, `table_bookings` ×6, `event_payments` ×2. Not obscure ones: `table_bookings.guest_name/guest_phone/guest_email` are the names CLAUDE.md and standards.md §10 *mandate* for customer-facing bookings — the live table follows the standard, the files never recorded that it does. `event_payments.received_by` is the subject of an entire entry in this log (Sprint B Task 4 / Sprint C Task 1, the 28 May Add Payment FK bug) — a column analysed at length across two sprints that has never once appeared in a migration. **A rebuild produced Events and Table Bookings schemas the application cannot run against.** → `046_events_unfiled_columns_reconcile.sql`, `047_table_bookings_unfiled_columns_reconcile.sql`, `048_event_payments_unfiled_columns_reconcile.sql`. Every definition read off production read-only, never inferred; `ADD COLUMN IF NOT EXISTS`, added in production's ordinal order so a rebuild reproduces column *positions* too, not just the set. 047 also files `table_bookings_table_id_fkey → tables(id)`; 048 files `event_payments_received_by_fkey → auth.users(id)`.
2. **🔴 `user_profiles_id_fkey` was missing `DEFERRABLE INITIALLY DEFERRED` in the files — the one divergence running in the dangerous direction.** standards.md §6 states the requirement outright and even supplies the ALTER; grepping all 45 files case-insensitively for `deferrable` returns **zero hits**. Production has it (`condeferrable = t, condeferred = t`, verified live); `001_schema.sql:7` declares only `ON DELETE CASCADE`. A from-files rebuild yields a non-deferred FK, and `create-user` — the Edge Function that provisions every user in the system — fails on its first call, exactly as §6 predicts. → `049_user_profiles_fk_deferrable_reconcile.sql`, guarded so it is a no-op when already deferrable.
3. **🟡 Two more nullability drifts, same class as the 016 fix.** `events.title` and `table_bookings.customer_name` are `NOT NULL` in the files, nullable on production. Confirmed live *why*: both are vestigial, superseded by columns the app actually writes — of 1 live event, `name` is set and `title` is NULL; of 3 live bookings, all 3 have `guest_name` and none have `customer_name`. A rebuild keeping NOT NULL would reject every row the app creates. → folded into 046 and 047 alongside their tables' columns.
4. **🟡 The GRANT layer is ungoverned by any file.** 588 grants on the rebuild vs 435 on production. Root cause (via `pg_default_acl`): production restricts what `anon`/`authenticated`/`service_role` receive on newly created postgres-owned objects (tables `Dxtm`, sequences `w`, functions postgres-only); a fresh project grants full `arwdDxtm`/`rwU`/`X` to all three. Nothing in any migration ever recorded that restriction. **Currently inert** — every table has RLS enabled on both sides and no policy anywhere targets `anon`, verified on both databases — but production defends twice (GRANT + RLS) where a rebuild defends once. One future migration that forgets `ENABLE ROW LEVEL SECURITY` is harmless on production and a full public exposure on a rebuilt database. → `050_default_privileges_reconcile.sql`. Note the ordering trap it documents: `ALTER DEFAULT PRIVILEGES` is **not retroactive**, so the file must *also* reset the 28 already-created tables and re-grant production's exact matrix (generated from the live grant table, not transcribed) — the default-privileges statement alone would have fixed nothing.
5. **🟢 Two legacy duplicate `service_role` policies on production only** (`departments`, `user_profiles`) — the files correctly omit them. This is the Sprint A "six tables carry duplicate service_role policies" item, still open. Deliberately NOT reproduced. **This one is a production-cleanup item, not a files fix** — see below.

**New open item — production cleanup (do not do it as part of a rebuild fix):** drop the legacy-named duplicate `service_role` policies from production so the two databases converge from the other side. Functionally inert (`ALL/service_role/USING(true)`, identical to the canonical `service_role_all_*`), so this is tidiness, not a fix. Confirmed present on `departments` and `user_profiles`; the Sprint A entry named six tables, so re-check the full set before dropping.

**Why this whole class kept happening, and what the proof was for.** Every one of these — the 016 constraint, ~20 columns, an FK property, a grant-layer default — is hand-applied DDL that worked on production and was never written down. Sessions A and B reconciled *ghost tables and ghost columns* and did not check constraints, column-level nullability, FK properties, or grants. Those four categories are where all of today's findings live. **A future audit must diff `pg_constraint` (including `condeferrable`/`condeferred`), `information_schema.columns` (nullability AND defaults AND ordinal order), `pg_default_acl`, and the per-table grant matrix — existence checks alone would have passed every one of these.**

**Status: §2.6 PASSED — migration gate CLOSED (rebuild proof run 4, 12 August 2026).** 001–050 rebuild from empty matches production; `db push` now trustworthy for new schema.

### Rebuild proof runs 3 and 4 — the fix validated and proven

**Run 3 (12 August):** pushed 001–045 clean (016's fix held; 017–045 rebuild-tested for the first time and all cleared), then failed at `050_default_privileges_reconcile.sql`: `syntax error at or near "﻿"`. Cause: a leading UTF-8 BOM, introduced when `050` was assembled via PowerShell `Set-Content -Encoding utf8` rather than the tool used for every other file — checked `045`–`049` for the same defect, all clean. Not patched that session, per plan; the failure was reported as the finding. Everything reachable before the failure (001–049, covering all four run-2 fixes) diffed clean against production: 302/302 columns, 101/101 constraints (including the deferrable `user_profiles` FK and `event_payments_received_by_fkey`), 106/108 RLS policies (the same known residual, below). The BOM was fixed in a follow-up session — verified `045`–`050` all now start with a plain `--` byte, not `﻿`; `git diff` on `050` confirmed the fix touched exactly one line. `050`'s SQL content was read-reviewed (syntax, object names against the live 28-table list, the section 2/3 revoke-then-regrant structure, transactional safety) but had never executed anywhere as of the end of that session.

**Run 4 (12 August) — PASS.** Fresh throwaway, `001`–`050` pushed clean through `050` for the first time — no BOM error, no SQL error behind it. Diff against production, byte-for-byte:

| Object | Result |
|---|---|
| Tables | **28/28** exact |
| Columns | **302/302** exact, zero diff |
| Constraints | **101/101** exact, zero diff |
| Indexes | **41/41** exact |
| Grants | **435/435** exact, zero diff |
| `pg_default_acl` | byte-identical |
| Functions (`current_app_role`, `current_app_department`, `apply_stock_delta`, `set_stock_quantity`) | byte-identical |
| RLS policies | 106/108 — the 2 known legacy duplicates only, below |

Every prior finding confirmed fixed by direct re-check, not by count alone: the ~20 unfiled columns, `user_profiles_id_fkey` deferrable (`condeferrable=t, condeferred=t` on both sides), `event_payments.received_by` (FK'd to `auth.users(id)` on **both** sides — it has never been a bare uuid), and the full grant/default-privilege layer.

**Two claims checked directly this run and found NOT to hold** — recorded so they aren't mistaken for real findings later: (1) *"`event_payments.received_by` has no FK, bare uuid"* — false, verified FK'd on both databases. (2) *"`event_checklists` has a CASCADE-vs-SET-NULL divergence, production stricter"* — false; `event_checklists_event_id_fkey` is `ON DELETE CASCADE` on **both** databases, byte-identical `pg_get_constraintdef`. No such residual was ever recorded in this log — checked before writing this entry — so there is nothing to remove; noted here only so the claim isn't reintroduced later.

**The one real, expected residual — a production-cleanup item, not a file gap:** 2 legacy duplicate `service_role` policies (`departments`, `user_profiles`), production-only. Functionally inert (`ALL/service_role/USING(true)`, identical to the canonical `service_role_all_*`). The Sprint A entry originally named six tables carrying this pattern; re-check the full set before dropping them from production.

**The gate is closed.** `db push` is trustworthy for new schema going forward — every migration file `001`–`050` has been proven, not merely believed, to reproduce production from empty.

#### 046–050 EXECUTION STATUS (12 August 2026) — read this before rolling them out

**None of these five files has been executed anywhere — not production, not staging.** Production's `supabase_migrations.schema_migrations` reads **001–044**; even `045` is unrecorded. Production was **READ-ONLY for the entire authoring session** — `SELECT`s only, via a helper that hard-refuses any statement not starting `SELECT`/`WITH` and rejects any string containing a mutating keyword (it fired twice on my own read-only queries for merely containing `INSERT`/`UPDATE`/`DELETE`/`TRUNCATE` inside an `IN` list; those were rephrased to filter client-side rather than relax the guard).

**Rollout is `supabase migration repair --status applied 045 046 047 048 049 050` — NOT `db push`.** Production already has every object these files describe; they exist to make the *files* reproduce it.

**🔴 050 must NEVER be executed against production.** Its section 2 (`revoke ... on all tables in schema public`) briefly strips DML from every table before section 3 restores it. That is a real risk window — in exchange for a no-op end state, since production already carries the exact grant matrix section 3 re-grants.

*Recorded because it was briefly believed in review that 047 had applied live `ALTER DEFAULT PRIVILEGES ... REVOKE` statements to production. It had not, and no such statement was ever executed: `ALTER DEFAULT PRIVILEGES` appears only in **050**, only as file text, and the read-only guard would have refused it. Noted here so the question is answered in the record rather than re-litigated later.*

**Closed via run 4 (12 August 2026)** — the diff came back exactly as predicted: clean except the two production-only legacy policies in item 5. Staging deleted, local link re-confirmed unchanged. What remains is not proving the gate — that's done — but **rolling 045–050 into production's own migration history**, which is a separate, deliberately deferred step: `supabase migration repair --status applied 045 046 047 048 049 050` — **not** `db push`. Production already has every object these files describe; `050` in particular briefly strips DML from every table before restoring it, which is pointless risk against live data for a no-op end state. See the EXECUTION STATUS block above for the full detail.

### Prior deferral (10 August 2026) — superseded by the runs above

`db push --dry-run` reports clean, but **a clean dry-run only proves the history table is recorded — it does not prove the files rebuild the database.**

Docker is not installed on this machine (not merely stopped — `docker` is not on PATH), so `supabase db reset` is unavailable locally and the only route is a throwaway cloud project. The "Streamline Systems" org already holds three projects (`woodlands`, `petroda-dev`, `phalombe-prod`) against a two-project free allowance, so a fourth is very likely billable; the token in use cannot read the org subscription to confirm (404). Aman deferred rather than provision it at the time — since resolved, a throwaway was provisioned for the run above.

Still un-scripted (either session or later): legacy-duplicate policy pairs on the three ghost tables and elsewhere; dead-table drop decision for `deliveries`, `inventory_items`, `stock_adjustments`, `stock_transfers` (`stock_transfers` collides with Phase 2 naming).

---

## TWO-TIER INVENTORY — DEFERRED TO THE REAL-DATA SESSION (13 August 2026)

*From the two-tier FOUNDATION session (migrations 051–053). The structure is
built; three things were deliberately not done. Read this before touching
inventory again.*

### 1. The catalogue is NOT deduped — 559 rows, 276 products duplicated

`stock_items` still holds **559 rows: 276 Main Bar + 283 Sports Bar**, of which
**276 products exist twice**, once per bar. The lodge buys centrally into one
main store and distributes to both bars (Aman, Option A), so the end state is
one catalogue row per product with per-location balances. The structure now
supports that; **the merge itself waits for real data.**

**Why deferred:** every one of the 559 quantities is placeholder pending
Dhiren's stocktake, and real data will bring real SKUs. Merging placeholder
pairs now means doing the same job twice. Consistent with the standing
"prove the modules work before perfecting the data" framing.

**Correcting the record on the merge key, because a wrong version of this was
briefly in circulation and would cost a future session real time.** It was
stated during the session that "no reliable auto-key exists — `BAR-*`/`RB-*`
vs `SBA-*` are independent sequences." **That is not what production holds.**
Measured live, 13 August 2026:

- SKU prefixes are exactly two: `RBA-` (276) and `SBA-` (283). There is **no
  `BAR-` or `RB-` prefix anywhere in the table.**
- Keyed on the numeric SKU suffix: **283 distinct products, 276 appearing in
  both bars, 7 Sports-only, 0 Main-only**, and no suffix appears more than
  twice.
- Across all 276 shared pairs: **name mismatches 0, unit mismatches 0, reorder
  mismatches 0.** The only difference between a pair is `department` and `id`.

So a lossless key **does** exist today. The deferral is a decision about *when*
to merge, not an absence of a way to do it. Re-derive against real SKUs when
the real catalogue lands — but do not go hunting for a key on the assumption
none is available.

**When it runs, it is a pure DATA operation — no schema change.** Because
migration 051 put location on the balance row, the merge is: re-point each
duplicate's children to the surviving catalogue row **keeping
`current_stock.location` as-is**, then `is_active = false` on the duplicates
(not DELETE). Ordering matters — `current_stock`, `stock_movements` and
`requisitions` all FK to `stock_items` **ON DELETE CASCADE**, and
`event_stock_allocations` is **ON DELETE RESTRICT**, so a naive DELETE would
destroy balances, ledger history and requisitions. Children first, always.

**Consequence visible until it runs:** the main-store tier holds a balance per
*catalogue row*, so those 276 products appear **twice in the main store**
(559 store rows, not 283). Accepted deliberately — collapsing them early would
mean trusting the suffix key to decide product identity, which is the
real-data session's judgement to make. Switching to one row per product is a
`DELETE`, not a rebuild.

### 2. The stock_catalogue / stock_locations split — same session, one operation

The eventual split of identity from balance is **deferred to the same real-data
session and done as one operation with the dedupe** (Aman, 13 August).

From the current end state this is **two renames, not a retrofit**:
`current_stock` already has the balance table's shape
(`stock_item_id, location, sub_location, tier, quantity, reorder_level`), so it
becomes `stock_locations`, `stock_items` becomes `stock_catalogue`, and the
by-then-dead `department` column is dropped. A rename carries FKs, indexes,
constraints and policies with it — none of the four inbound FKs need
re-pointing.

**The expensive version is the one to avoid:** keeping the OLD table names as
compatibility *views* over the new tables. That would need FK re-points,
`INSTEAD OF` triggers (the RPCs use `SELECT … FOR UPDATE` and `ON CONFLICT`,
neither of which works through a join-backed view), `security_invoker = true`
on every view — **without it a view runs with its owner's rights and silently
bypasses RLS entirely** — and a full RLS rebuild, since policies belong to
tables and the 10 policies on `stock_items`/`current_stock` would vanish with
them. Migrate the components to the new names in the same pass instead.

### 3. `stock_items.department` is deprecated but still load-bearing for RLS

It is no longer the location authority — `current_stock.location` is — but it
stays populated because migration 039's `stock_items_dept_select` and
`current_stock_dept_select` both key on it. The invariant 051 established (for
every pre-existing balance, `location` = that item's `department`) is what lets
the RLS pass re-point those policies at `current_stock.location`, after which
the column can be dropped.

### 4. ~~Known scope widening for department_head — one clause, deliberately not applied~~ — CLOSED 14 August 2026 by `056`

Heads no longer see main-store rows: `current_stock_dept_select` now carries
`tier = 'department' and location = current_app_department()`, and `'Main Store'`
can never equal a department. Proved live — Sports Bar head **0 store rows**
(was 283), Main Bar head 0 (was 276). See 4c for the full before/after.

*Original entry, preserved:*

The main-store rows point at items tagged `Main Bar`/`Sports Bar`, so
`current_stock_dept_select`'s `EXISTS` against `stock_items.department` matches
them too. **Proved as the roles, 13 August:** the Sports Bar head sees 283
department balances **plus 283 main-store rows**; a Main Bar head (proved via a
rolled-back re-point, no such profile exists yet) sees 276 plus 276. Zero
cross-department leakage in both cases.

Not a rebuild and arguably useful — a head planning a requisition can see what
the store holds — but it is a widening of what a head sees, and it was **not**
applied silently. Suppressing it is one clause on one policy
(`and current_stock.tier = 'department'`), which belongs to the RLS pass.

### 4b. Store→department ISSUING — BUILT (migration 055, 13 August 2026)

`issue_stock(item, from_location, to_location, quantity, reason, movement_type,
from_sub_location, to_sub_location)` moves stock between any two locations
atomically. Orchestration only — it calls `apply_stock_delta` twice in one
function body, so the proven single-sided primitive remains the only
implementation of the locking, the fail-closed check, the create-if-missing
branch and the ledger write. Calls are issued in deterministic
`(location, sub_location)` order, not caller order, so an issue racing a return
cannot deadlock.

The main store **depletes** — it is an ordinary balance row, not a notional
source. Proved live: store 100 → 90 and Sports Bar 17 → 27 on a single
10-unit call. Store rows carry their own reorder (20 bottles / 32 crates), so
the store itself goes Low after ~80 / ~68 units are issued out.

`movement_type = 'issue'` was widened in **all three** places in the one
migration: table CHECK (`..._check_v3`, replacing `_v2`), the `apply_stock_delta`
allowlist, and `MOVEMENT_TYPES` in `src/lib/stock.js`. Requisition Fulfil is
wired to it and now issues Main Store → the requesting department.

**Deferred, decided by Aman 13 August 2026:**

- **No partial fulfilment.** If the store cannot cover the FULL quantity the
  fulfil is rejected and nothing moves. Matches the fail-closed pattern
  everywhere else. **Revisit with Dhiren** — whether a short store should
  part-fill a requisition is an operational preference, not a technical
  default.
- **Department → store RETURNS are out of scope.** `issue_stock` is
  direction-agnostic and was proved working department→department (Sports Bar →
  Main Bar), so returns need a UI surface, not new database work.

### 4c. ~~🔴 BLOCKER — a receiving department cannot SEE what it was issued~~ — RESOLVED 14 August 2026, migration `056` applied and proven live

**Migration `056` was written on 13 August but never executed** — the session that was to apply it was interrupted, and `057` went in without it. Discovered by a read-only assessment on 14 August (the policies were still in their `039` form; migration history had exactly one hole, at `056`). Applied 14 August and proved as the roles, rolled back, on the identical before/after scenario — issue Main Store → Kitchen 9 units, then read `current_stock` as each head:

| Viewer | Before `056` | After `056` |
|---|---|---|
| Kitchen head (**holds** the stock) | **0 rows** | **1 row** — the Kitchen row, qty 9 |
| Sports Bar head (**gave it away**) | **567 rows** — its own 283 + 283 Main Store + the Kitchen destination row | **283 rows** — Sports Bar only, **0 store rows** |

Main Bar head 276 / 0 store (via a rolled-back re-point; no Main Bar head profile exists yet). Restaurant head 0 rows — still data-absence, not policy failure. Owner and admin unchanged at 1118 rows across both tiers. The `current_stock → stock_items` join a head reads returns **0 null catalogue rows**, so `StockLevelsTab.jsx:27`'s unguarded `r.stock_items.name` cannot throw. Policy count 19 before and after; old policies dropped, not left beside the new ones; no blanket `USING(true)` for `authenticated` introduced.

**Worth carrying forward: the over-exposure was the more dangerous half, and it was the half nobody had named.** This entry was written as a *visibility* failure — a head cannot see what it holds. The same policy was simultaneously showing each head **other departments' balances**, which is a scoping failure and the one with security consequence. Both came from the same clause. When a policy is found to be scoped on the wrong column, check what it wrongly *reveals*, not only what it wrongly hides.

*Original diagnosis, preserved:*

**Issuing works; seeing it does not.** After issuing 10 units into Kitchen, the
Kitchen `department_head` sees **zero** balance rows — not merely zero of that
item, but 0 rows in `current_stock` entirely.

Cause: migration 039's `current_stock_dept_select` scopes via
`EXISTS (stock_items si WHERE si.id = cs.stock_item_id AND si.department =
current_app_department())` — the **deprecated** `stock_items.department`, not
`current_stock.location`. The item issued to Kitchen is tagged `'Sports Bar'`,
so the EXISTS fails. `stock_items` is itself RLS-filtered for that head, so even
the item row reads back NULL.

This is the deprecated column being load-bearing, exactly as `051`'s header
predicted — but it has stopped being cosmetic and is now **functionally
blocking**: a department can hold stock it cannot see, which makes the whole
store→department flow undemonstrable to a department head.

**Fix is one clause in the RLS pass** — re-point the policy at
`current_stock.location`:

```sql
create policy "current_stock_dept_select" on public.current_stock
  for select to authenticated
  using (public.current_app_role() = 'department_head'
         and location = public.current_app_department());
```

That also closes the known store-row over-exposure in item 4 above, since
`'Main Store'` never equals a head's department. **Not applied — RLS was fenced
out of this session. It should be the first thing the RLS pass does, and the
RLS pass should now come before the Movement Ledger.**

### 4d. BAR PAR LEVELS + END-OF-DAY CYCLE — BUILT (migration 059, 17 August 2026)

Deferred / decided items from that session:

- **Par placeholder is `2 × catalogue reorder_level`** (bottles 5 → 10, crates
  8 → 16), **Main Bar and Sports Bar only** (Aman, 17 August). The other nine
  departments keep `par_level` NULL and never enter the refill cycle — a
  location is on the cycle exactly when it has par values, so a new department
  joins by getting data, with no code change. **Real par values come from the
  bar heads at real-data time**; replacing them is one UPDATE.
- **The count is a stock take, and that is load-bearing, not incidental.**
  Nothing deducts sales (no POS integration), so a bar's `current_stock` is
  fiction between counts. Posting a count reconciles the balance to what was
  physically counted; the count-vs-system delta IS the night's consumption.
  **This is the natural feed for the §2.3 consumption ledger** — build that on
  top of `bar_count_lines`, don't invent a second source.
- **`post_bar_count` is `SECURITY DEFINER`.** A `department_head` holds no write
  policy on `current_stock`/`stock_movements` (all owner/admin), so a bar head
  could not otherwise post their own count. Widening those policies was
  **rejected** — it would also grant arbitrary balance edits at that location,
  the same over-exposure class `056` closed. The in-function check is therefore
  the security boundary: no dynamic SQL, location read off the locked session
  row and never from an argument, non-draft sessions refused. `fulfil_requisition_batch`
  is deliberately **INVOKER**, so fulfilling adds no second privilege surface.
- **Batch fulfil is per-line survivable, unlike a single requisition.** `055`'s
  no-partial rule still holds per requisition; but a 90-line refill must not be
  abandoned because one item is short, so `check_violation` on a line is caught,
  named in the return value and skipped. **Every other error aborts the batch.**
- **Requisitions are raised `pending`, not `approved`** — the existing
  approve → fulfil control is preserved rather than bypassed by automation.
- **🟡 OPEN — no par-level editing UI.** Par is seeded and readable (Stock
  Levels shows a Par column) but there is no screen to change it. Fine while
  values are placeholder; needed at real-data time when the bar heads supply
  real numbers. Until then it is an UPDATE.
- **🟡 OPEN — `AdjustmentsTab` is still location-blind.** `setStockQuantity()`
  never passes `p_location`, so every adjustment resolves to
  `stock_items.department` and the **Main Store cannot be adjusted at all**.
  Works by accident for bars. `059` fixed the *department on the movement row*
  through the same function but deliberately did not change the tab's call
  signature. Small fix, own step.
- **🟡 OPEN — browser verification of the Bar Count tab.** The database layer is
  proven live as the roles (19/19 scenarios) and the build is clean, but the new
  tab has not been exercised in a browser. Needs an owner or bar-head session.

### 5. Still not built, in order

~~RLS pass~~ ✅ (`056`, 14 August) → ~~`TransfersTab` wiring~~ ✅ (`057` +
frontend, 14 August) → ~~`movement_type` widening~~ ✅ (`058`, 14 August) →
~~Movement Ledger~~ ✅ (`058` + data-ops/`006`, 14 August — see the CLOSED block
below) → ~~bar par levels + end-of-day cycle~~ ✅ (`059`, 17 August — see 4d
above) → **rooms + consumption ledger** ← next feature → **FM taxonomy +
waiting list + fees** → **QR attendance** → **events payments-edit + revenue** →
**real-data dedupe + table split**.

### 5b. §2.6 REBUILD RE-PROOF — `051`–`057` CLOSED (run 5); `058` now owed

**`051`–`057` re-proof — CLOSED by run 5 (14 August 2026, Aman's verbal
confirm; output not yet pasted into the record).** Run 5 rebuilt `001`–`057`
into a throwaway and diffed clean against production. Closure currently rests on
a verbal — re-anchor it to the pasted artefact when convenient, as the earlier
runs were.

*(Historical: the gate closed on `001`–`050` at run 4, 12 August. `056`
executed out of order — production ran `057` first — but `056` is 2 `DROP
POLICY` + 2 `CREATE POLICY` + 1 column comment and `057` is 1 `CREATE OR REPLACE
FUNCTION` + grants + a comment; disjoint object sets, so they commute. Confirmed
after the fact: applying `056` second left `transfer_stock`, `issue_stock` and
`apply_stock_delta` byte-identical by `md5(prosrc)`, every `051`–`057` object
present as described.)*

**~~Now owed: `058` has not been rebuild-proven.~~ — CLOSED by RUN 6,
17 August 2026, before `059` was written.**

Throwaway `ezdzuncwptlslclxepii` (eu-west-1), confirmed empty first (0 tables,
0 functions, 0 migration rows). `db push --db-url` via the pooler applied **all
58 migrations with no errors**. Production stayed read-only throughout (a helper
that hard-refuses any statement not starting `SELECT`/`WITH` — it fired on the
proof's own `'GRANT|'` string literal, which was relabelled rather than the guard
relaxed). Staging deleted immediately; local link verified `gttsjmxltrxxfplqjans`
before *and* after; production data unchanged (559 / 305 / 62 / 1118 / 537).

| Object | Prod | Rebuild | Result |
|---|---|---|---|
| Tables | 28 | 28 | **exact** |
| Columns | 306 | 306 | set-exact; 5 differ in ordinal position only (accepted, above) |
| Constraints (incl. `condeferrable`/`condeferred`) | 101 | 101 | **exact** |
| Indexes | 46 | 46 | **exact** |
| Table privileges | 631 | 631 | **exact** |
| `pg_default_acl` | 24 | 24 | **exact** |
| RLS enablement | 28 | 28 | **exact** |
| Triggers | 1 | 1 | **exact** |
| Policies | 106 | 104 | the 2 known production-only legacy duplicates |
| Functions | 8 | 7 | `handle_new_user` orphan (production-only, files correctly omit) + the anon-EXECUTE finding above |

**Every function body byte-identical** by `md5(prosrc)`, including
`apply_stock_delta` after `058`'s in-place replace.

**Run 6 also caught what the record had wrong: production's migration history
stopped at `057`.** `058` had been applied by hand and never recorded — exactly
one gap, while its objects were demonstrably live (CHECK `_v4` carrying all eight
types, 4 indexes on `stock_movements`). STATE and this log both claimed
"`001`–`058`". Repaired via `migration repair --status applied 058`, re-read on a
fresh connection: **58 rows, max 58, no gaps**, `db push --dry-run` clean. `059`
was then written on a genuinely proven base rather than a believed one.

**Now owed: `059` has not been rebuild-proven.** Same rule — the next migration
written triggers a throwaway rebuild of `001`–`059` diffed against production.
A rebuild proof expires; it is a claim about a file range on a date, not a
permanent property of the project.

### 6. ~~⚠ The transfers-don't-deduct bug is STILL OPEN~~ — FIXED AND PROVEN LIVE, 14 August 2026

**Closed by migration `057` (`transfer_stock`) plus the `TransfersTab` /
`src/lib/stock.js` wiring, with the false ledger rows removed by
`scripts/data-ops/005`.** Proved as the `admin` role, `SET LOCAL ROLE`, rolled
back, and re-read on a fresh connection afterwards to confirm the rollback:

| Probe | Result |
|---|---|
| Sports Bar → Main Bar, 7 units | Sports Bar **17 → 10**, Main Bar row **created at 7**, 2 ledger rows, `movement_type` `'transfer'` |
| Main Store → Sports Bar, 5 units | Store **100 → 95**, Sports Bar **17 → 22**, `movement_type` **`'issue'`** — server-side derivation works |
| Same call as a Sports Bar `department_head` | **Denied `42501`** at the destination INSERT — correctly fail-closed |

`movement_type` is **not** caller-chosen: `transfer_stock` derives it (`'issue'`
when either end is `'Main Store'`, else `'transfer'`) so a manual
store→department move and the identical movement raised through a requisition
cannot be recorded two different ways in the Movement Ledger. `transferStock()`
in `src/lib/stock.js` deliberately exposes no `movementType` option.

The 2 orphan ledger rows from 27 July are deleted; `movement_type='transfer'`
now counts **0** in production. Balances were deliberately **not** adjusted —
the movement never happened, so the ledger was wrong and the balances were
already right.

*Original diagnosis, preserved — note the fix as planned here was superseded:
`issueStock(..., { movementType: 'transfer' })` would have let the caller choose
the type, which is exactly what `057` makes unrepresentable.*

Recorded with evidence because it was twice believed fixed during the 055
session, and a fixed-bug-recorded-as-open is cheaper than the reverse.

**There is no `record_stock_transfer` function.** `pg_proc` holds exactly seven
`public` functions, one signature each: `apply_stock_delta`, `issue_stock`,
`set_stock_quantity`, `current_stock_validate_location`, `current_app_role`,
`current_app_department`, and the orphan `handle_new_user`. Nothing in any
schema matches `%transfer%` or `%record_stock%`, and the only non-internal
trigger in the entire `public` schema is `trg_current_stock_validate_location`
(054) — so no trigger syncs the ledger to balances either.

**Demonstrated, not just read:** replaying exactly what `TransfersTab.jsx:57-60`
submits — two `stock_movements` rows, `−7`/`+7`, Sports Bar → Kitchen — wrote
**2 ledger rows** while the Sports Bar balance stayed at **17** and the Kitchen
row was **never created**. Rolled back.

`TransfersTab` still writes ledger rows directly and never calls any RPC. Its
From/To selects also read `departments`, so `'Main Store'` cannot even be
chosen.

**The fix is now one line of wiring, because 055 already built the primitive
and proved it in the transfer direction** (Sports Bar → Main Bar moved both
balances). Replace the `supabase.from('stock_movements').insert([...])` with
`issueStock(item, from, to, qty, { movementType: 'transfer' })` and swap
`fetchDepartmentList()` for `stockLocations(departments)`. Deliberately not
done in the 055 session, which was scoped to issuing.

---

## MOVEMENT LEDGER — CLOSED 14 August 2026 (`058` + data-ops/`006`)

The consolidated Movement Ledger replaces the delivery-only Delivery Log. Full
detail in STATE and HISTORY; the followup-relevant residue:

- **`058`** — `movement_type` CHECK `_v3`→`_v4` (`event_allocation`,
  `event_return`); allowlist widened in `apply_stock_delta` via in-place replace
  (same oid, byte-identical signature, `proacl` unchanged); 1 event `adjustment`
  row backfilled → `event_allocation`; `stock_movements` indexed (was pkey-only).
  4 event code sites re-typed. Ledger tab replaces `DeliveryLogTab`;
  pair-collapse in `src/lib/ledger.js`, 31/31 tests. Proven live as roles, and
  browser-verified.
- **Event `from`/`to` NULL bug — CLOSED (`data-ops/006`).** The four event call
  sites wrote `from_department`/`to_department` NULL, so the ledger department
  filter **silently dropped every event draw** (Main Bar filter showed a −2
  requisition, hid −10 and −13 event allocations on Main Bar). Fixed:
  `event_allocation` sets `from_department`, `event_return` sets
  `to_department`; existing rows backfilled from the event-allocation join, not
  the deprecated `stock_items.department` (both derivations confirmed to agree),
  idempotent, 0 inserts/deletes. See HISTORY 14 Aug for the doctrine lesson
  (nullable-column filters silently exclude null rows).
- **~~🟡 OPEN — restore the delivery Supplier column.~~ — DONE 17 August 2026.**
  `Supplier` is now a real column in `MovementLedgerTab`, populated by
  `parseSupplier(notes)` for every row that carries one, and the `Route` cell no
  longer tries to render a supplier as a route — it just says "—" when a
  movement has no route. Restores what the old Delivery Log showed.
- **~~🟡 OPEN — create a Main Bar `department_head` account.~~ — ALREADY DONE;
  the note was stale.** `mainbar@woodlands.com` exists live as a `department_head`
  scoped to `Main Bar` (confirmed 17 August while listing profiles for the `059`
  role proof, and used as a real cross-department denial subject in it — it is no
  longer proved via a rolled-back re-point). Both stock-holding bars now have a
  head. Kitchen, Restaurant and Sports Bar heads also exist; the remaining
  departments have none, which stays a real-data item with Rose.

## anon-EXECUTE RESIDUAL — ⚠ CORRECTED 17 August 2026. The entry below was right about PRODUCTION and wrong about the FILES.

**Closed for real by `059` section 10.** Rebuild proof run 6 (17 August) measured
both databases and resolved the contradiction this entry created:

| | `proacl` on `current_app_role` / `current_app_department` |
|---|---|
| **Production** | `{postgres, authenticated, service_role}` — **no anon**. The entry below is correct. |
| **A from-files rebuild** | `{postgres, **anon**, authenticated, service_role}` — anon CAN execute. |

So the debt **does exist**, on the files, and the old entry's instruction —
*"must not be re-added to any migration, do not re-litigate"* — would have kept a
real gap open indefinitely. It was written from a **production-only probe**, and
only a rebuild distinguishes the two sides. That is the whole reason §2.6 exists.

**Cause, measured not inferred:** a fresh Supabase project's default privileges
grant EXECUTE on new functions to `anon`. `021` and `037` each pair their CREATE
with `revoke all … from public`, which strips the **PUBLIC** grant but not the
separate **explicit anon** one. `050` then fixes the defaults going forward and
resets already-created **tables** (its section 2) but never resets already-created
**functions** — its own header documents that `ALTER DEFAULT PRIVILEGES` is not
retroactive and then covers only half of it. The two divergent functions are
exactly the only two created before `050` and never re-created after it (`052`
re-created the stock RPCs under the restricted default; `054`/`055`/`057` were
created after). Theory and measurement agree exactly, and the other five
functions matched production byte-for-byte.

**Effect was inert** — `auth.uid()` is NULL for `anon`, so both return NULL — but
these are `SECURITY DEFINER` functions that every RLS policy in the system calls,
and "production defends twice, a rebuild defends once" is precisely the class
that made `050` a finding.

**Fixed in `059` section 10**, which unlike `050` is safe to execute against
production (it is a no-op there — confirmed after apply: `proacl` unchanged,
still no `anon`).

**Doctrine, and the reason this is written at length:** *a claim that a debt does
not exist must say WHICH DATABASE it was measured on.* "Verified absent" against
production says nothing about the files, and the files are what a rebuild runs.

*Original entry, preserved:*

> The debt to `REVOKE EXECUTE` on `current_app_role`/`current_app_department` from
> `anon`/`PUBLIC` **does not exist and must not be re-added to any migration.**
> Verified live: `has_function_privilege` returns **false ×4** (anon + public ×
> both functions); `proacl` on both functions is
> `{postgres, authenticated, service_role}` only — no `anon`, no `PUBLIC`. Already
> closed, most likely at `050` or at function-creation time. Struck from the
> "fold into the next migration" plan. Do not re-litigate.

## COLUMN ORDINAL ORDER on `attendance_records` — ACCEPTED DIVERGENCE (17 August 2026)

Rebuild run 6 found positions 14–18 of `attendance_records` holding the **same
five columns with identical types, nullability and defaults, in a different
order**:

| | 14 | 15 | 16 | 17 | 18 |
|---|---|---|---|---|---|
| Production | `shift_date` | `user_id` | `within_radius` | `break_start` | `break_end` |
| Rebuild | `user_id` | `shift_date` | `break_start` | `break_end` | `within_radius` |

Set-identical — nothing missing, nothing extra, 306/306 columns match as a set.
**Accepted, not chased.** Unlike `046`/`047` (which could match production's
ordinal order because those columns did not yet exist in any file), both sides
already have these columns, so aligning them needs a table rewrite. PostgREST
returns keyed JSON, so no application code depends on ordinal position. Recorded
so a future audit recognises it as known rather than re-discovering it as new.

---

## FROM AUDIT #2 (2026-07-26) — DEFERRED

- **~~WOODLANDS_FUNCTIONAL_SPEC.md route/role table is stale.~~ — RESOLVED 9 August.** The whole spec was rewritten to the end-goal system (correct roles, Phase 2 modules, [DONE]/[BUG]/[NEW]/[VERIFY] markers). Two claims carried into it are marked [VERIFY] rather than trusted: the GPS clock-in geofence and the two-digit stall-number regex — probe both against live code.

---

## FROM SPRINTS

### Sprint A — Task 1 (migration `021_sprint_a_policies.sql`, 2026-07-26)

- **fm_market_days is not a table in the live DB.** MarketDayTab.jsx reads and writes it. Farmers Market monthly notes are broken in production. Escalated from "ghost table" to "live production bug." Must be CREATE'd (with RLS + policies + grants) in Sprint D — not just its policies added.

- **`fm_market_days` does not exist in the live database.** Confirmed absent from `pg_class` across all relkinds — it is not a table, view, or matview. `MarketDayTab.jsx:44` reads it and `:199`/`:205` write it, so the Farmers Market "market day notes" surface fails in production today. This is worse than the "ghost table" classification in AUDIT_2 §2.6, which assumed all four existed and were merely unmigrated. **Sprint D** — needs `CREATE TABLE` + RLS + policies, not just a back-filled migration.

- **The other three AUDIT_2 "ghost" tables do exist** — `event_checklists`, `shift_settings`, `tables` — with RLS enabled. Their `CREATE TABLE` statements are still absent from every migration. **Sprint D.**

- **`authenticated` held no usable grants on `event_checklists`, `shift_settings`, `tables`** — only `REFERENCES`/`TRIGGER`/`TRUNCATE`, so their pre-existing SELECT policies were unreachable. Granted in `021`. Worth checking the remaining tables for the same gap at Sprint D.

- **Duplicate `service_role` policies.** Six tables now carry two functionally identical `service_role … FOR ALL … USING(true)` policies: the pre-existing legacy-named `"service role full access {t}"` and the canonical `"service_role_all_{t}"` added by `021`. Sprint A was additive-only so the legacy ones were not dropped. **Sprint D** — collapse to one name per table. No security effect; both are permissive.

- **Remote migration history is missing versions 008–020.** `supabase migration list --linked` records only 001–007 as applied, though 008–020 demonstrably ran. `supabase db push` is therefore *unsafe* — it would replay `016_staff_restructure.sql` and duplicate all 62 real staff rows, re-run `018`'s DROP TABLE, and re-create `requisitions`. `021` was applied via the Management API query endpoint instead, and is not recorded in history either (it is written idempotently, so a future replay is harmless). **Sprint D** — `supabase migration repair --status applied` for 008–021 before `db push` is used again.

- **`021` is not itself in the migration history table.** See above. Idempotent by construction (`DROP POLICY IF EXISTS` before every `CREATE POLICY`).

### Sprint A — Task 2 (`create-user` Edge Function, 2026-07-26)

- **CORS is now pinned to `https://woodlands-beta.vercel.app` only.** Calling the deployed function from a local dev server (`http://localhost:5173`) will be blocked by the browser. Intentional per the sprint brief. If local admin testing is needed, either run the function locally with `supabase functions serve` or add the dev origin to an explicit allowlist. **Sprint E.**

- **`ALLOWED_ROLES` in the Edge Function duplicates `src/lib/roles.js`.** Deno cannot import the browser module, so the four roles are listed in two places and kept in sync by hand. Adding a fifth role means editing both. **Sprint E** — consider a shared JSON constant.

### Sprint B — Task 2 (`public-checkin` Edge Function, 2026-07-26)

- **`/checkin` still has no rate limit and holder UUIDs remain guessable-by-possession.** The Edge Function stopped the PII exposure (four columns returned, no listing, no search, inactive indistinguishable from missing), but prior-audit finding 2.3 is only *reduced*, not closed. Anyone holding a valid holder UUID — a photographed QR code, a shared link — can still check that holder in or out. Proper fix is a signed, expiring token in the QR rather than a raw UUID. **Sprint E.**

- **`public-checkin` is deployed with `--no-verify-jwt`.** Required — it is a public route with no caller to verify. Redeploying it without that flag will silently break every QR code. Not expressible in source: there is still no `supabase/config.toml`.

- **Market-day maths is now duplicated.** `getMarketDayForMonth` exists in `src/components/farmers-market/FarmersMarketUI.jsx` and is re-implemented in `supabase/functions/public-checkin/index.ts` (Deno cannot import the browser module). The Deno copy computes in Africa/Blantyre (UTC+2) rather than the host's UTC, to preserve the browser's previous local-time behaviour. If the market-day rule changes, both must change. **Sprint E.**

- **~~`check_in` / `check_out` write paths are not verified end-to-end~~ — CLOSED 26 July 2026 evening.** Verified via a real QR scan on Aman's phone: Banda Crafts holder scanned → check_in wrote the visit row → check_out completed roundtrip. Later re-verified with Shanie Cousins (A049) from the imported real dataset. Data-quality feedback ("Checked out after pack-up time") rendering correctly.

### Sprint B — Task 3 (anon-client migration, 2026-07-26)

- **`attendance_records` still carries an `ALL`/`authenticated` blanket policy.** `USING (true) WITH CHECK (true)`, alongside its scoped INSERT/SELECT/UPDATE policies. This is the same shape as the stale `staff` policy dropped in Sprint A, on a table holding real staff attendance — any authenticated user of any role can rewrite any attendance row. It was out of scope for both Sprint A (which named only `staff`) and Sprint B. **Sprint C or D — should be dropped and replaced with scoped policies.**

- **Key rotation must update the Edge Function secret in the same window.** Both `create-user` and `public-checkin` read `Deno.env.get('SERVICE_ROLE_KEY')`, a manually-set project secret. Rotating the service_role key in the Supabase dashboard does *not* update it. If it is not updated, user creation AND all public QR check-in break simultaneously. See `src/lib/standards.md` §4.

- **`store_supervisor` gates left in place.** `LogDeliveryTab.jsx:7` and `TransfersTab.jsx:7` still list a role that cannot exist, and `InventoryUI.jsx:82` filters on it. Migration 022 deliberately did not grant it anything. Those two tabs remain `AccessDenied` to everyone except owner/manager. **Sprint E.**

- **~~Inventory module had no runtime exercise~~ — CLOSED 26 July 2026 evening.** After the `/inventory` route fix and Bug 6 (requisitions column drift) fix, the requisition raise → approve → fulfil path was exercised end-to-end via the browser. Sprint C's `apply_stock_delta` RPC verified for the first time through the UI. Delivery Log shows exactly one movement row per fulfil (no double-write). Stock Levels reflected the delta correctly.

### Sprint B — Task 4 smoke test (2026-07-26)

- **Event Add Payment broken since 28 May 2026.** `event_payments.received_by` FKs to `auth.users(id)` but the dropdown at EventPaymentsSection.jsx:207 populates from the `staff` table. Any staff.id inserted fails the FK. Also inconsistent within the same table: `recorded_by` correctly FKs to `user_profiles`.

  **Fix confirmed by Aman — Sprint C task, not an open choice:**
  - Populate the Received By dropdown from **`user_profiles`**, not `staff`. The read path at `:162` already resolves `received_by` through `userMap` (built from `user_profiles` at `:30`), and `user_profiles.id` satisfies the `auth.users(id)` FK by construction.
  - **No migration.** The FK stays pointed at `auth.users`.
  - Scope is `EventPaymentsSection.jsx` only: dropdown source plus label rendering. Concretely — drop the `fetchAllActiveStaff()` call at `:31` and the `staff` state at `:10`, render the dropdown at `:207` from the existing `user_profiles` data instead, and update the `:206` placeholder ("Select staff member…") since the list is now system users rather than the roster.
  - Consequence to note: payments can then only be attributed to one of the four login users, not to any of the 62 roster staff. That is the intended semantics — `received_by` has always been an `auth.users` reference.

  *Diagnosis notes:* not a Sprint B regression. `git blame` puts the dropdown source (`:207`), the `fetchAllActiveStaff()` call (`:31`) and the import (`:5`) at commits `e638646` and `e63c7fb`, both 2026-05-28. Sprint B's only change to this file was the `supabaseAdmin` → `supabase` identifier rename. The FK was always enforced — the service-role key bypasses RLS, never constraints — so this path has never worked for any role since it was built. First exercised during the Sprint B smoke test.

### Sprint B — Task 5 (key rotation, 2026-07-26)

- **~~`auth.admin.createUser` unverified against the rotated secret~~ — CLOSED 26 July 2026.** Verified during the Sprint B smoke test: Aman created a burner user through Admin → Add User successfully, then removed it via the Supabase dashboard. **`sb_secret_*` keys do perform `auth.admin.createUser`.** `public-checkin` had already proved the secret valid for service-role PostgREST reads, so both Edge Function paths are now confirmed working against the new key pair. (The dashboard deletion is the separate delete-user gap logged below.)

- **~~`src/lib/standards.md` §4 may be stale~~ — CORRECTED 26 July 2026.** §4 previously mandated storing "the JWT value" in `SERVICE_ROLE_KEY`, which the key-system migration made wrong. Now records that `sb_secret_*` is the correct format and works for `auth.admin`. The underlying rule is unchanged and still load-bearing: use the *manually set* `SERVICE_ROLE_KEY`, not the runtime's auto-injected `SUPABASE_SERVICE_ROLE_KEY`.

- **No fresh manual backup was taken before Sprint B.** Confirmed by Aman as a deliberate call (backups live on Supabase, not locally). The restore point going into this sprint was the automatic backup of 26 July 02:30:54 UTC, which predates migrations 021 and 022. Both are idempotent and in git, so they are replayable, but any data written after that timestamp is not covered. **Take a manual snapshot before Sprint C**, which touches money and quantity logic.

- **No delete-user path in Admin.** Sprint B added authenticated create-user; deactivate hides the user but doesn't remove the auth.users or user_profiles rows. Aman had to delete manually via Supabase dashboard during Sprint B smoke test. Deactivate is likely the correct operational default (preserves FK integrity across recorded_by, created_by, etc.), but a genuine delete-user Edge Function + Admin button is a Sprint E fit-and-finish item if wanted. Decision: keep deactivate as default, add hard-delete option at Sprint E.

## FROM SPRINT C

### Sprint C — Task 1 (Add Payment FK fix, 2026-07-26)

- **~~`event_payments.recorded_by` is never populated~~ — PARTIALLY CLOSED 26 July 2026 evening (Sprint E must-ships).** `recorded_by` is now written on every payment insert. Two open pieces remain: (1) the payments table does not yet display who recorded a payment — the value is present in the DB but not rendered in any column, so verification is by SQL not by eye; (2) the same "written but not displayed" question applies to other `recorded_by`/`created_by` columns across the schema. Both are Sprint E post-demo (see the FROM DEMO PREP section below).

### Sprint C — Task 2 (amount CHECK constraints, 2026-07-26)

- **`event_bill_items.amount > 0` forbids a zero-value line.** Verified by probe: an `amount = 0` bill item is now rejected. That means a genuinely complimentary or comped item cannot be recorded at zero — it would have to be omitted or priced. No such row exists today (7 bill items, all positive), and `> 0` was the specified constraint. If comped lines turn out to be wanted operationally, relax to `>= 0` in a **new migration** rather than dropping the constraint. Worth asking Dhiren at handover. **Sprint E / handover question.**

- **Refunds confirmed to be stored positive.** `event_payments` records refunds as `payment_type = 'refund'` with a positive `amount`, subtracted in the UI (`EventPaymentsSection.jsx:46-48`, rendered parenthesised at `:156-159`). So `amount > 0` does not block refunds. Noted because a future session might reasonably assume refunds are negative and try to relax the constraint.

### Sprint C — Task 3 (stock clamp + returned_qty, 2026-07-26)

- **~~4 legacy allocations carry an unknowable deduction amount~~ — MOOT as of 26 July 2026 evening.** `event_stock_allocations` held 6 rows: 4 `deducted` (16 units) and 2 `pending` (42 units), whose real deduction amounts could not be reconstructed. **All 6 rows were removed by the 26 July evening test-data purge** (`scripts/data-ops/2026-07-26_purge_test_data.sql`), which cleared every transactional table. Verified empty by direct query on 27 July 2026: `SELECT count(*) FROM event_stock_allocations` returns 0. There is nothing left to reconcile, so the Sprint D reconciliation task is dropped.

  Recorded precisely because the closure reason matters: these rows were purged as test data along with everything else, **not** cleared by any later stock operation. The underlying defect the entry described — event stock deduction writing no `stock_movements` row, making clamp shortfalls unreconstructable — was fixed in Sprint C (migration 025) and is unrelated to their disappearance.

- **~~`AdjustmentsTab` is a fourth site that writes stock, not covered by Task 4's three~~ — CLOSED 26 July 2026 (Task 4 expanded scope).** After Aman confirmed scope expansion, migration 025 added a second RPC — `set_stock_quantity` — alongside `apply_stock_delta`, and `AdjustmentsTab.jsx:42-55` was refactored to use it. The set-vs-delta shape mismatch is resolved: `set_stock_quantity` locks the row, computes the delta server-side, and writes the movement + updates `current_stock` atomically. The pre-existing ordering flaw (movement row committed before upsert) no longer exists on this path.

## RESOLVED — Edge Function outage, 26 July 2026 evening

**Cause:** `SERVICE_ROLE_KEY` still held the legacy `service_role` JWT after legacy API keys were disabled, so the admin client inside every Edge Function was dead. QR check-in and Add User were both down. Surfaced by `public-checkin` reporting `"Legacy API keys are disabled"` from the `fm_holders` lookup.

**Fix:** a fresh secret key (`sb_secret_atywb…`) was created and `SERVICE_ROLE_KEY` updated. No redeploy was needed — the functions picked it up immediately. Verified end to end through the application: QR check-in scan → check in → check out from a phone, and Admin → Add User creating a real user. Capability now recorded in `src/lib/standards.md` §4.

### Documented misstep — a working key deleted on faulty reasoning

I reported the project's original secret key (`sb_secret_vXtUz…`, id `85f95296…`) as non-functional, on the evidence that it returned a bare `401` from `/rest/v1` and `/auth/v1/admin` in every header form. Aman deleted it partly on that basis.

**That conclusion was not supported.** The value I probed with came from `GET /v1/projects/{ref}/api-keys`, which does **not** return usable material for `secret`-type keys — only a same-shaped placeholder. So the probe was testing a bogus string, and its `401` said nothing about the key. The `vXtUz` key may well have been fine; the only evidenced fault was the stale legacy JWT in `SERVICE_ROLE_KEY`.

No lasting harm — the replacement key works — but the reasoning was wrong and it destroyed a credential. The tell was available and I missed it: `public-checkin` was reading `fm_holders` successfully with the key in the secret, while my direct probe of "the same key" failed. Two contradictory results about one key value should have prompted me to doubt the probe, not the key.

### Three verification rules, all learned the hard way today

1. **A passing test proves the configuration that was live when it ran, not the one you believe you set.** `public-checkin` returning 200 and Add User succeeding were both recorded as verifying the *new* secret key format. Both actually ran while `SERVICE_ROLE_KEY` still held the legacy JWT, so they verified the old key. The false claim then sat in `standards.md` as doctrine.

2. **Never probe with a secret value read from the Management API.** Publishable keys come back usable; secret keys come back as non-functional placeholders. A probe using one produces an indistinguishable `401`. Verify a secret only through something that already holds it — an Edge Function call, or the app.

3. **Verify by stored codepoints, not by rendered visual, when console codepage differs from source file encoding.** During the Farmers Market import, apostrophes in stall names (e.g. "That's Amore", "Jeniffer's Products") rendered as `â` in the terminal but were correctly stored as U+2019. The mojibake was the console, not the data. Verified by `char_length` vs `octet_length` and by checking expected Unicode points at expected positions — visual verification alone would have "found" a bug that wasn't there and possibly triggered a destructive re-import.

All three are now written into `src/lib/standards.md` §4 so the next session inherits them.

### Still open from this episode

- **`public-checkin` returns a `detail` string on infrastructure failure.** Deliberate — it is what made the missing-column fault diagnosable instead of silent, and `CheckIn.jsx` now renders it. It contains no PII or credentials, but it does expose internal state on a public endpoint. **Drop it before handover** and rely on `console.error` in the function logs.

## FROM DEMO PREP (Sprint D P1 + Sprint E must-ships, 26 July 2026 evening)

- **`WOODLANDS_DEMO_PREP.md` does not exist.** The demo-prep brief instructed me to read it and cited §1, §4 items 5–6, and §5 (four verification tests). Searched the repo, the whole user directory, and git history on all branches — no such file, and no commit ever added one. Tasks 1–6 were unaffected because the brief specified them fully and §4 items 5–6 duplicate findings already in this log from the Sprint C smoke test. The only casualty was Task 7's NEXT ACTION, which was supposed to cite §5's four tests; concrete steps derived from tonight's changes were written instead. **Either write the file or stop citing it** — this project has already been bitten twice by confident references to documents that turned out to be missing or misnumbered (AUDIT_2 §0 on the absent Standard; the §2.5-vs-§4.4 create-user citation).

- **Farmers Market at-risk query still runs for every role.** `OwnerDashboard.jsx` gates the *display* of FM cards to owner/manager, but the `fm_holders` at-risk query in its `Promise.all` still executes for kitchen_manager and restaurant_manager. RLS permits it — all six `fm_*` tables allow `authenticated` SELECT — so this is wasted work rather than an exposure. **Post-demo:** decide whether Farmers Market reads should be role-scoped at the policy layer. That is a change across all six `fm_*` tables, not one, and would also let the dashboard skip the query.

- **`event_payments.recorded_by` is written but never displayed.** Populated as of tonight, but the payments table renders Date / Type / Method / Amount / Reference / Received By and does nothing with it. Verification is by SQL, not by eye. Adding a "Recorded By" column is a one-liner; deliberately not done the night before a demo. **Post-demo.**

- **Three ghost tables remain unmigrated.** `event_checklists`, `shift_settings`, `tables` exist in the live DB but no migration creates them. Only `fm_market_days` was created tonight, because it was the one that did not exist at all. The Standard §2.6 rebuild test still fails. **Post-demo Sprint D.**

## FROM SPRINT E — POST-DEMO (UX / design decisions, not bugs)

*Observed 26 July 2026 while verifying the Sprint C stock RPCs through the requisition path. Both are design gaps, not defects — nothing is broken or losing data.*

- **Delivery Log shows only `movement_type = 'delivery'`.** `DeliveryLogTab.jsx:26` filters on it, so requisition fulfils — which do write `stock_movements` rows — never appear there. The trail is not invisible: the Requisitions view surfaces fulfilled requisitions by status. It is just not consolidated in one place. Two options: rename the tab so its scope is obvious, or build a consolidated Movement Ledger. **Decision needed from Dhiren.**

- **Movement rows show a quantity with no +/- direction indicator.** Harmless in a delivery-only view where everything is inbound, but ambiguous the moment adjustments, fulfils or transfers appear alongside. Cheap to fix when needed — `stock_movements.quantity_change` is already stored signed (negative for deductions), so this is a rendering change with no schema work. **Required if the consolidated Ledger is built.**

- **MEETING QUESTION — should Delivery Log stay delivery-only or become a consolidated Movement Ledger** showing deliveries, adjustments, requisitions, transfers and event allocations with +/- direction?

  Dependency worth raising if the answer is "consolidate": event stock deductions and returns are currently written with `movement_type = 'adjustment'`, because the CHECK constraint on that column only permits `delivery / transfer / adjustment / requisition` (see the Sprint C Task 4 entry below). Today nothing displays them so it is invisible. In a consolidated Ledger, event allocations would appear to the owner as manual stock takes — so widening the CHECK to add `event_allocation` / `event_return` becomes a prerequisite of that feature rather than a tidy-up.

## FROM SPRINT C SMOKE TEST

*Found by Aman during the Sprint C browser verification, 26 July 2026. For Sprint D/E — which run tonight, not "later".*

- **~~Kitchen manager sees Farmers Market cards on Dashboard~~ — CLOSED 26 July 2026 evening.** Fixed as part of Sprint E must-ships — FM cards now gated to owner/manager only. Bug 2 (Task 6 gating partial for `restaurant_manager`) also caught and fixed same evening.
- **~~"Needs Attention" cards on Dashboard link to `/login`~~ — CLOSED 26 July 2026 evening.** Resolved by the `/inventory` route fix in Sprint E — verified in browser.
- **Top-right notification bell + search bar non-functional** — deliberately deferred. Framing at meeting: "placeholder UI, not wired yet." Wire up or remove post-meeting.
- **~~Owner has no visible stock page~~ — CLOSED 26 July 2026 evening.** `/inventory` route fix in Sprint E — verified in browser. Stock Levels tab shows real items, real quantities, real reorder levels.
- **Completed events with outstanding balance are invisible** (event `ww`: 500k unpaid after completion — that event has since been purged in the data cleanup, but the underlying UI gap remains). Ask Dhiren at the meeting whether this needs a card/filter. Sprint E post-meeting if yes.

### Sprint C — Task 4 (atomic stock, 2026-07-26)

- **Event stock movements are typed `'adjustment'`.** `stock_movements.movement_type` has a CHECK limited to `('delivery','transfer','adjustment','requisition')` (`008_inventory.sql:16`). The event sites have no type of their own, so they pass `'adjustment'` with a descriptive `notes` value. The CHECK was **not** widened — that would alter a constraint on a live table without being asked. Consequence: event deductions/returns are indistinguishable from manual stock takes in the ledger. Nothing displays them today (`DeliveryLogTab` filters `movement_type = 'delivery'`; no view renders `'adjustment'`), so there is no visible regression. **Sprint D** — add `'event_allocation'` / `'event_return'` by widening the CHECK, which is additive and breaks no existing row.

- **Event stock now writes `stock_movements` rows where it previously wrote none.** Behaviour change, not a like-for-like refactor. It is an improvement — the absence of this audit trail is exactly why the 4 legacy allocations in migration 024 cannot be reconstructed — but any stock-movement count or report will now include event activity.

- **Multi-item event confirm is still not transactional.** `apply_stock_delta` makes each item atomic, but confirming an event with five allocations is five separate calls; a failure on the fourth leaves three deducted. The Task 3 pre-flight (`assertStockAvailableForConfirm`) makes the realistic failure — insufficient stock — safe by checking everything before any write. A genuinely all-or-nothing confirm needs a function taking the whole event. **Not closed; do not assume otherwise.**

- **`AdjustmentsTab` no longer writes a zero-change ledger row.** A stock take that sets the same value now records nothing, where it previously inserted a `quantity_change: 0` movement. Deliberate — a zero-change ledger entry is noise — but it is a visible difference if anyone counted adjustment rows.

- **`TransfersTab` deliberately not converted.** `TransfersTab.jsx:56` writes a matched pair of movement rows (`-qty` from source, `+qty` to destination) and never touches `current_stock`, because a department transfer is net-zero to total stock. It is not a balance-writing site and needs no lock. Left as-is intentionally, recorded so a future audit does not read it as a missed site.

### Sprint B — carried from Task 2 setup

- **No `supabase/config.toml` in the repo.** The deployed `verify_jwt` setting is still not expressible in source. The function no longer depends on it (it verifies the caller itself), but the setting remains undocumented. **Sprint D.**

---

## PHASE 2 ROLE MODEL — deferred items (11 August 2026)

*From the role-model session: migrations 037–044, hand-applied to live and verified per file. Roles are now `owner`, `admin`, `department_head`, `hr`.*

### Blocking department_head being genuinely useful

- **~~The step-3 department re-tag has NOT run~~ — RESOLVED 12 August 2026.** All three sources now share the 11-value canonical vocabulary (Administration, Main Bar, Sports Bar, Front Office, Grounds & Landscape, Housekeeping, Kitchen, Maintenance, Restaurant, Security, Transport). Applied live via the Management API, verified after each sub-step, recorded in `scripts/data-ops/003_department_retag.sql` (data-ops, deliberately NOT a replaying migration — see that file's header for why). Baseline matched this table's prior entry exactly, no delta found at apply time.

  | Source | Before | After |
  |---|---|---|
  | `departments` table | 7, missing 4, `Restaurant Bar`/`Grounds` short forms | 11, exact canonical set, no duplicates |
  | `staff.department` (62 rows) | 10 values incl. `Bar` (3) | 11 canonical values, `Bar` split (below) |
  | `stock_items.department` (559 rows) | `Restaurant Bar` (276) / `Sports Bar` (283) | `Main Bar` (276) / `Sports Bar` (283), same totals |

  **The `Bar` staff split:** Kondwani Jumbo → Sports Bar, **data-confirmed** (his `staff.position` already read "Sports Bar Bartender" before this ran — corrected to match existing data, not assigned). Benard Gama and Nenenji Khumbo Chikafa → Main Bar, **placeholder** (generic "Bartender" position, no bar indicated). To be finalised at real-data time with Rose.

- **~~`department_head` functional verification is still outstanding~~ — RESOLVED 12 August 2026.** Migration 039 proof re-run post-re-tag, as the roles themselves (`SET LOCAL ROLE authenticated`, real `sub`, rolled back — never as `postgres`, which bypasses RLS):
  - Main Bar head sees `stock_items` grouped to exactly `{Main Bar: 276}` — 0 Sports Bar visible.
  - Sports Bar head sees exactly `{Sports Bar: 283}` — 0 Main Bar visible.
  - Kitchen head (Mukesh) sees 0 stock items — confirmed **data-absence, not policy failure**: `stock_items WHERE department = 'Kitchen'` = 0, queried as `postgres`.
  - No Main Bar / Sports Bar `department_head` profile exists yet, so the Kitchen-head and Restaurant-head profiles were temporarily re-pointed inside the same rolled-back transaction as each read; `user_profiles.department` re-queried after each rollback and confirmed unchanged (`Kitchen`, `Restaurant`).

### Gaps created or exposed by this session

- **hr has `staff` write in RLS but no reachable UI.** `StaffTab.jsx` is mounted inside `/admin`, which is owner-only, so hr can write the table but cannot get to the screen. Needs either an HR page or `StaffTab` moved/duplicated onto an hr-reachable route. The RLS grant is correct as specified; the surface is missing.

- **`RequisitionsTab` shows a `department_head` only their OWN requisitions, where RLS now permits their whole department.** `RequisitionsTab.jsx:28` does `if (!isManager) q = q.eq('requested_by', session.user.id)`. The decision was "raise + view own dept". The UI is the narrower gate, so this fails closed and is safe — but it does not yet match the spec. One-line fix once confirmed.

- **`fetchUserMap()` degrades for `department_head`.** `InventoryUI.jsx:74` reads all of `user_profiles`; a head can now only see their own row, so requisitions raised by others in their department render with a blank requester name. Cosmetic, and a consequence of the own-row-only profile read that keeps login working.

- **`hr` has no `/` (Inventory) access, and the catch-all route redirects there.** `App.jsx:45` sends any unknown path to `/`, which `GuardedPage` then denies, bouncing hr to `/login` while they hold a valid session. Not a loop (Login does not auto-redirect an authenticated visitor) but it reads like a session bug. Consider pointing the catch-all at `/dashboard`.

- **`ClockInOutTab` has no reachable mount point.** It was already unreachable before Phase 2 — the two `Attendance.jsx` branches that rendered it required `restaurant_manager` or a role outside owner/manager, and `ROUTE_ACCESS['/attendance']` was `['owner','manager']`, so `GuardedPage` bounced both first. Those dead branches are now deleted. The component is retained for the QR staff attendance work in FUNCTIONAL_SPEC §4; it needs a real route.

- **`create-user` `ALLOWED_ROLES` end-to-end test not performed.** The list was synced to the new four roles and redeployed (version 25, ACTIVE), and `AddUserTab` derives its dropdown from `Object.keys(ROLE_LABELS)` so it now offers exactly the four. But actually creating one user of each role requires an owner browser session, which this session had no credentials for. **Aman to confirm by logging in as owner and adding one `hr` (Martin) and one `department_head`.**

### Pre-existing, noticed while working

- **`user_profiles.email` is NULL for `kitchen@woodlands.com` (Mukesh).** The auth row has the address; the profile row does not. Migration 037 matched on `auth.users.email` for that reason. Harmless today, but any screen reading `user_profiles.email` shows a blank for that user.

- **`public.handle_new_user()` still exists as an orphaned function.** standards.md §5 requires no such *trigger* on `auth.users`, and there is none (verified — `pg_trigger` returns nothing), so the rule holds. The function is dead code; dropping it was out of scope for an auth session.

- **`departments` intentionally keeps its blanket authenticated read.** It is the only table that still has one. Every role needs it for department dropdowns (`AddUserTab`, `TransfersTab`, `RequisitionsTab`), and it holds nothing but names. Recorded so a future audit does not read it as a missed table.

### Open question for Aman

- **Does `owner` keep `attendance_records` access?** The Phase 2 brief said both "attendance_records: admin + hr ONLY" and "admin+hr replaces owner+manager"; read literally the second drops owner. Migration 043 **keeps owner** (`owner, admin, hr`), because dropping it would contradict owner-sees-everything, disagree with `AT_MANAGE_ROLES` in `src/lib/roles.js`, and let owner open `/attendance` to an empty screen. If owner really must be excluded, it is a one-word edit to each of the three `attendance_manage_*_v2` policies.
