-- 006_event_movement_departments.sql
-- Data-op, 14 August 2026. Backfill from_department / to_department on the
-- event movement rows written before the four event call sites were fixed.
--
-- WHY
--   The event call sites wrote movement_type 'event_allocation' /
--   'event_return' with both department columns NULL. Two things break as a
--   result, and one fix closes both:
--     1. The Movement Ledger's department filter is
--        (from_department = D OR to_department = D), so filtering by a
--        department SILENTLY DROPS every event row. Proven in the browser on
--        14 August: filtering Main Bar showed a -2 requisition and hid a -13
--        and a -10 event allocation on Main Bar stock. A ledger that omits rows
--        when filtered is worse than no ledger.
--     2. RLS policy stock_movements_dept_select scopes a department_head on the
--        same two columns, so heads saw ZERO event rows against their own stock.
--
-- THE DERIVATION — stated because a backfill that guesses is worse than none.
--   Department = stock_items.department of the item that moved.
--   This is not an inference. The event call sites pass no p_location, and
--   apply_stock_delta resolves
--       v_location := coalesce(p_location, stock_items.department)
--   so stock_items.department IS the location the balance was actually debited
--   from. The row is being labelled with the department it already moved.
--
--   Verified before writing this (see the 059 diagnosis):
--     - both null rows independently derive 'Main Bar' from BOTH
--       stock_items.department AND the event's own allocation join
--       (event_stock_allocations -> stock_items), and the two agree;
--     - 0 event rows whose item has a null department;
--     - 0 items carrying more than one department.
--   So the derivation is deterministic for every row this touches. If a future
--   row cannot be derived, the guard below leaves it alone rather than
--   assigning it a department.
--
-- DIRECTION RULE — matches the fixed code, the sign, and how the Ledger renders:
--   event_allocation  negative, stock LEAVES  -> set from_department, to stays NULL
--   event_return      positive, stock RETURNS -> set to_department,  from stays NULL
--
-- SCOPE: UPDATE only. No INSERT, no DELETE. Row count must be unchanged after.
-- Not hardcoded to the two rows that exist today — it is keyed on the
-- null-both predicate, so it is correct for whatever is there when it runs, and
-- is idempotent (re-running matches nothing).

begin;

-- stock LEAVING a department for an event
update public.stock_movements sm
   set from_department = si.department
  from public.stock_items si
 where si.id = sm.stock_item_id
   and sm.movement_type = 'event_allocation'
   and sm.from_department is null
   and sm.to_department   is null
   and si.department      is not null;

-- stock COMING BACK to a department
update public.stock_movements sm
   set to_department = si.department
  from public.stock_items si
 where si.id = sm.stock_item_id
   and sm.movement_type = 'event_return'
   and sm.from_department is null
   and sm.to_department   is null
   and si.department      is not null;

commit;
