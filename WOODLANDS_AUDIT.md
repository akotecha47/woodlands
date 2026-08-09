> **⚠ HISTORICAL SNAPSHOT — dated 4 July 2026. NOT the current state of the system.**
> This is a read-only audit from a point in time, kept as a diff record and as provenance for a future AUDIT_3. Much of it has since been fixed (see Sprints A–E in `WOODLANDS_HISTORY.md`). **For the current system, read `WOODLANDS_STATE.md` and `WOODLANDS_FUNCTIONAL_SPEC.md`.** Do not treat findings here as live. Never rewrite this file — audits are superseded, not edited.

# WOODLANDS SYSTEM AUDIT — 2026-07-04

Auditor note: read-only analysis of `src/`, `supabase/migrations/`, `supabase/functions/`, config files, and the built bundle in `dist/`. No files were modified. `npm audit` was run (read-only). Findings are grounded in specific files; where I could not confirm something without running SQL against the live DB, it is marked **UNVERIFIED**.

---

## 1. SYSTEM OVERVIEW (short)

Woodlands Lodge management system — React 19 + Vite + Tailwind SPA on Vercel, talking to Supabase (Postgres + Auth). Single-page app, client-rendered, no backend of its own except one Supabase Edge Function.

Modules (one line each):
- **Inventory** (`src/pages/Inventory.jsx`, `components/inventory/*`) — stock items, current stock levels, deliveries, transfers, adjustments, requisitions. Stock lives in `current_stock`; every change writes a `stock_movements` row.
- **Attendance** (`components/attendance/*`) — manual GPS-flagged clock in/out, breaks, shift lookup, history. No biometrics (per project scope).
- **Events** (`components/events/*`) — event lifecycle (enquiry → confirmed → in_progress → completed / cancelled), bill items, payments, staff assignment, stock allocation with deduct-on-confirm and post-event clearance, auto-generated BEO checklists.
- **Table Bookings** (`components/table-bookings/*`) — restaurant reservations with table-capacity checks and a 45-minute conflict warning.
- **Farmers Market** (`components/farmers-market/*` + public `pages/CheckIn.jsx`) — stall holders, monthly market days (last Saturday, none in December), visit check-in/out via public QR page, fees/payments, ID cards, monthly WhatsApp message generator.
- **Admin** (`components/admin/*`) — create/edit/deactivate users, manage departments, stock items, staff.

Route map (`src/App.jsx`) and role access (`src/lib/roles.js` `ROUTE_ACCESS`):

| Route | owner | manager | kitchen_manager | restaurant_manager |
|---|---|---|---|---|
| `/login` | public | public | public | public |
| `/checkin` | **public (unauthenticated)** | — | — | — |
| `/dashboard` | ✓ | ✓ | ✓ | ✓ |
| `/` (Inventory) | ✓ | ✓ | ✓ | ✓ |
| `/attendance` | ✓ | ✓ | ✗ | ✗ |
| `/events` | ✓ | ✓ | ✗ | ✗ |
| `/table-bookings` | ✓ | ✓ | ✗ | ✓ |
| `/farmers-market` | ✓ | ✓ | ✗ | ✗ |
| `/admin` | ✓ | ✗ | ✗ | ✗ |

Note the four roles the app actually recognises for login are `owner`, `manager`, `kitchen_manager`, `restaurant_manager` (`ROLE_LABELS` in `roles.js`). This does **not** match CLAUDE.md (which lists `owner, manager, store_supervisor, bar1, bar2, restaurant_manager`) nor the inventory code (which gates on `store_supervisor`). See §3.

---

## 2. CRITICAL ISSUES (fix before handover)

### 2.1 — THE SERVICE ROLE KEY IS SHIPPED TO EVERY BROWSER. THIS IS A FULL DATABASE COMPROMISE. — CRITICAL

**Location:** `src/lib/supabaseAdmin.js`, `.env.local` (`VITE_SUPABASE_SERVICE_ROLE_KEY`), and confirmed baked into `dist/assets/index-CM_lQCCT.js`.

**What's wrong:** `supabaseAdmin` is created in the browser with the Supabase **service_role** JWT, read from `import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY`. Any env var prefixed `VITE_` is inlined into the JavaScript bundle by Vite at build time — it is **not** a secret, it is public. I decoded the JWTs embedded in the production bundle: one has `"role":"anon"` (expected) and **one has `"role":"service_role"` (catastrophic)**. The service role key bypasses Row Level Security entirely.

**Why it matters, in plain language:** Anyone who opens the site, presses F12, and looks at the network tab or the JS source can copy this key. With it they can read, modify, or delete **every row in every table** directly against `https://gttsjmxltrxxfplqjans.supabase.co` — all staff records, all payment records, all event money, all farmers-market holders' personal details (names, phones, emails) — from a script, without ever logging in. They can also delete every table. This is not a theoretical risk; the key is literally in the file served to the public right now. Every RLS policy in your migrations is decorative because the app never uses the anon client for data — it uses this key for everything (38 files import `supabaseAdmin`; `standards.md` rule 1 explicitly mandates it).

**This is the single reason the system is not safe to hand over as-is.**

**Fix (this is a re-architecture, not a one-liner):** The service role key must **never** leave a trusted server. Move every privileged DB operation behind Supabase Edge Functions (or Postgres RPC) that (a) verify the caller's JWT, (b) check the caller's role, then (c) use the service key server-side. The browser should only ever hold the anon key and rely on RLS. As an immediate containment step before that work: **rotate the service role key in the Supabase dashboard right now** (the current one is burned), and delete `VITE_SUPABASE_SERVICE_ROLE_KEY` from Vercel env and `.env.local`. Rotating alone will break the app (because the app depends on the key) — which is exactly the point: the app's security model has to change.

### 2.2 — Anyone on the internet can create users, including an owner account — CRITICAL

**Location:** `supabase/functions/create-user/index.ts`, called from `src/components/admin/AddUserTab.jsx`.

**What's wrong:** The Edge Function accepts `{ email, password, full_name, role, ... }` and calls `auth.admin.createUser` + inserts a `user_profiles` row with **whatever role the caller sends**. It performs **no authentication and no authorization** — there is no check that the request carries a valid session, and no check that the caller is an owner. The only credential the frontend sends is the anon key in the `Authorization` header (`AddUserTab.jsx`), which is public. CORS is `*`.

**Why it matters:** Anyone can `curl` this endpoint with `role: "owner"` and mint themselves a full-access account. Combined with 2.1 it's redundant (they already have god mode), but even if you fixed 2.1, this endpoint alone is a privilege-escalation backdoor into the whole system.

**Fix:** In the function, require the caller's user JWT (`Authorization: Bearer <access_token>`, not the anon key), verify it, load that user's profile, and reject unless `role === 'owner'`. Lock CORS to your Vercel origin. Whitelist assignable roles server-side.

### 2.3 — The public `/checkin` page uses the service role key and enumerable UUIDs — CRITICAL (subsumed by 2.1, called out separately)

**Location:** `src/pages/CheckIn.jsx`.

**What's wrong:** `/checkin?holder=<uuid>` is unauthenticated (it's outside `RequireAuth` in `App.jsx`) and it imports `supabaseAdmin` — so the **service role key is delivered to completely anonymous visitors**, not just logged-in staff. The page reads `fm_holders` by id and inserts/updates `fm_visits`. Holder ids are random UUIDs (`gen_random_uuid()`), so they are not trivially guessable, but they are printed on QR cards handed to stall holders and shown in the URL; anyone with one holder's link possesses the service key and can then read the full holders table (names, phones, emails) regardless.

**Why it matters:** This is the worst possible place to expose the key because it requires no login at all. It also means an anonymous person with a valid holder link can forge check-ins/check-outs for any holder.

**Fix:** Same as 2.1 — the check-in flow must go through an Edge Function that uses the anon client + a narrowly-scoped RLS policy (or a server function that only touches that one holder's visit row). Never import `supabaseAdmin` into a public route.

### 2.4 — Effective security model: there is none below the UI — CRITICAL

**What's wrong:** RLS is enabled on every table (migration `001` and later), and most tables have an "authenticated read" + "service_role all" policy pair (`standards.md` rule 4 mandates this). But because the app performs **all** reads and writes with the service role client (§2.1), RLS is never actually exercised. The real access control is: whatever the React components choose to show/hide based on `profile.role` (e.g. `MANAGERS = ['owner','manager']` in `RequisitionsTab.jsx`, `ALLOWED` arrays in transfer/adjustment/delivery tabs). That is **client-side enforcement only** — trivially bypassed by anyone using the exposed key or just calling Supabase directly.

**Why it matters:** Role gating that lives only in JSX (`{isManager && <ApproveButton/>}`) is UX, not security. A `restaurant_manager`, or a random attacker, can approve requisitions, delete bill items, or change event totals directly.

**Fix:** Enforce authorization server-side (RLS policies keyed on `auth.uid()` and a role lookup, or role checks inside Edge Functions). The UI gates stay as convenience, but must not be the only line.

### 2.5 — Money and stock are computed client-side and trusted — HIGH

**Locations:** `EventPaymentsSection.jsx` (`totalPaid`, `difference`, balance), `EventBillSection.jsx` (`billTotal`), `PaymentsTab.jsx` / `MonthlyMessagesTab.jsx` (`holderOutstanding`), `EventStockSection.jsx` and `EventDetailTab.jsx` (stock deduction).

**What's wrong:** All financial totals are summed in JavaScript from rows the client itself wrote, then written back or displayed. There is no server-side validation that, e.g., a payment amount is positive, that a bill total matches its line items, or that stock never goes negative beyond the `Math.max(0, …)` clamp. Amounts use JS `Number` (float) — `numeric` in Postgres is exact, but the moment a value round-trips through `Number(...)` for arithmetic (every total in the app) you are doing floating-point math on currency. For MWK integer amounts this is low-risk today, but any fractional unit or large sum can drift.

**Why it matters:** Because writes are unauthenticated at the DB layer (2.1/2.4), "trusted client math" means anyone can post a MWK -5,000,000 "refund" or set an event balance to settled. Even absent an attacker, there's no server guard rail against a fat-fingered negative.

**Fix:** Validate amounts server-side (`CHECK (amount > 0)` where appropriate; you already have `CHECK (quantity >= 0)` on `current_stock`). Compute authoritative totals in SQL/RPC, not the browser. Keep currency as integer minor units or rely strictly on `numeric` without JS float round-trips for anything persisted.

### 2.6 — Stock deduction is a read-then-write race with no locking — HIGH

**Locations:** `InventoryUI.jsx` `shiftStock()` (select quantity → compute → upsert), `EventStockSection.jsx` `handleAdd`/`handleClearance`, `EventDetailTab.jsx` `handleStockOnStatusChange`. All follow: `SELECT quantity → newQty = old ± delta → UPDATE`.

**What's wrong:** Between the read and the write, another operation can change `current_stock`. Two concurrent deliveries/requisitions/allocations on the same item will lose one update (last-writer-wins). There is no atomic increment, no row lock, no transaction. The recent commit history (`fix double deduction with statusBusy guard`, `auto-deduct on add when event already confirmed`) shows this area has already produced correctness bugs.

**Why it matters:** At a lodge with a bar and kitchen both drawing the same stock, or a manager confirming an event while a delivery is logged, stock counts will silently go wrong. Money follows stock, so this erodes trust in the numbers.

**Fix:** Do the mutation atomically in the database: a Postgres function `adjust_stock(item, delta)` doing `UPDATE current_stock SET quantity = quantity + delta WHERE ... RETURNING`, called via RPC, wrapped so the movement row and the balance update are one transaction. Never compute the new quantity in JS.

### 2.7 — Hardcoded project URL; password shown in plaintext in the UI — HIGH / MEDIUM

- The Supabase project URL is hardcoded in `AddUserTab.jsx` (`https://gttsjmxltrxxfplqjans.supabase.co/functions/v1/create-user`) instead of using `VITE_SUPABASE_URL`. Not a secret, but it defeats environment separation — you cannot point this at a staging project without editing code.
- `AddUserTab.jsx` displays the new user's password back on screen in plaintext ("Password: …"). Combined with no forced password reset on first login, temporary passwords tend to become permanent. **UNVERIFIED**: I did not find any Wood123-style hardcoded password in the code or bundle — the "Wood123 pattern" you asked about does not appear in the repo. If it exists, it's in seed data or the live DB, which I did not query.

**Fix:** Use `import.meta.env.VITE_SUPABASE_URL` for the function URL. Force a password change on first login (Supabase supports this via a flag in `user_profiles` + a gate in `AuthContext`).

---

## 3. HIGH-PRIORITY GAPS (fix soon after handover)

**Three-way role inconsistency.** CLAUDE.md says roles are `owner, manager, store_supervisor, bar1, bar2, restaurant_manager`. `roles.js` `ROLE_LABELS` (the only creatable roles in `AddUserTab.jsx`) are `owner, manager, kitchen_manager, restaurant_manager`. Inventory tabs (`TransfersTab.jsx`, `LogDeliveryTab.jsx`, `InventoryUI.fetchStaffUsers`) gate on `store_supervisor`, which **cannot be created through the UI** and is not in `ROUTE_ACCESS`. `kitchen_manager` is creatable and has route access but is never referenced in any component's permission logic — it behaves like a viewer. `bar1`/`bar2` exist only in CLAUDE.md. Net effect: `store_supervisor` features are dead unless a role is inserted directly in SQL, and CLAUDE.md is stale. Pick one canonical role list, put it in `roles.js`, and make CLAUDE.md follow it.

**Attendance writes `date`, history reads `shift_date` — split-brain columns.** `ClockInOutTab.jsx` inserts `{ date: today, ... }` and queries `.eq('date', today)`, where `today` is derived from `new Date().toISOString()` (UTC). But `HistoryTab.jsx` reads, filters, and orders by `shift_date` (migration `010`/`seed.sql`, defaulted to `CURRENT_DATE` server-side). So the record's `date` is set by the client and `shift_date` is set by the DB default. They usually coincide, but near UTC midnight (Malawi is UTC+2) they will differ, and the unique index `attendance_records_user_shift_date_key` is on `(user_id, shift_date)` — meaning the client's "already clocked in today?" check (`.eq('date', today)`) and the DB's uniqueness guard key off **different columns**. This can both allow a duplicate and hide a record from history. Consolidate on one column (prefer `shift_date`, set explicitly from local date).

**Schema drift: tables used by code but absent from numbered migrations.** Code references `event_checklists`, `shift_settings`, `tables`, `fm_market_days` (grep of `from('…')`), but there is no numbered migration creating them — they live only in `seed.sql` or ad-hoc SQL that was pasted into the Supabase SQL editor. Migration `008` appears twice (`008_event_bill_items.sql` and `008_inventory.sql`) — duplicate numbering. `008_inventory.sql` contains a `-- NOTE:` telling a human to manually `DROP TABLE requisitions` first; that is not idempotent and not self-contained. The migration folder is not a reliable source of truth for the schema.

**Orphaned / superseded tables and columns.** Migration `001` creates `inventory_items`, `deliveries`, `stock_transfers`, `stock_adjustments`, and a `requisitions` table keyed to `inventory_items`; the inventory module was later rebuilt on `stock_items` + `current_stock` + `stock_movements` (`007`, `008_inventory`), so the `001` inventory tables are dead unless still present in the live DB (**UNVERIFIED** whether they were dropped). `018_drop_dead_tables.sql` drops `event_tasks`, `bar_week_config`, `fm_planning_tasks`. `attendance_records` still carries the legacy `staff_id` FK (`017`) alongside `user_id` — two ways to identify the same person; only `user_id` is used by the clock-in flow.

**FK ON DELETE behaviour is inconsistent.** Some FKs cascade (`event_bill_items.event_id`, `fm_visits.holder_id`), some are `ON DELETE SET NULL` (`attendance_records.staff_id`), and many in `001` (`requisitions.item_id`, `deliveries.item_id`, `event_payments.event_id`) specify **no** action, so they default to `NO ACTION` — deleting a referenced row will error. `event_stock_allocations.stock_item_id` is `ON DELETE RESTRICT`, which means a `stock_items` row can't be deleted once allocated (probably intended, but undocumented). There is no consistent policy.

**Text columns that should be constrained references.** Per the project rule, departments are deliberately plain text (not FKs) — that's a documented choice, fine. But it means `requisitions.department`, `stock_movements.from/to_department`, `user_profiles.department`, and the `departments` table can drift out of sync (a typo'd department is a silent orphan). At minimum, source department dropdowns everywhere from the `departments` table (some code does; verify all do).

**Error handling swallows failures.** `CheckIn.jsx` catches every error into a generic `phase='error'` with no logging. `MonthlyMessagesTab.copy()` has an empty `catch {}`. Several `load()` functions (e.g. `EventDetailTab.load`, `EventPaymentsSection.load`) don't check `.error` on individual queries — a failed sub-query just yields `?? []`/`?? {}` and the UI renders as if empty rather than surfacing the failure. `AuthContext.fetchProfile` ignores `error` entirely; if the profile fetch fails, the user silently becomes "no role" and gets bounced to `/login` with no explanation.

**A failed write can still look like success in places.** Most mutation handlers do check `error` and `throw`, which is good. But note `CreateEventTab.jsx` flashes "Event created" even when the setup-details insert fails (it deliberately downgrades to a soft warning — acceptable), and toast-based success (`useFlash`) is fire-and-forget with a 3.5s timeout; there's no persistent record of failures for the user to review.

**Derived values computed in multiple places.** `fmtDate`, `fmtMWK`, `todayStr`, `AccessDenied`, and `EmptyRow` are re-defined in `EventsUI.jsx`, `FarmersMarketUI.jsx`, `AttendanceUI.jsx`, `InventoryUI.jsx`, and `admin/AdminUI.jsx` — five near-identical copies, each with subtle differences (the events/FM/attendance `fmtDate` handle date-only strings; the admin one does not). "Outstanding fees" logic lives in both `PaymentsTab.holderOutstanding` and `MonthlyMessagesTab` with the same rules duplicated. Stock-deduction logic is duplicated between `EventStockSection.handleAdd` and `EventDetailTab.handleStockOnStatusChange`.

**Dead code / config.** `roles.js` exports `ALL_STAFF_ROLES` (unused) and `getDefaultRoute` references only a subset of roles. `constants.js` `FM_FEES.id_card_extra` — verify it's used. `App.jsx` `PlaceholderPage` is defined but every route now has a real element. `vite.config.js` sets `Cache-Control: no-store` on the **dev** server only (no effect on the Vercel build).

---

## 4. CODE QUALITY ASSESSMENT

| Area | Grade | Notes |
|---|---|---|
| Component structure | B | Clean module → tab → section decomposition; each tab is self-contained. Some files are too big (`HoldersTab.jsx` 972 lines, `MarketDayTab.jsx` 599). |
| State management | B− | Idiomatic `useState`/`useEffect`; `AuthContext` is reasonable. But every tab re-fetches independently and manages its own loading/toast; no shared cache, so lots of duplicated fetch/flash boilerplate. |
| Query patterns | C | Correct use of Supabase joins in places (`current_stock` → `stock_items`), but read-then-write races (§2.6), client-side filtering of full-table selects (§7), and per-tab `fetchUserMap()`/`fetchDepartmentList()` re-fetching the same reference data repeatedly. |
| Styling consistency | A− | Genuinely consistent Tailwind vocabulary (`brand-teal`, rounded-xl cards, the same table/badge patterns everywhere). This is the strongest area. |
| Naming | B | Mostly clear and consistent (`fmt*`, `handle*`, `fetch*`). The `date` vs `shift_date` and `user_id` vs `staff_id` splits are the notable naming-driven bugs. |
| Migration hygiene | D | Duplicate `008`, non-idempotent manual `-- NOTE: DROP` instructions, tables that exist only in `seed.sql`, schema truth spread across migrations + seed + ad-hoc SQL editor pastes. This will bite hardest when rebuilding the DB from scratch. |
| Reuse vs duplication | C | Shared `AdminUI.jsx` primitives (`Field`, `Inp`, `Th`, `Td`, `Toast`, `useFlash`) are good and widely reused. Undercut by five copies of the date/money/empty-state helpers and duplicated business logic (§3). |

**Done well:** consistent visual system; sensible file organisation; every mutation handler wraps Supabase calls in try/catch and checks `error` before flashing success; thoughtful domain modelling (event lifecycle, market-day math, stock allocation with return-on-clear).

**Actively bad and will hurt as it grows:** the service-role-everywhere architecture (it means you can *never* safely add a lower-trust user); business logic in the browser; schema drift; five-way helper duplication.

---

## 5. WORKFLOW ASSESSMENT

What the repo reveals about how this was built:

- **Code-first, schema-after.** Migrations are numbered but several tables only ever existed as SQL pasted into the Supabase editor (`event_checklists`, `shift_settings`, `tables`, `fm_market_days`). `standards.md` reads like a lab notebook of production incidents ("real bugs that were hit"). The pattern is: build UI, hit a DB error, paste a fix into the dashboard, sometimes back-fill a migration. This is why the migration folder can't rebuild the DB.

- **Sprawling changes, not prompt-sized ones.** The two biggest files (`HoldersTab` ~970 lines, `MarketDayTab` ~600) and the recent commit run ("events rework 3/4", "patch", "patch 2", "fix double deduction", "auto-deduct on add") show large features landed in one piece and then repeatedly patched for correctness after the fact — classic sign of changes too big to verify in one go.

- **No tests, no CI.** `package.json` has `dev/build/lint/preview` only. No test runner, no test files. Every regression is caught by hand in the browser. The "3/4", "patch", "patch 2" churn is what testing would have caught before commit.

- **Duplicate migration numbers (`008` twice)** indicate migrations authored in parallel without checking the latest number — a symptom of not treating the migrations dir as an append-only ledger.

- **The core security mistake was deliberate and documented.** `standards.md` rule 1 *instructs* future work to always use the service role client. This wasn't an accident to catch — it was adopted as a convention because the anon client "returns empty results" (i.e. RLS was in the way and the fix was to bypass it rather than write policies). That's the highest-leverage habit to change.

What to change, specifically:
1. **Treat the database as server-trust, the browser as hostile.** Internalise that anything in the bundle is public. This one mental model change prevents the entire §2 category.
2. **Make migrations the single source of truth.** Every schema change is a new, idempotent, correctly-numbered migration; never paste DDL into the dashboard and move on. Test that `migrations/` alone rebuilds the DB.
3. **Ship smaller, verify each step.** A change you can't hold in your head is a change you'll patch three times. The commit log already shows the cost.
4. **Add even a thin smoke test** (one Playwright happy-path per module) before the next client.

---

## 6. SECURITY CHECKLIST

| Item | Status | Note |
|---|---|---|
| Secrets in client bundle | **FAIL** | service_role JWT confirmed in `dist/assets/index-CM_lQCCT.js` via `VITE_SUPABASE_SERVICE_ROLE_KEY`. Full DB compromise. §2.1 |
| RLS effectiveness | **FAIL** | Policies exist but app uses service role for all I/O, so RLS is never enforced. §2.4 |
| Auth on every route | **PARTIAL** | Authenticated routes gated by `RequireAuth`+`GuardedPage` (client-side only). `/checkin` is intentionally public but ships the service key. |
| Public endpoints | **FAIL** | `create-user` Edge Function has no auth/authz and `*` CORS — anyone can create an owner. `/checkin` exposes service key to anonymous users. §2.2, §2.3 |
| Input validation | **FAIL** | Amounts/quantities validated only in the browser; no server-side `CHECK`/RPC guards on money. §2.5 |
| SQL injection surface | **PASS** | Supabase client parameterises queries; no string-built SQL in the app. |
| XSS surface | **PARTIAL** | No `dangerouslySetInnerHTML` seen; React escapes by default. But user-supplied text (holder names, notes) rendered into WhatsApp messages and tables is untrusted; low risk in-app, relevant if ever emailed/rendered as HTML. |
| Dependency audit | **PARTIAL** | `npm audit`: 6 vulns (4 high, 1 moderate, 1 low) — `@babel/core`, `brace-expansion`, `react-router`, `vite`, `ws`. All dev/build-chain, `fix available`. Run `npm audit fix`. `react-router` 7.x advisory affects the app dependency — patch it. |
| Password policy | **FAIL/PARTIAL** | Min 6 chars enforced in the add-user form only; no complexity, no forced rotation, temp password shown in plaintext and reused indefinitely. §2.7 |
| Session handling | **PARTIAL** | Supabase Auth handles the user session correctly (`AuthContext`). Undermined by the parallel service-role client that needs no session at all. |

---

## 7. PERFORMANCE & SCALE NOTES (brief)

- **Full-table selects + client-side filtering.** `PaymentsTab.load` pulls **all** `fm_payments` then filters in JS; `DeliveryLogTab` filters stock movements client-side after fetching; `StockLevelsTab` fetches all `current_stock` and sorts/filters in the browser; `fetchUserMap`/`fetchDepartmentList` pull whole tables on every tab mount. Fine at lodge scale (dozens–hundreds of rows), will degrade as payments/movements accumulate over years. Push filters into the query (`.gte`, `.eq`, pagination).
- **N+1 stock writes.** `EventDetailTab.handleStockOnStatusChange` and `EventStockSection.handleClearance` loop per-allocation doing a SELECT then an UPDATE each — N round-trips per confirm/clear. Batch or move into a single RPC.
- **Repeated reference fetches.** Departments, users, and shift settings are re-fetched by nearly every tab independently; a shared context/cache would cut redundant traffic.
- **Missing indexes implied by query patterns.** Frequent filters on `fm_payments(payment_type, payment_date, holder_id)`, `stock_movements(movement_type, created_at, stock_item_id)`, `attendance_records(user_id, shift_date)` (this one is indexed), `table_bookings(table_id, booking_date, status)`. Add indexes for the hot filter columns before data grows. **UNVERIFIED** which indexes exist in the live DB beyond those in migrations.
- **Bundle:** single `index-*.js` chunk (no route-level code splitting). `react-phone-number-input` and `qrcode.react` load for everyone. Minor at this size; lazy-load routes if it grows.

---

## 8. WHAT'S BEEN DONE RIGHT

Earned, specific:

- **The visual/design system is genuinely consistent** (`AdminUI.jsx` primitives + a disciplined Tailwind vocabulary reused across every module). A client will perceive this as polished and coherent.
- **Domain modelling is thoughtful.** The event lifecycle with stock allocation → deduct-on-confirm → post-event clearance with automatic return of unused stock (`EventStockSection`, `EventDetailTab`) is real operational thinking, not a toy CRUD. Same for market-day math (last Saturday, December skip, `getMarketDaysSince`) in `FarmersMarketUI`.
- **Consistent error-then-flash pattern in mutations.** Almost every write is `try { ...; if (error) throw error; flash(ok) } catch { flash(fail) }`. The habit is right; it just needs server-side teeth.
- **Deliberate, documented conventions.** `standards.md` records real incidents and their fixes so they don't recur — the instinct to write down hard-won lessons is exactly right (the specific lesson in rule 1 was wrong, but the practice is good).
- **`ErrorBoundary`** wraps the app and shows a recoverable error UI instead of a white screen.
- **Sensible UX guards:** table-capacity + 45-min booking conflict warnings (`NewBookingTab`), GPS-flagged (not GPS-blocked) attendance so a bad signal doesn't lock staff out, `statusBusy`/`busy` guards against double-submits.

Carry all of these into Petroda.

---

## 9. HANDOVER READINESS

**Not ready.** If handed over next week, in order of likelihood to break trust:

1. **A security researcher, competitor, or curious staffer finds the service key** (it's in plain view) and reads or alters payroll/attendance/payment data. Reputational and legal exposure with real personal data (Malawi staff and market holders' names, phones, emails).
2. **Someone self-registers an owner account** via the open `create-user` endpoint.
3. **Stock/money numbers drift** under concurrent use (races in §2.6) and the client stops trusting the totals.
4. **Attendance records go missing or duplicate** around midnight due to the `date`/`shift_date` split (§3).
5. **A `store_supervisor` is hired and the inventory features meant for them silently don't work** because the role can't be created (§3).
6. **A DB rebuild/migration fails** because the migrations don't contain the full schema (§3).

Pre-handover checklist (blockers in bold):
- [ ] **Rotate the service role key; remove it from Vercel/`.env.local`/bundle.**
- [ ] **Move all privileged DB access behind authenticated, role-checked Edge Functions / RPC; browser uses anon key + real RLS.**
- [ ] **Lock down the `create-user` function (verify caller JWT + owner role; restrict CORS).**
- [ ] **Rework `/checkin` to not use the service key.**
- [ ] Add server-side validation for money/stock; make stock mutations atomic.
- [ ] Fix the `date`/`shift_date` attendance inconsistency.
- [ ] Reconcile the role list across `roles.js`, the code, and CLAUDE.md.
- [ ] Force first-login password change; stop displaying passwords.
- [ ] `npm audit fix`.
- [ ] Reconstruct migrations so `migrations/` alone rebuilds the schema.

---

## 10. RECOMMENDED NEXT STEPS

### (a) Before handover — do in this order
1. **Contain the key leak now:** rotate the service_role key in Supabase; delete `VITE_SUPABASE_SERVICE_ROLE_KEY` from all envs. Accept that the app breaks — that proves how deep the dependency is.
2. **Re-architect data access:** stand up Edge Functions (or Postgres RPC) for every write and privileged read. Each verifies the user's JWT and role, then uses the service key **server-side only**. Point the frontend at these + the anon client. Delete `src/lib/supabaseAdmin.js`.
3. **Write real RLS** so the anon client can safely do the reads it needs (scoped by `auth.uid()` / role), and so the DB is the enforcement layer.
4. **Fix `create-user`** (auth + owner check + CORS) and **`/checkin`** (no service key).
5. **Server-side money/stock validation** (`CHECK` constraints, atomic `adjust_stock` RPC).
6. **Attendance `date`/`shift_date`** consolidation and **role-list reconciliation**.
7. **`npm audit fix`**, force-password-change, stop showing plaintext passwords.

### (b) First month after
1. Rebuild `migrations/` as the single source of truth; verify a clean DB rebuild in a scratch Supabase project.
2. De-duplicate the shared helpers (one `lib/format.js` for `fmtDate`/`fmtMWK`/`todayStr`, one `AccessDenied`, one `EmptyRow`) and the duplicated business logic (outstanding-fees, stock-deduction).
3. Push list filtering into queries + add pagination and the indexes in §7.
4. Add a thin end-to-end smoke test per module and wire `lint` + `audit` into a CI check on push.
5. Drop the orphaned `001` inventory tables / legacy `staff_id` path once confirmed unused.

### (c) Patterns to carry into the next client build (Petroda)
1. **The browser is public. The service role key never ships.** Server-trust for all privileged operations, from day one.
2. **Migrations are an append-only ledger and the only source of schema truth.** Never paste DDL into the dashboard and forget it.
3. **Business logic (money, stock, totals) belongs in the database or a trusted function**, not in React.
4. **Ship changes small enough to verify in one sitting;** add a happy-path test before committing a feature. The "patch/patch 2" churn here is the cost of skipping that.
5. **Keep the good habits:** the shared UI primitives, the consistent Tailwind system, the incident notebook (`standards.md`), and the error-then-flash mutation pattern — these are strengths worth standardising.

---

*End of audit. The one thing that must happen before anything else: rotate the service role key and get it out of the browser bundle. Everything else is secondary to that.*
