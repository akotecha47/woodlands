# WOODLANDS — ARTIFACTS

*Index of the Standard §5 artifact set plus Woodlands-specific docs, code, infrastructure, and client data. Where each lives, and current status.*

**Standard §5 defines:** Brief, Scope, Data Model, Pricing (paying only), CLAUDE.md, `{CLIENT}_AUDIT.md`, Followups log, Handover reference, `{CLIENT}_RETROSPECTIVE.md`.

---

## STATUS: retrofit build. Artifact set not created at Stage 1 — backfilled through July 2026.

| Artifact | Status | Location |
|---|---|---|
| **Brief** | Not created at Stage 1 | Skipped — not needed for retro-documentation |
| **Scope** | End-goal scope now lives in `WOODLANDS_FUNCTIONAL_SPEC.md` (target system) sourced from `WOODLANDS_MEETING_FEEDBACK_2026-07-27.md`. Standing rules in `CLAUDE.md`. | Spec + meeting doc + `CLAUDE.md` in repo |
| **Data Model** | ✅ **Reconciled.** The 3 ghost tables (`event_checklists`, `shift_settings`, `tables`) got real CREATE migrations (`031`–`033`) in Session A, 9 August. Migration files now reproduce the schema, **proven by rebuild-and-diff — run 10 covered `001`–`062`** (20 August). `063` is the proof owed before any `064`. | Migration files are authoritative; live DB verified against them |
| **Pricing** | N/A — gift build | — |
| **CLAUDE.md** | Rewritten 26 July 2026; **role list corrected 20 August.** It had carried the **dead** set (`owner`/`manager`/`kitchen_manager`/`restaurant_manager`) as “authoritative” ever since the 11 August collapse — the same C-16 trap AUDIT_3 caught in `standards.md`. Now the live four (`owner`/`admin`/`department_head`/`hr`), reconciled to `roles.js`. Also corrected: the gate section, the apply-SQL path, the audit list. | `akotecha47/woodlands:CLAUDE.md` |
| **`WOODLANDS_AUDIT.md`** (4 July 2026) | Tracked and committed 26 July. Superseded for finding status by AUDIT_2 but retained for the diff. | Repo root |
| **`WOODLANDS_AUDIT_2.md`** (26 July 2026) | Fresh Fable 5 audit against Standard v1.5. Committed. **Superseded as the audit of record by AUDIT_3**; retained for the diff. | Repo root |
| **`WOODLANDS_AUDIT_3.md`** (18 August 2026) | ✅ **The audit of record.** Read-only code audit — every file under `src/`, both Edge Functions, targeted migrations, plus a measured read-only dump of production. **Source of the `C-nn` findings that `WOODLANDS_FIX_PLAN.md` is built on.** | Repo root |
| **Followups log** | `WOODLANDS_FOLLOWUPS.md` — comprehensive, sprint-organised, updated throughout 26 July. | Repo root |
| **Handover reference** | Not yet created. Target: pre-final-handover in August. | — |
| **Retrospective** | Not applicable yet — build not handed over. | — |

---

## WOODLANDS-SPECIFIC ARTIFACTS (project-scoped, not Standard §5)

| Artifact | Status | Location |
|---|---|---|
| **`WOODLANDS_STATE.md`** | **Rewritten 20 August** — it had drifted three shipped commits behind. Now: Blocks 1–3 and `063` all shipped, migrations `001`–`063`, 8 users / 4 roles, Events revenue removed, FM taxonomy retired. **Cross-check against FIX_PLAN, which is updated as blocks land.** | Repo root |
| **`WOODLANDS_FIX_PLAN.md`** | **Created 19 August.** The single merged remediation tracker — Aman's browser pass (`U-nn`) and AUDIT_3's code audit (`C-nn`) worked as one queue, plus the decisions ledger (`D-n`). **The freshest working doc; the practical source of truth for what is and is not done.** | Repo root |
| **`WOODLANDS_CLIENT_INPUTS.md`** | **Created 19 August.** Every dependency on a person rather than on code, in three states (OPEN / KNOWN / SURFACED). The sheet taken into a client call. | Repo root |
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
- **Migrations:** `001`–`063`, all applied to the live DB. Remote history records a clean **`001`–`063`, 63 rows, no gaps** (measured 20 August 2026); `db push --dry-run` reports "Remote database is up to date." **Ten §2.6 rebuild-proof runs have been done; run 10 (20 August) proved `001`–`062`, and `063` is the proof owed before any `064`** — the proof is a standing per-migration discipline, not a one-off. See `WOODLANDS_STATE.md` § "MIGRATIONS AND THE §2.6 REBUILD-PROOF DISCIPLINE". Migrations `021` onward are applied per-file through **`scripts/apply-sql.ps1`** (UTF-8 read + mojibake refusal — never a bare `Get-Content`, which corrupted `059` on 17 August); history is recorded via `migration repair`, never `db push`.

  **Phase 2 — later migrations (`058`–`063`):** `058` Movement Ledger + `movement_type` `_v4` · `059` bar par levels + end-of-day count/refill cycle · `060` rooms + `v_stock_consumption` + `movement_type` `_v5` · `061` Farmers Market waiting list, forfeiture, fee schedule, `v_fm_attendance` · `062` event payment reversals · **`063` FM products redesign** — `fm_holder_products`, per-item change fee, and the retirement of the `061` taxonomy (`fm_categories` / `fm_product_types` / `fm_items` / `fm_approved_items` / `category_id` / `stall_type` all dropped).

  **Phase 2 — two-tier inventory (`051`–`057`, 13–14 August 2026):**
  - `051`: `location` / `sub_location` on `current_stock` + generated `tier`, keyed `UNIQUE NULLS NOT DISTINCT (stock_item_id, location, sub_location)`, per-tier `reorder_level`
  - `052`: `apply_stock_delta` / `set_stock_quantity` made location-aware (old overloads dropped, grants re-set)
  - `053`: main store seeded — 559 rows, flat placeholder 100, store reorder 4× catalogue
  - `054`: `trg_current_stock_validate_location` — rejects any location that is not `'Main Store'` or a live `departments` name; forbids a `sub_location` on the store tier
  - `055`: `issue_stock` — atomic two-location move, deterministic lock order, fail-closed; widened `movement_type` to `'issue'` in all three places (table CHECK `_v3`, RPC allowlist, `MOVEMENT_TYPES`)
  - `056`: RLS pass — `current_stock_dept_select` and `stock_items_dept_select` re-pointed from the deprecated `stock_items.department` onto `current_stock.location`. **Applied 14 August, out of order (after `057`)** — proven harmless, the two files are statement-disjoint and commute
  - `057`: `transfer_stock` — thin delegation to `issue_stock`, derives `movement_type` server-side (`'issue'` if either end is `'Main Store'`, else `'transfer'`); asserts one signature each for itself and `issue_stock` and aborts otherwise
- **Stock RPCs live in `pg_proc` (one signature each, no overloads):** `apply_stock_delta`, `set_stock_quantity`, `issue_stock`, `transfer_stock`, `current_stock_validate_location`, plus `current_app_role` / `current_app_department`.
- **Frontend, two-tier inventory:** `src/lib/stock.js` exports `applyStockDelta` / `setStockQuantity` / `issueStock` / `transferStock` — `transferStock` deliberately takes **no** `movementType` option, since the server derives it. `src/lib/constants.js` holds `MAIN_STORE` + `stockLocations()`. `TransfersTab.jsx` calls `transferStock()` and no longer inserts `stock_movements` rows directly (the transfers-don't-deduct bug, fixed 14 August).
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
- **`scripts/data-ops/`** — one-shot data-mutating scripts kept separate from `supabase/migrations/` because they must NOT replay on rebuild. **Currently `001`–`009`:** `001` Farmers Market import (305 stallholders from Feb 2026 register) · `002` bar stock reset + import (559 items across two bars) · `003` department vocabulary re-tag (11-value canonical list across `departments` / `staff` / `stock_items`) · `004` department orphan re-tag · `005` transfer orphan ledger cleanup (deleted the 2 false `transfer` rows written by the transfers bug on 27 July — balances deliberately untouched, since the movement never happened) · **`006`** event department backfill (`from_department`/`to_department` were NULL, so the Movement Ledger department filter silently dropped every event draw) · **`007`** encoding heal (repaired the mojibake `Get-Content` wrote into `post_bar_count` and `set_stock_quantity`) · **`008`** Farmers Market placeholder demo cohort (6 `Z00n` holders, seeded visits, waiting-list rows) · **`009`** `shift_settings` re-tag (three stale department values `003` had missed). Plus the test-data purge/seed procedure.

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
