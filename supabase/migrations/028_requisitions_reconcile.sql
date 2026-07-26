-- 028_requisitions_reconcile.sql
-- Replace the live `requisitions` table with the shape 008_inventory.sql always
-- intended, and restore every policy and grant the CASCADE drop removes.
--
-- ------------------------------------------------------------------
-- WHY THE LIVE TABLE WAS WRONG
-- ------------------------------------------------------------------
-- 008_inventory.sql opens with:
--
--   -- NOTE: If a 'requisitions' table already exists from 001_schema.sql
--   -- (referencing inventory_items), drop it first:
--   -- DROP TABLE IF EXISTS requisitions CASCADE;
--
-- That DROP was never run. Because 008's statement is CREATE TABLE IF NOT
-- EXISTS, it silently did nothing, and the live table stayed as the
-- 001_schema.sql version. Six differences from what the UI writes:
--
--   code / 008 expects              live / 001 had
--   ------------------------------  ---------------------------------------
--   stock_item_id -> stock_items    item_id -> inventory_items
--   reason                          absent (rejection_reason, notes instead)
--   reviewed_by   -> auth.users     approved_by -> user_profiles
--   requested_by  -> auth.users     requested_by -> user_profiles
--   department (nullable)           department NOT NULL
--   status CHECK (4 values)         status text, no CHECK
--                                   extras: approved_at, rejection_reason, notes
--
-- Every write path was broken: the insert (RequisitionsTab.jsx:45, two absent
-- columns), approve (:63), reject (:93), and fulfil (:84) — where
-- req.stock_item_id was undefined and would have been passed to
-- applyStockDelta. Reads survived only because fetchReqs is a bare select('*').
--
-- The flow had never worked once: item_id was NOT NULL referencing
-- inventory_items, which holds 0 rows, so no insert could ever satisfy it. Not
-- a regression — non-functional since it was built.
--
-- ------------------------------------------------------------------
-- SAFETY
-- ------------------------------------------------------------------
-- Verified immediately before applying: requisitions held 0 rows, no table had
-- a foreign key referencing it, and no view depended on it. So the CASCADE drop
-- takes only the 4 policies and the grants, all recreated below. Nothing else
-- in the schema is touched.
--
-- inventory_items is left in place. It is one of the four dead tables from 001
-- and its removal belongs to the schema-reconciliation work, not here.

DROP TABLE IF EXISTS public.requisitions CASCADE;

CREATE TABLE public.requisitions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_item_id uuid NOT NULL REFERENCES public.stock_items(id) ON DELETE CASCADE,
  requested_by  uuid REFERENCES auth.users(id),
  department    text,
  quantity      numeric NOT NULL,
  reason        text,
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','approved','fulfilled','rejected')),
  reviewed_by   uuid REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.requisitions IS
  'Stock requisitions: raise -> approve -> fulfil, with stock deducted on FULFIL (not on approve, not on submission). Recreated in migration 028 because 008_inventory.sql never replaced the incompatible 001_schema.sql version.';

-- ==================================================================
-- RLS, policies and grants — restoring exactly what the drop removed
-- ==================================================================
ALTER TABLE public.requisitions ENABLE ROW LEVEL SECURITY;

-- Two from 008_inventory.sql. Legacy names kept deliberately: this migration is
-- a faithful restore, not a rename, and renaming here would leave the audit
-- trail harder to follow.
CREATE POLICY "authenticated read requisitions" ON public.requisitions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "service role full access requisitions" ON public.requisitions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Two from 022_sprint_b_policies.sql. Raising a requisition is open to every
-- role on the inventory route — the only genuinely open write in the system —
-- while approve / fulfil / reject are owner+manager (MANAGERS gate,
-- RequisitionsTab.jsx:8).
CREATE POLICY "requisitions_raise_insert" ON public.requisitions
  FOR INSERT TO authenticated
  WITH CHECK (public.current_app_role() IS NOT NULL);

CREATE POLICY "requisitions_manage_update" ON public.requisitions
  FOR UPDATE TO authenticated
  USING      (public.current_app_role() IN ('owner', 'manager'))
  WITH CHECK (public.current_app_role() IN ('owner', 'manager'));

-- Grants, matching what was captured from the live table before the drop.
-- A grant is checked BEFORE a policy, so omitting these would leave all four
-- policies unreachable.
GRANT ALL ON public.requisitions TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.requisitions TO authenticated;
-- anon deliberately gets nothing.
