> **⚠ HISTORICAL SNAPSHOT — dated 26 July 2026. NOT the current state of the system.**
> This is a read-only audit from a point in time, kept as a diff record and as provenance for a future AUDIT_3. Findings drove Sprints A–E; most are closed (see `WOODLANDS_HISTORY.md` and `WOODLANDS_FOLLOWUPS.md`). **For the current system, read `WOODLANDS_STATE.md` and `WOODLANDS_FUNCTIONAL_SPEC.md`.** Do not treat findings here as live. Never rewrite this file — audits are superseded, not edited.

# WOODLANDS SYSTEM AUDIT #2 — 2026-07-26

**Read-only audit.** No source files modified. No SQL run against the live database. The only write performed was `npm run build`, which regenerates the gitignored `dist/` directory (explicitly authorised in the audit brief).

**Prior audit:** `WOODLANDS_AUDIT.md` (2026-07-04) — left untouched, still on disk. This document sits alongside it.

---

## 0. NOTE ON THE STANDARD VERSION

The brief asks for an audit against **STREAMLINE_BUILD_STANDARD.md v1.3** at `/path/to/`, which is a placeholder path. No copy of the Standard exists in this repo (`Glob **/STREAMLINE*` → no results in `C:\Users\akote\Dev\woodlands`). Four copies exist elsewhere on disk:

| Path | Version |
|---|---|
| `OneDrive - Streamline/files/Common/STREAMLINE_BUILD_STANDARD.md` | **v1.5 — 24 July 2026** |
| `Dev/petroda/STREAMLINE_BUILD_STANDARD.md` | v1.5 (byte-identical, 16,441 bytes) |
| `OneDrive - Streamline/.md files/STREAMLINE_BUILD_STANDARD.md` | v1.2 |
| `Dev/phalombe/STREAMLINE_BUILD_STANDARD.md` | v1.2 |

**No v1.3 artifact exists.** Per the v1.5 change log, v1.3 (24 July 2026) added only Stage 7 RETROSPECTIVE and a §0 rewording; it was superseded the same day by v1.4 and v1.5.

Decisively: the brief asks me to cover **§2.8 "Client instruction outranks source data"** and **§2.9 "Rebuilds preserve affordances"**. Those two Non-Negotiables *were introduced in v1.5* — they do not exist in v1.3 or v1.2. The brief's content therefore describes v1.5. **This audit measures against v1.5**, the canonical copy in `OneDrive - Streamline/files/Common/`.

One consequence worth flagging up front: `WOODLANDS_STATE.md` (2026-07-15) measured against the 7-rule block in the user's global `~/.claude/CLAUDE.md`, whose rule 7 is *"Test on staging. Never on production."* It recorded a **FAIL — no staging exists**. That rule was **removed from the Standard at v1.1** (17 July 2026) and replaced by §4 one-project-per-client. Under v1.5 there is no staging-project requirement, and that prior FAIL is obsolete. See §2, DoD row and §4.3.

**Also missing:** the repo contains no `STREAMLINE_BUILD_STANDARD.md` at all. Standard §5 item 5 requires `CLAUDE.md` to seed each session with the spec *and a pointer to this Standard*; `CLAUDE.md` contains no such pointer. Standard §1 Stage 3 requires the Standard be seeded into the project at set-up. **FAIL, LOW.**

---

## 1. SYSTEM OVERVIEW

**Stack.** React 19.2 + Vite 8 + Tailwind 4 single-page app, deployed on Vercel at `woodlands-beta.vercel.app`, backed by a single Supabase project (`gttsjmxltrxxfplqjans`) providing Postgres, Auth, and one Edge Function. Routing is client-side (`react-router-dom` 7); `vercel.json` rewrites all paths to `index.html`. Build output is a single unsplit 947 kB JS chunk. There is no test framework, no CI, and no server-side application tier — every data operation is issued directly from the browser to PostgREST.

**Modules** (one line each):

- **Inventory** — `stock_items` / `current_stock` / `stock_movements`; deliveries, requisitions (raise → approve → **fulfil**, deduction on fulfil), transfers, adjustments.
- **Attendance** — manual clock in/out with a GPS flag, breaks, manager Today/History views, shift settings. No biometrics.
- **Events** — enquiry → confirmed → in_progress → completed/cancelled, with BEO checklists, bill items, payments, assigned staff, and stock allocation (deduct-on-confirm, post-event clearance).
- **Table Bookings** — reservations against a `tables` roster with capacity checks and a no-show/conflict warning.
- **Farmers Market** — stall holders, monthly market day, public QR check-in, fees/payments, ID cards.
- **Admin** — users, staff roster, departments, stock items.

**Route map with role access** (`src/App.jsx:36-45` × `src/lib/roles.js:5-13`):

| Route | Component | Roles permitted | Notes |
|---|---|---|---|
| `/login` | `Login` | **public** | Deliberate |
| `/checkin` | `CheckIn` | **public, unauthenticated** | Deliberate; see §3 |
| `/dashboard` | `Dashboard` | owner, manager, kitchen_manager, restaurant_manager | |
| `/` | `Inventory` | **none — no `ROUTE_ACCESS` entry** | **Unreachable.** See §2 / §2.5 |
| `/attendance` | `Attendance` | owner, manager | |
| `/events` | `Events` | owner, manager | |
| `/table-bookings` | `TableBookings` | owner, manager, restaurant_manager | |
| `/farmers-market` | `FarmersMarket` | owner, manager | |
| `/admin` | `Admin` | owner | |
| `*` | → `Navigate to="/"` | — | Lands on the dead `/` route |

`ROUTE_ACCESS` additionally defines a key `'/inventory'` (`roles.js:7`) for which **no `<Route>` exists**. The Inventory page is mounted at `/` (`App.jsx:39`), and `ROUTE_ACCESS['/']` is `undefined`, so `GuardedPage` (`RouteGuard.jsx:21-24`) takes the `!allowed` branch and redirects every user of every role to `/login`. `Sidebar.jsx:21-23` filters nav items by the same lookup, so the Inventory link is hidden from all four roles. The entire Inventory module is currently unreachable through the UI, and the `*` wildcard dumps any unknown URL onto the same dead route.

**Edge Functions in use:** exactly one — `supabase/functions/create-user/index.ts`. Called from `src/components/admin/AddUserTab.jsx:56`. No `supabase/config.toml` exists in the repo, so the deployed `verify_jwt` setting is not determinable from source.

**Separately:** `supabase/migrations/016_staff_restructure.sql` seeds **62 real staff records** (names, employee numbers, departments, hire dates) into a `staff` table that has no login and no FK to `user_profiles`. This is the roster the manager-facing attendance screens operate on — disjoint from the four login roles.

---

## 2. FINDINGS AGAINST STANDARD v1.5

### §2.1 — The service role key never touches the browser

**FAIL — CRITICAL.**

**Evidence (recomputed from a fresh build, not inherited from the prior audit):**

1. `src/lib/supabaseAdmin.js:5-7` constructs a browser Supabase client from `import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY`.
2. `.env.local:3` defines `VITE_SUPABASE_SERVICE_ROLE_KEY` (219 chars). `.env.local` is untracked (`git ls-files .env.local` → empty; covered by `*.local` in `.gitignore`) — correct, but irrelevant to the exposure, because Vite inlines `VITE_*` at build time.
3. I ran `npm run build` (clean, 4.11s) and grepped the fresh artifact `dist/assets/index-ClGMEzuk.js` for the **literal key value from `.env.local`**: **2 exact matches**. Base64-decoding every JWT-shaped string in the bundle yields exactly two distinct tokens:
   - `{"iss":"supabase","ref":"gttsjmxltrxxfplqjans","role":"anon","iat":1777976021,"exp":2093552021}`
   - `{"iss":"supabase","ref":"gttsjmxltrxxfplqjans","**role":"service_role**","iat":1777976021,"exp":2093552021}`

   The `service_role` JWT does not expire until epoch 2093552021 (≈ April 2036).
4. Because the app ships as one unsplit chunk, this key is served to **every visitor of every route, including unauthenticated ones** — a stranger loading `/login` or `/checkin` downloads it. It is not gated behind login.
5. `src/lib/supabaseAdmin.js:3` additionally `console.log`s the key's length on every page load.

**Blast radius:** the `service_role` key bypasses RLS entirely. It grants full read/write/delete on every table in the project — 62 staff records with real names and employee numbers, all attendance, all event bills and payments, all farmers-market holder PII and fees, all stock. It also permits `auth.admin` operations.

**Minimal fix:** delete `src/lib/supabaseAdmin.js` and `VITE_SUPABASE_SERVICE_ROLE_KEY` from `.env.local` and Vercel, rotate the key in the Supabase dashboard, and route all privileged operations through authenticated, role-checked Edge Functions.

---

### §2.1(b) — The service role key is also committed to git history

**FAIL — CRITICAL. This is new; neither the 4 July audit nor the 15 July state doc records it.**

**Evidence:** `scripts/seed-attendance.mjs:14` contains the `service_role` JWT **hardcoded as a literal fallback**:

```js
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? 'eyJhbGciOiJI…z4-L1LSe6GElhrVAHfZOeSWa1PVQrH7tpr8spSw417I'
```

The file is tracked (`git ls-files scripts/` → `scripts/seed-attendance.mjs`). `git log --all -S` on the signature segment returns commit **`9759cc4` "re-seed attendance data after shift_date column fix"**. The remote is `https://github.com/akotecha47/woodlands.git`. Decoded, it is the same `service_role` token found in the bundle.

**UNVERIFIED:** whether the GitHub repo is public. The `gh` CLI is not installed on this machine, so I could not query visibility. This changes the *breadth* of exposure, not the verdict — the key is already public via the Vercel bundle regardless, and rewriting history alone will not contain it.

**Minimal fix:** rotate the key first, then purge the literal from `scripts/seed-attendance.mjs` and require the env var with no fallback; treat history rewriting as optional cleanup after rotation.

---

### §2.2 — RLS enabled + policies, in the same migration as the table

**PARTIAL — HIGH.**

RLS is enabled on every table that a migration creates — that much is genuinely sound and better than the norm. But the Standard's wording is specific: *"Every new table, at creation, **in the same migration**: `ENABLE ROW LEVEL SECURITY`, a policy for `service_role`, `GRANT ALL TO service_role`, plus the role-specific policies the feature needs."* Measured against that sentence, three distinct defects appear. Full table listing:

| Table | Created | RLS enabled | Policies | Same migration? |
|---|---|---|---|---|
| `user_profiles` | `001:6` | `001:219` | SELECT/authenticated only (`001:260`) | Yes — but no `service_role` policy, no INSERT/UPDATE policy |
| `inventory_items` | `001:17` | `001:220` | **NONE** | — dead table (unused in `src/`) |
| `deliveries` | `001:30` | `001:221` | **NONE** | — dead table |
| `stock_transfers` | `001:60` | `001:223` | **NONE** | — dead table |
| `stock_adjustments` | `001:75` | `001:224` | **NONE** | — dead table |
| `events` | `001:114` | `001:227` | **NONE anywhere** | **No** — see below |
| `event_payments` | `001:133` | `001:228` | **NONE anywhere** | **No** — see below |
| `table_bookings` | `001:159` | `001:230` | **NONE anywhere** | **No** — see below |
| `event_tasks` | `001:145` | `001:229` | none | dropped in `018:5` |
| `staff` | `001:86` | `001:225` | `004:15`, `016:21`, `016:24` | **No** — policies land 3 migrations later |
| `attendance_records` | `001:101` | `001:226` | `004:19`, `012:9`, `012:14`, `017:13` | **No** — policies land 3 migrations later |
| `requisitions` | `001:44`, re-created `008_inventory:25` | `001:222`, `008_inventory:40` | `008_inventory:53-54` | Yes (in `008_inventory`) |
| `fm_holders` / `fm_visits` / `fm_payments` | `009:10,27,37` | `009:50-52` | `009:54-61` | Yes |
| `departments` | `006:1` | `006:7` | SELECT/authenticated only (`006:10`) | Yes — no `service_role` policy |
| `stock_items` | `007:1` | `007:11` | `007:13,15` | Yes |
| `event_bill_items` | `008_event_bill_items:1` | `:11` | `:13,16` | Yes |
| `current_stock`, `stock_movements` | `008_inventory:5,13` | `:38-39` | `:49-52` | Yes |
| `fm_id_cards`, `fm_approved_items` | `013:14,38` | `013:26,46` | `013:28-52` | Yes |
| `event_configurations` | `015:5` | `015:26` | `015:28` | Yes |
| `event_staff` | `019:4` | `019:15` | `019:17` | Yes |
| `event_stock_allocations` | `020:1` | `020:15` | `020:16` | Yes |
| `event_checklists`, `shift_settings`, `tables`, `fm_market_days` | **never created by any migration** | **unknown** | **unknown** | See §2.6 |

Three specific defects:

**(a) `staff` is writable by any authenticated user — HIGH.** `004_attendance_columns.sql:14-16` creates `"authenticated can access staff" ON staff FOR ALL TO authenticated USING (true) WITH CHECK (true)`. `016_staff_restructure.sql:18-19` drops only its own two policy names (`authenticated_read_staff`, `service_role_all_staff`) — it **never drops the `004` blanket policy**. Combined with `GRANT SELECT, INSERT, UPDATE ON staff TO authenticated` (`001:245`), any logged-in user of any of the four roles — including `kitchen_manager`, who has no attendance or admin route access — can read and rewrite the entire 62-person roster through the plain anon client. Contrast `012_attendance_rls.sql:6`, which *does* correctly drop the equivalent `004` attendance policy: the same author caught this on one table and missed it on the other.

**(b) `events`, `event_payments`, `table_bookings` have RLS on and zero policies — HIGH, and it is the gating dependency for the §2.1 remediation.** RLS-on-with-no-policy denies all access to `anon` and `authenticated`; only `service_role` (which bypasses RLS) can reach them. That is fail-closed, so it is not an exposure today. But it means these three tables — the entire events billing/payments surface and all table bookings — are reachable *only* via the exposed service key. Deleting `supabaseAdmin` without first writing policies for these tables will hard-break Events and Table Bookings. **This must be sequenced before, not after, the §2.1 fix.**

**(c) `user_profiles` has a SELECT policy only.** `AuthContext.jsx:6-13` reads it through the anon client, which works. Any write path depends on the service key.

**UNVERIFIED (requires SQL against the live DB):** whether the deployed policy set actually matches these migration files, and what the four ghost tables in §2.6 have. To confirm, run:
```sql
SELECT relname, relrowsecurity FROM pg_class
  WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' ORDER BY 1;
SELECT tablename, policyname, roles, cmd, qual, with_check
  FROM pg_policies WHERE schemaname = 'public' ORDER BY 1, 2;
```

**Minimal fix:** drop the stale `004` staff policy, add `service_role` + role-scoped policies for `events`/`event_payments`/`table_bookings`/`user_profiles` in one new numbered migration, and treat that migration as the prerequisite for the W1 key removal.

---

### §2.3 — Storage buckets private by default

**PASS (vacuously — N/A).**

**Evidence:** grep across `src/` and `supabase/` for `.storage`, `createBucket`, `getPublicUrl`, `createSignedUrl` → **zero matches**. No Supabase Storage is used anywhere; no bucket exists to misconfigure. ID cards (`fm_id_cards`) are database rows rendered client-side via `qrcode.react`, not stored images.

**UNVERIFIED:** whether a bucket exists in the project but is simply unused by this code. To confirm: `SELECT id, name, public FROM storage.buckets;`.

**If a bucket is added later:** create it private and serve exclusively via signed URLs minted in an Edge Function.

---

### §2.4 — Only the anon key is client-side

**FAIL — CRITICAL.** Same root cause and same evidence as §2.1: the fresh bundle contains both the `anon` and the `service_role` JWT. Two secrets are client-side where one belongs.

Secondary evidence from a repo-wide secret scan (`src/`, `scripts/`, `supabase/`, `index.html`): the only hardcoded JWT literal is `scripts/seed-attendance.mjs:14` (§2.1b). The Edge Function correctly reads `Deno.env.get('SERVICE_ROLE_KEY')` (`create-user/index.ts:27`) — server-side, unprefixed, and the right pattern. The project URL is hardcoded at `AddUserTab.jsx:56` (not a secret; see §3 of the prior audit — still unfixed, LOW).

**Minimal fix:** as §2.1.

---

### §2.5 — Every route checks a role

**PARTIAL — MEDIUM.**

**Evidence — what is correct:** `App.jsx:38-44` wraps every non-public route in `<Protected>` → `RequireAuth` (`RouteGuard.jsx:5-13`, redirects to `/login` without a session) → `GuardedPage` (`:15-27`, redirects unless `ROUTE_ACCESS[pathname].includes(profile.role)`). The guard **fails closed** on an unknown path, which is the right default. `/login` and `/checkin` are public by design.

**Defect (a) — the `/` ↔ `/inventory` key mismatch, MEDIUM.** `roles.js:7` defines access for `'/inventory'`; `App.jsx:39` mounts Inventory at `'/'`; no route exists for `/inventory`. `ROUTE_ACCESS['/']` is `undefined` → `RouteGuard.jsx:22` `!allowed` → redirect to `/login`. `Sidebar.jsx:8` lists the nav item with `path: '/'`, and `:21-23` filters on the same undefined lookup, so the link is hidden from all four roles. Net effect: **the Inventory module — the system's first-named module — is unreachable for every role**, and the `*` wildcard (`App.jsx:45`) sends every unknown URL to the same dead route, landing a logged-in user on the login form (`Login.jsx` only navigates on submit, at `:31`, so there is no bounce-back). Security-wise this is fail-closed and harmless; functionally it is a dead module.

**Defect (b) — `is_active` is never enforced, HIGH. New finding.** `UsersTab.jsx:76` toggles `user_profiles.is_active`, and the UI renders Active/Inactive badges (`:119-121`). But `is_active` appears **nowhere** in `RouteGuard.jsx` or `AuthContext.jsx` (verified by grep across `src/`: every other hit is a data filter on `staff`/`stock_items`, none on the auth path). No code calls `auth.admin.deleteUser` or bans the auth user. A "deactivated" user keeps a working Supabase Auth account, still passes `RequireAuth`, still passes `GuardedPage`, and retains full access to every route their role allows. **Deactivation in the Admin panel is cosmetic.**

**Defect (c) — client-side only, by construction.** Because all data access uses the service key (§2.1), these checks gate *navigation*, not data. Anyone with the bundled key reads and writes every table without touching the router. `roles.js` is a UI convenience, not an access control system.

**UNVERIFIED:** per-role behaviour with real test users. Standard §2.5 requires *"Verify with real test users per role, not by assumption"* — I read the code, I did not log in as four users.

**Minimal fix:** rename the `ROUTE_ACCESS` key to `'/'` (or move the route to `/inventory`), and add an `is_active !== false` check to `GuardedPage` alongside the role check.

---

### §2.6 — Schema changes go into a numbered migration file FIRST

**FAIL — HIGH.**

The Standard's test is: *"if the database died tomorrow, could you rebuild it from the migration files alone?"* **No.**

**(a) Four tables are used by the code and created by no migration.** Diffing every `.from('…')` in `src/` (24 distinct tables) against every `CREATE TABLE` in `supabase/migrations/` (25 tables):

| Ghost table | Read/written at |
|---|---|
| `event_checklists` | `EventDetailTab.jsx`, `EventsUI.jsx` |
| `shift_settings` | `ClockInOutTab.jsx`, `TodayTab.jsx`, `HistoryTab.jsx`, `SettingsTab.jsx`, `admin/AddUserTab.jsx`, `admin/UsersTab.jsx` |
| `tables` | all four `table-bookings/*.jsx` |
| `fm_market_days` | `MarketDayTab.jsx` |

`supabase/seed.sql` contains no `CREATE TABLE` either, so these were pasted into the Supabase SQL editor. Their RLS and policy state is entirely unknown — they are the four tables most likely to be missing RLS, and nothing in the repo can tell you.

**(b) A column is read by the UI and created by no migration.** `event_stock_allocations.returned_qty` is rendered at `EventStockSection.jsx:206` and `:319`, but `020_event_stock.sql:1-13` defines only `id, event_id, stock_item_id, allocated_qty, consumed_qty, status, deducted_at, cleared_at, created_by, created_at`. See §2 DoD and the money findings below — the value is also never written.

**(c) Migration `008` is used twice** — `008_event_bill_items.sql` and `008_inventory.sql`. Ordering between them is undefined by filename.

**(d) `018_drop_dead_tables.sql:4-6` drops `bar_week_config` and `fm_planning_tasks`,** neither of which any migration ever created — direct proof that dashboard DDL is routine practice here.

**(e) Two migrations disagree with `seed.sql` about the same column.** `010_attendance_user_id.sql:10` declares `shift_date date` with **no default** and `user_id uuid REFERENCES user_profiles(id)`; `seed.sql:13` declares `shift_date date DEFAULT CURRENT_DATE` and `user_id uuid REFERENCES auth.users(id)`. Which one the live DB actually has is unknowable from the repo and materially changes the attendance bug in §2 DoD below.

**(f) Four dead tables remain** — `inventory_items`, `deliveries`, `stock_transfers`, `stock_adjustments` (created in `001`, superseded by `007`/`008_inventory`, never referenced in `src/`, never dropped).

**UNVERIFIED:** the live schema. To confirm drift:
```sql
SELECT table_name, column_name, data_type, column_default
  FROM information_schema.columns WHERE table_schema='public' ORDER BY 1,2;
```

**Minimal fix:** write one reconciliation migration containing `CREATE TABLE` for the four ghost tables (with RLS + policies), `ALTER TABLE event_stock_allocations ADD COLUMN returned_qty numeric`, and drops for the four dead tables; renumber the duplicate `008`; stop applying DDL through the dashboard.

---

### §2.7 — Real client data is sacred once it enters the system

**PARTIAL — MEDIUM.**

**Evidence that real data is already present:** `016_staff_restructure.sql:42+` inserts **62 real employee records** — full names, employee numbers, positions, departments, hire dates (e.g. `('WL02210', 'Secret Mtukula', 'Receptionist', 'Front Office', '2022-10-01')`). This is real client PII, committed to git, and per `WOODLANDS_STATE.md` it is the roster the attendance module runs on. The file's own header comment (`:32-39`) flags three duplicate employee numbers and says *"Verify correct numbers with Martin before going live"* — i.e. the data is real, entered, and not yet reconciled with the client.

Under §2.7 and §4, the project is therefore **past the point where it can be broken freely**: further breaking changes require a Supabase database branch, a snapshot restore, or a maintenance window.

**Why PARTIAL rather than FAIL:** the rule governs *how you treat* real data once live, and I found no evidence of a destructive operation performed against it. But two conditions the rule depends on are not met: (i) there is no evidence test users/test transactions were purged — `scripts/seed-attendance.mjs` exists specifically to write 7 days of synthetic attendance rows and there is no corresponding purge script; (ii) the single most likely cause of data loss here is not a careless migration but the exposed `service_role` key (§2.1), which hands full delete rights over this data to anyone who opens DevTools.

**UNVERIFIED:** whether real attendance, event, payment, or farmers-market data now exists beyond the staff roster, and whether seeded test rows were purged. To confirm: `SELECT count(*) FROM attendance_records WHERE created_at < '2026-06-01';` and equivalents per table.

**Minimal fix:** treat the project as live — DB branch or snapshot before the W1/W2 schema work — and rotate the key before anything else touches this data.

---

### §2.8 — Client instruction outranks source data

**N/A.** This system has no data pipeline that transforms client-supplied source files. Data originates from operator input in the app, not from client spreadsheets reconciled against a source. The one place client-supplied values were transcribed — the 62-row staff seed in `016` — correctly *preserves* the client's employee numbers and flags the three internal duplicates as a question for the client (`016:32-39`, *"Verify correct numbers with Martin"*) rather than silently overriding them. That is exactly the behaviour §2.8 prescribes.

---

### §2.9 — Rebuilds preserve every usability affordance

**N/A for the deliverable sense of the rule** (no spreadsheet, document, or prototype was rebuilt for this client; §2.9 was written for the Phalombe V4→V6 cycle).

One in-code observation, reported for completeness rather than scored: the June refactors (`5d86e3e` "reduce roles to 4", `00fbdaa` "bar role removal") removed the `store_supervisor` role from `roles.js` but left three gates still keyed to it — `LogDeliveryTab.jsx:7` and `TransfersTab.jsx:7` (`const ALLOWED = ['owner','manager','store_supervisor']`) and `InventoryUI.jsx:82`. No role that can be created can ever match `store_supervisor`, so the affordance those gates were written to grant is unreachable. This is scored under §4 as role drift.

---

### §3 — DEFINITION OF DONE

| # | Rule | Verdict | Evidence |
|---|---|---|---|
| 1 | Builds clean: `npm run build` passes | **PASS** | Ran it. Clean in 4.11s, 1946 modules, no errors. Warnings only (947 kB unsplit chunk). |
| 2 | No service role key anywhere in the client bundle | **FAIL — CRITICAL** | §2.1. Exact literal match, 2 occurrences, in a freshly built `dist/assets/index-ClGMEzuk.js`; `"role":"service_role"` confirmed by base64-decoding the payload. |
| 3 | RLS + policies for every table, **verified by SQL against the live DB** | **UNVERIFIED (structurally PARTIAL)** | §2.2. The brief forbids running SQL, so the Standard's own verification method is unavailable. Structural review of migrations found three defects. The four ghost tables (§2.6) cannot be assessed at all from source. Queries to run are given in §2.2. |
| 4 | Every schema change is in a numbered migration file | **FAIL — HIGH** | §2.6: 4 ghost tables, 1 ghost column, duplicate `008`, 2 tables dropped that were never created, `010` vs `seed.sql` conflict. |
| 5 | Tested against representative test data before real client data | **PARTIAL — MEDIUM** | `scripts/seed-attendance.mjs` is the only test-data artifact and it is attendance-only. No test framework, no CI, no `test` script in `package.json`. Real staff data is already loaded (§2.7), so this gate has been passed through, not met. |
| 6 | Money/quantity guarded against negatives, double-inserts, date-boundary errors | **FAIL — HIGH** | Four distinct defects, detailed below. |
| 7 | Client-facing docs reconcile arithmetically | **N/A** | No client-facing generated document in scope. The WhatsApp message generator (`MonthlyMessagesTab.jsx`) emits per-holder text, not aggregate totals. |
| 8 | Bulk changes decomposed before proposal | **N/A** | No bulk change proposed in this build. |
| 9 | Counts quoted to clients come from exhaustive scans | **N/A** | No count quoted to the client from this codebase. |
| 10 | Committed and pushed | **PASS** | Working tree at `ed9a8e3`; only the two untracked audit docs and the gitignored `dist/` rebuild are outside it. |

**Also unverified:** `npm audit` could not complete — the registry returned a malformed (gzip-mangled) response body: `npm error audit endpoint returned an error`. Dependency CVE status is **UNVERIFIED**; re-run `npm audit --omit=dev` when the registry responds.

#### DoD rule 6 — the four money/quantity defects

**(a) Insufficient-stock clamp creates phantom inventory on cancel — HIGH. New finding.**
`EventDetailTab.jsx:75` computes `newQty = Math.max(0, (cs?.quantity ?? 0) - alloc.allocated_qty)`. When stock is insufficient, `:77` flashes a warning **but the code proceeds anyway** and marks the allocation `status: 'deducted'`. The cancel branch at `:102` then adds back the **full `allocated_qty`**, not the amount actually deducted.

> Worked example: `current_stock` = 5, allocation = 20. Confirm → `max(0, 5-20)` = 0; warns; marks `deducted`. Cancel → `0 + 20` = 20. **Stock went from 5 to 20. Fifteen units created from nothing.**

The same clamp-and-continue appears at `EventStockSection.jsx:97` (auto-deduct on add) and `InventoryUI.jsx:96` (`shiftStock`, used by requisition fulfilment and deliveries), where an over-requisition silently under-deducts instead of failing.

**(b) Read-then-write races on `current_stock` — HIGH.** Three call sites do `SELECT quantity` → arithmetic in JS → `UPDATE`, with no row lock, no transaction, no atomic increment: `InventoryUI.jsx:90-102` (`shiftStock`), `EventDetailTab.jsx:64-118` (`handleStockOnStatusChange`), `EventStockSection.jsx:97` and `:147-155`. Two concurrent writers on the same `stock_item_id` silently lose one update. `current_stock.quantity` does carry `CHECK (quantity >= 0)` (`008_inventory.sql:8`) — the only quantity guard in the schema.

**(c) No server-side floor on any money column — HIGH.** Grepping every `CHECK` in `supabase/migrations/`: **no `amount` column has one.** `event_payments.amount` (`001:136`), `fm_payments.amount` (`001:205`, `009:41`), `event_bill_items.amount` (`008_event_bill_items:6`) are all bare `numeric NOT NULL`. The sole guard is the HTML attribute `min="0.01"` at `EventPaymentsSection.jsx:186` — client-side, and irrelevant to anyone holding the bundled service key. A negative "payment" inserts cleanly and moves `balanceDue` in the payer's favour.

**(d) `returned_qty` is computed and displayed but never persisted — MEDIUM.** `EventStockSection.jsx:147` computes `returned`, `:152-154` correctly adds it back to `current_stock`, but the `.update()` at `:157-161` writes only `consumed_qty`, `status`, `cleared_at`. `returned_qty` is never saved — and per §2.6(b) the column does not exist in any migration. The UI reads `a.returned_qty` at `:206` and `:319` and will always render blank. The stock movement is right; the audit trail of how much came back is absent.

**(e) Attendance date-boundary and duplicate-guard failure — MEDIUM.** `ClockInOutTab.jsx:36` computes `today` as `new Date().toISOString().split('T')[0]` — a **UTC** calendar date. Malawi is UTC+2, so a clock-in in the last two hours of the local day is stamped with tomorrow's date. `:130` inserts `date: today` and **never sets `shift_date`**, while `TodayTab.jsx:48` and `HistoryTab.jsx:68-71` filter and order exclusively on `shift_date`. The two write paths are structurally disjoint: self-service writes `user_id` + `date`; the manager path (`TodayTab.jsx:169`, `:200`, `:227`) writes `staff_id` + `shift_date`. The unique index `attendance_records_user_shift_date_key` (`010:16-18`) is `ON (user_id, shift_date) WHERE user_id IS NOT NULL` — it therefore protects **neither** path: manager inserts have `user_id IS NULL` (excluded by the predicate), and self-inserts have `shift_date` unset, and Postgres treats every NULL in a unique index as distinct. The only duplicate guard is the read-then-insert check at `ClockInOutTab.jsx:86-97`, which is a race. No trigger exists to backfill (grep for `CREATE TRIGGER`/`CREATE FUNCTION` across all migrations → **zero matches**).

> **Correction to `WOODLANDS_STATE.md` §4.1**, which states flatly that `shift_date` is never populated and self-clock-ins are invisible to the manager dashboards. That conclusion follows from `010_attendance_user_id.sql:10` (no default) but **not** from `seed.sql:13`, which declares `shift_date date DEFAULT CURRENT_DATE`. Which DDL the live database actually has determines whether these rows are invisible (no default) or merely mis-dated near midnight (default applied, in UTC). **UNVERIFIED** — resolve with:
> ```sql
> SELECT column_name, column_default, is_nullable FROM information_schema.columns
>   WHERE table_name='attendance_records' AND column_name IN ('date','shift_date','user_id','staff_id');
> SELECT count(*) FILTER (WHERE shift_date IS NULL) AS null_shift_date,
>        count(*) FILTER (WHERE user_id IS NULL)    AS null_user_id
>   FROM attendance_records;
> ```

---

## 3. INVENTORY: PRIVILEGED CLIENT USAGE

**36 component/page files import `supabaseAdmin`** (38 grep hits, less `src/lib/supabaseAdmin.js` itself and `src/lib/standards.md`, which merely documents the pattern). Only three files use the correct anon client (`src/lib/supabase`): `AuthContext.jsx`, `Login.jsx`, and `AddUserTab.jsx` (for the Edge Function call).

**Reachability caveat, and it matters for sequencing:** the column below describes *who can reach the component's UI*. It does **not** bound key exposure. Because the app ships as one unsplit chunk, the `service_role` key is downloaded by anyone who loads any URL on the domain — including an unauthenticated stranger at `/login`. Every row below is therefore *effectively* PUBLIC from a key-exposure standpoint. The ordering is useful for reasoning about which UI surfaces need role-checked Edge Function replacements first, not for triaging the key leak, which is uniform.

### PUBLIC — no authentication required

| File | Component | Tables touched | Route |
|---|---|---|---|
| `src/pages/CheckIn.jsx` | `CheckIn` (`:3` import; calls at `:50, 67, 94, 108, 130`) | `fm_holders`, `fm_visits` | `/checkin` |

The only route-facing privileged component reachable with no session. It reads a holder record by a UUID taken straight from the query string (`:34`, `:50-55`) and inserts/updates `fm_visits` (`:94-116`, `:130-135`) with no authentication and no rate limit. Prior audit finding 2.3, unchanged.

### AUTHENTICATED — any of the four roles (owner, manager, kitchen_manager, restaurant_manager)

| File | Component | Tables touched | Route |
|---|---|---|---|
| `src/components/dashboard/OwnerDashboard.jsx` | `OwnerDashboard` | `attendance_records`, `current_stock`, `event_payments`, `events`, `fm_holders`, `table_bookings` | `/dashboard` |

Reaches six tables spanning every module — the widest table surface of any single component, available to every role including `kitchen_manager`, whose only other permitted route is the dead `/`.

### AUTHENTICATED — intended for all four roles, but **currently unreachable** (§2.5 defect (a))

All seven Inventory files render on `/`, which redirects every role to `/login`. They are dead code at runtime until the `ROUTE_ACCESS` key is fixed — at which point they become reachable by all four roles.

| File | Component | Tables touched | Route |
|---|---|---|---|
| `src/components/inventory/InventoryUI.jsx` | `shiftStock`, `fetchStaffUsers`, shared helpers (not a component) | `current_stock`, `departments`, `stock_items`, `user_profiles` | `/` (shared module) |
| `src/components/inventory/StockLevelsTab.jsx` | `StockLevelsTab` | `current_stock` | `/` |
| `src/components/inventory/RequisitionsTab.jsx` | `RequisitionsTab` | `requisitions`, `stock_movements` | `/` |
| `src/components/inventory/AdjustmentsTab.jsx` | `AdjustmentsTab` | `current_stock`, `stock_movements` | `/` |
| `src/components/inventory/DeliveryLogTab.jsx` | `DeliveryLogTab` | `stock_movements` | `/` |
| `src/components/inventory/LogDeliveryTab.jsx` | `LogDeliveryTab` | `stock_movements` | `/` (further gated `:7` to a role that cannot exist) |
| `src/components/inventory/TransfersTab.jsx` | `TransfersTab` | `stock_movements` | `/` (same dead gate `:7`) |

### AUTHENTICATED — owner, manager, restaurant_manager

| File | Component | Tables touched | Route |
|---|---|---|---|
| `src/components/table-bookings/TodayTab.jsx` | `TodayTab` | `table_bookings`, `tables` | `/table-bookings` |
| `src/components/table-bookings/UpcomingTab.jsx` | `UpcomingTab` | `table_bookings`, `tables`, `user_profiles` | `/table-bookings` |
| `src/components/table-bookings/NewBookingTab.jsx` | `NewBookingTab` | `table_bookings`, `tables` | `/table-bookings` |
| `src/components/table-bookings/AllBookingsTab.jsx` | `AllBookingsTab` | `table_bookings`, `tables`, `user_profiles` | `/table-bookings` |

### AUTHENTICATED — owner, manager only

| File | Component | Tables touched | Route |
|---|---|---|---|
| `src/components/attendance/ClockInOutTab.jsx` | `ClockInOutTab` | `attendance_records`, `shift_settings` | `/attendance` |
| `src/components/attendance/TodayTab.jsx` | `TodayTab` | `attendance_records`, `shift_settings`, `staff` | `/attendance` |
| `src/components/attendance/HistoryTab.jsx` | `HistoryTab` | `attendance_records`, `shift_settings`, `staff` | `/attendance` |
| `src/components/attendance/SettingsTab.jsx` | `SettingsTab` | `shift_settings` | `/attendance` |
| `src/components/events/EventsListTab.jsx` | `EventsListTab` | `events` | `/events` |
| `src/components/events/CreateEventTab.jsx` | `CreateEventTab` | `events`, `event_configurations` | `/events` |
| `src/components/events/EventDetailTab.jsx` | `EventDetailTab` | `events`, `event_bill_items`, `event_checklists`, `event_stock_allocations`, `current_stock`, `user_profiles` | `/events` |
| `src/components/events/EventBillSection.jsx` | `EventBillSection` | `event_bill_items` | `/events` |
| `src/components/events/EventPaymentsSection.jsx` | `EventPaymentsSection` | `event_payments`, `events`, `user_profiles` | `/events` |
| `src/components/events/EventStockSection.jsx` | `EventStockSection` | `event_stock_allocations`, `current_stock`, `stock_items` | `/events` |
| `src/components/events/EventStaffSection.jsx` | `EventStaffSection` | `event_staff`, `staff` | `/events` |
| `src/components/events/EventSetupSection.jsx` | `EventSetupSection` | `event_configurations` | `/events` |
| `src/components/events/EventsUI.jsx` | shared helpers (not a component) | `event_checklists`, `staff` | `/events` (shared module) |
| `src/components/farmers-market/MarketDayTab.jsx` | `MarketDayTab` | `fm_holders`, `fm_market_days`, `fm_payments`, `fm_visits` | `/farmers-market` |
| `src/components/farmers-market/HoldersTab.jsx` | `HoldersTab` | `fm_holders`, `fm_visits`, `fm_payments`, `fm_id_cards`, `fm_approved_items` | `/farmers-market` |
| `src/components/farmers-market/AddHolderTab.jsx` | `AddHolderTab` | `fm_holders` | `/farmers-market` |
| `src/components/farmers-market/PaymentsTab.jsx` | `PaymentsTab` | `fm_holders`, `fm_payments`, `fm_visits`, `user_profiles` | `/farmers-market` |
| `src/components/farmers-market/MonthlyMessagesTab.jsx` | `MonthlyMessagesTab` | `fm_holders`, `fm_payments`, `fm_approved_items` | `/farmers-market` |

### ADMIN-ONLY — owner

| File | Component | Tables touched | Route |
|---|---|---|---|
| `src/components/admin/UsersTab.jsx` | `UsersTab` | `user_profiles`, `departments`, `shift_settings` | `/admin` |
| `src/components/admin/AddUserTab.jsx` | `AddUserTab` | `departments`, `shift_settings` (+ Edge Function) | `/admin` |
| `src/components/admin/StaffTab.jsx` | `StaffTab` | `staff` | `/admin` |
| `src/components/admin/DepartmentsTab.jsx` | `DepartmentsTab` | `departments` | `/admin` |
| `src/components/admin/StockItemsTab.jsx` | `StockItemsTab` | `stock_items`, `departments` | `/admin` |

### Not route-facing

| File | Notes |
|---|---|
| `src/lib/supabaseAdmin.js` | The client itself (`:5-7`). Deleting this is the W1 objective. |
| `scripts/seed-attendance.mjs` | Node script, never bundled — but carries the hardcoded key (§2.1b). |
| `src/lib/standards.md` | Documentation only; not imported, not bundled. **But see §4.3 — it mandates the anti-pattern.** |

**Sequencing input for W1/W2.** The remediation order is not the table order above. It is:

1. **Rotate the key** — it is already public; every other step is theatre until this is done.
2. **Write the missing policies** for `events`, `event_payments`, `table_bookings`, `user_profiles`, and the four ghost tables (§2.2(b), §2.6(a)). Removing `supabaseAdmin` before this hard-breaks Events and Table Bookings, which have *no* non-service-role access path today.
3. **Authenticate `create-user`** (§4.4 below) — smallest diff, largest single reduction in attack surface.
4. **Then** migrate the 36 files, `/checkin` first.

---

## 4. CLAUDE.md DRIFT CHECK

### 4.1 Role list — DRIFT CONFIRMED

`CLAUDE.md:8` states: `owner, manager, store_supervisor, bar1, bar2, restaurant_manager` (6 roles).
`src/lib/roles.js:1-3` defines: `owner, manager, kitchen_manager, restaurant_manager` (4 roles).

| Role | CLAUDE.md | `roles.js` | Creatable in UI | Referenced in permission logic |
|---|---|---|---|---|
| `owner` | ✓ | ✓ | ✓ | ✓ |
| `manager` | ✓ | ✓ | ✓ | ✓ |
| `restaurant_manager` | ✓ | ✓ | ✓ | ✓ (`/table-bookings`) |
| `kitchen_manager` | **✗** | ✓ | ✓ | **never** — route access only; behaves as a viewer |
| `store_supervisor` | ✓ | **✗** | **✗** | ✓ at 3 sites — **dead gates** |
| `bar1`, `bar2` | ✓ | **✗** | ✗ | ✗ — exist only in CLAUDE.md |

`roles.js` is now internally consistent (`ALL_STAFF_ROLES`, `ROUTE_ACCESS`, `ROLE_LABELS` agree), and `AddUserTab.jsx:7` derives its dropdown from `ROLE_LABELS`, so the drift is CLAUDE.md-vs-code, not code-vs-code. But three gates still reference the removed `store_supervisor` — `LogDeliveryTab.jsx:7`, `TransfersTab.jsx:7`, `InventoryUI.jsx:82` — so Log Delivery and Transfers are permanently `AccessDenied` to every role except owner/manager, and `fetchStaffUsers` filters on a role no row can hold. Unchanged since the 4 July audit.

**Fix:** make `roles.js` canonical, update `CLAUDE.md:8` to the 4 roles, delete the three `store_supervisor` references.

### 4.2 Stock deduction — DRIFT CONFIRMED

`CLAUDE.md:14` states: *"Stock deducted on requisition APPROVAL only, not on submission."*

The code deducts on **Fulfil**, a distinct step *after* Approve:
- `RequisitionsTab.jsx:61-70` `handleApprove` — sets `status: 'approved'` and nothing else. No stock call.
- `RequisitionsTab.jsx:72-91` `handleFulfil` — calls `shiftStock(req.stock_item_id, -qty)` at `:74`, writes the `stock_movements` row, then sets `status: 'fulfilled'`.

`008_inventory.sql:32` confirms four statuses: `pending, approved, fulfilled, rejected`. So CLAUDE.md is describing a three-state workflow the code does not have. Not a live bug — but CLAUDE.md is the file that seeds every Claude Code session, and a future session told "deduct on approval" would move the `shiftStock` call into `handleApprove` and introduce a double deduction.

**Note the second-order drift:** the *events* module deducts on **confirm** (`EventDetailTab.jsx:64-90`) and on **add-when-already-confirmed** (`EventStockSection.jsx:97`, commit `1a0b50d`). CLAUDE.md's single global sentence about stock deduction now covers two modules with three different trigger points, and describes none of them correctly.

**Fix:** restate `CLAUDE.md:14` as "requisitions deduct on fulfil; event allocations deduct on confirm."

### 4.3 `src/lib/standards.md` mandates the §2.1 violation — MEDIUM, and this is the root cause

Not a CLAUDE.md line, but a standing written rule inside the repo that directly contradicts the Streamline Standard, and it explains why 36 files do the wrong thing.

`src/lib/standards.md:9` — *"**Rule:** All admin DB operations must use `supabaseAdmin` (service role client). The regular `supabase` anon client is for auth operations only. Never use the anon client for DB reads/writes in admin pages."*
`:11-19` — prints the `supabaseAdmin` browser-client config as the approved pattern.
`:21` — *"**Why:** The anon client is subject to RLS and returns empty results… Admin pages need unrestricted access."*
`:225` — lists `VITE_SUPABASE_SERVICE_ROLE_KEY` among the three env vars that *"must exist in both `.env.local` AND Vercel."*

This is a documented, in-repo standard instructing exactly what Standard §2.1 and §2.4 forbid. It is titled *"Resolved Issues & Permanent Standards"* and says *"Each fix is permanent. Do not reintroduce these patterns."* Any future session that reads it will re-introduce the vulnerability after W1 removes it. The diagnosis at `:21` is also backwards: RLS returning empty results is the signal that policies are missing, not a reason to bypass RLS.

Ironically, the same file gets §2.2 right — `:56`, `:64`, `:132-133` prescribe the `service_role` ALL policy + `GRANT ALL` pattern that the migrations do follow.

**Fix:** rewrite `src/lib/standards.md` §1 and §14 to mandate Edge Functions before W1 lands, or the fix will be reverted by the next session that reads the file.

### 4.4 `create-user` Edge Function has no authorization — CRITICAL

Not a CLAUDE.md contradiction, but the most serious single defect after the key itself, and it belongs with the standing-rules review because `CLAUDE.md:10` asserts *"Auth: Supabase Auth + user_profiles table"* as though an auth model exists on this path.

`supabase/functions/create-user/index.ts` performs **zero** authorization. Grepping the file for `auth.getUser`, `verify`, `role ===`, or `owner` returns **0 matches**. The handler (`:9-31`) reads the body, validates only that `email`, `password`, `full_name`, `role` are non-empty (`:18`), and calls `auth.admin.createUser` (`:31`) followed by an unvalidated `user_profiles` insert (`:38-47`) that writes **`role` straight from the request body** (`:42`). `:5` sets `Access-Control-Allow-Origin: '*'`.

**Anyone who can reach the function URL can mint an `owner` account.**

The platform's `verify_jwt` setting is **UNVERIFIED** — there is no `supabase/config.toml` in the repo. But it does not save this endpoint either way: `AddUserTab.jsx:61` authenticates the call with `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` — **the anon key, not the caller's session JWT**. The anon key is public and sits in the bundle. So even with `verify_jwt` enabled, the credential that satisfies it is one every visitor already has. The endpoint is effectively unauthenticated in both configurations.

**Fix:** verify the caller's JWT inside the function, look up their `user_profiles.role`, reject anything but `owner`, restrict the role field to the four known values, and set CORS to the deployed origin.

---

## 5. CHANGE SINCE PRIOR AUDIT

`git log --oneline --since=2026-07-04` → **1 commit.**

```
ed9a8e3  chore: track existing Woodlands doc artifacts
```

**Files changed:** two, both additions, both documentation:
- `WOODLANDS_AUDIT.md` (+266)
- `WOODLANDS_STATE.md` (+113)

Zero source, migration, config, or Edge Function files were touched. The last commit before this one, `1a0b50d`, is dated **2026-06-25** — nine days *before* the prior audit was even written. The code audited today is byte-for-byte the code the 4 July audit examined.

### Status of the prior audit's CRITICAL/HIGH findings

Each re-verified against current source, not assumed from the prior write-up.

| Prior finding | Severity | Status | Re-verification |
|---|---|---|---|
| 2.1 Service role key shipped to every browser | CRITICAL | **NOT ADDRESSED** | `supabaseAdmin.js:5-7` unchanged. Re-confirmed by fresh `npm run build` + literal key match in `dist/assets/index-ClGMEzuk.js` (§2.1). |
| 2.2 Anyone on the internet can create users, including an owner | CRITICAL | **NOT ADDRESSED** | `create-user/index.ts` unchanged; 0 authorization checks (§4.4). Now additionally established: `AddUserTab.jsx:61` sends the *anon key* as the bearer token, so `verify_jwt` provides no protection either. |
| 2.3 Public `/checkin` uses the service key and enumerable UUIDs | CRITICAL | **NOT ADDRESSED** | `CheckIn.jsx:3, 50, 67, 94, 108, 130` unchanged. |
| 2.4 No effective security model below the UI | CRITICAL | **NOT ADDRESSED** | 36 files still import `supabaseAdmin`. Newly established: `events`, `event_payments`, `table_bookings` have RLS on with *zero* policies, so service-role is their only access path — the dependency that must be cleared first (§2.2(b)). |
| 2.5 Money and stock computed client-side and trusted | HIGH | **NOT ADDRESSED** | No `CHECK` on any `amount` column (§3 DoD (c)); `min="0.01"` at `EventPaymentsSection.jsx:186` is still the only floor. |
| 2.6 Stock deduction is a read-then-write race | HIGH | **NOT ADDRESSED** | All three sites unchanged (§3 DoD (b)). Newly established: the `Math.max(0, …)` clamp combined with full-quantity return on cancel *creates* inventory (§3 DoD (a)). |
| 2.7 Hardcoded project URL; plaintext password in UI | HIGH / MEDIUM | **NOT ADDRESSED** | URL still hardcoded at `AddUserTab.jsx:56`; password still rendered at `:93`. |

**FIXED: none.** Seven of seven CRITICAL/HIGH findings remain open after 22 days. The only change to the repository in that window was committing the audit documents themselves.

### New in this audit (same unchanged code, findings the prior two documents did not record)

1. **Service role key committed to git history** — `scripts/seed-attendance.mjs:14`, commit `9759cc4`, pushed to GitHub (§2.1b). **CRITICAL.**
2. **The Inventory module is unreachable** — `ROUTE_ACCESS` keys `/inventory`, the route is `/`, the guard fails closed for all four roles (§2.5(a)). **MEDIUM.**
3. **`is_active` is never enforced** — deactivating a user in Admin does not revoke access (§2.5(b)). **HIGH.**
4. **`staff` is writable by any authenticated user** — `004:14-16` blanket policy never dropped by `016` (§2.2(a)). **HIGH.**
5. **`events` / `event_payments` / `table_bookings` have RLS with no policies** — service-role is their only access path; blocks the §2.1 fix (§2.2(b)). **HIGH.**
6. **Stock clamp + full return creates phantom inventory** — `EventDetailTab.jsx:75` vs `:102` (§3 DoD (a)). **HIGH.**
7. **`src/lib/standards.md` mandates the service-role-in-browser anti-pattern** — the root cause of the 36-file spread, and the reason a fix would regress (§4.3). **MEDIUM.**
8. **`010` and `seed.sql` declare `shift_date` differently** — which one is live determines whether `WOODLANDS_STATE.md` §4.1's conclusion holds (§2.6(e), §3 DoD (e)). **UNVERIFIED.**
9. **The prior "no staging" FAIL is obsolete** — Standard v1.1 removed the staging-project requirement (§0, §4.3 of the Standard).

---

## 6. SUMMARY TABLE

| Severity | Finding | Standard § | File(s) | Fix sprint |
|---|---|---|---|---|
| **CRITICAL** | `service_role` JWT in the client bundle — verified by literal match in a fresh build | §2.1, §2.4, §3 DoD 2 | `src/lib/supabaseAdmin.js:5-7`; `.env.local:3`; `dist/assets/index-ClGMEzuk.js` | **W1** |
| **CRITICAL** | `service_role` JWT hardcoded and committed to git | §2.4 | `scripts/seed-attendance.mjs:14`; commit `9759cc4` | **W1** |
| **CRITICAL** | `create-user` Edge Function has zero authorization — anyone can mint an `owner` | §2.5, §6 | `supabase/functions/create-user/index.ts:9-47`; `AddUserTab.jsx:61` | **W1** |
| **CRITICAL** | All access control is client-side JSX; RLS never exercised | §2.2, §2.5 | 36 files importing `supabaseAdmin` | **W1→W2** |
| **HIGH** | `events`, `event_payments`, `table_bookings`: RLS on, zero policies — blocks the W1 fix | §2.2 | `001:227-230`; no policy in any migration | **W1** (prerequisite) |
| **HIGH** | `staff` writable by any authenticated user — stale `004` blanket policy | §2.2 | `004_attendance_columns.sql:14-16`; `016:18-19`; `001:245` | **W1** |
| **HIGH** | `is_active` never checked — deactivation does not revoke access | §2.5 | `RouteGuard.jsx:15-27`; `UsersTab.jsx:76` | **W1** |
| **HIGH** | Stock clamp + full-quantity return on cancel creates phantom inventory | §3 DoD 6 | `EventDetailTab.jsx:75, 102`; `EventStockSection.jsx:97`; `InventoryUI.jsx:96` | **W2** |
| **HIGH** | Read-then-write races on `current_stock`, no lock or transaction | §3 DoD 6 | `InventoryUI.jsx:90-102`; `EventDetailTab.jsx:64-118`; `EventStockSection.jsx:97, 147-155` | **W2** |
| **HIGH** | No `CHECK` on any money column — negative payments insert cleanly | §3 DoD 6 | `001:136, 205`; `008_event_bill_items:6`; `009:41` | **W2** |
| **HIGH** | Schema drift: 4 ghost tables + 1 ghost column; DB not rebuildable from migrations | §2.6, §3 DoD 4 | `event_checklists`, `shift_settings`, `tables`, `fm_market_days`; `020_event_stock.sql` | **W2** |
| **MEDIUM** | Inventory module unreachable — `ROUTE_ACCESS` key/route mismatch | §2.5 | `roles.js:7`; `App.jsx:39`; `RouteGuard.jsx:21-24`; `Sidebar.jsx:8` | **W2** |
| **MEDIUM** | `src/lib/standards.md` mandates the service-role-in-browser anti-pattern | §2.1, §2.4 | `src/lib/standards.md:9-21, 225` | **W1** (with the fix) |
| **MEDIUM** | `returned_qty` computed and displayed, never persisted; column absent | §2.6, §3 DoD 6 | `EventStockSection.jsx:147, 157-161, 206, 319` | **W2** |
| **MEDIUM** | Attendance UTC date boundary; unique index protects neither write path | §3 DoD 6 | `ClockInOutTab.jsx:36, 86-97, 130`; `010:16-18` | **W2** |
| **MEDIUM** | Real client PII (62 staff) committed to git; no purge of seeded test data | §2.7, §3 DoD 5 | `016_staff_restructure.sql:42+`; `scripts/seed-attendance.mjs` | **W2** |
| **MEDIUM** | Temporary password displayed in plaintext; no forced reset on first login | §6 | `AddUserTab.jsx:93` | **W3** |
| **MEDIUM** | CLAUDE.md role list wrong (6 vs 4); `store_supervisor` gates dead | §5 | `CLAUDE.md:8`; `LogDeliveryTab.jsx:7`; `TransfersTab.jsx:7`; `InventoryUI.jsx:82` | **W3** |
| **MEDIUM** | CLAUDE.md stock-deduction rule contradicts code (approve vs fulfil vs confirm) | §5 | `CLAUDE.md:14`; `RequisitionsTab.jsx:61-91` | **W3** |
| **LOW** | Duplicate migration number `008`; `018` drops tables no migration created | §2.6 | `008_event_bill_items.sql`, `008_inventory.sql`; `018:4-6` | **W3** |
| **LOW** | Project URL hardcoded — defeats environment separation | §2.6 | `AddUserTab.jsx:56` | **W3** |
| **LOW** | Key length `console.log`ged on every page load | §2.1 | `src/lib/supabaseAdmin.js:3` | **W1** (deleted with the file) |
| **LOW** | Four dead tables never dropped | §2.6 | `inventory_items`, `deliveries`, `stock_transfers`, `stock_adjustments` (`001`) | **W3** |
| **LOW** | No `STREAMLINE_BUILD_STANDARD.md` in repo; `CLAUDE.md` has no pointer to it | §1 Stage 3, §5 | repo root; `CLAUDE.md` | **W3** |
| **UNVERIFIED** | Live RLS/policy state, incl. all four ghost tables | §2.2, §3 DoD 3 | queries in §2.2 | **W1** |
| **UNVERIFIED** | Live `shift_date` DDL — `010:10` (no default) vs `seed.sql:13` (`DEFAULT CURRENT_DATE`) | §2.6 | query in §3 DoD (e) | **W2** |
| **UNVERIFIED** | Storage buckets — none used in code; existence unconfirmed | §2.3 | `SELECT id, name, public FROM storage.buckets;` | **W2** |
| **UNVERIFIED** | Dependency CVEs — `npm audit` registry returned a malformed response | §3 DoD | `package.json` | **W3** |
| **UNVERIFIED** | GitHub repo visibility (public/private) — `gh` not installed | §2.4 | — | **W1** |

---

## 7. TOP 3 FIXES BY IMPACT

Ranked by reachability × blast radius — not by effort, and not by sprint order.

### 1. Rotate the `service_role` key, then remove it from the browser and from git

**Reachability: maximal.** No authentication, no role, no session, no interaction. Anyone who loads any URL on `woodlands-beta.vercel.app` — including `/login` before signing in — receives the key in the first JavaScript response. Anyone who can read the GitHub repo gets it from `scripts/seed-attendance.mjs:14`. There is no narrower way to describe the audience than "the internet."

**Blast radius: total.** The key bypasses RLS on every table. Read: 62 staff members' names, employee numbers and departments; all attendance; all event bills and payments; all farmers-market holder PII and fee history. Write and delete: the same. Plus `auth.admin`. Every other finding in this report is an access-control finding *underneath* a key that renders access control moot.

**Why first:** rotation is the only step that changes the facts. Deleting `supabaseAdmin.js` does not un-publish a key that has been served to every visitor since 1 June and pushed to GitHub. Rotate in the Supabase dashboard, then delete `src/lib/supabaseAdmin.js` and `VITE_SUPABASE_SERVICE_ROLE_KEY` from `.env.local` and Vercel, then strip the literal from the seed script.

**Sequencing warning:** rotation breaks the running app immediately and completely — 36 files depend on that key. That is expected and correct. But it means step 2 below is not optional follow-up work; it is the same maintenance window. Write the missing policies for `events`, `event_payments`, `table_bookings` and the four ghost tables *before* rotating, or Events and Table Bookings will have no access path at all. And rewrite `src/lib/standards.md:9-21` in the same change, or the next session will read it and put the key back.

### 2. Authenticate the `create-user` Edge Function

**Reachability: maximal, and it does not depend on finding #1.** A single unauthenticated `POST` to a public URL. `verify_jwt` does not close it: `AddUserTab.jsx:61` authenticates with the anon key, which is public by design and in the bundle. So the endpoint is reachable by a stranger whether or not JWT verification is enabled — and it remains reachable after the service key is rotated, because it uses its own server-side secret.

**Blast radius: total, and persistent.** `:42` writes `role` verbatim from the request body. A stranger POSTs `{"email":"…","password":"…","full_name":"…","role":"owner"}` and holds a legitimate owner account — one that survives key rotation, survives the W1 migration, and looks like a real user in the Admin panel. This is the finding that turns a data breach into durable unauthorized control.

**Why second, not third:** it is the smallest diff in this report — verify the caller's JWT, look up `user_profiles.role`, reject non-owners, allowlist the four role values, set CORS to the deployed origin. Roughly twenty lines against the single largest residual risk after the key. It is also independent of finding #1, so it can ship immediately rather than waiting on the policy work.

### 3. Fix the stock clamp before the concurrency work

**Reachability: authenticated owner/manager on `/events` — narrower than #1 and #2, deliberately ranked third.** But it is reached by *normal correct use of the product*, not by an attacker. It fires on ordinary event confirm-then-cancel, and it is silent.

**Blast radius: the inventory ledger, quietly and cumulatively.** `EventDetailTab.jsx:75` clamps a short deduction to zero and proceeds anyway; `:102` returns the full `allocated_qty` on cancel. Confirming an event against insufficient stock and then cancelling it *manufactures* the shortfall as real inventory. Five units, allocate twenty, cancel → twenty units on the books. The warning at `:77` is a toast that does not block, and nothing reconciles afterwards. Every occurrence corrupts the ledger permanently and invisibly, and Inventory is the module the owner will use to make purchasing decisions.

**Why this and not the race conditions:** the read-then-write races (§3 DoD (b)) are the better-known defect and appear in every prior document, but they need genuine concurrency to fire — two operators touching the same `stock_item_id` in the same instant, which at this lodge's scale is uncommon. The clamp needs one person, one event, one cancellation. It is more likely to have fired already than the races are. Fix the clamp first: fail the confirm when stock is insufficient rather than warning and continuing, and record the quantity actually deducted so the return can match it. Then make all three sites atomic.

---

## APPENDIX — AUDIT METHOD

- **Standard:** v1.5, `OneDrive - Streamline/files/Common/STREAMLINE_BUILD_STANDARD.md`, read in full. No v1.3 artifact exists; see §0.
- **Read:** all 59 files under `src/`, all 21 migrations, the Edge Function, `seed.sql`, `scripts/seed-attendance.mjs`, `CLAUDE.md`, `src/lib/standards.md`, `.env.local`, `vite.config.js`, `vercel.json`, `package.json`, `.gitignore`.
- **Built:** `npm run build` — clean, 4.11s. Grepped the resulting `dist/assets/index-ClGMEzuk.js` for the literal key value from `.env.local` (2 exact matches) and base64-decoded every JWT-shaped string in it (2 distinct tokens: `anon`, `service_role`).
- **Git:** `log --since=2026-07-04` (1 commit), `log --all -S` on the key signature (commit `9759cc4`), `ls-files`, `branch -a`, `remote -v`.
- **Did not do:** any SQL against the live database; any file modification outside the gitignored `dist/` rebuild; any `npm audit fix`. `npm audit` was attempted read-only and failed on a malformed registry response.
- **Independence:** findings were derived from source and re-verified before being compared with `WOODLANDS_AUDIT.md` and `WOODLANDS_STATE.md`. Where this audit contradicts either — the obsolete staging FAIL (§0), the flat `shift_date` claim (§3 DoD (e)), and the route table in `WOODLANDS_STATE.md` §1 that lists `/` as accessible to all four roles (§2.5(a)) — the contradiction is stated explicitly rather than silently corrected.

*Nothing in this repository has changed in code since 2026-06-25. All seven CRITICAL/HIGH findings from the 2026-07-04 audit remain open, and this audit adds seven more.*
