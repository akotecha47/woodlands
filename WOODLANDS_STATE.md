# WOODLANDS — CURRENT STATE (compliance measurement) — 2026-07-15

**Read-only measurement.** No files modified, no git commands beyond `log`/`status`, no SQL run.

**Note on scope:** `STREAMLINE_BUILD_STANDARD.md` does not exist anywhere in this repo (`Glob **/STREAMLINE*` → no results). The only written standard found is the "STREAMLINE BUILD STANDARD" block in the user's global `~/.claude/CLAUDE.md` (7 numbered rules) — that is what §2 below measures against, since it is the only artifact matching the name and shape the brief describes. If a repo-local `STREAMLINE_BUILD_STANDARD.md` was expected to exist, it needs to be added — its absence is itself a compliance gap (nothing in the repo pins the standard a reader could check against without external context).

---

## 1. WHAT THIS IS

Woodlands Lodge Management System — React 19 + Vite + Tailwind SPA on Vercel, backed by Supabase (Postgres + Auth + one Edge Function). Client: Woodlands Lodge, Lilongwe, Malawi.

- Live: woodlands-beta.vercel.app
- Supabase ref: `gttsjmxltrxxfplqjans`
- Repo: github.com/akotecha47/woodlands

Modules:
- **Inventory** — stock items, deliveries, requisitions (raise → approve → **fulfil**, deduction happens on fulfil), transfers, adjustments.
- **Attendance** — GPS-flagged manual clock in/out, breaks, manager Today/History views, shift settings. No biometrics.
- **Events** — enquiry → confirmed → in_progress → completed/cancelled lifecycle, BEO checklists, bill, payments, stock allocation with deduct-on-confirm and post-event clearance.
- **Table Bookings** — reservations with capacity checks and a 45-min no-show/conflict warning.
- **Farmers Market** — stall holders, monthly market day (last Saturday, none in Dec), public QR check-in, fees/payments, ID cards.
- **Admin** — users, departments, stock items.

Roles actually creatable/recognized by the running app (`src/lib/roles.js`, not CLAUDE.md — see §3): `owner`, `manager`, `kitchen_manager`, `restaurant_manager`.

| Route | owner | manager | kitchen_manager | restaurant_manager |
|---|---|---|---|---|
| `/dashboard`, `/` (Inventory) | ✓ | ✓ | ✓ | ✓ |
| `/attendance`, `/events`, `/farmers-market` | ✓ | ✓ | ✗ | ✗ |
| `/table-bookings` | ✓ | ✓ | ✗ | ✓ |
| `/admin` | ✓ | ✗ | ✗ | ✗ |
| `/checkin` | public, unauthenticated | | | |

Separately, `supabase/migrations/016_staff_restructure.sql` seeds a **62-row `staff` table** (real names, employee numbers, departments) that has no login and no FK to `user_profiles` — it's the roster the manager-facing Attendance screens (`TodayTab`, `HistoryTab`, `SettingsTab`) actually operate on, disjoint from the 4 roles above. See §4.1.

---

## 2. COMPLIANCE VS THE NON-NEGOTIABLES (Standard §2)

| # | Rule | Status | Evidence | To close |
|---|---|---|---|---|
| 1 | Service role key NEVER client-side | **FAIL** | `src/lib/supabaseAdmin.js:6-7` creates a Supabase client in browser code with `import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY`. `.env.local` defines `VITE_SUPABASE_SERVICE_ROLE_KEY`. Imported by 38 files, including the **public, unauthenticated** `src/pages/CheckIn.jsx:3`. Vite inlines every `VITE_`-prefixed var into the client bundle at build time (deterministic, documented Vite behavior) — the prior audit (`WOODLANDS_AUDIT.md`, 2026-07-04) additionally confirmed this by decoding a `service_role` JWT out of `dist/assets/index-*.js`. | Delete `src/lib/supabaseAdmin.js` and `VITE_SUPABASE_SERVICE_ROLE_KEY` from `.env.local`/Vercel. Move every privileged read/write behind an Edge Function using `SERVICE_ROLE_KEY` (server-side Deno env — no `VITE_` prefix), the way `supabase/functions/create-user/index.ts:26-27` already correctly does it. |
| 2 | RLS + policies in the same migration as table creation | **PASS (structural)** | Every `CREATE TABLE` in `supabase/migrations/*.sql` is followed in the same file by `ENABLE ROW LEVEL SECURITY` + `CREATE POLICY` (`001_schema.sql`, `006`–`009`, `013`, `015`, `016`, `019`, `020`). | Structurally fine. Functionally inert while rule 1 fails — the app never uses the anon client, so these policies are never evaluated. Fixing rule 1 is what makes rule 2 real. |
| 3 | Storage buckets private, signed URLs only | **PASS (N/A)** | No Supabase Storage usage anywhere in `src/` — grepped for `storage.`, `createBucket`, `getPublicUrl`: zero matches. No bucket exists to misconfigure. | Nothing to do now. If a bucket is added later, create it private and serve via signed URL from an Edge Function. |
| 4 | Only the anon key is client-side | **FAIL** | Same evidence as rule 1 — the service-role key ships to every browser, not just the anon key. | Same fix as rule 1. |
| 5 | Every route checks a role | **PASS** | `src/App.jsx` wraps every non-public route in `<Protected>` → `RequireAuth` + `GuardedPage` (`src/components/RouteGuard.jsx:15-27`), which checks `ROUTE_ACCESS[path].includes(profile.role)` and redirects to `/login` otherwise. `/login` and `/checkin` are deliberately public. | Structurally sound, but this is **client-side (JSX) gating only** — it stops navigation, not direct DB access (see rule 1/4). |
| 6 | Schema changes in a numbered migration first | **FAIL — schema drift confirmed** | Code reads/writes tables no migration creates: `event_checklists` (`EventDetailTab.jsx:34,46,148`, `EventsUI.jsx:165`), `shift_settings` (`ClockInOutTab.jsx:49`, `TodayTab.jsx:50`, `HistoryTab.jsx:77`, `SettingsTab.jsx:28,53,77,98`, `admin/AddUserTab.jsx:27`, `admin/UsersTab.jsx:29`), `tables` (`table-bookings/{TodayTab,UpcomingTab,NewBookingTab,AllBookingsTab}.jsx`), `fm_market_days` (`MarketDayTab.jsx:44,199,205`). Also: `event_stock_allocations.returned_qty` is read at `EventStockSection.jsx:206,319` but `supabase/migrations/020_event_stock.sql` never creates that column (only `id, event_id, stock_item_id, allocated_qty, consumed_qty, status, deducted_at, cleared_at, created_by, created_at`). Migration number `008` is used twice (`008_inventory.sql`, `008_event_bill_items.sql`). | Write the missing `CREATE TABLE` migrations for the four ghost tables, add an `ALTER TABLE event_stock_allocations ADD COLUMN returned_qty numeric` migration, renumber the duplicate `008`, and stop pasting DDL directly into the Supabase dashboard. |
| 7 | Test on staging, never production | **FAIL — no staging exists** | Exactly one Supabase project is referenced anywhere in the repo (`gttsjmxltrxxfplqjans`, in `CLAUDE.md` and the single `.env.local`). One git branch (`git branch -a` → `main` only). `vercel.json` has no per-environment config. There is nowhere else for a change to be exercised before it hits the project the live app and `.env.local` both point at. | Stand up a second Supabase project for staging, point a Vercel preview environment at it, and route all pre-release testing there. |

---

## 3. WHAT'S BEEN FIXED SINCE THE LAST AUDIT

Prior audit: `WOODLANDS_AUDIT.md`, dated 2026-07-04. `git log --since="2026-07-04"` returns **zero commits** — the last commit (`1a0b50d`) is dated 2026-06-25, nine days *before* that audit was written. The code this report examined is byte-for-byte what `WOODLANDS_AUDIT.md` already examined.

**FIXED:** none.

**STILL OPEN** (re-verified directly against current source, not assumed from the prior write-up):
- §2.1/2.4 service-role-key-in-browser and its consequence (RLS never enforced) — `src/lib/supabaseAdmin.js` unchanged.
- §2.2 `create-user` Edge Function still has no caller-JWT check, no owner-role check, `Access-Control-Allow-Origin: '*'` — `supabase/functions/create-user/index.ts:4-30`.
- §2.3 `/checkin` still imports `supabaseAdmin` in a public, unauthenticated route — `src/pages/CheckIn.jsx:3,50,67,94,108,130`.
- §2.6 stock read-then-write races — still present in three places, unpatched: `InventoryUI.jsx:90-102`, `EventDetailTab.jsx:64-118`, `EventStockSection.jsx:94-107,145-162`.
- §3 role-list drift — CLAUDE.md still lists `owner, manager, store_supervisor, bar1, bar2, restaurant_manager`; the running app (`roles.js`) still only knows `owner, manager, kitchen_manager, restaurant_manager`. Unlike the previous audit's snapshot, `roles.js` itself is now internally consistent (`ALL_STAFF_ROLES`, `ROUTE_ACCESS`, `ROLE_LABELS` all agree on the same 4 roles) — the drift is CLAUDE.md vs. code, not code vs. code.
- §3 attendance `date`/`shift_date` split — still present, and this audit's own read of it (§4.1 below) is sharper than the prior write-up: it is not just a midnight edge case, it's two structurally disjoint write paths.
- Schema drift (ghost tables, duplicate migration `008`) — unchanged.

**NEW SINCE:** none — there is no new code to introduce anything. Two specifics this audit surfaced that the prior write-up didn't spell out (same unchanged code, sharper reading):
1. `event_stock_allocations.returned_qty` is displayed by the UI but was never given a column by any migration (§2 rule 6, §4.3).
2. The attendance `shift_date` column is never populated by the self-clock-in insert path at all (not just occasionally mismatched near midnight) — see §4.1.

---

## 4. CORRECTNESS RISKS IN MONEY/QUANTITY LOGIC

**4.1 — Attendance: self-clock-in records are invisible to the manager dashboards, and the "one clock-in per day" constraint doesn't fire.**
`ClockInOutTab.jsx:128-136` inserts `{ user_id, date: today, clock_in, ... }` — it never sets `shift_date`. The only migration that defines `shift_date` (`010_attendance_user_id.sql:10`) gives it no `DEFAULT`, and no trigger exists anywhere in `supabase/migrations/` (grepped for `TRIGGER`: zero matches) to backfill it. Meanwhile `HistoryTab.jsx:68-71` and `TodayTab.jsx:47-56` both filter/order by `shift_date`, and `TodayTab.jsx:43-44` sources its roster from the separate `staff` table, not `user_profiles`. Net effect: any owner/manager/kitchen_manager/restaurant_manager who clocks themselves in via the self-service flow produces a row that never appears in Today or History (`shift_date IS NULL` fails every `.eq`/`.gte`/`.lte('shift_date', …)` filter). Separately, the unique index `attendance_records_user_shift_date_key ON (user_id, shift_date)` (`010_attendance_user_id.sql:16-18`) cannot prevent a duplicate same-day clock-in through this path, because Postgres treats every `NULL` in a unique index as distinct from every other `NULL` — the app-level "already clocked in?" check (`ClockInOutTab.jsx:86-97`) is the *only* guard, and it is a read-then-insert race, not atomic.
Compounding factor: `today` is computed as `new Date().toISOString().split('T')[0]` (`ClockInOutTab.jsx:36`) — a UTC calendar date. Malawi is UTC+2, so a clock-in in the last two hours of the local day is dated tomorrow.

**4.2 — Stock quantity races (unchanged from prior audit, re-confirmed).**
Three call sites do `SELECT quantity → newQty = old ± delta (in JS) → UPDATE`, with no row lock, no transaction, no atomic increment: `InventoryUI.jsx:90-102` (`shiftStock`, used by requisition fulfilment and deliveries), `EventDetailTab.jsx:64-118` (`handleStockOnStatusChange`, runs on event confirm/cancel), `EventStockSection.jsx:94-107,145-162` (`handleAdd`, `handleClearance`). Two concurrent writers touching the same `stock_item_id` — a bar order and an event confirmation, say — will silently lose one update.

**4.3 — `event_stock_allocations.returned_qty` is computed, displayed, but never persisted.**
`EventStockSection.jsx:147` computes `returned = Math.max(0, allocated_qty - consumed)` during clearance and correctly adds it back to `current_stock` (`:152-154`), but the follow-up `.update()` at `:157-161` only writes `consumed_qty` and `status` — `returned_qty` is never saved (the column doesn't exist per §2 rule 6). The UI reads `a.returned_qty` at `:206` and `:319` expecting a persisted value; it will always render blank/`undefined`. The stock movement itself is correct — the audit trail of how much was returned is not.

**4.4 — No server-side floor on payment amounts.**
`event_payments.amount` and `event_bill_items.amount` have no `CHECK` constraint in any migration (grepped every `CHECK`/`check` across `supabase/migrations/`: none reference `amount`). The only guard is the HTML `min="0.01"` on the form input (`EventPaymentsSection.jsx:186`). Because every write goes through the service-role client (§2 rule 1/4), anyone calling the DB directly — which the shipped key allows — can insert a negative "payment" and move `balanceDue = max(0, billTotal − totalPaid)` in their favor with no server-side check catching it.

**4.5 — Documentation vs. code disagree on when requisition stock is deducted.**
`CLAUDE.md:14` states "Stock deducted on requisition APPROVAL only, not on submission." The code deducts on **Fulfil**, a distinct step after Approve (`RequisitionsTab.jsx`: `handleApprove` at `:61-70` only sets `status: 'approved'`; `handleFulfil` at `:72-91` is what calls `shiftStock`). Not a live bug — `SYSTEM_AUDIT.md:451` agrees with the code — but CLAUDE.md is the wrong source of truth here and would mislead anyone building against it.

---

## 5. THE ONE-SCREEN SUMMARY

```
Build: woodlands-beta.vercel.app, Supabase gttsjmxltrxxfplqjans, repo akotecha47/woodlands
Standard compliance: FAILS #1 (service_role key shipped to every browser via
  src/lib/supabaseAdmin.js + VITE_SUPABASE_SERVICE_ROLE_KEY), #4 (same — anon
  key is not the only key client-side), #6 (schema drift: 4 tables + 1 column
  used by code, created by no migration), #7 (no staging environment exists —
  one Supabase project, one git branch, everything tests against prod)
Blocking: rotate the service_role key and remove it from the bundle; move all
  privileged reads/writes behind auth+role-checked Edge Functions before any
  real staff, guest, or payment data goes into this system
Next action: rotate the Supabase service_role key now (Supabase dashboard),
  delete VITE_SUPABASE_SERVICE_ROLE_KEY from .env.local and Vercel — see §2
  rule 1. This breaks the app immediately; that is expected and correct.
```

---

*Zero commits since the prior audit (2026-07-04) — this report re-verifies the same findings against current source rather than assuming they still hold, and adds §4.1's sharper read of the attendance split and §4.3's `returned_qty` gap.*
