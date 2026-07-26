-- 026_fm_market_days.sql
-- Sprint D Priority 1 — create the table the Farmers Market module has been
-- reading and writing against since it was built.
--
-- Governing doctrine: STREAMLINE_BUILD_STANDARD.md v1.5 §2.2 — RLS, a
-- service_role policy, GRANT ALL TO service_role and the role-specific
-- policies all land in the SAME migration that creates the table.
--
-- ------------------------------------------------------------------
-- BACKGROUND
-- ------------------------------------------------------------------
-- WOODLANDS_AUDIT_2.md §2.6(a) listed fm_market_days as one of four "ghost"
-- tables — used by src/ but created by no migration. Sprint A checked all four
-- against the live database and found this one is worse than that: it does not
-- exist at all, in any relkind. The other three (event_checklists,
-- shift_settings, tables) are real and merely unmigrated.
--
-- So MarketDayTab.jsx has been failing in production, not just drifting from
-- the migrations:
--   :44   reads  fm_market_days (id, notes) by market_date
--   :199  updates notes / updated_by / updated_at by id
--   :205  inserts market_date / notes / updated_by
-- The read sits inside a Promise.all whose error is never checked, so the
-- market-conditions box has silently rendered empty and every save has been
-- discarded.
--
-- ------------------------------------------------------------------
-- SCHEMA DERIVED FROM THE CODE, NOT INVENTED
-- ------------------------------------------------------------------
--   market_date  MarketDayTab.jsx:206 inserts a 'YYYY-MM-DD' string from
--                defaultMarketDate. :44 selects with .maybeSingle(), which
--                errors if more than one row matches — hence UNIQUE.
--   notes        the free-text "market conditions" box, debounced at :219.
--   updated_by   set from session?.user?.id (:201, :208) → an auth.users id.
--                FK to auth.users(id), matching the dominant convention in
--                this schema (requisitions.requested_by, stock_movements
--                .performed_by, event_stock_allocations.created_by).
--   updated_at   written on update at :202.
--   created_at   schema convention; not read by the UI.
--
-- No DELETE policy or grant: no code path deletes a market day.
--
-- SELECT is open to all authenticated roles, matching every other fm_* table
-- (migrations 009 and 022). Restricting Farmers Market reads by role would be a
-- change across all six fm_* tables, not just this one, and is a separate
-- decision. kitchen_manager cannot WRITE here, and the Farmers Market data
-- leaking into kitchen_manager's Dashboard is fixed in the UI separately.

CREATE TABLE IF NOT EXISTS public.fm_market_days (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_date date NOT NULL UNIQUE,
  notes       text,
  updated_by  uuid REFERENCES auth.users(id),
  updated_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.fm_market_days IS
  'One row per monthly market day, holding the free-text market conditions note shown on the Farmers Market Market Day tab. Created in Sprint D (2026-07-26); the table was missing entirely while the UI read and wrote it, so all prior notes were silently discarded.';

ALTER TABLE public.fm_market_days ENABLE ROW LEVEL SECURITY;

-- service_role escape hatch (Edge Functions only — never the browser)
DROP POLICY IF EXISTS "service_role_all_fm_market_days" ON public.fm_market_days;
CREATE POLICY "service_role_all_fm_market_days" ON public.fm_market_days
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT ALL ON public.fm_market_days TO service_role;

-- The anon client needs these or the policies below are unreachable: a grant is
-- checked before a policy. This is the defect that made eleven tables silently
-- unusable in Sprint B.
GRANT SELECT, INSERT, UPDATE ON public.fm_market_days TO authenticated;

DROP POLICY IF EXISTS "authenticated_read_fm_market_days" ON public.fm_market_days;
CREATE POLICY "authenticated_read_fm_market_days" ON public.fm_market_days
  FOR SELECT TO authenticated USING (true);

-- Writes restricted to owner/manager, matching MarketDayTab.jsx:17
-- (canManage) and ROUTE_ACCESS['/farmers-market'].
DROP POLICY IF EXISTS "fm_market_days_manage_insert" ON public.fm_market_days;
CREATE POLICY "fm_market_days_manage_insert" ON public.fm_market_days
  FOR INSERT TO authenticated
  WITH CHECK (public.current_app_role() IN ('owner', 'manager'));

DROP POLICY IF EXISTS "fm_market_days_manage_update" ON public.fm_market_days;
CREATE POLICY "fm_market_days_manage_update" ON public.fm_market_days
  FOR UPDATE TO authenticated
  USING      (public.current_app_role() IN ('owner', 'manager'))
  WITH CHECK (public.current_app_role() IN ('owner', 'manager'));
