# WOODLANDS — STATE

*Current state, live commitments, next action. Updated at the end of every session that changed state.*

**Last updated: 26 July 2026**
**Governing doctrine:** STREAMLINE_BUILD_STANDARD.md v1.5, STREAMLINE_MATERIALS.md v2.4, STREAMLINE_SESSION.md v2.0.

---

## WHAT IT IS

Lodge in Lilongwe. Family relationship — Dhiren is Aman's uncle.

- **Owner:** Dhiren (Aman's uncle)
- **Ops manager:** Rose Ngalawango
- **HR:** Martin Lisilira
- **Staff:** 62 in staff table (real names, employee numbers — real client PII, already committed to git via migration `016`)
- **Modules built (6):** Inventory, Events, Farmers Market, Table Bookings, Attendance, Admin
- **Roles (4) — authoritative in `src/lib/roles.js`:** owner, manager, kitchen_manager, restaurant_manager
- **System logins:** 4

---

## COMMERCIAL SHAPE — GIFT BUILD

**Aman is not charging Dhiren.** Uncle. Decided.

- Build delivered no different from a paying client — full working system, security compliance, professional handover.
- The exchange for Streamline: a delivered testimonial, and referrals to Dhiren's contacts.
- Woodlands functions as: (a) proof Streamline can deliver a real hospitality system, (b) a hospitality template that can be re-used commercially for a future paying lodge client, (c) a relationship-based reference source.
- **Internal-only reference value:** a paid-client version of this scope (6 modules, 4 roles, 62 staff, real operational scope) would price under the Materials methodology at approximately MWK 6–9M. Knowing this shapes how much polish time is warranted — full professional delivery, not infinite polish.

---

## STAGE

**5 — HARDEN.** Sprint B complete (26 July 2026). Sprint C is the next scheduled work.

---

## STACK

- React + Vite + Tailwind + Supabase + Vercel
- Supabase ref: `gttsjmxltrxxfplqjans`
- Repo: `akotecha47/woodlands`
- Live: `woodlands-beta.vercel.app`
- Auth: Supabase Auth + `user_profiles` table (role as plain text, department as plain text)

---

## COMPLIANCE VS STANDARD (v1.5)

Per WOODLANDS_AUDIT_2.md (26 July 2026):

**Still open:** the service-key findings (§2.1, §2.1b, §2.4) — Sprint B. Money/quantity guards (§3 DoD 6) — Sprint C. Schema reconciliation (§2.6) — Sprint D. `/inventory` route mismatch (§2.5a) — Sprint E.

- **7 CRITICAL/HIGH from AUDIT (4 July) — all still open.** Zero source commits between audits.
- **7 new findings** in AUDIT_2. Highlights: service_role key also in git history via `scripts/seed-attendance.mjs:14`; `events`/`event_payments`/`table_bookings` have RLS on with zero policies (fail-closed today, but a prerequisite dependency for stripping the service key); `staff` table writable by any authenticated user via a stale `004` blanket policy; `is_active` never enforced (deactivation is cosmetic); Inventory module unreachable due to `/inventory` vs `/` route key mismatch; stock clamp + full-quantity return creates phantom inventory on cancel; `src/lib/standards.md` mandates the anti-pattern that produced the service-key spread.

**Updated post-Sprint A (26 July 2026):**
- Sprint A closed: RLS policies written and verified against live DB (migration 021); create-user Edge Function authenticated + CORS pinned; is_active enforced in RouteGuard, Login, and SQL via current_app_role() SECURITY DEFINER function.
- AUDIT_2 §2.2 corrections (source vs live-DB reality): events, event_payments and user_profiles already had partial policies; table_bookings was the only genuinely-zero case; event_checklists, shift_settings, tables had unreachable policies due to missing GRANTs (now granted).
- **New finding, LIVE PRODUCTION BUG:** `fm_market_days` table does not exist in the DB at all. MarketDayTab.jsx reads/writes it on every render. Farmers Market monthly notes are broken in production. Sprint D must CREATE this table (not just its policies).

**Updated post-Sprint B (26 July 2026):**
- **The service role key is out of the browser and rotated.** AUDIT_2 §2.1, §2.1b and §2.4 (all CRITICAL) are closed. Verified on a clean rebuild, not assumed from source: the old key literal returns **0 matches in `dist/`** and **0 files anywhere in the working tree**; the bundle contains exactly **one JWT, `role=anon`**; zero occurrences of `service_role` or `sb_secret`. `src/lib/supabaseAdmin.js` is deleted, `VITE_SUPABASE_SERVICE_ROLE_KEY` is gone from `.env.local`, and the hardcoded literal is stripped from `scripts/seed-attendance.mjs` (now throws if `SUPABASE_SERVICE_KEY` is unset). Key rotated via the new API keys route, so the anon key and live sessions were unaffected.
- **All 36 files migrated off `supabaseAdmin`.** 35 to the anon client, plus CheckIn.jsx to a new `public-checkin` Edge Function. Access control now genuinely lives in RLS rather than in JSX.
- **`src/lib/standards.md` rewritten** (AUDIT_2 §4.3, the root cause). It now mandates the anon client and Edge Functions and explicitly forbids `supabaseAdmin`, `VITE_SUPABASE_SERVICE_ROLE_KEY` and any `service_role` usage in browser bundles, pointing at Standard §2.1/§2.2/§2.4/§2.6.
- **Migration 022 was far larger than the sprint brief anticipated.** It expected occasional policy patching; a live query found **14 tables** unusable by the anon client, 11 of them missing `authenticated` DML grants entirely. A grant is checked *before* a policy, so those tables had correct-looking SELECT policies that could never run — invisible while the browser held a service-role client. Events, Farmers Market and Inventory would have failed on every read and write.
- **Zero `anon` policies exist in this database, deliberately.** Public `/checkin` reaches `fm_holders`/`fm_visits` only through the Edge Function, which keeps holder PII off a public read policy.
- **New finding, pre-existing since 28 May:** Event Add Payment has never worked. `event_payments.received_by` FKs to `auth.users(id)` while the dropdown populates from `staff`. Not a Sprint B regression (confirmed by `git blame`) — constraints are enforced regardless of which key issues the insert. Sprint C.

See `WOODLANDS_AUDIT_2.md` for full findings and file/line references.

Standing rules from CLAUDE.md (rewritten 26 July to match code):
- All department references are plain text, never FK to a departments table
- Requisitions deduct on **Fulfil**, event allocations deduct on **Confirm** (not on approval or submission)
- No biometrics this phase — manual clock in/out only

---

## LIVE COMMITMENTS

- **Full working system delivered no different from a paying client.**
- **Handover-track** — meeting with Dhiren showing a proper working version of his system. Post-meeting: he decides if he wants to proceed to formal handover.
- **Testimonial + referrals** post-handover. Nothing specific discussed yet.
- **Restore point:** Supabase automatic backup, 26 July 2026 02:30:54 UTC — still the most recent known point. **No fresh manual backup was taken before Sprint B**; Aman's call, on the basis that backups live on Supabase rather than locally. That timestamp predates migrations 021 and 022, both of which are idempotent and in git and so replayable; data written after it is not covered. **Take a manual snapshot before Sprint C** — it touches money and quantity logic.

---

## REAL DATA STATUS — §2.7 APPLIES

**Real client data is already live.** Migration `016_staff_restructure.sql` seeded 62 real employee records (names, employee numbers, departments, hire dates) committed to git. Per Standard §2.7 the project is no longer free to break — snapshot before any schema or policy change; breaking changes go through a Supabase database branch or scheduled maintenance window.

Test users and test attendance rows also exist (`scripts/seed-attendance.mjs`) and must be purged before final go-live.

**Do not run `supabase db push` until migration history is repaired.** Remote history records only 001–007; 008–020 ran but were never recorded. A push would replay `016_staff_restructure.sql` and duplicate all 62 real staff rows. Migration `021` was applied via the Management API query endpoint instead. Repair is a Sprint D item — see WOODLANDS_FOLLOWUPS.md.

---

## OPEN QUALITY ITEMS / KNOWN GAPS

- Both audit files now tracked and committed (`WOODLANDS_AUDIT.md` 4 July, `WOODLANDS_AUDIT_2.md` 26 July). AUDIT_2 supersedes for finding status; both retained side-by-side for the diff.
- Full four-role walkthrough by role (owner / manager / kitchen_manager / restaurant_manager) + deactivated user — partially done during the Sprint B smoke test, which surfaced the Add Payment FK bug. Not yet a systematic pass; still TO CONFIRM.
- **Inventory module has had no runtime exercise at all.** All seven files were migrated to the anon client, but the module is unreachable (`ROUTE_ACCESS` keys `/inventory`, route is mounted at `/`). Its policies and grants are untested against a real session until the Sprint E route fix.
- `npm audit` returned malformed registry response during AUDIT_2 — dependency CVE status UNVERIFIED, re-run pending.

---

## SPRINT PLAN — being revised per AUDIT_2

**Original W1–W4 sequence (superseded):** strip service key → kill public signup → RLS rewrite → schema reconciliation.

**Revised sequence (Sprint A–F, per audit's dependency graph):**

- **Sprint A — Foundations. ✅ DONE 26 July 2026.** Commits `6b56bdd`, `8a22e1c`, `aabb620`. Migration `021_sprint_a_policies.sql` applied to the live DB and verified by `pg_policies` query; `create-user` Edge Function authenticated and redeployed; `is_active` enforced in RouteGuard and Login. Build clean. Additive only — nothing dropped except the stale `004` blanket policy on `staff`, which was in scope. Per-role login testing outstanding (Dhiren-facing, Sprint F).
- **Sprint B — Strip the service role key. ✅ DONE 26 July 2026.** Commits `d88387b` (standards.md rewrite), `e7b9df0` (CheckIn → `public-checkin` Edge Function), `516cd2a` (migration `022`, 14 tables), `6cb8e25`/`155461b`/`78300f0`/`ce1e06e`/`4cda9c4`/`e59c400` (35 files, six module commits), `22a3a89` (key rotation + cleanup). Verified by grep and JWT decode of a fresh `dist/`: zero service_role, one anon JWT. Migration `022` applied via SQL, not `db push`.
- **Sprint C — Money and quantity guards.** Fix stock clamp (fail-not-warn); persist deducted quantity; atomic stock operations; CHECK constraints on `amount` columns; attendance UTC date boundary + `shift_date` fix.
- **Sprint D — Schema reconciliation.** Ghost tables → migrations; `returned_qty` column; drop dead tables; renumber duplicate `008`; verify DB rebuildable from files alone.
- **Sprint E — Fit and finish.** `/inventory` route fix; delete dead `store_supervisor` gates; password reset flow; un-hardcode project URL; refresh WOODLANDS_FUNCTIONAL_SPEC.md route table.
- **Sprint F — Final audit + handover prep.** Fresh Fable audit (`WOODLANDS_AUDIT_3.md`); walk Standard §6 Pre-Handover Checklist; transfer Supabase/Vercel/GitHub ownership to Dhiren; one-page reference; testimonial + referrals ask; write `WOODLANDS_RETROSPECTIVE.md` (Standard §Stage 7).

---

## NEXT ACTION

**Two verification items before Sprint C:**

1. **Browser test of Admin → Add User.** The rotated secret is proved working for service-role PostgREST reads (`public-checkin` returns 200), but `auth.admin.createUser` against the `sb_secret_*` format is untested — `standards.md` §4 records that the auto-injected non-JWT key cannot do `auth.admin` calls. If Add User fails, put the JWT-format service-role key in the `SERVICE_ROLE_KEY` secret.
2. **Take a manual Supabase snapshot.** Sprint C touches money and quantity logic; the last known restore point predates Sprints A and B.

Then **Sprint C — money and quantity guards**, now carrying one extra item: Event Add Payment has never worked (`received_by` FK vs `staff` dropdown, see COMPLIANCE above).

---

## BLOCKING

Nothing external is blocking. Session time is the constraint.

---

## STATUS SUMMARY

Retrofit hardening informed by a second audit (26 July). Sprint plan resequenced because policies must precede the service-key strip, and because `src/lib/standards.md` must be rewritten in the same change as the key removal or the fix regresses.
