-- 056_rls_inventory_location_scope.sql
-- Phase 2, two-tier inventory - the RLS pass. Re-points department_head scoping
-- from the DEPRECATED stock_items.department onto current_stock.location.
--
-- WHY THIS IS BLOCKING, NOT COSMETIC
--   055 made store->department issuing work. It did not make it VISIBLE.
--   migration 039's current_stock_dept_select scopes via
--     EXISTS (stock_items si WHERE si.id = cs.stock_item_id
--             AND si.department = current_app_department())
--   i.e. the catalogue TAG, not the location the stock is actually AT. Proved
--   live 13 August 2026 (rolled back), issuing 10 units Main Store -> Kitchen:
--     Kitchen head    -> 0 rows          (holds the stock, cannot see it)
--     Sports Bar head -> the Kitchen row (gave the stock away, still sees it)
--   because the item is tagged stock_items.department = 'Sports Bar'.
--
--   So this is not only a hidden-rows bug. It is an active MIS-scoping that
--   grows with every issue: each issue writes a balance row visible to the
--   wrong department head. FOLLOWUPS item 4's "zero cross-department leakage"
--   was true only of the pre-issuing data.
--
-- WHAT CHANGES
--   current_stock_dept_select   scope on current_stock.location  (was: catalogue tag)
--   stock_items_dept_select     scope on "items I hold a balance for at my
--                               location" (was: stock_items.department)
--
-- WHY stock_items HAS TO MOVE TOO, AND CANNOT BE DEFERRED
--   Every current_stock reader in src/ embeds stock_items
--   (StockLevelsTab, AdjustmentsTab, OwnerDashboard, EventStockSection,
--   EventDetailTab). StockLevelsTab.jsx:27 dereferences r.stock_items.name
--   unguarded. If a head could read a balance row but not its catalogue row,
--   PostgREST returns stock_items: null and the screen throws. Fixing
--   current_stock alone would replace a zero-rows bug with a crash.
--
-- WHAT DELIBERATELY DOES NOT CHANGE
--   stock_movements  - stock_movements_dept_select already matches
--                      current_app_department() against from_department /
--                      to_department, and 055 writes the LOCATION names into
--                      those columns (055 line 150, lines 205-213). It is
--                      already location-based; a Kitchen head correctly sees
--                      both legs of their issue. Touching it would be change
--                      for its own sake.
--   requisitions     - requisitions.department is the department a requisition
--                      is FOR. Not the deprecated column, not a location.
--   every owner/admin/hr/service_role policy - byte-identical after this runs.
--   all INSERT/UPDATE policies - a department_head still holds NO write policy
--                      on current_stock, so issue_stock/fulfil remain denied to
--                      heads (verified live: apply_stock_delta's create-if-
--                      missing INSERT raises 42501 for a head). Correct: a head
--                      does not issue stock to itself.
--   stock_items.department - NOT dropped. 051 said drop it once RLS is
--                      re-pointed AND the real-data dedupe runs. The dedupe is
--                      still deferred, so the column stays (its comment is
--                      updated below to record that it is no longer load-
--                      bearing for RLS).
--
-- NAMING: SAME NAMES, DROP-THEN-CREATE. NOT _v2.
--   039 used _v2 suffixes. This does the opposite deliberately. Reusing the
--   name means a missed DROP makes the CREATE fail loudly ("policy already
--   exists"); a _v2 name with a missed DROP leaves the OLD PERMISSIVE POLICY
--   SITTING ALONGSIDE THE NEW ONE, silently, and permissive policies OR
--   together - so the stale one would keep granting exactly the over-exposure
--   this migration exists to close. Fail-loud is the correct trade here.
--
-- NO RECURSION
--   After this runs, current_stock's policies reference NO other table, and
--   stock_items' policy references current_stock. The dependency is one-way.
--   (039 had it the other way round and relied on the two policies happening
--   to agree; this is strictly tighter.)
--
-- NO BLANKET READ IS INTRODUCED
--   Both new policies open with current_app_role() = 'department_head' and both
--   carry an equality against current_app_department(), which returns NULL for
--   a deactivated or unknown profile - making the predicate NULL, not true.
--   Neither uses USING (true). The only true predicates left on these tables
--   are the four pre-existing service_role policies.
--
-- POLICY COUNT: 19 before, 19 after. Two DROPs, two CREATEs, one transaction.

begin;

-- current_stock -------------------------------------------------------------
-- Scope on LOCATION. tier = 'department' is redundant today ('Main Store' is a
-- reserved name that 054's trigger forbids as a department, so it can never
-- equal current_app_department()) but it makes "no head ever sees a store row"
-- true by construction rather than by vocabulary discipline.
--
-- No sub_location clause: a Housekeeping head sees both the plain Housekeeping
-- row and the 'Laundry' sub-location row, which is the intended reading of 051.

drop policy if exists "current_stock_dept_select" on public.current_stock;

create policy "current_stock_dept_select" on public.current_stock
  for select to authenticated
  using (
    public.current_app_role() = 'department_head'
    and public.current_app_department() is not null
    and tier     = 'department'
    and location = public.current_app_department()
  );

-- stock_items ---------------------------------------------------------------
-- "I can read the catalogue row for anything I hold at my location."
--
-- Scope confirmed by Aman 13 August 2026: HELD ITEMS ONLY. The store's
-- catalogue is deliberately NOT exposed to heads. Consequence, accepted
-- knowingly: a head holding no stock sees no items and therefore cannot pick
-- one to raise a requisition. That is already true today for Kitchen and
-- Restaurant (both see 0 items), so this is not a regression - but it is the
-- reason to revisit catalogue visibility when the requisition/par-level work
-- lands. Widening is one `or cs.location = 'Main Store'` in this EXISTS.
--
-- The EXISTS subquery is itself RLS-filtered as the invoker against
-- current_stock, whose (new) head policy allows exactly location = own
-- department - so the two agree by construction, not by coincidence.

drop policy if exists "stock_items_dept_select" on public.stock_items;

create policy "stock_items_dept_select" on public.stock_items
  for select to authenticated
  using (
    public.current_app_role() = 'department_head'
    and exists (
      select 1
        from public.current_stock cs
       where cs.stock_item_id = stock_items.id
         and cs.tier     = 'department'
         and cs.location = public.current_app_department()
    )
  );

-- documentation -------------------------------------------------------------
-- 051 set this comment saying the column is retained BECAUSE 039's policies key
-- on it. That is no longer true as of this migration.

comment on column public.stock_items.department is
  'DEPRECATED as of migration 051. Location is authoritative on current_stock.location. As of migration 056 NO RLS POLICY KEYS ON THIS COLUMN - stock_items_dept_select and current_stock_dept_select both scope on current_stock.location. The column is retained only until the real-data catalogue dedupe runs (see WOODLANDS_FOLLOWUPS.md), after which it can be dropped. Do not add new dependencies on it.';

commit;
