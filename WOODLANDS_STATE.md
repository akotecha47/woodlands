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

**5 — HARDEN.** Sprint plan being revised per AUDIT_2 findings before Sprint A begins.

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

- **7 CRITICAL/HIGH from AUDIT (4 July) — all still open.** Zero source commits between audits.
- **7 new findings** in AUDIT_2. Highlights: service_role key also in git history via `scripts/seed-attendance.mjs:14`; `events`/`event_payments`/`table_bookings` have RLS on with zero policies (fail-closed today, but a prerequisite dependency for stripping the service key); `staff` table writable by any authenticated user via a stale `004` blanket policy; `is_active` never enforced (deactivation is cosmetic); Inventory module unreachable due to `/inventory` vs `/` route key mismatch; stock clamp + full-quantity return creates phantom inventory on cancel; `src/lib/standards.md` mandates the anti-pattern that produced the service-key spread.

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

---

## REAL DATA STATUS — §2.7 APPLIES

**Real client data is already live.** Migration `016_staff_restructure.sql` seeded 62 real employee records (names, employee numbers, departments, hire dates) committed to git. Per Standard §2.7 the project is no longer free to break — snapshot before any schema or policy change; breaking changes go through a Supabase database branch or scheduled maintenance window.

Test users and test attendance rows also exist (`scripts/seed-attendance.mjs`) and must be purged before final go-live.

---

## OPEN QUALITY ITEMS / KNOWN GAPS

- Both audit files now tracked and committed (`WOODLANDS_AUDIT.md` 4 July, `WOODLANDS_AUDIT_2.md` 26 July). AUDIT_2 supersedes for finding status; both retained side-by-side for the diff.
- Full four-role walkthrough by role (owner / manager / kitchen_manager / restaurant_manager) — status TO CONFIRM after Sprint B.
- `npm audit` returned malformed registry response during AUDIT_2 — dependency CVE status UNVERIFIED, re-run pending.

---

## SPRINT PLAN — being revised per AUDIT_2

**Original W1–W4 sequence (superseded):** strip service key → kill public signup → RLS rewrite → schema reconciliation.

**Revised sequence (Sprint A–F, per audit's dependency graph):**

- **Sprint A — Foundations.** Write missing policies (`events`, `event_payments`, `table_bookings`, `user_profiles`, four ghost tables); drop stale `004` blanket policy on `staff`; authenticate `create-user` Edge Function; enforce `is_active` in RouteGuard. Additive only. Prerequisite for Sprint B.
- **Sprint B — Rewrite `src/lib/standards.md`, then strip the key.** Rewrite the superseded standards file first so future sessions don't regress. Migrate 36 files off `supabaseAdmin` (CheckIn.jsx first). Rotate service_role key. Strip hardcoded key from seed script. Verify by grep of fresh `dist/`.
- **Sprint C — Money and quantity guards.** Fix stock clamp (fail-not-warn); persist deducted quantity; atomic stock operations; CHECK constraints on `amount` columns; attendance UTC date boundary + `shift_date` fix.
- **Sprint D — Schema reconciliation.** Ghost tables → migrations; `returned_qty` column; drop dead tables; renumber duplicate `008`; verify DB rebuildable from files alone.
- **Sprint E — Fit and finish.** `/inventory` route fix; delete dead `store_supervisor` gates; password reset flow; un-hardcode project URL; refresh WOODLANDS_FUNCTIONAL_SPEC.md route table.
- **Sprint F — Final audit + handover prep.** Fresh Fable audit (`WOODLANDS_AUDIT_3.md`); walk Standard §6 Pre-Handover Checklist; transfer Supabase/Vercel/GitHub ownership to Dhiren; one-page reference; testimonial + referrals ask; write `WOODLANDS_RETROSPECTIVE.md` (Standard §Stage 7).

---

## NEXT ACTION

Pre-sprint cleanup in progress (this update is part of it). After cleanup commit lands: begin Sprint A.

---

## BLOCKING

Nothing external is blocking. Session time is the constraint.

---

## STATUS SUMMARY

Retrofit hardening informed by a second audit (26 July). Sprint plan resequenced because policies must precede the service-key strip, and because `src/lib/standards.md` must be rewritten in the same change as the key removal or the fix regresses.
