-- 055_issue_stock.sql
-- Phase 2, two-tier inventory — main-store -> department ISSUING.
--
-- WHAT THIS ADDS
--   issue_stock(): move a quantity of one item from one location to another,
--   atomically. Primary case is 'Main Store' -> a department: the store
--   balance is DEDUCTED and the department balance CREDITED in a single
--   transaction.
--
--   The main store is an ordinary balance row, not a notional or infinite
--   source. Issuing depletes it, and because 053 gave store rows their own
--   reorder_level (4x catalogue: 20 bottles / 32 crates) against a seeded 100,
--   a store row reads Low once ~80 units (bottles) or ~68 (crates) have been
--   issued out. That is the per-tier reorder from 051/053 doing its job:
--   "the store is running out" and "this department is running out" are
--   different alerts at different thresholds.
--
-- NEW vs CHANGED — stated explicitly, because the overload rule is easy to get
-- wrong and this project has already been bitten by it:
--   NEW              issue_stock(...)            -- did not exist; nothing to drop
--   CHANGED (body)   apply_stock_delta(...)      -- IDENTICAL parameter list,
--                    replaced in place to accept the new 'issue' movement type.
--                    CREATE OR REPLACE with a byte-identical signature replaces
--                    rather than overloads, so NO DROP is correct here — and a
--                    drop would be actively harmful, since it would strip the
--                    function's grants under this project's
--                    {postgres=X/postgres} function default privileges (the
--                    trap 052 documents).
--   CHANGED (sig)    none
--   DROPPED          stock_movements_movement_type_check_v2, replaced by _v3
--
--   By contrast, 052 DID drop apply_stock_delta's old 6-arg and
--   set_stock_quantity's old 3-arg signatures, because adding parameters
--   changes the signature and would otherwise have left the old, by-then
--   balance-corrupting overloads callable.
--
-- movement_type 'issue' IS WIDENED IN ALL THREE PLACES IN THIS ONE CHANGE:
--   1. the table CHECK          -> here, _v2 replaced by _v3
--   2. the RPC body's allowlist -> here, in apply_stock_delta
--   3. the JS constant          -> src/lib/stock.js MOVEMENT_TYPES
--   They drift the moment they are changed separately. Note the pre-existing
--   drift this does NOT fix and does not worsen: the table has always also
--   permitted 'opening_balance', which the RPC body and the JS constant
--   reject. That value is import-only (data-ops/002) and is left alone.
--
-- FAIL-CLOSED, NO PARTIAL ISSUE (Aman, 13 August 2026)
--   If the store cannot cover the FULL quantity the whole call is rejected and
--   nothing moves — no partial issue, no negative balance. Matches every other
--   write path. Partial fulfilment is an operational preference rather than a
--   technical default, so it is logged in FOLLOWUPS as a Dhiren-revisit.
--
-- OUT OF SCOPE (logged in FOLLOWUPS): department -> store RETURNS. The function
-- is direction-agnostic, but no UI exposes the reverse direction this session.

begin;

-- ── 1. movement_type: widen the table CHECK (place 1 of 3) ──────────────────
-- Added before the old one is dropped, so the column is never unconstrained.

alter table public.stock_movements drop constraint if exists stock_movements_movement_type_check_v3;
alter table public.stock_movements
  add constraint stock_movements_movement_type_check_v3
  check (movement_type = any (array['delivery','transfer','adjustment','requisition','opening_balance','issue']));

alter table public.stock_movements drop constraint if exists stock_movements_movement_type_check_v2;

-- ── 2. movement_type: widen the RPC allowlist (place 2 of 3) ────────────────
-- IDENTICAL signature to the live function (read from pg_get_functiondef
-- before writing this, not transcribed from memory). The ONLY change is the
-- addition of 'issue' to the validation list.

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
  IF p_movement_type IS NULL
     OR p_movement_type NOT IN ('delivery','transfer','adjustment','requisition','issue') THEN
    RAISE EXCEPTION
      'apply_stock_delta: movement_type must be one of delivery, transfer, adjustment, requisition, issue (got %)',
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

-- ── 3. issue_stock — orchestration only ─────────────────────────────────────
-- Deliberately contains NO locking, no fail-closed arithmetic, no
-- create-if-missing branch and no ledger insert of its own. It calls
-- apply_stock_delta twice, so the proven single-sided primitive stays the only
-- implementation of those semantics. Both calls are in one function body, so
-- they are one transaction: if the source leg raises, the destination credit
-- rolls back with it.

create or replace function public.issue_stock(
  p_stock_item_id     uuid,
  p_from_location     text,
  p_to_location       text,
  p_quantity          numeric,
  p_reason            text default null,
  p_movement_type     text default 'issue',
  p_from_sub_location text default null,
  p_to_sub_location   text default null
)
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
DECLARE
  v_from            numeric;
  v_to              numeric;
  v_source_is_first boolean;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'issue_stock: quantity must be greater than zero (got %)', p_quantity
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_from_location IS NULL OR p_to_location IS NULL THEN
    RAISE EXCEPTION 'issue_stock: both a source and a destination location are required'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_from_location = p_to_location
     AND p_from_sub_location IS NOT DISTINCT FROM p_to_sub_location THEN
    RAISE EXCEPTION 'issue_stock: source and destination are the same location (%)', p_from_location
      USING ERRCODE = 'check_violation';
  END IF;

  -- Deterministic lock ORDER, not call order. Without this, a
  -- Main Store -> Kitchen issue racing a Kitchen -> Main Store return would
  -- take the two row locks in opposite orders and deadlock. The sign is bound
  -- to the location, so ordering the calls cannot mis-post the movement.
  v_source_is_first :=
    (p_from_location, coalesce(p_from_sub_location, '')) <
    (p_to_location,   coalesce(p_to_sub_location,   ''));

  IF v_source_is_first THEN
    v_from := public.apply_stock_delta(p_stock_item_id, -p_quantity, p_movement_type, p_reason,
                                       p_from_location, p_to_location, p_from_location, p_from_sub_location);
    v_to   := public.apply_stock_delta(p_stock_item_id,  p_quantity, p_movement_type, p_reason,
                                       p_from_location, p_to_location, p_to_location,   p_to_sub_location);
  ELSE
    v_to   := public.apply_stock_delta(p_stock_item_id,  p_quantity, p_movement_type, p_reason,
                                       p_from_location, p_to_location, p_to_location,   p_to_sub_location);
    v_from := public.apply_stock_delta(p_stock_item_id, -p_quantity, p_movement_type, p_reason,
                                       p_from_location, p_to_location, p_from_location, p_from_sub_location);
  END IF;

  RETURN jsonb_build_object(
    'from_location', p_from_location,
    'to_location',   p_to_location,
    'quantity',      p_quantity,
    'from_quantity', v_from,
    'to_quantity',   v_to
  );
END $function$;

-- Same grant discipline as 052 and 054: CREATE FUNCTION grants EXECUTE to
-- PUBLIC by default, and this project's function default privileges are
-- {postgres=X/postgres}. Set both ends explicitly rather than inherit either.
revoke execute on function public.issue_stock(uuid, text, text, numeric, text, text, text, text) from public;
grant  execute on function public.issue_stock(uuid, text, text, numeric, text, text, text, text)
  to authenticated, service_role;

commit;
