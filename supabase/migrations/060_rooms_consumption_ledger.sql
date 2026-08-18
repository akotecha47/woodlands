-- 060_rooms_consumption_ledger.sql
-- Phase 2, Inventory — rooms + the consumption ledger (FUNCTIONAL_SPEC §2.2, §2.3).
--
-- WHAT THIS BUILDS
--   Dhiren's stated pain: "we cannot see which rooms used which stock." This
--   migration adds the missing reference list (rooms) and the missing third
--   dimension on a stock draw (who drew it, and for which room), then exposes
--   consumption as ONE ledger over the two places consumption actually happens.
--
-- WHY CONSUMPTION IS A VIEW AND NOT A TABLE
--   Consumption is already recorded twice in this system, by two different acts,
--   and neither can be replaced by a third table without inventing a second
--   source of truth for a number we already hold:
--
--     leg 1 — THE BAR.  059 established that a bar count IS a stock take:
--             nothing deducts sales, so the balance is fiction between counts
--             and (system_qty - counted_qty) IS the night's consumption. That
--             delta is already stamped on bar_count_lines at post time.
--     leg 2 — THE DRAW.  Everywhere else (housekeeping, laundry, kitchen) stock
--             is physically drawn and used. That is a stock_movements row.
--
--   A consumption TABLE would have to be written by both paths and kept in step
--   with both — the exact drift class scripts/data-ops/003, 004 and 006 each
--   spent a session repairing. A view has no state to drift. It is defined
--   `security_invoker = true`, so the base-table RLS the project already proved
--   (056 for balances, 059 for count lines, 038 for movements) IS the view's
--   access control; the view adds no policy surface of its own and cannot
--   accidentally widen one.
--
-- NEW vs CHANGED — stated explicitly, because this project has been bitten by
-- the overload/grant trap three times (052 documents it; 055, 058 and 059 each
-- repeat the discipline):
--   NEW              rooms (+ RLS, policies, grants, indexes, seed — same
--                    migration, per Standard rule 2)
--   NEW              stock_movements.room_id, .consumed_by, .sub_location
--   NEW              record_consumption(...)        SECURITY DEFINER
--   NEW              v_stock_consumption            security_invoker view
--   NEW              staff_dept_select policy on staff
--   CHANGED (check)  stock_movements movement_type CHECK _v4 -> _v5, adding
--                    'consumption'. Widened in all three places in THIS one
--                    migration per the 055/058 rule: the table CHECK, the
--                    apply_stock_delta allowlist, and MOVEMENT_TYPES in
--                    src/lib/stock.js (the last is in the same commit).
--   CHANGED (SIG)    apply_stock_delta — see the whole section below.
--   DROPPED          nothing else.
--
-- ── THE ONE DANGEROUS THING IN THIS MIGRATION ───────────────────────────────
-- apply_stock_delta gains p_room_id and p_consumed_by. That is a SIGNATURE
-- change, and a signature change is NOT a replace:
--
--   * CREATE OR REPLACE with extra parameters does not replace, it OVERLOADS.
--     052 hit exactly this and documented it: the old, now-incomplete overload
--     stays callable and silently keeps writing rows without attribution.
--     So the old signature must be DROPPED, not replaced.
--   * DROP + CREATE strips proacl. This project's function default privileges
--     are {postgres=X/postgres} (verified live, pg_default_acl), so the new
--     function is created with NO grant to authenticated at all — every stock
--     write in the app would start failing with a permission error. 052 hit
--     this too.
--
-- The guard below therefore captures proacl BEFORE the drop, re-GRANTs
-- explicitly after the create, and ABORTS THE WHOLE MIGRATION if the resulting
-- privilege set is not identical. It also asserts exactly one signature remains
-- in pg_proc, which is the assertion that catches the overload trap.
--
-- HONEST LIMIT ON THE GUARD: the oid CANNOT be preserved. 055, 058 and 059 each
-- proved grant survival by showing the oid unchanged, because each of those was
-- a true in-place replace with a byte-identical parameter list. A dropped
-- function's oid is gone and Postgres assigns a fresh one; there is no form of
-- DDL that changes a function's argument list while keeping its oid. The oid is
-- recorded before and after for the record, but the INVARIANT being asserted
-- here is the privilege set, not the oid — and it is asserted harder to
-- compensate: identical proacl, exactly one signature, and (in the session
-- proof, not here) a live EXECUTE as `authenticated` with RLS in force.
--
-- WHY NOT AVOID THE SIGNATURE CHANGE ENTIRELY
--   The alternative is record_consumption writing the current_stock UPDATE and
--   the stock_movements INSERT itself. Rejected: that is a second copy of the
--   row-lock / fail-closed / location-resolution logic that apply_stock_delta
--   owns, and two copies of locking is how a balance goes wrong silently.
--   One implementation, widened once, is the cheaper risk.
--
-- WHY record_consumption IS SECURITY DEFINER, AND WHAT GATES IT
--   Identical reasoning to 059's post_bar_count. A department_head holds no
--   write policy on current_stock or stock_movements (all owner/admin, migration
--   022, re-confirmed live today), so a housekeeper's supervisor could not
--   record their own department's draw. Widening those policies was rejected in
--   059 because it also grants arbitrary balance edits at that location; that
--   reasoning has not changed. So: one SECURITY DEFINER entry point granting
--   exactly "record a draw at your own location" and nothing else.
--
--   ONE DELIBERATE DIFFERENCE FROM post_bar_count, stated rather than glossed:
--   post_bar_count reads its location off the locked session row and never from
--   an argument. record_consumption HAS no session row — the location is
--   necessarily an argument. The rule is preserved in substance rather than in
--   form: the argument is never trusted on its own. It is checked against
--   departments (it must be a real location), against 'Main Store' (rejected —
--   the store issues stock, it does not consume it), and for a department_head
--   it must EQUAL current_app_department(). A head therefore cannot name a
--   location they do not own, which is the property the rule exists to enforce.
--
-- WHY sub_location IS ADDED TO stock_movements (a third column, beyond the two
-- the session scoped)
--   051 made 'Laundry' a SUB-LOCATION of Housekeeping rather than a department,
--   and this migration seeds housekeeping stock at both Housekeeping and
--   Housekeeping/Laundry. apply_stock_delta already RECEIVES p_sub_location and
--   already draws the balance down at the right sub-location — it simply never
--   recorded which one on the movement row. Without this column the ledger can
--   deduct from Laundry and then report the draw as plain "Housekeeping", so the
--   one attribution the laundry case exists to prove would be lost at the exact
--   moment it was asked for. The column is additive and nullable; every movement
--   type now records it, which also recovers it for issue/transfer, where it was
--   being discarded.
--
-- ROOMS ARE NOT WIRED TO TABLE BOOKINGS
--   Table Bookings has a 'Private Room' LOCATION for restaurant tables. It is a
--   dining area, not lodging, and shares no key with this list. Deliberately
--   left unconnected (Aman, 18 August 2026).
--
-- REBUILD BEHAVIOUR
--   Every seed here is idempotent and self-contained (rooms; a 7-item
--   housekeeping catalogue and its balances), so it applies identically on a
--   from-files rebuild — unlike 053/059's seeds, which depend on the
--   scripts/data-ops/002 catalogue and no-op on a rebuild.
--
-- REBUILD PROOF STATUS
--   059 was rebuild-proven by run 7 (17 August 2026) BEFORE this file was
--   written, so this migration sits on a proven base. 060 itself is NOT
--   rebuild-proven, and a full throwaway rebuild of 001-060 diffed against
--   production is OWED BEFORE THE NEXT MIGRATION IS WRITTEN.

begin;

-- ── 1. rooms ────────────────────────────────────────────────────────────────
-- The reference list §2.2 requires. room_type is PLAIN TEXT with no CHECK, on
-- purpose: the real room classes come from Dhiren and a CHECK would have to be
-- migrated every time he names a new one. Same reasoning that keeps departments
-- plain text, one standing rule further down the same road.
--
-- NO DELETE POLICY, and that is a decision rather than an oversight (059 made
-- the same one for bar_count_sessions, for the same reason): a room that stock
-- was consumed against is part of the audit trail. Rooms are DEACTIVATED via
-- is_active, never removed.

create table if not exists public.rooms (
  id          uuid primary key default gen_random_uuid(),
  room_number text not null,
  name        text,
  room_type   text,
  block       text,
  is_active   boolean not null default true,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.rooms drop constraint if exists rooms_room_number_key;
alter table public.rooms add constraint rooms_room_number_key unique (room_number);

create index if not exists rooms_active_idx on public.rooms (is_active, room_number);

comment on table public.rooms is
  'Lodge rooms and public areas, the reference list stock consumption is attributed against (FUNCTIONAL_SPEC 2.2). Deliberately NOT connected to the Table Bookings "Private Room" location, which is a dining area and shares no key with this list. room_type is free text: the real classes come from Dhiren and a CHECK would need migrating every time he names a new one.';

comment on column public.rooms.room_number is
  'The identifier staff actually say out loud. Unique. Public areas use a PUB- prefix so they sort together and cannot collide with a numbered room.';

alter table public.rooms enable row level security;

-- Explicit grants at both ends: this project's table default privileges give
-- anon/authenticated no DML at all (pg_default_acl, verified live), so a new
-- table starts unusable until granted. No DELETE grant, matching the policy set.
grant select, insert, update on public.rooms to authenticated;
grant all                    on public.rooms to service_role;

drop policy if exists service_role_all_rooms on public.rooms;
create policy service_role_all_rooms on public.rooms
  for all to service_role using (true) with check (true);

-- SELECT is deliberately open to every authenticated role, unlike almost
-- everything else in this system. A room list is not sensitive, and the
-- consumption draw form needs it for department_head — the role that does most
-- of the drawing. Scoping rooms by department would be meaningless: a room
-- belongs to the lodge, not to a department.
drop policy if exists rooms_select on public.rooms;
create policy rooms_select on public.rooms
  for select to authenticated
  using (true);

drop policy if exists rooms_manage_insert on public.rooms;
create policy rooms_manage_insert on public.rooms
  for insert to authenticated
  with check (public.current_app_role() in ('owner', 'admin'));

drop policy if exists rooms_manage_update on public.rooms;
create policy rooms_manage_update on public.rooms
  for update to authenticated
  using      (public.current_app_role() in ('owner', 'admin'))
  with check (public.current_app_role() in ('owner', 'admin'));

-- ── 2. placeholder room seed ────────────────────────────────────────────────
-- Standing rule: every new surface ships with placeholder seed in its own step,
-- because a blank screen reads as broken. 20 rooms across three blocks plus 4
-- public areas. Real numbers, names and types come from Dhiren; replacing these
-- is one delete-and-insert against a table nothing else keys on yet.
-- Idempotent, so re-running this migration is a no-op.

insert into public.rooms (room_number, name, room_type, block, notes) values
  ('A01', 'Acacia',     'Standard',    'Block A', 'Placeholder pending Dhiren''s room list'),
  ('A02', 'Baobab',     'Standard',    'Block A', 'Placeholder pending Dhiren''s room list'),
  ('A03', 'Mopane',     'Standard',    'Block A', 'Placeholder pending Dhiren''s room list'),
  ('A04', 'Msasa',      'Standard',    'Block A', 'Placeholder pending Dhiren''s room list'),
  ('A05', 'Marula',     'Standard',    'Block A', 'Placeholder pending Dhiren''s room list'),
  ('A06', 'Jacaranda',  'Standard',    'Block A', 'Placeholder pending Dhiren''s room list'),
  ('A07', 'Chikangawa', 'Executive',   'Block A', 'Placeholder pending Dhiren''s room list'),
  ('A08', 'Zomba',      'Executive',   'Block A', 'Placeholder pending Dhiren''s room list'),
  ('A09', 'Mulanje',    'Executive',   'Block A', 'Placeholder pending Dhiren''s room list'),
  ('A10', 'Nyika',      'Executive',   'Block A', 'Placeholder pending Dhiren''s room list'),
  ('B01', 'Shire',      'Standard',    'Block B', 'Placeholder pending Dhiren''s room list'),
  ('B02', 'Songwe',     'Standard',    'Block B', 'Placeholder pending Dhiren''s room list'),
  ('B03', 'Bua',        'Standard',    'Block B', 'Placeholder pending Dhiren''s room list'),
  ('B04', 'Linthipe',   'Standard',    'Block B', 'Placeholder pending Dhiren''s room list'),
  ('B05', 'Dwangwa',    'Family',      'Block B', 'Placeholder pending Dhiren''s room list'),
  ('B06', 'Luweya',     'Family',      'Block B', 'Placeholder pending Dhiren''s room list'),
  ('B07', 'Ruo',        'Family',      'Block B', 'Placeholder pending Dhiren''s room list'),
  ('B08', 'Lilongwe',   'Family',      'Block B', 'Placeholder pending Dhiren''s room list'),
  ('C01', 'Chintheche', 'Cottage',     'Cottages', 'Placeholder pending Dhiren''s room list'),
  ('C02', 'Senga',      'Cottage',     'Cottages', 'Placeholder pending Dhiren''s room list'),
  ('PUB-REST',  'Restaurant',        'Public Area', 'Public', 'Placeholder public area'),
  ('PUB-POOL',  'Pool Area',         'Public Area', 'Public', 'Placeholder public area'),
  ('PUB-CONF',  'Conference Room',   'Public Area', 'Public', 'Placeholder public area'),
  ('PUB-LOBBY', 'Reception & Lobby', 'Public Area', 'Public', 'Placeholder public area')
on conflict (room_number) do nothing;

-- ── 3. the third dimension on a movement ────────────────────────────────────
-- what  = stock_item_id + quantity_change   (already there)
-- where = from_department + room_id + sub_location
-- who   = consumed_by  (the STAFF ROSTER member who physically drew it)
--
-- consumed_by and performed_by are two DIFFERENT people and two different
-- tables, which is the whole point of keeping both:
--   performed_by -> auth.users, one of the 4 logins. Who typed it in.
--   consumed_by  -> staff,      one of the 62 roster rows. Who took the stock.
-- The staff table is disjoint from login roles by standing rule (no FK to
-- user_profiles), and a housekeeper has no login, so collapsing these two into
-- one column would make the "who" dimension unanswerable for exactly the
-- department that asked for it.
--
-- ON DELETE RESTRICT on both, deliberately: a movement is a document. A room or
-- a staff member that appears in the ledger is deactivated (both tables carry
-- is_active), never deleted. This WILL block a hard delete of a staff row that
-- has drawn stock — that is the intended behaviour, and it is logged in
-- FOLLOWUPS so the real-data roster reconciliation meets it as a decision
-- rather than as a surprise.

alter table public.stock_movements
  add column if not exists room_id      uuid,
  add column if not exists consumed_by  uuid,
  add column if not exists sub_location text;

alter table public.stock_movements drop constraint if exists stock_movements_room_id_fkey;
alter table public.stock_movements
  add constraint stock_movements_room_id_fkey
  foreign key (room_id) references public.rooms(id) on delete restrict;

alter table public.stock_movements drop constraint if exists stock_movements_consumed_by_fkey;
alter table public.stock_movements
  add constraint stock_movements_consumed_by_fkey
  foreign key (consumed_by) references public.staff(id) on delete restrict;

create index if not exists stock_movements_room_idx        on public.stock_movements (room_id);
create index if not exists stock_movements_consumed_by_idx on public.stock_movements (consumed_by);

comment on column public.stock_movements.consumed_by is
  'The staff roster member who physically drew the stock (staff.id, 1 of 62). Distinct from performed_by, which is the login user who recorded it (auth.users, 1 of 4). Housekeepers have no login, so both columns are needed to answer "who".';

comment on column public.stock_movements.sub_location is
  'The sub-location the movement happened at, e.g. Laundry inside Housekeeping (051). apply_stock_delta already moved the balance at the right sub-location; before 060 it simply never recorded which one, so a Laundry draw was indistinguishable from a Housekeeping one in the ledger.';

-- ── 4. movement_type CHECK _v4 -> _v5 ───────────────────────────────────────
-- Widened in all three places in this one migration (the 055/058 rule): here,
-- in apply_stock_delta's allowlist in section 5, and in MOVEMENT_TYPES in
-- src/lib/stock.js in the same commit. Miss one and they drift silently until
-- something fails at runtime.

alter table public.stock_movements
  drop constraint if exists stock_movements_movement_type_check_v4;
alter table public.stock_movements
  drop constraint if exists stock_movements_movement_type_check_v5;
alter table public.stock_movements
  add constraint stock_movements_movement_type_check_v5
  check (movement_type in (
    'delivery', 'transfer', 'adjustment', 'requisition', 'opening_balance',
    'issue', 'event_allocation', 'event_return', 'consumption'
  ));

-- ── 5. apply_stock_delta — the signature change, guarded ────────────────────

-- 5a. capture the privilege set BEFORE the drop. If anything below goes wrong,
--     the whole migration rolls back and production keeps the old function.
create temp table _060_asd_before on commit drop as
  select p.oid,
         p.proacl::text                                            as acl_raw,
         (select array_agg(a::text order by a::text)
            from unnest(coalesce(p.proacl, '{}'::aclitem[])) a)    as acl_set
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'apply_stock_delta';

do $$
declare v_n integer;
begin
  select count(*) into v_n from _060_asd_before;
  if v_n <> 1 then
    raise exception '060: expected exactly 1 apply_stock_delta signature before the change, found %. Investigate before proceeding - an overload may already exist.', v_n;
  end if;
end $$;

-- 5b. drop the narrow signature. Named in full so a stray overload could never
--     be dropped by accident instead.
drop function if exists public.apply_stock_delta(uuid, numeric, text, text, text, text, text, text);

-- 5c. recreate, widened. Body is byte-for-byte the live 8-parameter body with
--     exactly three changes, all of them additive:
--       - two new trailing parameters, both DEFAULT NULL, so every existing
--         caller (issue_stock's four positional 8-arg calls, transfer_stock via
--         issue_stock, and the named-argument calls from src/lib/stock.js) is
--         unaffected;
--       - 'consumption' added to the allowlist;
--       - the INSERT now names sub_location, room_id and consumed_by.
create or replace function public.apply_stock_delta(
  p_stock_item_id   uuid,
  p_delta           numeric,
  p_movement_type   text,
  p_reason          text default null,
  p_from_department text default null,
  p_to_department   text default null,
  p_location        text default null,
  p_sub_location    text default null,
  p_room_id         uuid default null,
  p_consumed_by     uuid default null
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
  -- 060 adds 'consumption'.
  IF p_movement_type IS NULL
     OR p_movement_type NOT IN ('delivery','transfer','adjustment','requisition','issue',
                                'event_allocation','event_return','consumption') THEN
    RAISE EXCEPTION
      'apply_stock_delta: movement_type must be one of delivery, transfer, adjustment, requisition, issue, event_allocation, event_return, consumption (got %)',
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

  -- 060: sub_location, room_id and consumed_by are now recorded. The first was
  -- already known to this function and simply thrown away; the other two are the
  -- consumption attribution (FUNCTIONAL_SPEC 2.3). All three are NULL for every
  -- movement type that does not carry them, which is every type except
  -- 'consumption' plus the sub-located issues and transfers.
  INSERT INTO public.stock_movements
    (stock_item_id, movement_type, quantity_change, from_department, to_department,
     sub_location, room_id, consumed_by, performed_by, notes)
  VALUES
    (p_stock_item_id, p_movement_type, p_delta, p_from_department, p_to_department,
     p_sub_location, p_room_id, p_consumed_by, auth.uid(), p_reason);

  RETURN v_new;
END $function$;

-- 5d. re-privilege explicitly. The drop took the ACL with it, so BOTH halves
--     have to be restored, and the revoke is not optional:
--
--     A freshly created function gets Postgres's BUILT-IN default of EXECUTE to
--     PUBLIC. That is why every function in this project pairs its CREATE with
--     `revoke execute ... from public` (021, 037, 054, 055, 057, 059) — the
--     convention is load-bearing, not decorative. This was written granting but
--     not revoking, and the guard in 5e caught it on the dry run: proacl came
--     back as {=X/postgres,postgres=...,authenticated=...,service_role=...} —
--     that leading `=X` is PUBLIC, i.e. anon as well, on the function that
--     performs every stock write in the system. Exactly the residual class the
--     058 rebuild proof (run 6) found on current_app_role/current_app_department
--     and 059 §10 closed. Caught before production, by the guard, which is what
--     the guard is for.
--
--     anon is revoked too. It holds no explicit grant today (it inherits only
--     through PUBLIC), so this is a no-op here — but 059 §10's finding was
--     precisely that a rebuild can hand anon an explicit grant production never
--     had, and the fix for that is to be explicit at the point of creation
--     rather than to discover it a proof run later.
--
--     Granted in the same order the previous ACL held so even the raw text
--     matches, not merely the privilege set.
revoke execute on function public.apply_stock_delta(uuid, numeric, text, text, text, text, text, text, uuid, uuid)
  from public, anon;
grant  execute on function public.apply_stock_delta(uuid, numeric, text, text, text, text, text, text, uuid, uuid)
  to authenticated, service_role;

-- 5e. THE GUARD. Aborts the migration if the privilege set moved, or if an
--     overload survived. Both are the failure modes this project has actually
--     experienced, not hypotheticals.
do $$
declare
  v_count     integer;
  v_before    text[];
  v_after     text[];
  v_raw_b     text;
  v_raw_a     text;
  v_oid_b     oid;
  v_oid_a     oid;
begin
  select count(*) into v_count
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'apply_stock_delta';

  if v_count <> 1 then
    raise exception '060 GUARD FAILED: % apply_stock_delta signatures exist after the change, expected exactly 1. An overload survived - the 052 trap. Rolling back.', v_count;
  end if;

  select b.acl_set, b.acl_raw, b.oid into v_before, v_raw_b, v_oid_b from _060_asd_before b;

  select (select array_agg(a::text order by a::text)
            from unnest(coalesce(p.proacl, '{}'::aclitem[])) a),
         p.proacl::text,
         p.oid
    into v_after, v_raw_a, v_oid_a
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'apply_stock_delta';

  if v_after is distinct from v_before then
    raise exception '060 GUARD FAILED: apply_stock_delta privileges changed. BEFORE % AFTER %. Rolling back - fix the grants in this file, do not apply by hand.', v_raw_b, v_raw_a;
  end if;

  -- The oid necessarily changed: a dropped function's oid is gone and there is
  -- no DDL that alters a function's argument list in place. Recorded, not
  -- asserted. The privilege set above is the invariant that matters, and the
  -- session proof adds a live EXECUTE as `authenticated` on top of it.
  raise notice '060: apply_stock_delta oid % -> % (expected: signature change forces a new oid). proacl IDENTICAL: %', v_oid_b, v_oid_a, v_raw_a;
end $$;

comment on function public.apply_stock_delta(uuid, numeric, text, text, text, text, text, text, uuid, uuid) is
  'Single implementation of a stock balance change: locks the current_stock row, fails closed on insufficient stock, and writes the balance and the stock_movements row in one transaction. 060 widened it with p_room_id / p_consumed_by (consumption attribution) and made it record p_sub_location, which it had always received and always discarded. Signature change means it was dropped and recreated, so its oid differs from 055/058/059''s - the privilege set was asserted identical instead, in-migration.';

-- ── 6. record_consumption ───────────────────────────────────────────────────
-- The draw entry point. Delegates the balance and ledger write to
-- apply_stock_delta so there is exactly one implementation of locking and
-- fail-closed. Everything this function adds is authorisation and validation.

create or replace function public.record_consumption(
  p_stock_item_id uuid,
  p_location      text,
  p_sub_location  text default null,
  p_quantity      numeric default null,
  p_room_id       uuid default null,
  p_consumed_by   uuid default null,
  p_reason        text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_role      text;
  v_dept      text;
  v_new       numeric;
  v_staff     public.staff%ROWTYPE;
  v_room      public.rooms%ROWTYPE;
  v_item_name text;
BEGIN
  IF p_stock_item_id IS NULL THEN
    RAISE EXCEPTION 'record_consumption: stock item is required'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'record_consumption: quantity must be greater than zero (got %)', p_quantity
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_location IS NULL OR btrim(p_location) = '' THEN
    RAISE EXCEPTION 'record_consumption: location is required'
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── the security boundary ────────────────────────────────────────────────
  -- SECURITY DEFINER, so RLS does not apply inside this body and these checks
  -- ARE the gate. Unlike post_bar_count there is no session row to read the
  -- location off, so the location arrives as an argument - and is therefore
  -- never trusted alone: it must be a real department, it must not be the
  -- store, and a department_head's must equal their own department.
  v_role := public.current_app_role();
  v_dept := public.current_app_department();

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'record_consumption: no active profile for this user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_location = 'Main Store' THEN
    RAISE EXCEPTION 'record_consumption: the Main Store issues stock, it does not consume it - draw from the department that holds it'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.departments d WHERE d.name = p_location) THEN
    RAISE EXCEPTION 'record_consumption: % is not a valid location - expected a name from the departments table', p_location
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NOT (
    v_role IN ('owner', 'admin')
    OR (v_role = 'department_head' AND v_dept IS NOT NULL AND v_dept = p_location)
  ) THEN
    RAISE EXCEPTION 'record_consumption: % is not permitted to record consumption for %', v_role, p_location
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── attribution validation ───────────────────────────────────────────────
  -- Both dimensions are OPTIONAL: laundry detergent used across the whole
  -- department has no room, and a draw signed for by nobody in particular still
  -- has to be recordable or people will stop recording it. But if a value IS
  -- given it must be real and live, or the ledger fills up with dangling ids
  -- that read as data.
  IF p_room_id IS NOT NULL THEN
    SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'record_consumption: no such room %', p_room_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_room.is_active IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'record_consumption: room % is not active', v_room.room_number
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF p_consumed_by IS NOT NULL THEN
    SELECT * INTO v_staff FROM public.staff WHERE id = p_consumed_by;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'record_consumption: no such staff member %', p_consumed_by
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_staff.is_active IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'record_consumption: % is not an active staff member', v_staff.full_name
        USING ERRCODE = 'check_violation';
    END IF;
    -- A department_head may only attribute to their own department's roster -
    -- the same scope staff_dept_select gives them for READING it (section 8).
    -- Without this the dropdown would be scoped and the RPC would not, and the
    -- narrower of the two is the one that must be enforced server-side.
    -- owner/admin see the whole roster and may attribute across departments,
    -- which is real: a waiter can be sent to draw from the bar.
    IF v_role = 'department_head' AND v_staff.department IS DISTINCT FROM p_location THEN
      RAISE EXCEPTION 'record_consumption: % is not on the % roster', v_staff.full_name, p_location
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  SELECT si.name INTO v_item_name FROM public.stock_items si WHERE si.id = p_stock_item_id;
  IF v_item_name IS NULL THEN
    RAISE EXCEPTION 'record_consumption: no such stock item %', p_stock_item_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- ── the write, delegated ─────────────────────────────────────────────────
  -- Consumption leaves the system, so it is a from_department and never a to_.
  -- apply_stock_delta owns the row lock, the fail-closed check and the ledger
  -- row; nothing about them is reimplemented here.
  v_new := public.apply_stock_delta(
    p_stock_item_id,
    -p_quantity,
    'consumption',
    coalesce(p_reason, 'Consumption'),
    p_location,      -- from_department
    NULL,            -- to_department
    p_location,      -- location (the balance to draw down)
    p_sub_location,
    p_room_id,
    p_consumed_by
  );

  RETURN jsonb_build_object(
    'stock_item_id',  p_stock_item_id,
    'item',           v_item_name,
    'location',       p_location,
    'sub_location',   p_sub_location,
    'quantity',       p_quantity,
    'room',           v_room.room_number,
    'consumed_by',    v_staff.full_name,
    'new_quantity',   v_new
  );
END $function$;

-- from public AND anon, per the reasoning in 5d: PUBLIC is the built-in default
-- for a new function, and 059 §10 established that being explicit at creation
-- time is what keeps a rebuild and production agreeing about anon.
revoke execute on function public.record_consumption(uuid, text, text, numeric, uuid, uuid, text) from public, anon;
grant  execute on function public.record_consumption(uuid, text, text, numeric, uuid, uuid, text) to authenticated, service_role;

comment on function public.record_consumption(uuid, text, text, numeric, uuid, uuid, text) is
  'Records a stock draw with its consumption attribution: what (item + quantity), where (location, sub-location, room) and who (staff roster member). SECURITY DEFINER because department_head holds no write policy on current_stock/stock_movements and widening those policies was rejected in 059; the in-function checks are the security boundary. Delegates the balance and ledger write to apply_stock_delta - one implementation of locking.';

-- ── 7. v_stock_consumption ──────────────────────────────────────────────────
-- One ledger over the two places consumption is recorded. security_invoker so
-- the base tables' RLS is the access control - 056 for balances, 059's count
-- policies for the bar leg, 038's stock_movements_dept_select for the draw leg.
-- A department_head therefore sees exactly their own department's consumption
-- and nobody else's, without this view carrying a policy of its own.

drop view if exists public.v_stock_consumption;

create view public.v_stock_consumption
with (security_invoker = true) as

  -- LEG 1 — the bar. A posted count is a stock take, so the shortfall against
  -- the system balance IS the night's consumption (059). Only lines that went
  -- DOWN are consumption; a line counted UP is a correction, not a drink sold.
  select
    'bar_count'::text                     as source,
    l.id                                  as source_id,
    s.business_date                       as consumed_on,
    s.posted_at                           as recorded_at,
    l.stock_item_id,
    si.name                               as item_name,
    si.sku                                as item_sku,
    si.unit                               as item_unit,
    s.location,
    s.sub_location,
    null::uuid                            as room_id,
    null::text                            as room_number,
    null::text                            as room_name,
    null::uuid                            as consumed_by,
    null::text                            as consumed_by_name,
    s.posted_by                           as recorded_by,
    (l.system_qty - l.counted_qty)        as quantity,
    'End-of-day bar count'::text          as reason
  from public.bar_count_lines l
  join public.bar_count_sessions s on s.id = l.session_id
  join public.stock_items si       on si.id = l.stock_item_id
  where s.status = 'posted'
    and l.system_qty is not null
    and l.system_qty > l.counted_qty

  union all

  -- LEG 2 — the draw. Everywhere that is not a bar, stock is physically taken
  -- and used, and record_consumption writes exactly one movement row for it.
  -- LEFT JOINs on purpose: room and staff are both optional attribution, and a
  -- department_head who cannot SELECT another department's staff row simply
  -- gets a null name rather than losing the consumption row itself.
  select
    'draw'::text                          as source,
    m.id                                  as source_id,
    m.created_at::date                    as consumed_on,
    m.created_at                          as recorded_at,
    m.stock_item_id,
    si.name                               as item_name,
    si.sku                                as item_sku,
    si.unit                               as item_unit,
    m.from_department                     as location,
    m.sub_location,
    m.room_id,
    r.room_number,
    r.name                                as room_name,
    m.consumed_by,
    st.full_name                          as consumed_by_name,
    m.performed_by                        as recorded_by,
    abs(m.quantity_change)                as quantity,
    m.notes                               as reason
  from public.stock_movements m
  join public.stock_items si on si.id = m.stock_item_id
  left join public.rooms r   on r.id  = m.room_id
  left join public.staff st  on st.id = m.consumed_by
  where m.movement_type = 'consumption';

comment on view public.v_stock_consumption is
  'The consumption ledger (FUNCTIONAL_SPEC 2.3): what, where and who, over both places consumption is actually recorded - the bar count shortfall (059) and the attributed draw (060). A VIEW, not a table, so there is no second copy of a number the system already holds and nothing to drift. security_invoker = true, so base-table RLS is the access control.';

grant select on public.v_stock_consumption to authenticated, service_role;

-- ── 8. staff_dept_select ────────────────────────────────────────────────────
-- Before this, staff was readable only by owner/admin/hr, so a department_head
-- opening the consumption draw form would get an EMPTY "who" dropdown and no
-- error - the failure mode that looks like a UI bug and is actually a policy
-- gap. Scoped exactly as 056 scoped stock: their OWN department's roster only,
-- no wider. Additive; no existing policy is dropped or altered.

drop policy if exists staff_dept_select on public.staff;
create policy staff_dept_select on public.staff
  for select to authenticated
  using (public.current_app_role() = 'department_head'
         and public.current_app_department() is not null
         and department = public.current_app_department());

-- ── 9. placeholder Housekeeping catalogue + balances ────────────────────────
-- Standing rule: placeholder data is fine, blank screens are not. Without this
-- the Consumption tab ships with an empty item list for the one department the
-- feature was requested for, because Housekeeping currently holds ZERO stock
-- items (verified live: 0 rows).
--
-- Unlike 053's and 059's seeds this one is self-contained - it creates its own
-- catalogue rows rather than updating rows that came from scripts/data-ops/002 -
-- so it applies identically on a from-files rebuild.
--
-- Balances are placed at three coordinates per the two-tier model:
--   Main Store              the inbound point, so the items can be issued
--   Housekeeping            the department sub-store
--   Housekeeping/Laundry    the sub-location (051), for the laundry items only
-- par_level stays NULL: Housekeeping is not on the end-of-day bar cycle.

insert into public.stock_items (name, sku, unit, department, reorder_level, is_active) values
  ('Toilet Tissue (2-ply)',      'HK-001', 'boxes',  'Housekeeping', 10, true),
  ('Bottled Water 500ml',        'HK-002', 'bottles','Housekeeping', 24, true),
  ('Tea Bags (100s)',            'HK-003', 'boxes',  'Housekeeping',  6, true),
  ('Instant Coffee (500g)',      'HK-004', 'boxes',  'Housekeeping',  6, true),
  ('Guest Soap (bar)',           'HK-005', 'units',  'Housekeeping', 40, true),
  ('Laundry Detergent (5L)',     'HK-006', 'litres', 'Housekeeping', 10, true),
  ('Bleach (5L)',                'HK-007', 'litres', 'Housekeeping', 10, true)
on conflict (sku) do nothing;

-- Main Store tier. Store reorder is 4x the catalogue default, matching 053.
insert into public.current_stock (stock_item_id, location, sub_location, quantity, reorder_level, last_updated)
select si.id, 'Main Store', null, 100, si.reorder_level * 4, now()
  from public.stock_items si
 where si.sku like 'HK-%'
on conflict (stock_item_id, location, sub_location) do nothing;

-- Housekeeping department tier.
insert into public.current_stock (stock_item_id, location, sub_location, quantity, last_updated)
select si.id, 'Housekeeping', null,
       case si.sku
         when 'HK-001' then 24
         when 'HK-002' then 48
         when 'HK-003' then 12
         when 'HK-004' then 10
         when 'HK-005' then 80
         when 'HK-006' then 20
         when 'HK-007' then 15
       end,
       now()
  from public.stock_items si
 where si.sku like 'HK-%'
on conflict (stock_item_id, location, sub_location) do nothing;

-- Housekeeping / Laundry sub-location. Only the items laundry actually holds -
-- seeding all seven here would say the laundry stocks tea bags, which is the
-- kind of placeholder that has to be explained away in a demo.
insert into public.current_stock (stock_item_id, location, sub_location, quantity, last_updated)
select si.id, 'Housekeeping', 'Laundry',
       case si.sku
         when 'HK-005' then 20
         when 'HK-006' then 30
         when 'HK-007' then 25
       end,
       now()
  from public.stock_items si
 where si.sku in ('HK-005', 'HK-006', 'HK-007')
on conflict (stock_item_id, location, sub_location) do nothing;

commit;
