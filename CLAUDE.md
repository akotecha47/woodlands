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
The build is in **Phase 2**: turning the hardened six-module system into the full system Dhiren asked for at the 27 July feedback meeting. The old target — a fully functioning app on placeholder data by the week of 11 August — **was met; every Phase 2 build feature exists.**

**The live target is the full-system walkthrough with Dhiren, Mon 31 Aug / Tue 1 Sep 2026**, with a feedback call on 28 August. The work between here and there is **remediation and curation, not construction** — tracked block by block in `WOODLANDS_FIX_PLAN.md`. Real data (bar stocktake, department stock lists, staff reconciliation, menus, real stallholder details) stays **out of scope** until Dhiren verifies the modules work.

Read these three, in this order, to know what to build:
1. **WOODLANDS_STATE.md** — current state, what's live, what's blocking, what's next. Source of truth at the start of any session.
2. **WOODLANDS_FUNCTIONAL_SPEC.md** — the **end-goal system**, module by module, with [DONE]/[BUG]/[NEW]/[VERIFY] markers. This is what "finished" looks like.
3. **WOODLANDS_MEETING_FEEDBACK_2026-07-27.md** — Dhiren's own words; the source the spec is built from.

**Cross-check STATE against `WOODLANDS_FIX_PLAN.md` before trusting it.** STATE is updated at the end of a session that changed state; the FIX_PLAN tracker is updated *as blocks land* and is therefore usually the fresher of the two. A 20 August staleness scan found STATE lagging three shipped commits while FIX_PLAN was current. If the two disagree, believe FIX_PLAN and fix STATE.

## The gate — migration history reconciled; the rebuild proof is a standing discipline
**History is `001`–`063`, complete and recorded, no gaps.** The reconciliation that used to be Priority 1 (Sessions A and B, 9–10 August) is long closed: duplicate 008 resolved, the three ghost tables migrated (031/032/033), attendance indexes (034) and GPS columns (035) filed, the 021 rebuild-order bug fixed, and the `attendance_records` RLS hole closed by `036` (7 canonical policies, no blanket `USING(true)` for `authenticated`, no DELETE policy).

**`db push` is no longer the standing hazard it was** — history is fully recorded, so a push has nothing to replay. The old warning about 009 destroying stallholders and 016 duplicating staff applied to a push against the *unrepaired* history; that condition is gone.

**The live rule is Standard §2.6, and it is a STANDING PER-MIGRATION DISCIPLINE, not a one-off task.** A rebuild proof is a claim about a file range on a date, never a permanent property of the project. It expires the moment a new migration is written.

- **The proof owed is always: prove the current range BEFORE writing the next migration.**
- **Ten runs have been done.** Docker is not installed here, so every run uses a throwaway Supabase project pushed via `--db-url` on the **session pooler** (`db.<ref>` has been IPv6-unresolvable for five runs running), never by re-linking, with the local link verified as production before *and* after, and the throwaway deleted via the Management API and confirmed gone.
- **Run 10 (20 August) proved `001`–`062` — PASSED, no new finding.** `063` was then written, applied and recorded on that proven base.
- **⚠ `063` is the proof now owed, before any `064` is written.** Code-only and data-op changes do not touch this clock.

Run 10's full record is in `WOODLANDS_FIX_PLAN.md` (Block 3 section); runs 1–9 and the standing residuals are in `WOODLANDS_FOLLOWUPS.md`.

## Followups log
Open items live in **WOODLANDS_FOLLOWUPS.md** (repo root). Add to it when a sprint consciously defers something.

## Audits — historical snapshots, NOT current state
- `WOODLANDS_AUDIT.md` — 4 July 2026
- `WOODLANDS_AUDIT_2.md` — 26 July 2026
- **`WOODLANDS_AUDIT_3.md` — 18 August 2026. The audit of record.** Read-only code audit of every file under `src/`, both Edge Functions, targeted migrations, plus a measured read-only dump of production. It is the source of the `C-nn` findings that the whole of `WOODLANDS_FIX_PLAN.md` is built on — if you are working a `C-nn`, its detail is here.

All three are **dated read-only snapshots**, kept side-by-side as the diff record. **Do not read them as the current state of the system** — for that, use STATE (cross-checked against FIX_PLAN) and FUNCTIONAL_SPEC. A later audit supersedes an earlier one for finding status; the old ones are never rewritten.

## Modules
**Six built and hardened:** Inventory, Attendance, Events, Table Bookings, Farmers Market, Admin.

**Phase 2 additions (see FUNCTIONAL_SPEC):** two-tier inventory (main store → per-department sub-stores), bar par levels + end-of-day refill cycle, consumption attribution (what/where/who + rooms + 1-year laundry), expanded role model, ~~QR staff attendance~~ (**dropped — see Standing rules**), Farmers Market 3-month attendance history + waiting-list forfeiture + a **per-holder approved-products list** + fee schedule, and Events payments editable by reversing entry.

**Two Phase 2 features were subsequently REMOVED and must not be described as live:**
- ~~**Events revenue display**~~ — the three toggleable readings and the provisional note were cut in Block 3 (20 August). The client asked to *record payments*, not to track revenue. The Events-List tile is now **"Payments Received · This Month"**. `src/lib/revenue.js` is kept as a library with its tests; no revenue surface exists.
- ~~**Farmers Market 3-level product taxonomy**~~ — `fm_categories` / `fm_product_types` / `fm_items` / `fm_approved_items` / `fm_holders.category_id` / `fm_holders.stall_type` were all **dropped in `063`** (20 August). The model is now one free-text `fm_holder_products` row per approved product per holder.

## Roles
**FOUR roles. Authoritative in `src/lib/roles.js` (`APP_ROLES`), enforced in the database by `public.current_app_role()` (migrations 037–044):**

`owner` · `admin` (front desk) · `department_head` (scoped by `user_profiles.department`, several per department) · `hr`

**This is BUILT and proven live, not proposed.** The collapse ran 11 August: `manager` → `admin`, `kitchen_manager` + `restaurant_manager` → a single scoped `department_head`, `hr` new. See FUNCTIONAL_SPEC §1 for the mapping.

**⚠ The old set (`owner` / `manager` / `kitchen_manager` / `restaurant_manager`) is a live trap.** A policy or gate written from it compiles, passes review, and **silently excludes every `admin`** — the whole management tier. That failure has already happened in this project (AUDIT_3 `C-16`, in `src/lib/standards.md`; this file carried the same defect until 20 August). **Gate on the constants in `roles.js`, never on raw strings:** `MANAGE_ROLES` (owner + admin) is the default for a module write, `AT_MANAGE_ROLES` adds `hr` for attendance, `INVENTORY_VIEW_ROLES` adds `department_head` for read. `supabase/functions/create-user/index.ts` carries a hand-synced copy of the role list — change both together.

**4 roles ≠ 8 accounts.** There are **8 `user_profiles` rows, all active** (5 of them `department_head`, one per department, plus owner, admin and hr). The role count is four; the user count is eight. Do not conflate them.

The `staff` table (62 rows) is disjoint from login roles — the roster the manager-facing Attendance screens operate on. No FK to `user_profiles`.

## Standing rules
- **Department references are plain text**, never FK to a `departments` table.
- **Stock deduction triggers:**
  - Requisitions deduct on **Fulfil** (a distinct step *after* Approve). Not on Approve, not on submission.
  - Event allocations deduct on **Confirm**.
- **Automated attendance capture is PARKED. QR is not being built.** QR staff check-in was explored and dropped — the design arc and the reasons are in `WOODLANDS_HISTORY.md` (19 August); do not restate or relitigate them here.
  - The lodge **already owns an FA03H face/fingerprint attendance device.**
  - **The recommendation Streamline puts to Dhiren from 28 August:** do **not** build attendance capture into this system. Invest in a proper networked fingerprint unit with its own PC software, run by a manager.
  - Whether to instead import the FA03H's USB export is **still open and will be asked at that meeting** — but the leaning is to recommend the dedicated device and keep this system out of biometric capture entirely.
  - **PARKED means parked, not deleted.** The built Attendance module (Today / History / Settings) and manual clock-in **stay in the codebase**. Manual marking by front desk / ops is the working fallback. **Do not delete the attendance module or its screens.** Whether anything is hidden for the walkthrough is a presentation decision, decided separately — never a code deletion.
- **No biometrics in this system.** It performs **no biometric capture, storage, or matching of its own.** If attendance data is ever taken in, what enters is the **already-matched result** from a device the client owns and operates — a staff identifier and a timestamp. **No template, image, or comparison enters this codebase.** This restates the rule for the FA03H path; the older QR-era reasoning ("QR is not biometrics") no longer applies and must not be inherited.
- **Placeholder data is fine, blank screens are not.** Every new table ships with placeholder seed as part of its build step.
- **Do not re-read all files on session start** — read STATE, then only the files the session needs.
- **Verify against live, don't trust the doc, for anything marked [VERIFY]** in FUNCTIONAL_SPEC (movement_type CHECK, GPS clock-in, stall regex, Add-User role branching).

## Superseded files — DO NOT FOLLOW
- Nothing currently. (`src/lib/standards.md` was rewritten in Sprint B and is now current — it mandates the anon client + Edge Functions and carries the §4 verification lessons. Follow it.)

## Environment
- Real client data is live: 62-row staff roster, **311 Farmers Market holders (305 real + 6 `Z00n` placeholders to purge)**, 559 bar items, 8 user accounts. Standard §2.7 applies — snapshot before any schema or policy change.
- **Apply SQL through `scripts/apply-sql.ps1`, never by hand and never with a bare `Get-Content` one-liner.** Docker is unavailable here, so the helper POSTs to the Supabase Management API query endpoint; it reads files as **UTF-8** and refuses text still containing `U+00C3` / `U+00E2`. PowerShell 5.1's `Get-Content` decodes UTF-8 as Windows-1252, which silently destroyed every box-drawing character and em-dash in migration `059` on 17 August and made `md5(prosrc)` unmatchable forever. Tooling fixed and the damage healed by `scripts/data-ops/007_encoding_heal.sql`. Use `-ReadOnly` for all diagnosis.
- **The Management API endpoint connects as `postgres` with `rolbypassrls = true`.** A statement succeeding through it proves **nothing** about what `anon`, `authenticated` or a `department_head` may do. Prove access as the role — `SET LOCAL ROLE` with a real `sub` claim, rolled back.
- Ownership transfers to Dhiren's own accounts at handover per Standard §6.
