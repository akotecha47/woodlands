-- 039_rls_inventory_dept_scope.sql
-- Phase 2 RLS, part 2 of 6: inventory, and the only department-scoped read in
-- the system.
--
-- Target:
--   stock_items      read  owner/admin all; department_head own department
--                    write owner (unchanged — StockItemsTab is on /admin)
--   current_stock    read  owner/admin all; department_head own department
--                    write owner/admin
--   stock_movements  read  owner/admin all; department_head rows touching own
--                          department (from_ or to_)
--                    write owner/admin (insert only — the ledger is append-only)
--   requisitions     read  owner/admin all; department_head own department
--                    raise owner/admin any; department_head own department,
--                          as themselves
--                    approve/reject/fulfil  owner/admin ONLY
--   hr has no inventory access at all.
--
-- Every one of these tables carried a blanket authenticated read, so the
-- scoping only means anything because the blanket is dropped here.
--
-- current_stock has no department column (id, stock_item_id, quantity,
-- last_updated), so its scope is an EXISTS against stock_items. That subquery
-- is itself RLS-filtered as the invoker, but stock_items' own department_head
-- policy allows exactly the same rows, so the two agree. stock_items does not
-- reference current_stock, so there is no policy recursion.
--
-- stock_movements has from_department and to_department rather than one
-- column, so a department_head sees a movement if either end is theirs.
--
-- apply_stock_delta() and set_stock_quantity() are SECURITY INVOKER (verified
-- 11 August 2026), so these policies really do govern Log Delivery, Transfers,
-- Adjustments and requisition Fulfil rather than being bypassed.
--
-- SCOPE CORRECTNESS DEPENDS ON THE STEP-3 RE-TAG, WHICH HAS NOT RUN.
-- Today stock_items.department holds only 'Restaurant Bar' and 'Sports Bar',
-- so the Kitchen department_head legitimately sees zero stock rows. That is
-- the expected pre-re-tag state, not a policy fault. Do not widen these
-- policies to make rows appear.

begin;

-- ── stock_items ──────────────────────────────────────────────────────────────

create policy "stock_items_manage_select" on public.stock_items
  for select to authenticated
  using (public.current_app_role() in ('owner', 'admin'));

create policy "stock_items_dept_select" on public.stock_items
  for select to authenticated
  using (
    public.current_app_role() = 'department_head'
    and department is not null
    and department = public.current_app_department()
  );

drop policy if exists "authenticated read stock_items" on public.stock_items;

-- stock_items_owner_insert / stock_items_owner_update are unchanged: they key
-- on 'owner', which survives the rename, and StockItemsTab is owner-only.

-- ── current_stock ────────────────────────────────────────────────────────────

create policy "current_stock_manage_select" on public.current_stock
  for select to authenticated
  using (public.current_app_role() in ('owner', 'admin'));

create policy "current_stock_dept_select" on public.current_stock
  for select to authenticated
  using (
    public.current_app_role() = 'department_head'
    and exists (
      select 1 from public.stock_items si
       where si.id = current_stock.stock_item_id
         and si.department is not null
         and si.department = public.current_app_department()
    )
  );

create policy "current_stock_manage_insert_v2" on public.current_stock
  for insert to authenticated
  with check (public.current_app_role() in ('owner', 'admin'));

create policy "current_stock_manage_update_v2" on public.current_stock
  for update to authenticated
  using      (public.current_app_role() in ('owner', 'admin'))
  with check (public.current_app_role() in ('owner', 'admin'));

drop policy if exists "authenticated read current_stock"    on public.current_stock;
drop policy if exists "current_stock_manage_insert"         on public.current_stock;
drop policy if exists "current_stock_manage_update"         on public.current_stock;

-- ── stock_movements ──────────────────────────────────────────────────────────

create policy "stock_movements_manage_select" on public.stock_movements
  for select to authenticated
  using (public.current_app_role() in ('owner', 'admin'));

create policy "stock_movements_dept_select" on public.stock_movements
  for select to authenticated
  using (
    public.current_app_role() = 'department_head'
    and public.current_app_department() is not null
    and public.current_app_department() in (from_department, to_department)
  );

create policy "stock_movements_manage_insert_v2" on public.stock_movements
  for insert to authenticated
  with check (public.current_app_role() in ('owner', 'admin'));

drop policy if exists "authenticated read stock_movements"  on public.stock_movements;
drop policy if exists "stock_movements_manage_insert"       on public.stock_movements;

-- ── requisitions ─────────────────────────────────────────────────────────────

create policy "requisitions_manage_select" on public.requisitions
  for select to authenticated
  using (public.current_app_role() in ('owner', 'admin'));

create policy "requisitions_dept_select" on public.requisitions
  for select to authenticated
  using (
    public.current_app_role() = 'department_head'
    and department is not null
    and department = public.current_app_department()
  );

-- Raise. Replaces requisitions_raise_insert, whose check was merely
-- `current_app_role() IS NOT NULL` — that let any authenticated role, hr
-- included, raise a requisition for any department.
create policy "requisitions_raise_insert_v2" on public.requisitions
  for insert to authenticated
  with check (
    public.current_app_role() in ('owner', 'admin')
    or (
      public.current_app_role() = 'department_head'
      and requested_by = auth.uid()
      and department is not null
      and department = public.current_app_department()
    )
  );

-- Approve / reject / fulfil. department_head is deliberately absent: a head
-- raises a requisition, it does not sign off its own.
create policy "requisitions_manage_update_v2" on public.requisitions
  for update to authenticated
  using      (public.current_app_role() in ('owner', 'admin'))
  with check (public.current_app_role() in ('owner', 'admin'));

drop policy if exists "authenticated read requisitions" on public.requisitions;
drop policy if exists "requisitions_raise_insert"       on public.requisitions;
drop policy if exists "requisitions_manage_update"      on public.requisitions;

commit;
