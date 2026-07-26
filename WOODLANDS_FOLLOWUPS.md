# WOODLANDS — FOLLOWUPS LOG

*Small deferred items not blocking the current sprint. Standard §5 item 7. Append-only during sprints; consolidated at retrospective.*

---

## FROM AUDIT #2 (2026-07-26) — DEFERRED

- **WOODLANDS_FUNCTIONAL_SPEC.md route/role table is stale.** Lists seven roles that don't exist. Refresh at Sprint E fit-and-finish. Source: rename commit, 26 July.

---

## FROM SPRINTS

### Sprint A — Task 1 (migration `021_sprint_a_policies.sql`, 2026-07-26)

- **fm_market_days is not a table in the live DB.** MarketDayTab.jsx reads and writes it. Farmers Market monthly notes are broken in production. Escalated from "ghost table" to "live production bug." Must be CREATE'd (with RLS + policies + grants) in Sprint D — not just its policies added.

- **`fm_market_days` does not exist in the live database.** Confirmed absent from `pg_class` across all relkinds — it is not a table, view, or matview. `MarketDayTab.jsx:44` reads it and `:199`/`:205` write it, so the Farmers Market "market day notes" surface fails in production today. This is worse than the "ghost table" classification in AUDIT_2 §2.6, which assumed all four existed and were merely unmigrated. **Sprint D** — needs `CREATE TABLE` + RLS + policies, not just a back-filled migration.

- **The other three AUDIT_2 "ghost" tables do exist** — `event_checklists`, `shift_settings`, `tables` — with RLS enabled. Their `CREATE TABLE` statements are still absent from every migration. **Sprint D.**

- **`authenticated` held no usable grants on `event_checklists`, `shift_settings`, `tables`** — only `REFERENCES`/`TRIGGER`/`TRUNCATE`, so their pre-existing SELECT policies were unreachable. Granted in `021`. Worth checking the remaining tables for the same gap at Sprint D.

- **Duplicate `service_role` policies.** Six tables now carry two functionally identical `service_role … FOR ALL … USING(true)` policies: the pre-existing legacy-named `"service role full access {t}"` and the canonical `"service_role_all_{t}"` added by `021`. Sprint A was additive-only so the legacy ones were not dropped. **Sprint D** — collapse to one name per table. No security effect; both are permissive.

- **Remote migration history is missing versions 008–020.** `supabase migration list --linked` records only 001–007 as applied, though 008–020 demonstrably ran. `supabase db push` is therefore *unsafe* — it would replay `016_staff_restructure.sql` and duplicate all 62 real staff rows, re-run `018`'s DROP TABLE, and re-create `requisitions`. `021` was applied via the Management API query endpoint instead, and is not recorded in history either (it is written idempotently, so a future replay is harmless). **Sprint D** — `supabase migration repair --status applied` for 008–021 before `db push` is used again.

- **`021` is not itself in the migration history table.** See above. Idempotent by construction (`DROP POLICY IF EXISTS` before every `CREATE POLICY`).

### Sprint A — Task 2 (`create-user` Edge Function, 2026-07-26)

- **CORS is now pinned to `https://woodlands-beta.vercel.app` only.** Calling the deployed function from a local dev server (`http://localhost:5173`) will be blocked by the browser. Intentional per the sprint brief. If local admin testing is needed, either run the function locally with `supabase functions serve` or add the dev origin to an explicit allowlist. **Sprint E.**

- **`ALLOWED_ROLES` in the Edge Function duplicates `src/lib/roles.js`.** Deno cannot import the browser module, so the four roles are listed in two places and kept in sync by hand. Adding a fifth role means editing both. **Sprint E** — consider a shared JSON constant.

- **No `supabase/config.toml` in the repo.** The deployed `verify_jwt` setting is still not expressible in source. The function no longer depends on it (it verifies the caller itself), but the setting remains undocumented. **Sprint D.**
