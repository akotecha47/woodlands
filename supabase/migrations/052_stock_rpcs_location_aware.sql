-- 052_stock_rpcs_location_aware.sql
-- Phase 2, two-tier inventory — FOUNDATION, part 2 of 3: make the two stock
-- RPCs location-aware.
--
-- WHY THIS IS NOT OPTIONAL, AND WHY IT SHIPS WITH 051
--   Both functions were written when current_stock held exactly one row per
--   item. After 051 they are actively dangerous:
--     - ON CONFLICT (stock_item_id) no longer matches any constraint, so the
--       "first delivery for an item" branch raises.
--     - UPDATE ... WHERE stock_item_id = X now updates EVERY location's
--       balance for that item at once. A 5-unit delivery would set the store
--       and both bars to the same number.
--     - SELECT quantity INTO v_current ... takes an arbitrary matching row.
--   051 alone is harmless because nothing yet has two rows per item; 053 seeds
--   the main-store tier and makes it real. These two must not be separated.
--
-- BEHAVIOUR-PRESERVING BY DESIGN
--   p_location defaults to NULL, which resolves to the item's DEPARTMENT-tier
--   row — the row whose location equals that item's stock_items.department.
--   Because the catalogue is not deduped, every item has exactly one such row,
--   so every existing caller reaches precisely the row it reaches today. No
--   application code has to change for correctness; the app pass that follows
--   is about what the screens DISPLAY, not about which row gets written.
--
--   The transfer primitive (a later session) will pass p_location explicitly.
--
-- ACCESS IS UNCHANGED
--   Both remain SECURITY INVOKER, so migration 039's policies still govern
--   every write. Adding a parameter grants nobody anything.
--
-- NOT IN SCOPE
--   movement_type is NOT widened here — 'event_allocation' / 'event_return'
--   remain deferred to the Movement Ledger session, so the validation list
--   below is unchanged from migration 025.

-- TWO TRAPS THIS FILE HAS TO HANDLE, BOTH VERIFIED LIVE BEFORE WRITING IT
--
--   1. Adding parameters CHANGES THE SIGNATURE, so CREATE OR REPLACE would
--      create a second OVERLOAD and leave the old location-blind function
--      callable — and an existing caller passing exactly the old argument list
--      resolves to it, so the corruption above would survive this migration
--      entirely. The old signatures are therefore dropped explicitly.
--
--   2. DROP loses the function's grants, and this project's default privileges
--      for functions are {postgres=X/postgres} (confirmed live in
--      pg_default_acl — the restriction migration 050 files). A recreated
--      function would therefore grant `authenticated` NOTHING, and every
--      Log Delivery / Adjustment / Fulfil / event stock write would fail with
--      "permission denied for function". The grants below restore exactly the
--      matrix both functions carry today:
--        {postgres=X/postgres, authenticated=X/postgres, service_role=X/postgres}
--
--   DDL is transactional in Postgres, so the drop, the create and the grants
--   commit as one unit — there is no window in which the app can see a
--   half-applied state.

begin;

drop function if exists public.apply_stock_delta(uuid, numeric, text, text, text, text);
drop function if exists public.set_stock_quantity(uuid, numeric, text);

-- ── apply_stock_delta ───────────────────────────────────────────────────────

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
     OR p_movement_type NOT IN ('delivery','transfer','adjustment','requisition') THEN
    RAISE EXCEPTION
      'apply_stock_delta: movement_type must be one of delivery, transfer, adjustment, requisition (got %)',
      p_movement_type;
  END IF;

  -- Resolve the target tier. NULL means "the department-tier row", which is
  -- what every pre-two-tier caller means.
  v_location := coalesce(p_location, (
    SELECT si.department FROM public.stock_items si WHERE si.id = p_stock_item_id
  ));

  IF v_location IS NULL THEN
    RAISE EXCEPTION 'apply_stock_delta: cannot resolve a location for stock item % (no p_location given and its catalogue row has no department)', p_stock_item_id;
  END IF;

  -- Lock the balance row for the rest of the transaction. Any concurrent
  -- caller for the same (item, location) blocks here instead of overwriting.
  SELECT quantity INTO v_current
    FROM public.current_stock
   WHERE stock_item_id = p_stock_item_id
     AND location      = v_location
     AND sub_location IS NOT DISTINCT FROM p_sub_location
   FOR UPDATE;

  -- No balance row yet at this location. Create it at zero, then take the
  -- lock. ON CONFLICT DO NOTHING covers a concurrent creator.
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

  -- Fail closed. Replaces the Math.max(0, ...) clamp that used to under-deduct
  -- while the ledger recorded the full amount.
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

-- ── set_stock_quantity ──────────────────────────────────────────────────────

create or replace function public.set_stock_quantity(
  p_stock_item_id uuid,
  p_new_qty       numeric,
  p_reason        text default null,
  p_location      text default null,
  p_sub_location  text default null
)
returns numeric
language plpgsql
set search_path to 'public'
as $function$
DECLARE
  v_current  numeric;
  v_delta    numeric;
  v_location text;
BEGIN
  IF p_stock_item_id IS NULL THEN
    RAISE EXCEPTION 'set_stock_quantity: stock_item_id is required';
  END IF;
  IF p_new_qty IS NULL OR p_new_qty < 0 THEN
    RAISE EXCEPTION 'set_stock_quantity: quantity must be zero or greater (got %)', p_new_qty;
  END IF;

  v_location := coalesce(p_location, (
    SELECT si.department FROM public.stock_items si WHERE si.id = p_stock_item_id
  ));

  IF v_location IS NULL THEN
    RAISE EXCEPTION 'set_stock_quantity: cannot resolve a location for stock item % (no p_location given and its catalogue row has no department)', p_stock_item_id;
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
  v_delta   := p_new_qty - v_current;

  UPDATE public.current_stock
     SET quantity     = p_new_qty,
         last_updated = now()
   WHERE stock_item_id = p_stock_item_id
     AND location      = v_location
     AND sub_location IS NOT DISTINCT FROM p_sub_location;

  -- A stock take that changes nothing is not a ledger event. AdjustmentsTab
  -- previously wrote a zero-quantity_change row in that case; skipping it
  -- keeps the ledger meaningful. Behaviour change, noted in FOLLOWUPS.
  IF v_delta <> 0 THEN
    INSERT INTO public.stock_movements
      (stock_item_id, movement_type, quantity_change, performed_by, notes)
    VALUES
      (p_stock_item_id, 'adjustment', v_delta, auth.uid(), p_reason);
  END IF;

  RETURN p_new_qty;
END $function$;

-- ── restore the grant matrix the dropped functions carried ──────────────────
-- Not optional: see trap 2 in the header. Without these the RPCs exist but are
-- unreachable by the anon client's authenticated session.

-- CREATE FUNCTION grants EXECUTE to PUBLIC by default, and the dropped
-- functions did NOT carry that (their ACL was postgres/authenticated/
-- service_role only — read off production before this ran). Revoke it first so
-- the end state matches the old matrix exactly rather than quietly widening
-- execute to every role including anon. Harmless in practice — both functions
-- are SECURITY INVOKER and anon holds neither the table grants nor a passing
-- policy — but an unintended grant is still drift, and a from-files rebuild
-- must reproduce the ACL production actually has.

revoke execute on function public.apply_stock_delta(uuid, numeric, text, text, text, text, text, text) from public;
revoke execute on function public.set_stock_quantity(uuid, numeric, text, text, text) from public;

grant execute on function public.apply_stock_delta(uuid, numeric, text, text, text, text, text, text)
  to authenticated, service_role;

grant execute on function public.set_stock_quantity(uuid, numeric, text, text, text)
  to authenticated, service_role;

commit;
