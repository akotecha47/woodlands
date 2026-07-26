# CLAUDE.md — Woodlands Lodge Management System

## Project
- **Client:** Woodlands Lodge, Lilongwe, Malawi
- **Stack:** React 19 + Vite + Tailwind 4 + Supabase + Vercel
- **Repo:** github.com/akotecha47/woodlands
- **Live:** woodlands-beta.vercel.app
- **Supabase URL:** https://gttsjmxltrxxfplqjans.supabase.co

## Authoritative doctrine
Every session obeys **STREAMLINE_BUILD_STANDARD.md v1.5** (in repo root). Read it before making any technical decision.

## Current state
Read **WOODLANDS_STATE.md** (in repo root) at the start of any substantive session. It is the source of truth for what's live, what's blocking, and what's next.

## Followups log
Small deferred items live in **WOODLANDS_FOLLOWUPS.md** (in repo root). Add to it when a sprint consciously defers something rather than losing it in a commit message.

## Audits
- `WOODLANDS_AUDIT.md` — 4 July 2026 (first audit, pre-dates Standard v1.0)
- `WOODLANDS_AUDIT_2.md` — 26 July 2026 (second audit, against Standard v1.5) — **current audit of record**

Both are on disk. The newer one supersedes the older for finding status. Neither is deleted — they sit side-by-side as the diff record.

## Functional spec (not an audit)
`WOODLANDS_FUNCTIONAL_SPEC.md` — module-by-module inventory of screens, fields, and business rules. Written 31 May 2026, renamed 26 July from `SYSTEM_AUDIT.md`. Its Route Access Control table is stale (lists roles that don't exist); refresh at Sprint E.

## Modules (6)
- **Inventory** — stock items, deliveries, requisitions, transfers, adjustments
- **Attendance** — manual GPS-flagged clock in/out, breaks, shift settings (no biometrics this phase)
- **Events** — enquiry → confirmed → in_progress → completed/cancelled; BEO, bill, payments, stock allocation
- **Table Bookings** — reservations with capacity + no-show/conflict checks
- **Farmers Market** — stall holders, monthly market day, public QR check-in, fees, ID cards
- **Admin** — users, staff, departments, stock items

## Roles (4) — authoritative in `src/lib/roles.js`
`owner`, `manager`, `kitchen_manager`, `restaurant_manager`

The `staff` table (62 rows) is disjoint from login roles — it's the roster the manager-facing Attendance screens operate on. No FK to `user_profiles`.

## Standing rules
- **Department references are plain text**, never FK to a `departments` table.
- **Stock deduction triggers:**
  - Requisitions deduct on **Fulfil** (a distinct step *after* Approve). Not on Approve, not on submission.
  - Event allocations deduct on **Confirm**.
- **No biometrics this phase** — manual clock in/out only.
- **Do not re-read all files on session start** — read STATE and only the files the session needs.

## Superseded files — DO NOT FOLLOW
- `src/lib/standards.md` — pre-dates Standard v1.5 and mandates `supabaseAdmin` in browser code, which the Standard now forbids. Being rewritten in Sprint B. Treat as archival.

## Environment
- Real client data (62-row staff roster) is already live per migration `016`. Standard §2.7 applies — the project is no longer free to break. Snapshot before any schema or policy change.
- Ownership: to be transferred to Dhiren's own accounts at handover per Standard §6.
