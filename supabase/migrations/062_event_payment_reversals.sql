-- 062_event_payment_reversals.sql
-- Phase 2, Events — payments become CORRECTABLE, by reversing entry
-- (FUNCTIONAL_SPEC §5). The last Phase 2 build feature.
--
-- WRITTEN ON A PROVEN BASE. The §2.6 rebuild proof for 001-061 ran BEFORE a
-- line of this file existed (18 August 2026, throwaway njttkfrbhnkdpqrtirlu,
-- eu-west-1, deleted after and confirmed gone). Ten of thirteen fingerprint
-- categories were byte-identical by md5 over their full sorted detail: tables
-- 37/37, columns-by-set 429/429, constraints 142/142, indexes 76/76, privileges
-- 600/600, pg_default_acl 24/24, RLS enablement 37/37 (all true, argued from
-- production's side), triggers 2/2, views 2/2 both security_invoker, comments
-- 33/33. The three that differed differed by EXACTLY the four pre-declared
-- residuals and nothing else: attendance_records ordinals 14-18 (set-identical),
-- handle_new_user (production-only) against rls_auto_enable (rebuild-only), and
-- the 2 legacy duplicate service_role policies on departments/user_profiles.
-- 061's own new surface all reproduced: v_fm_attendance present as a view with
-- security_invoker=true, its fm_market_day/fm_last_n_market_days dependencies
-- carrying EXECUTE for authenticated and NOT for anon or public, and the
-- migration-borne taxonomy seed at 6/17/51 with all six fees at Dhiren's
-- confirmed amounts. apply_stock_delta compared by md5(prosrc) + proacl and
-- never by oid: identical on both, one signature, no PUBLIC/anon EXECUTE.
--
-- ── THE FORK, DECIDED WITH AMAN 18 AUGUST: REVERSING ENTRY, NOT EDIT-IN-PLACE ─
-- Dhiren, 27 July: "Payments tab on Events cannot be edited. Payments can be
-- recorded but not corrected." Two ways to answer that, and the schema had
-- already answered it once:
--
--   event_payments has NO DELETE grant and NO DELETE policy for authenticated,
--   while events and event_bill_items both DO. That absence is a decision, not
--   an oversight — this table is an append-only money ledger.
--
-- Edit-in-place would make the one table nobody may delete from silently
-- mutable, and would destroy the original figure with no trace. It would also
-- need NEW audit columns (amended_by / amended_at) to surface "last amended by",
-- so it does not even avoid the DDL — it spends it on worse columns. A reversal
-- carries its own recorded_by and created_at, so the audit trail is the ledger
-- itself. Refunds already prove the convention works: they are stored POSITIVE
-- with payment_type='refund' (CHECK (amount > 0) makes a negative row
-- impossible) and subtracted in the reading. Reversals do exactly the same.
--
-- A REFUND AND A REVERSAL ARE NOT THE SAME EVENT and this file keeps them
-- apart. A refund is money going back to the client. A reversal says the money
-- never arrived in the shape recorded — the entry was wrong. Both reduce
-- recognised revenue; only one of them is a real cash movement.
--
-- ── WHY THE LINK COLUMN IS NOT GOLD-PLATING ─────────────────────────────────
-- Without reverses_payment_id, deposit_paid cannot be recomputed: you cannot
-- tell whether a reversal cancelled a deposit or a balance payment. A reversed
-- deposit would leave events.deposit_paid = true for ever, and the Events List's
-- amber "confirmed - unpaid deposit" highlight would silently lie. That is the
-- same class as the data-ops/006 bug where a department filter quietly hid every
-- event draw. One nullable FK removes it.
--
-- ── WHAT THIS FILE ADDS ─────────────────────────────────────────────────────
--   1. event_payments.reverses_payment_id  nullable, FK to event_payments(id),
--      ON DELETE RESTRICT so a reversed payment cannot be deleted out from
--      under its reversal by service_role.
--   2. Two CHECKs  no self-reference; and payment_type='reversal' if and only if
--      reverses_payment_id is set, so a reversal always points at its original
--      and a pointer always announces itself as a reversal.
--   3. A partial UNIQUE index  one reversal per payment.
--   4. A BEFORE trigger  for the rules a CHECK cannot express, because they need
--      a subquery: same event, target is not itself a reversal, and the amount
--      matches exactly. Trigger not CHECK, exactly as 054's location guard.
--   5. reverse_event_payment()  SECURITY DEFINER, gated owner/admin, which
--      writes the reversal AND recomputes events.deposit_paid in ONE
--      transaction. The client cannot do that across two PostgREST calls, and
--      the half-applied version of this is already logged in this repo:
--      LogDeliveryTab used to insert the movement first and update the balance
--      second.
--
-- NO new policies and NO new grants on event_payments. The existing
-- insert/select/update policies are already gated on
-- current_app_role() IN ('owner','admin') and cover the new column, so a
-- department_head or hr is refused by the policy that is already there. Adding
-- policies here would create a second place to look.
--
-- Every function this file creates is revoked from public and anon before being
-- granted, and §9 asserts it. 060's first dry run failed on precisely that
-- omission, caught by the guard rather than by review.

begin;

-- ── 0. assert the ground this file stands on ────────────────────────────────
-- The paired CHECK in §2 would reject any pre-existing row typed 'reversal'.
-- Assert there is none rather than assume it, so a replay against a database
-- that has since grown such rows aborts instead of half-applying.
do $$
declare
  v_bad int;
  v_col int;
begin
  select count(*) into v_bad
  from public.event_payments
  where coalesce(payment_type, '') = 'reversal';

  if v_bad > 0 then
    raise exception '062 GUARD FAILED: % existing event_payments rows are already typed reversal, but no reverses_payment_id exists to point them at an original. Reconcile them before applying. Rolling back.', v_bad;
  end if;

  select count(*) into v_col
  from information_schema.columns
  where table_schema = 'public' and table_name = 'event_payments'
    and column_name = 'reverses_payment_id';

  raise notice '062: pre-flight clean - 0 pre-existing reversal rows; reverses_payment_id present already: %.', v_col;
end $$;

-- ── 1. the linkage column ───────────────────────────────────────────────────
alter table public.event_payments
  add column if not exists reverses_payment_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'event_payments_reverses_payment_id_fkey'
      and conrelid = 'public.event_payments'::regclass
  ) then
    alter table public.event_payments
      add constraint event_payments_reverses_payment_id_fkey
      foreign key (reverses_payment_id)
      references public.event_payments(id)
      on delete restrict;
  end if;
end $$;

comment on column public.event_payments.reverses_payment_id is
  'The payment this row reverses. NULL on every ordinary payment. Set only by reverse_event_payment(). A correction is a new row, never an edit: this table has no DELETE grant and no DELETE policy, and the original figure must survive its own correction.';

-- ── 2. the two CHECKs a single row can answer for itself ────────────────────
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'event_payments_no_self_reversal'
      and conrelid = 'public.event_payments'::regclass
  ) then
    alter table public.event_payments
      add constraint event_payments_no_self_reversal
      check (reverses_payment_id is null or reverses_payment_id <> id);
  end if;

  -- The biconditional matters in both directions. Left to right: a row that
  -- claims to be a reversal must say what it reverses, or the netting cannot be
  -- undone or audited. Right to left: a row that points at an original must be
  -- typed 'reversal', or summarisePayments() would ADD it to gross instead of
  -- subtracting it and the bill would silently double-count.
  -- coalesce, because payment_type is nullable and a NULL comparison would make
  -- the CHECK pass by evaluating to NULL.
  if not exists (
    select 1 from pg_constraint
    where conname = 'event_payments_reversal_typed'
      and conrelid = 'public.event_payments'::regclass
  ) then
    alter table public.event_payments
      add constraint event_payments_reversal_typed
      check ((coalesce(payment_type, '') = 'reversal') = (reverses_payment_id is not null));
  end if;
end $$;

-- ── 3. one reversal per payment ─────────────────────────────────────────────
-- Partial, so the thousands of NULLs on ordinary payments do not collide with
-- each other. This is the constraint that makes "reverse it twice" impossible
-- even if two owners click at the same moment; the check inside the RPC is for
-- the error message, not for the guarantee.
create unique index if not exists event_payments_one_reversal_per_payment
  on public.event_payments (reverses_payment_id)
  where reverses_payment_id is not null;

-- ── 4. the rules a CHECK cannot express ─────────────────────────────────────
-- All three need to read another row, so they cannot be CHECK constraints.
-- A trigger, following 054's location guard: not an FK either, because these are
-- relationships between two rows of the SAME table, not a reference.
create or replace function public.event_payment_reversal_guard()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
DECLARE
  v_target public.event_payments%ROWTYPE;
BEGIN
  IF NEW.reverses_payment_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- FOR UPDATE: locks the original for the life of the transaction, so two
  -- concurrent reversals serialise here rather than racing to the unique index.
  SELECT * INTO v_target
  FROM public.event_payments
  WHERE id = NEW.reverses_payment_id
  FOR UPDATE;

  -- Deliberately fail-closed. This function runs as the invoker, so if RLS
  -- hides the target from whoever is inserting, the reversal is REFUSED rather
  -- than written against a row the writer cannot see.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'event payment reversal: the payment being reversed does not exist, or is not visible to you'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_target.event_id <> NEW.event_id THEN
    RAISE EXCEPTION 'event payment reversal: a payment can only be reversed on its own event (target belongs to event %, reversal was written against event %)', v_target.event_id, NEW.event_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- Reversing a reversal would subtract twice: both rows are typed 'reversal'
  -- and both are subtracted by every reading. The correction for a wrong
  -- reversal is a fresh payment, not an un-reversal.
  IF v_target.reverses_payment_id IS NOT NULL
     OR coalesce(v_target.payment_type, '') = 'reversal' THEN
    RAISE EXCEPTION 'event payment reversal: a reversal cannot itself be reversed. Record the correct payment instead.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- A reversal is total. A partial correction is two facts (this much was
  -- wrong, that much was right) and is recorded as a reversal plus a fresh
  -- payment, so the ledger never has to be read as arithmetic on one row.
  IF NEW.amount <> v_target.amount THEN
    RAISE EXCEPTION 'event payment reversal: a reversal must be for the full amount of the payment it reverses (payment is %, reversal was %)', v_target.amount, NEW.amount
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

comment on function public.event_payment_reversal_guard() is
  'Integrity rules for a reversing entry that need to read the row being reversed: same event, target is not itself a reversal, and the amount matches exactly. A trigger rather than a CHECK because each rule requires a subquery. Fail-closed if the target is not visible.';

drop trigger if exists event_payments_reversal_guard on public.event_payments;
create trigger event_payments_reversal_guard
  before insert or update of reverses_payment_id, amount, event_id, payment_type
  on public.event_payments
  for each row
  execute function public.event_payment_reversal_guard();

-- ── 5. reverse_event_payment ────────────────────────────────────────────────
-- The reversal row and the deposit_paid recomputation are ONE transaction. Two
-- PostgREST calls from the browser cannot be, and this repo already carries the
-- scar: LogDeliveryTab inserted the movement first and updated the balance
-- second, so a failure between them left a delivery on record that never
-- arrived.
create or replace function public.reverse_event_payment(
  p_payment_id uuid,
  p_reason     text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_role         text;
  v_orig         public.event_payments%ROWTYPE;
  v_existing     uuid;
  v_reversal_id  uuid;
  v_deposit_paid boolean;
BEGIN
  IF p_payment_id IS NULL THEN
    RAISE EXCEPTION 'reverse_event_payment: a payment is required'
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── the security boundary ────────────────────────────────────────────────
  -- SECURITY DEFINER, so RLS does not apply inside this body and this check IS
  -- the gate. It deliberately mirrors the event_payments policies rather than
  -- inventing a second rule: owner and admin, nobody else.
  v_role := public.current_app_role();
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'reverse_event_payment: no active profile for this user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'reverse_event_payment: % is not permitted to reverse a payment', v_role
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_orig FROM public.event_payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'reverse_event_payment: payment % not found', p_payment_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_orig.reverses_payment_id IS NOT NULL
     OR coalesce(v_orig.payment_type, '') = 'reversal' THEN
    RAISE EXCEPTION 'reverse_event_payment: that row is itself a reversal and cannot be reversed. Record the correct payment instead.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The unique index is the guarantee; this is here so the caller gets a
  -- sentence instead of a constraint name.
  SELECT id INTO v_existing
  FROM public.event_payments
  WHERE reverses_payment_id = p_payment_id;

  IF FOUND THEN
    RAISE EXCEPTION 'reverse_event_payment: that payment has already been reversed (reversal %)', v_existing
      USING ERRCODE = 'unique_violation';
  END IF;

  -- payment_date is NOW, not the original's date: the correction happened
  -- today, and back-dating it would move money between reporting periods.
  -- received_by is NULL because nobody received anything; recorded_by is the
  -- signed-in user and is what "who reversed this" is read from.
  INSERT INTO public.event_payments (
    event_id, amount, payment_date, payment_method, payment_type,
    reference, notes, received_by, recorded_by, reverses_payment_id
  ) VALUES (
    v_orig.event_id,
    v_orig.amount,
    now(),
    v_orig.payment_method,
    'reversal',
    v_orig.reference,
    p_reason,
    NULL,
    auth.uid(),
    v_orig.id
  )
  RETURNING id INTO v_reversal_id;

  -- ── recompute deposit_paid, always, not only when a deposit was reversed ──
  -- Derived from the rows rather than flipped, so the flag cannot drift from
  -- the ledger. A deposit counts only while nothing points at it.
  SELECT EXISTS (
    SELECT 1
    FROM public.event_payments p
    WHERE p.event_id = v_orig.event_id
      AND coalesce(p.payment_type, '') = 'deposit'
      AND NOT EXISTS (
        SELECT 1 FROM public.event_payments r
        WHERE r.reverses_payment_id = p.id
      )
  ) INTO v_deposit_paid;

  UPDATE public.events
  SET deposit_paid = v_deposit_paid,
      updated_at   = now()
  WHERE id = v_orig.event_id;

  RETURN jsonb_build_object(
    'reversal_id',      v_reversal_id,
    'reversed_payment', v_orig.id,
    'event_id',         v_orig.event_id,
    'amount',           v_orig.amount,
    'payment_type',     v_orig.payment_type,
    'deposit_paid',     v_deposit_paid,
    'reversed_by',      auth.uid()
  );
END;
$function$;

comment on function public.reverse_event_payment(uuid, text) is
  'Correct an event payment by reversing entry. Gated owner/admin. Writes a positive reversal row pointing at the original and recomputes events.deposit_paid from the surviving rows, atomically or not at all. event_payments is append-only by design: nothing here edits or deletes the original.';

revoke execute on function public.reverse_event_payment(uuid, text)      from public, anon;
grant  execute on function public.reverse_event_payment(uuid, text)      to authenticated, service_role;

revoke execute on function public.event_payment_reversal_guard()         from public, anon;
grant  execute on function public.event_payment_reversal_guard()         to authenticated, service_role;

-- ── 6. the objects landed ───────────────────────────────────────────────────
do $$
declare
  v_missing text := '';
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='event_payments'
      and column_name='reverses_payment_id'
  ) then v_missing := v_missing || ' column'; end if;

  if not exists (
    select 1 from pg_constraint
    where conname='event_payments_reverses_payment_id_fkey'
      and conrelid='public.event_payments'::regclass
  ) then v_missing := v_missing || ' fkey'; end if;

  if not exists (
    select 1 from pg_constraint
    where conname='event_payments_reversal_typed'
      and conrelid='public.event_payments'::regclass
  ) then v_missing := v_missing || ' typed-check'; end if;

  if not exists (
    select 1 from pg_constraint
    where conname='event_payments_no_self_reversal'
      and conrelid='public.event_payments'::regclass
  ) then v_missing := v_missing || ' self-check'; end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname='public' and indexname='event_payments_one_reversal_per_payment'
  ) then v_missing := v_missing || ' unique-index'; end if;

  if not exists (
    select 1 from pg_trigger
    where tgname='event_payments_reversal_guard'
      and tgrelid='public.event_payments'::regclass
      and not tgisinternal
  ) then v_missing := v_missing || ' trigger'; end if;

  if v_missing <> '' then
    raise exception '062 GUARD FAILED: missing objects after apply:%. Rolling back.', v_missing;
  end if;

  raise notice '062: column, FK, 2 checks, partial unique index and trigger all present.';
end $$;

-- ── 7. no policy or grant on event_payments was touched ─────────────────────
-- Asserted rather than claimed. authenticated must still hold exactly
-- SELECT/INSERT/UPDATE and still NOT hold DELETE, and the table must still
-- carry exactly its four policies. If this file ever grows a policy by
-- accident, this fires.
do $$
declare
  v_privs text;
  v_pols  int;
  v_del   int;
begin
  select string_agg(privilege_type, ',' order by privilege_type) into v_privs
  from information_schema.role_table_grants
  where table_schema='public' and table_name='event_payments' and grantee='authenticated'
    and privilege_type in ('SELECT','INSERT','UPDATE','DELETE');

  select count(*) into v_pols from pg_policies
  where schemaname='public' and tablename='event_payments';

  select count(*) into v_del from pg_policies
  where schemaname='public' and tablename='event_payments' and cmd='DELETE';

  if v_privs is distinct from 'INSERT,SELECT,UPDATE' then
    raise exception '062 GUARD FAILED: authenticated holds % on event_payments, expected exactly INSERT,SELECT,UPDATE. A DELETE grant here would break the append-only ledger this file depends on. Rolling back.', v_privs;
  end if;

  if v_del > 0 then
    raise exception '062 GUARD FAILED: % DELETE policies on event_payments; expected 0. Rolling back.', v_del;
  end if;

  if v_pols <> 4 then
    raise exception '062 GUARD FAILED: % policies on event_payments, expected 4 (service_role ALL, select, insert, update). Rolling back.', v_pols;
  end if;

  raise notice '062: event_payments still append-only - authenticated holds %, 0 DELETE policies, % policies total.', v_privs, v_pols;
end $$;

-- ── 8. existing rows survived ───────────────────────────────────────────────
do $$
declare
  v_n int; v_sum numeric; v_rev int;
begin
  select count(*), coalesce(sum(amount),0) into v_n, v_sum from public.event_payments;
  select count(*) into v_rev from public.event_payments where reverses_payment_id is not null;

  if v_rev <> 0 then
    raise exception '062 GUARD FAILED: % rows already carry reverses_payment_id immediately after adding the column. Rolling back.', v_rev;
  end if;

  raise notice '062: % payment rows preserved, total MWK %, 0 reversals (as expected on a fresh column).', v_n, v_sum;
end $$;

-- ── 9. no function this file creates carries PUBLIC or anon EXECUTE ─────────
-- The check 060's first dry run failed, kept as a standing guard. A new
-- function inherits Postgres's built-in PUBLIC EXECUTE default, which reads as
-- anon on this project.
do $$
declare
  r record;
  v_bad text := '';
begin
  for r in
    select p.oid, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('reverse_event_payment', 'event_payment_reversal_guard')
  loop
    if has_function_privilege('anon', r.oid, 'EXECUTE')
       or has_function_privilege('public', r.oid, 'EXECUTE') then
      v_bad := v_bad || ' ' || r.proname;
    end if;
  end loop;

  if v_bad <> '' then
    raise exception '062 GUARD FAILED: PUBLIC/anon EXECUTE present on:%. Rolling back.', v_bad;
  end if;

  raise notice '062: no PUBLIC or anon EXECUTE on either new function.';
end $$;

-- ── 10. one signature each, no accidental overload ──────────────────────────
-- The 052 trap: CREATE OR REPLACE with a changed argument list overloads rather
-- than replaces, leaving the old, now-wrong function callable.
do $$
declare
  v_rev int; v_grd int;
begin
  select count(*) into v_rev from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='reverse_event_payment';

  select count(*) into v_grd from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='event_payment_reversal_guard';

  if v_rev <> 1 or v_grd <> 1 then
    raise exception '062 GUARD FAILED: expected one signature each, found reverse_event_payment=%, event_payment_reversal_guard=%. Rolling back.', v_rev, v_grd;
  end if;

  raise notice '062: one signature each in pg_proc.';
end $$;

commit;
