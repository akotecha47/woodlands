-- 058_movement_ledger_event_types.sql
-- Phase 2, Movement Ledger — give event stock movements their own movement types.
--
-- WHY
--   The consolidated Movement Ledger (FUNCTIONAL_SPEC §Inventory, the open
--   question logged in FOLLOWUPS) replaces the delivery-only Delivery Log and
--   shows every movement type in one place. Event allocations currently write
--   movement_type 'adjustment', which is the same value a stock take writes.
--   In a delivery-only view that collision was invisible. In a consolidated
--   ledger it is a lie: "adjustment" would cover both "someone recounted the
--   shelf" and "this stock left for an event", and no filter could separate
--   them. Events get their own two types, in both directions.
--
-- NEW vs CHANGED — stated explicitly, because the overload rule is easy to get
-- wrong and this project has already been bitten by it twice:
--   NEW              stock_movements_movement_type_check_v4  (replaces _v3)
--   NEW              three indexes on stock_movements
--   CHANGED (body)   apply_stock_delta(...)  -- IDENTICAL parameter list,
--                    replaced in place to accept the two new movement types.
--                    CREATE OR REPLACE with a byte-identical signature replaces
--                    rather than overloads, so NO DROP is correct here — and a
--                    drop would be actively harmful, since it would strip the
--                    function's grants under this project's
--                    {postgres=X/postgres} function default privileges (the
--                    trap 052 documents and 055 repeats). No re-GRANT is needed
--                    or wanted: replace-in-place preserves proacl, which is
--                    {postgres=X/postgres,authenticated=X/postgres,
--                     service_role=X/postgres} before and after.
--   CHANGED (sig)    none
--   CHANGED (data)   the event-tagged 'adjustment' rows are re-typed (below)
--   DROPPED          stock_movements_movement_type_check_v3, replaced by _v4
--
-- movement_type IS WIDENED IN ALL THREE PLACES, same rule as 055:
--   1. the table CHECK          -> here, _v3 replaced by _v4
--   2. the RPC body's allowlist -> here, in apply_stock_delta
--   3. the JS constant          -> src/lib/stock.js MOVEMENT_TYPES
--   They drift the moment they are changed separately. The migration must land
--   BEFORE the event code is re-typed, or the new values fail the CHECK.
--
-- ORDER INSIDE THIS FILE MATTERS: the CHECK is widened first, because the
-- backfill in step 3 writes values the old CHECK would reject.
--
-- RLS IS NOT TOUCHED. stock_movements_dept_select already scopes a
-- department_head on (current_app_department() = from_department OR
-- = to_department), which is correct for these rows as it is for every other.
-- Note the consequence, which is behaviour and not a bug: the event code does
-- not set from_department/to_department, so event rows are visible to
-- owner/admin and not to a department_head. Same as opening_balance. Logged in
-- FOLLOWUPS as a Dhiren-facing question, deliberately not changed here.

begin;

-- ── 1. movement_type: widen the table CHECK (place 1 of 3) ──────────────────
-- Added before the old one is dropped, so the column is never unconstrained.
-- Purely additive: every one of the six existing values is carried over, so no
-- existing row can fail validation.

alter table public.stock_movements drop constraint if exists stock_movements_movement_type_check_v4;
alter table public.stock_movements
  add constraint stock_movements_movement_type_check_v4
  check (movement_type = any (array[
    'delivery','transfer','adjustment','requisition','opening_balance','issue',
    'event_allocation','event_return'
  ]));

alter table public.stock_movements drop constraint if exists stock_movements_movement_type_check_v3;

-- ── 2. movement_type: widen the RPC allowlist (place 2 of 3) ────────────────
-- IDENTICAL signature to the live function (read from pg_get_functiondef
-- immediately before writing this, not transcribed from memory). The ONLY
-- change is the addition of 'event_allocation','event_return' to the
-- validation list and its error message.

create or replace function public.apply_stock_delta(
  p_stock_item_id  uuid,
  p_delta          numeric,
  p_movement_type  text,
  p_reason         text default null,
  p_from_department text default null,
  p_to_department   text default null,
  p_location       text default null,
  p_sub_location   text default null
)
returns numeric
language plpgsql
set search_path to 'public'
as $function$
DECLARE
  v_current  numeric;
  v_new      numeric;
  v_location text;
BEGIN
  IF p_stock_item_id IS NULL THEN
    RAISE EXCEPTION 'apply_stock_delta: stock_item_id is required';
  END IF;
  IF p_delta IS NULL OR p_delta = 0 THEN
    RAISE EXCEPTION 'apply_stock_delta: delta must be a non-zero number';
  END IF;
  -- 'opening_balance' is permitted by the table CHECK but deliberately absent
  -- here: it is the bulk-import path only (scripts/data-ops/002), never a
  -- runtime movement, so the RPC must refuse it.
  IF p_movement_type IS NULL
     OR p_movement_type NOT IN ('delivery','transfer','adjustment','requisition','issue',
                                'event_allocation','event_return') THEN
    RAISE EXCEPTION
      'apply_stock_delta: movement_type must be one of delivery, transfer, adjustment, requisition, issue, event_allocation, event_return (got %)',
      p_movement_type;
  END IF;

  v_location := coalesce(p_location, (
    SELECT si.department FROM public.stock_items si WHERE si.id = p_stock_item_id
  ));

  IF v_location IS NULL THEN
    RAISE EXCEPTION 'apply_stock_delta: cannot resolve a location for stock item % (no p_location given and its catalogue row has no department)', p_stock_item_id;
  END IF;

  SELECT quantity INTO v_current
    FROM public.current_stock
   WHERE stock_item_id = p_stock_item_id
     AND location      = v_location
     AND sub_location IS NOT DISTINCT FROM p_sub_location
   FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.current_stock (stock_item_id, location, sub_location, quantity, last_updated)
    VALUES (p_stock_item_id, v_location, p_sub_location, 0, now())
    ON CONFLICT (stock_item_id, location, sub_location) DO NOTHING;

    SELECT quantity INTO v_current
      FROM public.current_stock
     WHERE stock_item_id = p_stock_item_id
       AND location      = v_location
       AND sub_location IS NOT DISTINCT FROM p_sub_location
     FOR UPDATE;
  END IF;

  v_current := coalesce(v_current, 0);
  v_new     := v_current + p_delta;

  IF v_new < 0 THEN
    RAISE EXCEPTION 'Insufficient stock: % available, % required', v_current, abs(p_delta)
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.current_stock
     SET quantity     = v_new,
         last_updated = now()
   WHERE stock_item_id = p_stock_item_id
     AND location      = v_location
     AND sub_location IS NOT DISTINCT FROM p_sub_location;

  INSERT INTO public.stock_movements
    (stock_item_id, movement_type, quantity_change, from_department, to_department, performed_by, notes)
  VALUES
    (p_stock_item_id, p_movement_type, p_delta, p_from_department, p_to_department, auth.uid(), p_reason);

  RETURN v_new;
END $function$;

-- ── 3. Backfill the historical event rows ───────────────────────────────────
-- Matched on the exact reason strings the four event call sites emit, NOT on
-- sign — sign alone would sweep up genuine stock takes, which are the other
-- (and after this, the only) writer of 'adjustment'. A stock take's reason is
-- free text typed by a user, so an exact-prefix match on the machine-generated
-- string is the narrow test.
--
--   EventDetailTab   confirm   -> 'Event stock allocated (event ...)'
--   EventStockSection add       -> 'Event stock allocated (event ...)'
--   EventDetailTab   cancel    -> 'Event cancelled, stock returned (event ...)'
--   EventStockSection clearance-> 'Event clearance, unused stock returned (event ...)'
--
-- At time of writing production holds exactly one such row (a -10 allocation,
-- 27 July 2026). The return patterns are included anyway so the migration is
-- correct rather than merely sufficient for today's data.

update public.stock_movements
   set movement_type = 'event_allocation'
 where movement_type = 'adjustment'
   and notes like 'Event stock allocated (event %';

update public.stock_movements
   set movement_type = 'event_return'
 where movement_type = 'adjustment'
   and (notes like 'Event cancelled, stock returned (event %'
     or notes like 'Event clearance, unused stock returned (event %');

-- ── 4. Indexes ──────────────────────────────────────────────────────────────
-- Purely additive. The table has carried nothing but its primary key, which was
-- survivable for a delivery-only view filtering one movement_type over ~1 row.
-- The Ledger reads the whole table ordered by created_at and filters by item
-- and by department, and RLS evaluates the department predicate on every row
-- for every department_head read.
--   created_at desc          -> the default ordering of the Ledger
--   stock_item_id            -> the item filter, and the FK
--   (from_department, to_department) -> the Ledger's department filter and the
--                               stock_movements_dept_select RLS predicate

create index if not exists stock_movements_created_at_idx
  on public.stock_movements (created_at desc);

create index if not exists stock_movements_stock_item_id_idx
  on public.stock_movements (stock_item_id);

create index if not exists stock_movements_departments_idx
  on public.stock_movements (from_department, to_department);

commit;
