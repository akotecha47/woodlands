-- 057_transfer_stock.sql
-- Phase 2, two-tier inventory - fixes the transfers-don't-deduct bug by giving
-- the Transfers screen a real balance-moving primitive.
--
-- MIGRATION NUMBER: 057. Checked BOTH sides before choosing, because a
-- collision is the duplicate-008 fault that cost Session A a day:
--   files on disk                     001-056 (056 = the unapplied RLS pass)
--   production schema_migrations      001-055
-- 056 is claimed by a FILE even though production has not executed it. A number
-- is taken by the file, not by the history table.
--
-- THE BUG THIS CLOSES
--   TransfersTab.jsx:57-60 wrote TWO stock_movements rows directly and called
--   no RPC at all, so a transfer moved no stock. Reproduced live 13 August 2026
--   (rolled back), replaying the component's exact submission as the admin role:
--     2 ledger rows written, Sports Bar balance stayed at 17,
--     the Kitchen destination row was never created.
--   There was never a record_stock_transfer function to break - confirmed live
--   against pg_proc across every non-system schema. The path never called one.
--
-- WHY THIS IS A THIN DELEGATION AND NOT A SECOND IMPLEMENTATION
--   issue_stock (055) already does exactly what a transfer needs: two
--   apply_stock_delta calls in one function body (one transaction), taken in
--   deterministic (location, sub_location) lock order so an A->B move racing a
--   B->A move cannot deadlock, fail-closed on insufficient source, destination
--   row created if absent. It is tier- and direction-agnostic by construction -
--   nothing in it privileges the store.
--
--   Verified live before writing this file, rolled back, as the admin role:
--     issue_stock(SBA-1001, 'Sports Bar' -> 'Kitchen', 7, movement_type
--     'transfer')  ->  Sports Bar 17 -> 10, Kitchen absent -> 7 at
--     tier='department', Main Store untouched, 2 ledger rows.
--
--   So transfer_stock contains NO locking, NO arithmetic, NO fail-closed check
--   and NO ledger write of its own. Duplicating any of that is how two code
--   paths drift into disagreeing about what a movement means.
--
-- NEW vs CHANGED - stated explicitly, per the overload rule:
--   NEW       transfer_stock(uuid, text, text, numeric, text, text, text)
--             Did not exist in any schema (pg_proc checked). Nothing to drop.
--   CHANGED   NOTHING. issue_stock, apply_stock_delta and set_stock_quantity
--             are not touched by this file - not their bodies, not their
--             signatures, not their grants.
--   DROPPED   nothing.
--   Section 3 below ASSERTS one signature each for transfer_stock and
--   issue_stock and aborts the migration otherwise, so "no overload" is
--   enforced by the migration rather than checked afterwards by hand.
--
-- movement_type IS NOT WIDENED, AND DOES NOT NEED TO BE. Verified live:
--   table CHECK  stock_movements_movement_type_check_v3  permits 'transfer' and 'issue'
--   RPC allowlist  apply_stock_delta (055:98)            permits 'transfer' and 'issue'
--   JS constant    src/lib/stock.js MOVEMENT_TYPES       permits 'transfer' and 'issue'
-- All three already agree. A widening here would be motion without change.
--
-- WHY THE CALLER DOES NOT CHOOSE THE movement_type (Aman, 13 August 2026)
--   It is DERIVED from the physical movement: 'issue' when either end is the
--   main store, 'transfer' otherwise. Requisition Fulfil (055) already writes
--   'issue' for store->department. If the Transfers screen could pass its own
--   value, a manual store->department move would land in the ledger as
--   'transfer' while the identical movement raised through a requisition landed
--   as 'issue' - the Movement Ledger would describe one physical event two
--   ways. Deriving it server-side makes that unrepresentable rather than merely
--   discouraged.
--
--   'Main Store' is hardcoded here, consistently with 051's generated `tier`
--   column and 054's guard trigger, which both hardcode the same reserved name.
--   It is deliberately not a departments row (051) and MAIN_STORE in
--   src/lib/constants.js is the client-side twin.
--
-- INHERITED SEMANTICS - all probed live before this file was written, each
-- rejected with nothing moved (as admin, rolled back):
--   999 from a source holding 17    23514 Insufficient stock: 17 available, 999 required
--   destination 'Nowhere'           23503 not a valid stock location   (054 trigger)
--   source = destination            23514 source and destination are the same location
--   quantity 0                      23514 quantity must be greater than zero
--   source location holds no row    23514 Insufficient stock: 0 available, N required
--
-- RLS - UNCHANGED BY THIS FILE, and already correct. SECURITY INVOKER, so the
-- caller's policies govern. Probed live: owner and admin allowed;
-- department_head and hr denied 42501 at the destination row INSERT - including
-- when both balance rows already exist, because a head's SELECT policy hides
-- the foreign row, so apply_stock_delta's SELECT ... FOR UPDATE finds nothing
-- and takes the INSERT branch. There is no path where a head reaches a
-- silently-zero-row UPDATE and gets a fake success.

begin;

-- 1. transfer_stock ---------------------------------------------------------

create or replace function public.transfer_stock(
  p_stock_item_id     uuid,
  p_from_location     text,
  p_to_location       text,
  p_quantity          numeric,
  p_reason            text default null,
  p_from_sub_location text default null,
  p_to_sub_location   text default null
)
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
DECLARE
  v_movement_type text;
  v_result        jsonb;
BEGIN
  -- IS NOT DISTINCT FROM, not IN: `'Main Store' IN (NULL, 'Kitchen')` is NULL,
  -- not false, which would fall through to 'transfer' on a null location.
  -- issue_stock rejects null locations anyway, but the derivation should not
  -- depend on that happening first.
  v_movement_type := CASE
    WHEN p_from_location IS NOT DISTINCT FROM 'Main Store'
      OR p_to_location   IS NOT DISTINCT FROM 'Main Store'
    THEN 'issue'
    ELSE 'transfer'
  END;

  -- Every guarantee - atomicity, lock order, fail-closed, create-if-missing,
  -- the ledger pair - comes from here. Nothing is reimplemented above or below.
  v_result := public.issue_stock(
    p_stock_item_id,
    p_from_location,
    p_to_location,
    p_quantity,
    p_reason,
    v_movement_type,
    p_from_sub_location,
    p_to_sub_location
  );

  -- Surfaced so the caller can report what was actually recorded rather than
  -- what it assumed. The UI has no say in the value.
  RETURN v_result || jsonb_build_object('movement_type', v_movement_type);
END $function$;

-- 2. grants -----------------------------------------------------------------
-- Same discipline as 052, 054 and 055. CREATE FUNCTION grants EXECUTE to PUBLIC
-- by default, and this project's function default privileges are
-- {postgres=X/postgres} (see 050). Set both ends explicitly rather than inherit
-- either one.

revoke execute on function
  public.transfer_stock(uuid, text, text, numeric, text, text, text) from public;
grant execute on function
  public.transfer_stock(uuid, text, text, numeric, text, text, text)
  to authenticated, service_role;

-- 3. no-overload assertion --------------------------------------------------
-- The 012-class fault is a second signature left callable beside the intended
-- one, silently. 052 hit exactly this and had to drop the old arities. Assert
-- rather than trust: this aborts the migration instead of leaving an overload
-- to be discovered later. issue_stock is asserted too, to prove this file did
-- not disturb it.

do $$
declare
  n_transfer int;
  n_issue    int;
begin
  select count(*) into n_transfer
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'transfer_stock';

  select count(*) into n_issue
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'issue_stock';

  if n_transfer <> 1 then
    raise exception '057: transfer_stock has % signatures, expected exactly 1 (overload)', n_transfer;
  end if;
  if n_issue <> 1 then
    raise exception '057: issue_stock has % signatures, expected exactly 1 - this migration must not have changed it', n_issue;
  end if;
end $$;

comment on function public.transfer_stock(uuid, text, text, numeric, text, text, text) is
  'Move stock between two locations from the Transfers screen. Thin delegation to issue_stock (055) - all atomicity, locking, fail-closed and ledger behaviour lives there. Derives movement_type from the movement itself: ''issue'' when either end is ''Main Store'', otherwise ''transfer'', so a manual store->department move and a requisition fulfil of the same movement cannot disagree in the ledger.';

commit;
