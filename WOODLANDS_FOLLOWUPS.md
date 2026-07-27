# WOODLANDS — FOLLOWUPS LOG

*Small deferred items not blocking the current sprint. Standard §5 item 7. Append-only during sprints; consolidated at retrospective.*

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

*Artifacts prepared and committed. **The import has NOT been applied to the live database.** Live state at commit, verified by direct query: 25 test `stock_items`, 25 `current_stock`, 0 `stock_movements`, 0 `event_stock_allocations`. Everything below was found during schema probing, not during an import run.*

### Blocking — the import still has to be run

- **`supabase/migrations/030_widen_movement_type.sql` — written, NOT applied.** Adds `'opening_balance'` to the `stock_movements.movement_type` CHECK. Must be applied *before* the data-ops script, which will otherwise fail the constraint on every insert.

- **`scripts/data-ops/002_bar_stock_reset_and_import.sql` — written, NOT applied.** Wipes the 25 test stock rows and loads 559 real bar items (276 Restaurant Bar + 283 Sports Bar), 533 `opening_balance` movements, and 559 `current_stock` rows. Apply via the Supabase SQL Editor, never `db push`.

### Findings

- **`current_stock` is a BASE TABLE, not a view.** Verified: `pg_class.relkind = 'r'`, `information_schema.tables` reports `BASE TABLE`, absent from `pg_views`, and it carries a PK, a UNIQUE on `stock_item_id`, `CHECK (quantity >= 0)`, an FK to `stock_items` and two btree indexes — none of which a view can hold. **There are also no triggers whatsoever** on `stock_items`, `stock_movements` or `current_stock`, so nothing syncs the ledger to the balances.

  A draft of the import script was written on the assumption that `current_stock` was a view over `stock_movements` and therefore only needed movement rows. Had it run, `DELETE FROM stock_items` would have cascaded `current_stock` empty and nothing would have refilled it: 559 items, 533 movements, **zero balances**, and a blank Stock Levels screen. The committed script writes both, and derives `current_stock` from the movements (STEP 4) so the two cannot disagree.

- **An item with no `current_stock` row is invisible on Stock Levels, not shown as zero.** `StockLevelsTab.jsx:16` selects from `current_stock` and joins `stock_items`, so the balances table drives the list. Any future import must write a row for every item including zero-stock ones — hence the `LEFT JOIN` in STEP 4 covering all 559 rather than only the 533 with movements.

- **`stock_movements.movement_type` CHECK matches migration 008 exactly — no drift.** Live definition is `CHECK (movement_type = ANY (ARRAY['delivery','transfer','adjustment','requisition']))`. It does **not** permit `event_allocation`, `event_return` or `opening_balance`, and `stock_movements_movement_type_check_v2` does not exist. Recorded explicitly because a session brief asserted the live CHECK was already wider than documented; it is not. The Sprint C Task 4 item to widen for `event_allocation` / `event_return` therefore **remains fully open** — migration 030 does not address it.

- **`stock_items` has no DELETE policy, for any role except `service_role`.** RLS is enabled; policies are `SELECT` (authenticated), `stock_items_owner_insert` (INSERT, authenticated), `stock_items_owner_update` (UPDATE, authenticated), and `service role full access` (ALL, service_role). DELETE is fail-closed for every application user, which is why the data-ops wipe can only run through the Management API or an Edge Function. Probably correct as an operational default, but the asymmetry — INSERT and UPDATE present, DELETE simply absent rather than deliberately denied — looks unplanned. **Post-meeting: confirm intent and make it explicit either way.**

  Note for whoever audits this: the Management API query endpoint runs privileged and bypasses RLS entirely. Running a statement successfully through it proves nothing about what `anon` or `authenticated` may do. Policy claims must be tested as the role in question.

- **Stock Levels' department filter lists all 7 departments regardless of stock.** Populated from the `departments` table (`InventoryUI.jsx:69`), not from `DISTINCT stock_items.department`. After the bar-only import, Housekeeping / Kitchen / Grounds / Restaurant / Security will still appear in the dropdown, each showing "No items in this department." Cosmetic, and consistent with the "waiting on your other stock lists" framing — but worth knowing before demoing rather than discovering live. The `departments` table is deliberately untouched by the import: Transfers and Requisitions need all 7.

- **`WOODLANDS_HISTORY.md` does not exist.** Named as required reading in this session's brief. Not in the repo root, not anywhere in the tree. This is the third confident citation of a missing document in this project, after `WOODLANDS_DEMO_PREP.md` and AUDIT_2 §0. **Either write these files or stop citing them.**

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

**Why it keeps happening:** the remote migration history table records only versions 001–007, while 008–028 have run. `supabase db push` is therefore unusable — it would replay `016_staff_restructure.sql` and duplicate all 62 real staff rows — so every migration since has been applied by hand through the SQL editor or Management API. Hand application is where "never applied" and "applied out of order" come from, and nothing detects either.

**Until this closes, Standard §2.6's rebuild-from-migrations test keeps failing**, and the Sprint F audit will keep failing it. Three tables (`event_checklists`, `shift_settings`, `tables`) still cannot be created from the files at all.

**Scope of the fix:** `supabase migration repair --status applied` for 008–028; write the three missing `CREATE TABLE` migrations; renumber the duplicate `008` pair; then verify `db push` is safe and prove the schema is rebuildable. After that, migrations get applied by `db push` and drift stops being silent.

---

## FROM AUDIT #2 (2026-07-26) — DEFERRED

- **WOODLANDS_FUNCTIONAL_SPEC.md route/role table is stale.** Lists seven roles that don't exist. Refresh at Sprint E fit-and-finish. Source: rename commit, 26 July.

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
