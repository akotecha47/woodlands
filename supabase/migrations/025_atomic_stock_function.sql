-- 025_atomic_stock_function.sql
-- Sprint C / Task 4 — atomic stock mutation.
--
-- Closes WOODLANDS_AUDIT_2.md §3 DoD 6(b): every stock write was a
-- read-then-write race — SELECT quantity, arithmetic in JS, UPDATE — with no
-- row lock, no transaction and no atomic increment. Two concurrent writers on
-- the same stock_item_id silently lost one update, and the stock_movements row
-- was a separate statement that could commit without its balance change.
--
-- Two functions, because the call sites do two different things:
--
--   apply_stock_delta()   — five sites that ADD or SUBTRACT a quantity
--   set_stock_quantity()  — one site (AdjustmentsTab) that SETS an absolute
--                           quantity, i.e. a stock take. A delta function
--                           cannot express "set to N" without the caller
--                           reading first, which is the race being removed.
--
-- Both take a row lock, write current_stock and stock_movements in the same
-- transaction (a function body is one transaction), and return the new
-- quantity.
--
-- SECURITY INVOKER, deliberately: the caller's RLS applies. Migration 022
-- restricts current_stock and stock_movements writes to owner/manager via
-- public.current_app_role(), so a kitchen_manager calling these gets a policy
-- error rather than a stock movement. A SECURITY DEFINER function here would
-- silently hand every authenticated role the ability to move stock.
--
-- ------------------------------------------------------------------
-- MOVEMENT TYPE VOCABULARY — note for Sprint D
-- ------------------------------------------------------------------
-- stock_movements.movement_type has a CHECK limited to
-- ('delivery','transfer','adjustment','requisition') from 008_inventory.sql:16.
-- The two event-stock call sites have no type of their own and pass
-- 'adjustment'. That CHECK is NOT widened here — doing so would alter a
-- constraint on a live table without being asked.
--
-- Consequence: event deductions and returns are indistinguishable from manual
-- stock takes in the ledger. Nothing displays them today (DeliveryLogTab
-- filters movement_type = 'delivery' and no view renders 'adjustment'), so
-- there is no visible regression, but adding 'event_allocation' /
-- 'event_return' is the correct fix. Logged in WOODLANDS_FOLLOWUPS.md.
--
-- NOTE: event stock previously wrote NO movement row at all. Routing it
-- through these functions starts producing them. That is the missing audit
-- trail whose absence made the 4 legacy allocations unreconstructable
-- (see migration 024), so it is an improvement — but it is a behaviour change,
-- not a like-for-like refactor.


-- ==================================================================
-- apply_stock_delta — relative change
-- ==================================================================
CREATE OR REPLACE FUNCTION public.apply_stock_delta(
  p_stock_item_id   uuid,
  p_delta           numeric,
  p_movement_type   text,
  p_reason          text DEFAULT NULL,
  p_from_department text DEFAULT NULL,
  p_to_department   text DEFAULT NULL
) RETURNS numeric
  LANGUAGE plpgsql
  SECURITY INVOKER
  SET search_path = public
AS $$
DECLARE
  v_current numeric;
  v_new     numeric;
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

  -- Lock the balance row for the rest of the transaction. Any concurrent
  -- caller for the same stock item blocks here instead of overwriting.
  SELECT quantity INTO v_current
    FROM public.current_stock
   WHERE stock_item_id = p_stock_item_id
   FOR UPDATE;

  -- No balance row yet (first delivery for an item). Create it at zero, then
  -- take the lock. ON CONFLICT DO NOTHING covers a concurrent creator.
  IF NOT FOUND THEN
    INSERT INTO public.current_stock (stock_item_id, quantity, last_updated)
    VALUES (p_stock_item_id, 0, now())
    ON CONFLICT (stock_item_id) DO NOTHING;

    SELECT quantity INTO v_current
      FROM public.current_stock
     WHERE stock_item_id = p_stock_item_id
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
   WHERE stock_item_id = p_stock_item_id;

  INSERT INTO public.stock_movements
    (stock_item_id, movement_type, quantity_change, from_department, to_department, performed_by, notes)
  VALUES
    (p_stock_item_id, p_movement_type, p_delta, p_from_department, p_to_department, auth.uid(), p_reason);

  RETURN v_new;
END $$;


-- ==================================================================
-- set_stock_quantity — absolute set (stock take)
-- ==================================================================
CREATE OR REPLACE FUNCTION public.set_stock_quantity(
  p_stock_item_id uuid,
  p_new_qty       numeric,
  p_reason        text DEFAULT NULL
) RETURNS numeric
  LANGUAGE plpgsql
  SECURITY INVOKER
  SET search_path = public
AS $$
DECLARE
  v_current numeric;
  v_delta   numeric;
BEGIN
  IF p_stock_item_id IS NULL THEN
    RAISE EXCEPTION 'set_stock_quantity: stock_item_id is required';
  END IF;
  IF p_new_qty IS NULL OR p_new_qty < 0 THEN
    RAISE EXCEPTION 'set_stock_quantity: quantity must be zero or greater (got %)', p_new_qty;
  END IF;

  SELECT quantity INTO v_current
    FROM public.current_stock
   WHERE stock_item_id = p_stock_item_id
   FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.current_stock (stock_item_id, quantity, last_updated)
    VALUES (p_stock_item_id, 0, now())
    ON CONFLICT (stock_item_id) DO NOTHING;

    SELECT quantity INTO v_current
      FROM public.current_stock
     WHERE stock_item_id = p_stock_item_id
     FOR UPDATE;
  END IF;

  v_current := coalesce(v_current, 0);
  v_delta   := p_new_qty - v_current;

  UPDATE public.current_stock
     SET quantity     = p_new_qty,
         last_updated = now()
   WHERE stock_item_id = p_stock_item_id;

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
END $$;


-- ==================================================================
-- Grants
-- ==================================================================
-- EXECUTE is open to authenticated; RLS on current_stock and stock_movements
-- is what actually decides whether the caller may move stock.
REVOKE ALL ON FUNCTION public.apply_stock_delta(uuid, numeric, text, text, text, text) FROM public;
REVOKE ALL ON FUNCTION public.set_stock_quantity(uuid, numeric, text)                  FROM public;

GRANT EXECUTE ON FUNCTION public.apply_stock_delta(uuid, numeric, text, text, text, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_stock_quantity(uuid, numeric, text)
  TO authenticated, service_role;
