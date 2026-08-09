# WOODLANDS — ARTIFACTS

*Index of the Standard §5 artifact set plus Woodlands-specific docs, code, infrastructure, and client data. Where each lives, and current status.*

**Standard §5 defines:** Brief, Scope, Data Model, Pricing (paying only), CLAUDE.md, `{CLIENT}_AUDIT.md`, Followups log, Handover reference, `{CLIENT}_RETROSPECTIVE.md`.

---

## STATUS: retrofit build. Artifact set not created at Stage 1 — backfilled through July 2026.

| Artifact | Status | Location |
|---|---|---|
| **Brief** | Not created at Stage 1 | Skipped — not needed for retro-documentation |
| **Scope** | End-goal scope now lives in `WOODLANDS_FUNCTIONAL_SPEC.md` (target system) sourced from `WOODLANDS_MEETING_FEEDBACK_2026-07-27.md`. Standing rules in `CLAUDE.md`. | Spec + meeting doc + `CLAUDE.md` in repo |
| **Data Model** | Implicit in live Supabase schema. Migration files still don't fully reflect it — 3 ghost tables (`event_checklists`, `shift_settings`, `tables`) uncreatable from files. **Post-meeting Sprint D** to close. | Live DB is authoritative; reconciliation post-meeting |
| **Pricing** | N/A — gift build | — |
| **CLAUDE.md** | Rewritten 26 July 2026. Correct 4-role list, correct stock deduction triggers, pointers to Standard v1.5 / state / audits / followups. Flags superseded files. | `akotecha47/woodlands:CLAUDE.md` |
| **`WOODLANDS_AUDIT.md`** (4 July 2026) | Tracked and committed 26 July. Superseded for finding status by AUDIT_2 but retained for the diff. | Repo root |
| **`WOODLANDS_AUDIT_2.md`** (26 July 2026) | Fresh Fable 5 audit against Standard v1.5. Committed. Current audit of record. | Repo root |
| **Followups log** | `WOODLANDS_FOLLOWUPS.md` — comprehensive, sprint-organised, updated throughout 26 July. | Repo root |
| **Handover reference** | Not yet created. Target: pre-final-handover in August. | — |
| **Retrospective** | Not applicable yet — build not handed over. | — |

---

## WOODLANDS-SPECIFIC ARTIFACTS (project-scoped, not Standard §5)

| Artifact | Status | Location |
|---|---|---|
| **`WOODLANDS_STATE.md`** | Rewritten 9 August, end-goal aligned. Correct 4-role list, bar import + migrations to 030, transfers bug, post-meeting scope, handover target under review. | Repo root |
| **`WOODLANDS_HISTORY.md`** | Updated 9 August. Meeting write-up, bar import, transfers bug, two new exec decisions. | Repo root |
| **`WOODLANDS_FUNCTIONAL_SPEC.md`** | **Rewritten 9 August to the end-goal system** — every module at target state with [DONE]/[BUG]/[NEW]/[VERIFY] markers. The build reference Claude Code reads for what "finished" looks like. Supersedes the 31 May version. | Repo root |
| **`WOODLANDS_DEMO_PREP.md`** | Created — in repo, updated 27 July morning. Meeting walkthrough script, questions matrix, framing crib. | Repo root |
| **`WOODLANDS_MEETING_FEEDBACK_2026-07-27.md`** | Created 9 August. Organised capture of Dhiren's 27 July feedback — the second-phase scope. Twelve sections plus call-question list. | Project (repo on next commit) |

---

## CODE / INFRASTRUCTURE ARTIFACTS

- **Repo:** `akotecha47/woodlands` (GitHub, private)
- **Live deployment:** `woodlands-beta.vercel.app`
- **Supabase project:** ref `gttsjmxltrxxfplqjans` (Pro tier, 7-day scheduled backups only, no on-demand)
- **API key posture:** legacy JWT-based API keys disabled 26 July; project runs on `sb_publishable_g4EcLtu7…` (client) + `sb_secret_atywb…` (server, held in `SERVICE_ROLE_KEY` project secret only)
- **Edge Functions (2):**
  - `create-user` — authenticated (owner-only JWT check, allowlisted 4 roles, CORS pinned)
  - `public-checkin` — unauthenticated by design (`--no-verify-jwt`, uses server-side `SERVICE_ROLE_KEY` for holder lookup + visit write; keeps holder PII off any public read policy)
- **Migrations:** 001–030, all applied to live DB. Remote history table records only 001–007 — **`supabase db push` is disqualified** until reconciliation (post-meeting Priority 1). Every migration from 021 onward applied through Supabase SQL Editor or Management API by hand.
  - 021: Sprint A policies + `current_app_role()`
  - 022: 14 additional tables, policies + authenticated DML grants
  - 023: positive-amount CHECK constraints (event_payments, fm_payments, event_bill_items)
  - 024: `returned_qty` + `deducted_qty` on event_stock_allocations
  - 025: atomic stock RPCs (`apply_stock_delta`, `set_stock_quantity`)
  - 026: `fm_market_days` CREATE (the ghost table that didn't exist at all)
  - 027: `fm_visits.notes` ghost column
  - 028: `requisitions` reconciled with `008` intent (six-column drift)
  - 029: `fm_holders.products` text column for Feb 2026 register import
  - 030: widened `stock_movements.movement_type` to permit `opening_balance` (for the bar stock import)
- **Migration 014** (`fm_visits.checked_in_at` / `checked_out_at`) existed since May but had never run — applied 26 July evening as part of Sprint D compressed session.
- **`scripts/data-ops/`** — one-shot data-mutating scripts kept separate from `supabase/migrations/` because they must NOT replay on rebuild. Currently: `001` Farmers Market import (305 stallholders from Feb 2026 register), `002` bar stock reset + import (559 items across two bars), and the test-data purge/seed procedure.

---

## CLIENT DATA FILES (received 26 July 2026 — NOT in repo per segregation policy)

Real Woodlands operational data. Kept in Aman's Claude project context and local storage; never committed to `akotecha47/woodlands`. Only structured, analysed, mapped import SQL crosses into the repo.

| File | Content | Used for |
|---|---|---|
| `Stallholders_Database.xlsx` | 319 rows in FEB 2026 sheet — real Farmers Market register | 305 imported 26 July via `scripts/data-ops/` |
| `STAFF_SALARIES_AS_25_03_2026.xlsx` | 58 real staff across 10 departments as of March | Reconciliation with 62-row `staff` table — Martin, post-meeting |
| `STAFF_SHIFTS.xlsx` | Working days / off days / hours per staff member | Staff reconciliation source — Martin |
| `Bar_Stock.xlsx` | 276 items — Restaurant Bar | Imported 26–27 July via `scripts/data-ops/002` (names + SKUs; real quantities pending stocktake) |
| `Sports_Bar_Stock.xlsx` | 283 items — Sports Bar | Imported 26–27 July via `scripts/data-ops/002` (names + SKUs; real quantities pending stocktake) |
| `Kitchen_POS.pdf` | Kitchen menu / product catalogue | Menu item source — post-meeting decision on whether to parse |
| `RECEPTION_POS.pdf` | Reception menu / product catalogue | Same |
| `Attendance_list_farmers_market.xlsx` | Blank register template, no actual attendance data | Not currently useful — flag if operational use emerges |

---

## GAPS TO CLOSE

**Pre-meeting gaps — closed.** Meeting held 27 July; `WOODLANDS_DEMO_PREP.md` landed in repo. Feedback captured in `WOODLANDS_MEETING_FEEDBACK_2026-07-27.md`.

**Post-meeting (before final handover):**
- Migration history reconciliation — Priority 1
- Three ghost table CREATE migrations (`event_checklists`, `shift_settings`, `tables`) — closes Standard §2.6 rebuild test
- Handover reference doc (one page)
- Confirm Dhiren has Supabase, Vercel, GitHub accounts set up in his own name before the handover meeting (Standard §6 requires them provided, not requested at handover)
- AUDIT_3 — fresh Fable audit against a system with real data loaded
- `WOODLANDS_RETROSPECTIVE.md` post-handover per Standard Stage 7

---

## RETROSPECTIVE PLACEHOLDER

Post-handover, write `WOODLANDS_RETROSPECTIVE.md` per Standard Stage 7. Three questions:
1. What did this build teach us?
2. What should the Standard / Materials / Session doctrine now say that it didn't?
3. What is now templatable? (Especially: hospitality template — six-module lodge structure directly re-usable. Also: the Sprint A–F retrofit playbook, if other legacy builds need the same treatment.)

Candidates for doctrine-worthy lessons — carry across from `WOODLANDS_HISTORY.md`:
- The three verification methodology lessons already baked into `src/lib/standards.md` §4 — may deserve promotion to the Standard itself, not just per-project doctrine
- Ghost schema as a systemic symptom of broken migration history — argues for `db push` discipline being a Standard §2.6 explicit requirement, not implicit
- Reachability > module ownership when scoping fixes — could inform Standard §4 (Sprint scoping)
- Client data segregation policy — kept real Woodlands data out of the repo, worth codifying as a §5 add if a paying client version of this rule is needed
