# CLAUDE.md — Woodlands Lodge Management System

## Project
- **Client:** Woodlands Lodge, Lilongwe, Malawi
- **Stack:** React 19 + Vite + Tailwind 4 + Supabase + Vercel
- **Repo:** github.com/akotecha47/woodlands
- **Live:** woodlands-beta.vercel.app
- **Supabase URL:** https://gttsjmxltrxxfplqjans.supabase.co

## Authoritative doctrine
Every session obeys **STREAMLINE_BUILD_STANDARD.md v1.5** (in repo root). Read it before making any technical decision.

## The current goal
The build is in **Phase 2**: turning the hardened six-module system into the full system Dhiren asked for at the 27 July feedback meeting. The target is a **fully functioning app on placeholder data by the week of 11 August** — every screen works and is populated. Real data (bar stocktake, department stock lists, staff reconciliation, menus, real stallholder details) is **out of scope** until Dhiren verifies the modules work.

Read these three, in this order, to know what to build:
1. **WOODLANDS_STATE.md** — current state, what's live, what's blocking, what's next. Source of truth at the start of any session.
2. **WOODLANDS_FUNCTIONAL_SPEC.md** — the **end-goal system**, module by module, with [DONE]/[BUG]/[NEW]/[VERIFY] markers. This is what "finished" looks like.
3. **WOODLANDS_MEETING_FEEDBACK_2026-07-27.md** — Dhiren's own words; the source the spec is built from.

## The gate — Session A done, Session B closes it
**Migration reconciliation is Priority 1 and blocks the Phase 2 schema. Session A executed 9 August; the gate is NOT yet closed.** Session A repaired history to 001–035 minus 010/012/017, resolved the duplicate 008, migrated the three ghost tables (031/032/033), created the missing attendance indexes (034), moved the GPS columns into 035, fixed the 021 rebuild-order bug, and documented the 010 FK to live. Real data unchanged. **Session B (012 auth) is the remaining gate step and must run before new schema:** drop the blanket `ALL/authenticated/USING(true)` policy still live on `attendance_records`, reconcile 017's policy drift + the unfiled "staff can… own" policies, clean seed.sql's flagged block, decide the two 010 default divergences, then `repair 010/012/017`, then `db push --dry-run` + staging rebuild = gate closed. **Do NOT run `db push` until Session B has reconciled 010/012/017** — a push now would execute 012 and rewrite live attendance RLS. Full detail in `WOODLANDS_FOLLOWUPS.md`; summary in STATE.

## Followups log
Open items live in **WOODLANDS_FOLLOWUPS.md** (repo root). Add to it when a sprint consciously defers something.

## Audits — historical snapshots, NOT current state
- `WOODLANDS_AUDIT.md` — 4 July 2026
- `WOODLANDS_AUDIT_2.md` — 26 July 2026

Both are **dated read-only snapshots**, kept side-by-side as the diff record and as provenance for a future AUDIT_3. **Do not read them as the current state of the system** — for that, use STATE and FUNCTIONAL_SPEC. The next audit supersedes; the old ones are never rewritten.

## Modules
**Six built and hardened:** Inventory, Attendance, Events, Table Bookings, Farmers Market, Admin.

**Phase 2 additions (see FUNCTIONAL_SPEC):** two-tier inventory (main store → per-department sub-stores), bar par levels + end-of-day refill cycle, consumption attribution (what/where/who + rooms + 1-year laundry), expanded role model, QR staff attendance, Farmers Market 3-month attendance history + waiting-list forfeiture + 3-level product taxonomy + fee schedule, and two Events UX fixes (payments editable, revenue display).

## Roles
**Current (authoritative in `src/lib/roles.js`):** `owner`, `manager`, `kitchen_manager`, `restaurant_manager`.

**Target (Phase 2, PROPOSED — confirm before the role migration runs):** `owner`, `admin` (front desk), `department_head` (scoped by `department`, multiple per department), `hr`. One scoped role, not a role per department. See FUNCTIONAL_SPEC §1 for the collapse mapping.

The `staff` table (62 rows) is disjoint from login roles — the roster the manager-facing Attendance screens operate on. No FK to `user_profiles`.

## Standing rules
- **Department references are plain text**, never FK to a `departments` table.
- **Stock deduction triggers:**
  - Requisitions deduct on **Fulfil** (a distinct step *after* Approve). Not on Approve, not on submission.
  - Event allocations deduct on **Confirm**.
- **QR staff check-in supersedes "manual clock in/out only."** QR is not biometrics, so no biometrics rule is broken — but attendance is no longer manual-only. Still no biometrics this phase.
- **Placeholder data is fine, blank screens are not.** Every new table ships with placeholder seed as part of its build step.
- **Do not re-read all files on session start** — read STATE, then only the files the session needs.
- **Verify against live, don't trust the doc, for anything marked [VERIFY]** in FUNCTIONAL_SPEC (movement_type CHECK, GPS clock-in, stall regex, Add-User role branching).

## Superseded files — DO NOT FOLLOW
- Nothing currently. (`src/lib/standards.md` was rewritten in Sprint B and is now current — it mandates the anon client + Edge Functions and carries the §4 verification lessons. Follow it.)

## Environment
- Real client data (62-row staff roster, 305 stallholders, 559 bar items) is live. Standard §2.7 applies — snapshot before any schema or policy change.
- All migrations from 021 on applied by hand via the SQL Editor until the reconciliation gate closes.
- Ownership transfers to Dhiren's own accounts at handover per Standard §6.
