-- scripts/data-ops/007_encoding_heal.sql
--
-- DATA-OP, NOT A MIGRATION. Deliberately: the migration FILES are already
-- correct. Only PRODUCTION is wrong. There is no schema change here and nothing
-- for a from-files rebuild to replay -- a rebuild produces the clean text
-- already, which is exactly how this was found.
--
-- ---------------------------------------------------------------------------
-- WHAT WAS WRONG
-- ---------------------------------------------------------------------------
-- Rebuild proof run 7 (17 August 2026, throwaway tnseclavqwijhtmljgui) diffed
-- 001-059 against production. Everything matched -- tables 30/30, columns
-- 328/328, constraints 114/114, indexes 54/54, privileges 678/678,
-- pg_default_acl 24/24, RLS 30/30, triggers 2/2 -- except two function bodies
-- that differed by md5(prosrc) while sharing an identical signature, prosecdef
-- and proacl.
--
-- Measured by STORED CODEPOINTS, not by rendering:
--
--                            files / rebuild        production
--   post_bar_count           92 x U+2500            0 box-draw, 92 x U+00E2
--   set_stock_quantity        1 x U+2014            0 em-dash,   1 x U+00E2
--   current_stock.par_level  clean comment          corrupted
--   event_stock_allocations
--     .deducted_qty          clean comment          corrupted
--
-- The clincher: production's post_bar_count CHARACTER count (4481) equals the
-- rebuild's BYTE count (4481) -- the signature of UTF-8 bytes decoded as
-- single-byte Latin-1.
--
-- ---------------------------------------------------------------------------
-- ROOT CAUSE -- reproduced, not inferred
-- ---------------------------------------------------------------------------
-- The apply path read migration files with bare `Get-Content`. PowerShell 5.1
-- decodes with the ANSI codepage (Windows-1252 here), not UTF-8. Reading 059
-- both ways:
--
--   U+2500 box-drawing   old path 0     fixed path 333
--   U+00E2 mojibake      old path 360   fixed path 0
--   round trip to bytes  old path 35427 -> 37230 (inflated)
--                        fixed path 35427 -> 35427 (byte-exact)
--
-- src/lib/standards.md section 4 ALREADY carried this rule, learned from the
-- Farmers Market import ("decode explicitly ... never bare Get-Content"). It
-- was honoured in the import path and never carried across to the apply path.
-- The rule is now a script -- scripts/apply-sql.ps1 -- which reads UTF-8
-- explicitly AND refuses to send text still containing U+00C3 / U+00E2.
--
-- ORDER MATTERS: the tooling was fixed and proven BEFORE this ran. Healing
-- through the old path would have written the same corruption straight back in.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS DOES
-- ---------------------------------------------------------------------------
-- Re-runs four statements, sliced verbatim out of the migration files rather
-- than retyped, so the healed text cannot drift from the files:
--
--   059_bar_par_levels.sql          lines 405-487   set_stock_quantity
--   059_bar_par_levels.sql          lines 491-618   post_bar_count
--   059_bar_par_levels.sql          lines 126-127   current_stock.par_level
--   024_event_stock_returned_qty.sql lines 42-43    ...deducted_qty
--
-- CREATE OR REPLACE with a byte-identical signature REPLACES rather than
-- overloads, so the oid and proacl survive -- the grant-survival trap this
-- project has now dodged four times (052 documents it; 055, 058, 059 repeat
-- it). Asserted below rather than assumed: the script captures oid and proacl
-- first and RAISES if either moves, which aborts the whole transaction.
--
-- Impact of the corruption itself was cosmetic -- every affected character sits
-- inside a `--` comment or a COMMENT ON string. Both bodies are 123 and 73
-- lines on each side and only comment lines ever differed; no executable
-- statement, constraint, default, policy name or data row was affected (swept
-- for all of them). 059's 19/19 live role proof therefore stands unchanged.
-- What it broke was the PROOF: md5(prosrc) could never match again, so every
-- future 2.6 run would flag it forever.

begin;

create temp table _heal_before on commit drop as
  select p.oid                                   as fn_oid,
         p.proname                               as fn_name,
         coalesce(array_to_string(p.proacl,','), '<default>') as fn_acl,
         md5(p.prosrc)                           as fn_md5
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('post_bar_count', 'set_stock_quantity');

do $heal$
begin
  if (select count(*) from _heal_before) <> 2 then
    raise exception '007: expected exactly 2 target functions, found %', (select count(*) from _heal_before);
  end if;
end $heal$;

-- ---------------------------------------------------------------------------
-- 1. set_stock_quantity -- verbatim from 059 lines 405-487
-- ---------------------------------------------------------------------------
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
  --
  -- 059: the department is now recorded. A stock take has ONE location, so the
  -- sign carries the direction — stock leaving the location is a `from`, stock
  -- appearing is a `to`. Leaving both NULL (the pre-059 behaviour) made every
  -- adjustment invisible to the Movement Ledger's department filter, which is a
  -- nullable-column filter and therefore drops null rows silently. Same fault,
  -- and same fix, as scripts/data-ops/006 applied to event movements.
  IF v_delta <> 0 THEN
    INSERT INTO public.stock_movements
      (stock_item_id, movement_type, quantity_change, from_department, to_department, performed_by, notes)
    VALUES
      (p_stock_item_id, 'adjustment', v_delta,
       CASE WHEN v_delta < 0 THEN v_location ELSE NULL END,
       CASE WHEN v_delta > 0 THEN v_location ELSE NULL END,
       auth.uid(), p_reason);
  END IF;

  RETURN p_new_qty;
END $function$;

-- ---------------------------------------------------------------------------
-- 2. post_bar_count -- verbatim from 059 lines 491-618
-- ---------------------------------------------------------------------------

create or replace function public.post_bar_count(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_session   public.bar_count_sessions%ROWTYPE;
  v_role      text;
  v_dept      text;
  v_line      record;
  v_system    numeric;
  v_par       numeric;
  v_short     numeric;
  v_counted   integer := 0;
  v_raised    integer := 0;
  v_units     numeric := 0;
BEGIN
  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'post_bar_count: session id is required';
  END IF;

  -- Lock the session first: two concurrent posts of the same count would
  -- otherwise both pass the draft check and apply the stock take twice.
  SELECT * INTO v_session
    FROM public.bar_count_sessions
   WHERE id = p_session_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'post_bar_count: no such count session %', p_session_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_session.status <> 'draft' THEN
    RAISE EXCEPTION 'post_bar_count: session % is already % - a posted count cannot be posted again', p_session_id, v_session.status
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── the security boundary ────────────────────────────────────────────────
  -- This function is SECURITY DEFINER, so RLS does not apply inside it. This
  -- check is therefore the ONLY gate, and it is deliberately explicit: the
  -- location is taken from the locked session row, never from an argument, so
  -- a caller cannot name a location they do not own.
  v_role := public.current_app_role();
  v_dept := public.current_app_department();

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'post_bar_count: no active profile for this user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT (
    v_role IN ('owner', 'admin')
    OR (v_role = 'department_head' AND v_dept IS NOT NULL AND v_dept = v_session.location)
  ) THEN
    RAISE EXCEPTION 'post_bar_count: % is not permitted to post a count for %', v_role, v_session.location
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── apply the count, line by line ────────────────────────────────────────
  -- Ordered by stock_item_id so two sessions touching the same item take their
  -- row locks in the same order, matching 055's deterministic-lock-order rule.
  FOR v_line IN
    SELECT * FROM public.bar_count_lines
     WHERE session_id = p_session_id
     ORDER BY stock_item_id
  LOOP
    SELECT cs.quantity, cs.par_level INTO v_system, v_par
      FROM public.current_stock cs
     WHERE cs.stock_item_id = v_line.stock_item_id
       AND cs.location      = v_session.location
       AND cs.sub_location IS NOT DISTINCT FROM v_session.sub_location;

    v_system := coalesce(v_system, 0);

    -- Reconcile the balance to what was physically counted. This is the stock
    -- take: the delta is the night's consumption.
    PERFORM public.set_stock_quantity(
      v_line.stock_item_id,
      v_line.counted_qty,
      'Bar count (session ' || p_session_id || ')',
      v_session.location,
      v_session.sub_location
    );

    -- Shortfall against par. An item with no par is not par-managed, so it is
    -- counted and reconciled but never refilled.
    v_short := greatest(coalesce(v_par, 0) - v_line.counted_qty, 0);

    UPDATE public.bar_count_lines
       SET system_qty = v_system,
           par_level  = v_par,
           shortfall  = v_short
     WHERE id = v_line.id;

    v_counted := v_counted + 1;

    IF v_par IS NOT NULL AND v_short > 0 THEN
      INSERT INTO public.requisitions
        (stock_item_id, requested_by, department, quantity, reason, status,
         count_session_id, source)
      VALUES
        (v_line.stock_item_id, auth.uid(), v_session.location, v_short,
         'Par refill from bar count (session ' || p_session_id || ')', 'pending',
         p_session_id, 'par_refill');

      v_raised := v_raised + 1;
      v_units  := v_units + v_short;
    END IF;
  END LOOP;

  UPDATE public.bar_count_sessions
     SET status     = 'posted',
         posted_by  = auth.uid(),
         posted_at  = now(),
         updated_at = now()
   WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'session_id',           p_session_id,
    'location',             v_session.location,
    'business_date',        v_session.business_date,
    'lines_counted',        v_counted,
    'requisitions_raised',  v_raised,
    'units_requested',      v_units
  );
END $function$;

-- ---------------------------------------------------------------------------
-- 3. current_stock.par_level comment -- verbatim from 059 lines 126-127
-- ---------------------------------------------------------------------------

comment on column public.current_stock.par_level is
  'Par level: the minimum this location must hold before opening, and the target a refill tops up to. Distinct from reorder_level, which only decides when to warn. NULL means this location is not par-managed and never enters the end-of-day refill cycle — today only Main Bar and Sports Bar carry values.';

-- ---------------------------------------------------------------------------
-- 4. event_stock_allocations.deducted_qty comment -- verbatim from 024 lines 42-43
-- ---------------------------------------------------------------------------

COMMENT ON COLUMN public.event_stock_allocations.deducted_qty IS
  'Quantity actually removed from current_stock when this allocation was deducted. NULL means the allocation predates Sprint C (2026-07-26) and the true amount is unknown — read as coalesce(deducted_qty, allocated_qty). Since Sprint C the deduct path fails closed on insufficient stock, so for new rows this always equals allocated_qty.';
-- ---------------------------------------------------------------------------
-- 5. assert the heal did exactly what it claimed
-- ---------------------------------------------------------------------------
-- oid unchanged  -> it was replaced in place, not dropped and recreated
-- proacl unchanged -> no grant was silently stripped
-- md5 CHANGED    -> the corrupted text really was overwritten
-- Any of the three failing aborts the transaction, so a half-heal cannot commit.

do $heal$
declare
  r record;
begin
  for r in
    select b.fn_name, b.fn_oid as old_oid, b.fn_acl as old_acl, b.fn_md5 as old_md5,
           p.oid    as new_oid,
           coalesce(array_to_string(p.proacl,','), '<default>') as new_acl,
           md5(p.prosrc) as new_md5
      from _heal_before b
      join pg_proc p on p.oid = b.fn_oid
  loop
    if r.old_oid is distinct from r.new_oid then
      raise exception '007: % oid moved % -> % (it was recreated, not replaced)', r.fn_name, r.old_oid, r.new_oid;
    end if;
    if r.old_acl is distinct from r.new_acl then
      raise exception '007: % proacl changed % -> %', r.fn_name, r.old_acl, r.new_acl;
    end if;
    if r.old_md5 = r.new_md5 then
      raise exception '007: % body md5 did not change - the corrupted text was NOT overwritten', r.fn_name;
    end if;
    raise notice '007: % healed - oid % and proacl unchanged, md5 % -> %',
      r.fn_name, r.new_oid, r.old_md5, r.new_md5;
  end loop;

  -- no mojibake marker may survive anywhere in the two bodies or the two comments
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('post_bar_count','set_stock_quantity')
       and (p.prosrc like '%' || chr(226) || '%' or p.prosrc like '%' || chr(195) || '%')
  ) then
    raise exception '007: a healed function body STILL contains a mojibake marker - the read path is still wrong';
  end if;

  if exists (
    select 1 from pg_description d
     where d.description like '%' || chr(226) || '%'
        or d.description like '%' || chr(195) || '%'
  ) then
    raise exception '007: an object comment still contains a mojibake marker';
  end if;
end $heal$;

commit;