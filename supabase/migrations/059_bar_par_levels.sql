-- 059_bar_par_levels.sql
-- Phase 2, Inventory — bar par levels + the end-of-day count/refill cycle.
--
-- WHAT THIS BUILDS
--   Each bar holds a per-item MINIMUM it must carry before opening (its "par").
--   At close, the bartender counts the shelf. Posting that count does two
--   things in one transaction: it reconciles the bar's balance down to what was
--   physically counted, and it computes the shortfall against par and RAISES A
--   PRE-FILLED REFILL REQUISITION. The manager then approves and fulfils it,
--   Main Store -> bar, through the existing issue_stock path. Nothing new
--   touches stock; the refill rides 055's primitive.
--
-- WHY THE COUNT MUST WRITE THE BALANCE, NOT JUST BE READ ALONGSIDE IT
--   There is no POS integration, so nothing ever deducts a sale. A bar's
--   current_stock quantity only changes on an issue, a transfer or an event —
--   it does NOT fall as drinks are sold. Between counts the bar balance is
--   therefore fiction, and a shortfall computed against it would be meaningless.
--   The physical count is the only truth, so posting a count is a stock take:
--   the count-vs-system delta IS the night's consumption. That delta is also
--   what the §2.3 consumption ledger will later attribute.
--
-- WHERE PAR LIVES, AND WHY NOT IN ITS OWN TABLE
--   current_stock.par_level, beside the per-tier reorder_level that 051 already
--   put there. Par is per (item, location) — exactly the key current_stock is
--   already unique on — so a separate table would duplicate that key, need its
--   own copy of 054's location guard, and need its own RLS to re-derive the
--   scoping 056 already gives us for free. The two thresholds are distinct and
--   both belong on the balance row:
--       reorder_level  "warn me"        -> alerting
--       par_level      "top up to this" -> the refill target
--   NULL par means the location is not par-managed and never enters the refill
--   cycle. Only Main Bar and Sports Bar are seeded (section 8); the other nine
--   departments stay NULL deliberately.
--
-- NEW vs CHANGED — stated explicitly, because this project has been bitten by
-- the overload/grant trap twice (052 documents it, 055 and 058 repeat it):
--   NEW              current_stock.par_level
--   NEW              bar_count_sessions, bar_count_lines (+ RLS, policies,
--                    grants, indexes — same migration, per Standard rule 2)
--   NEW              requisitions.count_session_id, requisitions.source
--   NEW              post_bar_count(uuid)           SECURITY DEFINER
--   NEW              fulfil_requisition_batch(uuid) SECURITY INVOKER
--   NEW              bar_count_sessions_validate_location() + its trigger
--   CHANGED (body)   set_stock_quantity(...) -- IDENTICAL parameter list,
--                    replaced in place so it populates from_department /
--                    to_department. CREATE OR REPLACE with a byte-identical
--                    signature replaces rather than overloads, so NO DROP is
--                    correct — a drop would strip proacl under this project's
--                    {postgres=X/postgres} function default privileges. Live
--                    signature was read from pg_get_functiondef immediately
--                    before writing this, not transcribed from memory.
--                    Before: oid 42386, proacl {postgres,authenticated,
--                    service_role}. Both must be unchanged after.
--   CHANGED (sig)    none
--   DROPPED          nothing
--
-- WHY set_stock_quantity HAD TO CHANGE
--   Its stock_movements INSERT named only (stock_item_id, movement_type,
--   quantity_change, performed_by, notes) — from_department and to_department
--   were left NULL on every adjustment ever written. That is the EXACT fault
--   scripts/data-ops/006 closed for event movements three days ago: the
--   Movement Ledger's department filter is a nullable-column filter, so it
--   silently DROPS null-department rows. A nightly bar count would have written
--   hundreds of adjustment rows that vanish the moment anyone filters the
--   ledger by "Main Bar" — the ledger lying when filtered, again. A stock take
--   has one location, so the sign carries the direction:
--       delta < 0 (stock consumed/lost)  -> from_department = location
--       delta > 0 (stock found)          -> to_department   = location
--   Same shape data-ops/006 chose for event_allocation / event_return.
--   NO BACKFILL IS NEEDED: production holds zero 'adjustment' rows today
--   (verified live immediately before writing this — 058 re-typed the only one
--   that existed). Asserted in section 6 rather than assumed.
--   This also fixes AdjustmentsTab, which writes through the same function.
--
-- WHY post_bar_count IS SECURITY DEFINER, AND WHAT GATES IT
--   A department_head holds no write policy on current_stock or
--   stock_movements — every write policy there is owner/admin (migration 022,
--   re-confirmed live). So a bar head cannot post their own count under RLS.
--   The two ways to allow it:
--     (a) widen the current_stock / stock_movements write policies to include
--         department_head at their own location. Rejected: that also grants
--         arbitrary balance edits at that location, which is the same
--         over-exposure class 056 was written to close.
--     (b) one SECURITY DEFINER entry point that grants exactly "post a count at
--         your own bar" and nothing else. Chosen.
--   The in-function check IS the security boundary, so it is written to be
--   auditable: no dynamic SQL, no caller-supplied location (the location comes
--   off the session row, never the argument), the check runs before any write,
--   and a non-draft session is refused so a posted count cannot be replayed.
--   Note auth.uid() still resolves inside a SECURITY DEFINER body — it reads
--   the request JWT claim, not the current role — so performed_by / requested_by
--   remain the real user, not postgres.
--
-- WHY fulfil_requisition_batch IS *NOT* SECURITY DEFINER
--   Fulfilling is already an owner/admin action under existing RLS, and
--   issue_stock is SECURITY INVOKER. Running the batch as the invoker means the
--   existing policies stay the only gate and this migration adds no second
--   privilege surface. It exists purely to make the loop ONE transaction.
--
-- PARTIAL-FULFIL SEMANTICS — deliberately different at batch level
--   055 established: a single requisition is never part-filled. That still
--   holds — each issue_stock call inside the loop is all-or-nothing. But a
--   96-line refill must not be abandoned because one item is short in the
--   store, so an insufficient-stock failure on one line is caught, recorded and
--   skipped, and the batch continues. ONLY check_violation is caught (that is
--   the errcode issue_stock raises for insufficient stock); every other error
--   propagates and aborts the whole batch. The return value names every skipped
--   line — nothing fails silently.
--
-- REBUILD BEHAVIOUR
--   Sections 6 and 8 are UPDATE/assert statements over rows that do not exist
--   on a from-files rebuild (the catalogue came from scripts/data-ops/002,
--   which is not a migration), so they apply as clean no-ops there.

begin;

-- ── 1. par_level on the balance row ─────────────────────────────────────────

alter table public.current_stock
  add column if not exists par_level numeric;

alter table public.current_stock drop constraint if exists current_stock_par_level_check;
alter table public.current_stock
  add constraint current_stock_par_level_check check (par_level is null or par_level >= 0);

comment on column public.current_stock.par_level is
  'Par level: the minimum this location must hold before opening, and the target a refill tops up to. Distinct from reorder_level, which only decides when to warn. NULL means this location is not par-managed and never enters the end-of-day refill cycle — today only Main Bar and Sports Bar carry values.';

-- ── 2. the count session ────────────────────────────────────────────────────
-- One session per (location, sub_location, business_date). A count is a
-- document, not a moment: it is drafted, lines are entered, then it is POSTED,
-- which is the single act that touches stock.

create table if not exists public.bar_count_sessions (
  id            uuid primary key default gen_random_uuid(),
  location      text not null,
  sub_location  text,
  business_date date not null,
  status        text not null default 'draft'
                check (status in ('draft', 'posted', 'cancelled')),
  counted_by    uuid references auth.users(id),
  posted_by     uuid references auth.users(id),
  posted_at     timestamptz,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- NULLS NOT DISTINCT so a NULL sub_location still collides, matching the key
-- discipline 051 established on current_stock. Without it two 'Main Bar' /
-- NULL / same-date sessions could both exist and both post.
alter table public.bar_count_sessions
  drop constraint if exists bar_count_sessions_location_date_key;
alter table public.bar_count_sessions
  add constraint bar_count_sessions_location_date_key
  unique nulls not distinct (location, sub_location, business_date);

create index if not exists bar_count_sessions_location_idx
  on public.bar_count_sessions (location, business_date desc);
create index if not exists bar_count_sessions_status_idx
  on public.bar_count_sessions (status);

-- Soft FK on location, exactly as 054 does for current_stock: a CHECK cannot
-- subquery, and departments are plain text by standing rule so an FK is
-- forbidden. 'Main Store' is rejected here — the store is not a bar and does
-- not run a par cycle; a store stocktake is AdjustmentsTab's job.
create or replace function public.bar_count_sessions_validate_location()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
BEGIN
  IF new.location IS NULL OR btrim(new.location) = '' THEN
    RAISE EXCEPTION 'bar_count_sessions: location is required'
      USING ERRCODE = 'check_violation';
  END IF;

  IF new.location = 'Main Store' THEN
    RAISE EXCEPTION 'bar_count_sessions: the Main Store does not run an end-of-day par cycle'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.departments d WHERE d.name = new.location) THEN
    RAISE EXCEPTION 'bar_count_sessions: % is not a valid location - expected a name from the departments table', new.location
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  RETURN new;
END $function$;

revoke execute on function public.bar_count_sessions_validate_location() from public;
grant  execute on function public.bar_count_sessions_validate_location() to authenticated, service_role;

drop trigger if exists trg_bar_count_sessions_validate_location on public.bar_count_sessions;
create trigger trg_bar_count_sessions_validate_location
  before insert or update of location, sub_location
  on public.bar_count_sessions
  for each row
  execute function public.bar_count_sessions_validate_location();

-- ── 3. the count lines ──────────────────────────────────────────────────────
-- counted_qty is what the bartender physically counted. The other three are
-- stamped AT POST TIME so the document stays a faithful record of what was
-- decided and why, even after par or the balance later change.

create table if not exists public.bar_count_lines (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references public.bar_count_sessions(id) on delete cascade,
  stock_item_id  uuid not null references public.stock_items(id) on delete cascade,
  counted_qty    numeric not null check (counted_qty >= 0),
  system_qty     numeric,   -- balance immediately before the count was applied
  par_level      numeric,   -- par in force when posted
  shortfall      numeric,   -- greatest(par - counted, 0), what was requisitioned
  created_at     timestamptz not null default now()
);

alter table public.bar_count_lines
  drop constraint if exists bar_count_lines_session_item_key;
alter table public.bar_count_lines
  add constraint bar_count_lines_session_item_key
  unique (session_id, stock_item_id);

create index if not exists bar_count_lines_session_idx
  on public.bar_count_lines (session_id);

-- ── 4. RLS + policies + grants, in this same migration (Standard rule 2) ────
-- This project's default privileges are {postgres=X/postgres} for functions and
-- no DML for anon/authenticated on new tables (migration 050 documents the live
-- state), so a new table starts with NO usable grants. They are set explicitly
-- rather than inherited, at both ends.
--
-- NO DELETE POLICY ON bar_count_sessions, deliberately, and recorded as a
-- decision rather than left as an accident (the unplanned stock_items DELETE
-- asymmetry in FOLLOWUPS is the reason this is now stated): a count that
-- happened is a document, so it is cancelled via status, never removed.
-- bar_count_lines DOES allow delete, but only while the session is still draft.

alter table public.bar_count_sessions enable row level security;
alter table public.bar_count_lines    enable row level security;

grant select, insert, update         on public.bar_count_sessions to authenticated;
grant select, insert, update, delete on public.bar_count_lines    to authenticated;
grant all on public.bar_count_sessions to service_role;
grant all on public.bar_count_lines    to service_role;

drop policy if exists service_role_all_bar_count_sessions on public.bar_count_sessions;
create policy service_role_all_bar_count_sessions on public.bar_count_sessions
  for all to service_role using (true) with check (true);

drop policy if exists bar_count_sessions_manage_select on public.bar_count_sessions;
create policy bar_count_sessions_manage_select on public.bar_count_sessions
  for select to authenticated
  using (public.current_app_role() in ('owner', 'admin'));

drop policy if exists bar_count_sessions_dept_select on public.bar_count_sessions;
create policy bar_count_sessions_dept_select on public.bar_count_sessions
  for select to authenticated
  using (public.current_app_role() = 'department_head'
         and public.current_app_department() is not null
         and location = public.current_app_department());

drop policy if exists bar_count_sessions_manage_insert on public.bar_count_sessions;
create policy bar_count_sessions_manage_insert on public.bar_count_sessions
  for insert to authenticated
  with check (public.current_app_role() in ('owner', 'admin'));

drop policy if exists bar_count_sessions_dept_insert on public.bar_count_sessions;
create policy bar_count_sessions_dept_insert on public.bar_count_sessions
  for insert to authenticated
  with check (public.current_app_role() = 'department_head'
              and public.current_app_department() is not null
              and location = public.current_app_department()
              and counted_by = auth.uid()
              and status = 'draft');

drop policy if exists bar_count_sessions_manage_update on public.bar_count_sessions;
create policy bar_count_sessions_manage_update on public.bar_count_sessions
  for update to authenticated
  using      (public.current_app_role() in ('owner', 'admin'))
  with check (public.current_app_role() in ('owner', 'admin'));

-- A head may edit their own DRAFT only, and may not move it out of draft:
-- posting is reachable exclusively through post_bar_count, which is where the
-- authorisation and the stock write live together.
drop policy if exists bar_count_sessions_dept_update on public.bar_count_sessions;
create policy bar_count_sessions_dept_update on public.bar_count_sessions
  for update to authenticated
  using      (public.current_app_role() = 'department_head'
              and public.current_app_department() is not null
              and location = public.current_app_department()
              and status = 'draft')
  with check (public.current_app_role() = 'department_head'
              and public.current_app_department() is not null
              and location = public.current_app_department()
              and status = 'draft');

drop policy if exists service_role_all_bar_count_lines on public.bar_count_lines;
create policy service_role_all_bar_count_lines on public.bar_count_lines
  for all to service_role using (true) with check (true);

drop policy if exists bar_count_lines_manage_select on public.bar_count_lines;
create policy bar_count_lines_manage_select on public.bar_count_lines
  for select to authenticated
  using (public.current_app_role() in ('owner', 'admin'));

drop policy if exists bar_count_lines_dept_select on public.bar_count_lines;
create policy bar_count_lines_dept_select on public.bar_count_lines
  for select to authenticated
  using (exists (select 1 from public.bar_count_sessions s
                  where s.id = bar_count_lines.session_id
                    and public.current_app_role() = 'department_head'
                    and public.current_app_department() is not null
                    and s.location = public.current_app_department()));

drop policy if exists bar_count_lines_manage_write on public.bar_count_lines;
create policy bar_count_lines_manage_write on public.bar_count_lines
  for insert to authenticated
  with check (public.current_app_role() in ('owner', 'admin'));

drop policy if exists bar_count_lines_dept_write on public.bar_count_lines;
create policy bar_count_lines_dept_write on public.bar_count_lines
  for insert to authenticated
  with check (exists (select 1 from public.bar_count_sessions s
                       where s.id = bar_count_lines.session_id
                         and s.status = 'draft'
                         and public.current_app_role() = 'department_head'
                         and public.current_app_department() is not null
                         and s.location = public.current_app_department()));

drop policy if exists bar_count_lines_manage_update on public.bar_count_lines;
create policy bar_count_lines_manage_update on public.bar_count_lines
  for update to authenticated
  using      (public.current_app_role() in ('owner', 'admin'))
  with check (public.current_app_role() in ('owner', 'admin'));

drop policy if exists bar_count_lines_dept_update on public.bar_count_lines;
create policy bar_count_lines_dept_update on public.bar_count_lines
  for update to authenticated
  using      (exists (select 1 from public.bar_count_sessions s
                       where s.id = bar_count_lines.session_id
                         and s.status = 'draft'
                         and public.current_app_role() = 'department_head'
                         and public.current_app_department() is not null
                         and s.location = public.current_app_department()))
  with check (exists (select 1 from public.bar_count_sessions s
                       where s.id = bar_count_lines.session_id
                         and s.status = 'draft'
                         and public.current_app_role() = 'department_head'
                         and public.current_app_department() is not null
                         and s.location = public.current_app_department()));

drop policy if exists bar_count_lines_manage_delete on public.bar_count_lines;
create policy bar_count_lines_manage_delete on public.bar_count_lines
  for delete to authenticated
  using (public.current_app_role() in ('owner', 'admin'));

drop policy if exists bar_count_lines_dept_delete on public.bar_count_lines;
create policy bar_count_lines_dept_delete on public.bar_count_lines
  for delete to authenticated
  using (exists (select 1 from public.bar_count_sessions s
                  where s.id = bar_count_lines.session_id
                    and s.status = 'draft'
                    and public.current_app_role() = 'department_head'
                    and public.current_app_department() is not null
                    and s.location = public.current_app_department()));

-- ── 5. tie generated refills back to the count that produced them ───────────
-- A batch pointer on the existing table rather than a new header table:
-- requisitions is already one row per item and the fulfil path is per item, so
-- the only thing missing was the grouping key.

alter table public.requisitions
  add column if not exists count_session_id uuid,
  add column if not exists source text not null default 'manual';

alter table public.requisitions drop constraint if exists requisitions_count_session_id_fkey;
alter table public.requisitions
  add constraint requisitions_count_session_id_fkey
  foreign key (count_session_id) references public.bar_count_sessions(id) on delete set null;

alter table public.requisitions drop constraint if exists requisitions_source_check;
alter table public.requisitions
  add constraint requisitions_source_check check (source in ('manual', 'par_refill'));

create index if not exists requisitions_count_session_idx
  on public.requisitions (count_session_id);

comment on column public.requisitions.source is
  '''manual'' for a hand-raised requisition, ''par_refill'' for one generated by post_bar_count from an end-of-day count shortfall.';

-- ── 6. set_stock_quantity — populate the movement''s department ──────────────
-- Byte-identical signature to the live function. The ONLY change is the
-- from_department / to_department pair on the INSERT, and the comment above it.

do $$
declare v_adj integer;
begin
  select count(*) into v_adj from public.stock_movements where movement_type = 'adjustment';
  if v_adj > 0 then
    raise exception '059: % existing adjustment row(s) carry NULL departments and would stay invisible to the Movement Ledger department filter. Backfill them before applying (see scripts/data-ops/006 for the pattern).', v_adj;
  end if;
end $$;

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

-- ── 7. post_bar_count — the one act that turns a count into stock + a refill ─

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

revoke execute on function public.post_bar_count(uuid) from public;
grant  execute on function public.post_bar_count(uuid) to authenticated, service_role;

-- ── 8. fulfil_requisition_batch — one transaction, per-line shortfalls named ─

create or replace function public.fulfil_requisition_batch(p_session_id uuid)
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
DECLARE
  v_req      record;
  v_fulfil   integer := 0;
  v_skipped  jsonb   := '[]'::jsonb;
BEGIN
  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'fulfil_requisition_batch: session id is required';
  END IF;

  FOR v_req IN
    SELECT r.id, r.stock_item_id, r.department, r.quantity
      FROM public.requisitions r
     WHERE r.count_session_id = p_session_id
       AND r.status = 'approved'
     ORDER BY r.stock_item_id
  LOOP
    BEGIN
      PERFORM public.issue_stock(
        v_req.stock_item_id,
        'Main Store',
        v_req.department,
        v_req.quantity,
        'Par refill fulfil (session ' || p_session_id || ')',
        'requisition',
        NULL,
        NULL
      );

      UPDATE public.requisitions
         SET status      = 'fulfilled',
             reviewed_by = auth.uid(),
             updated_at  = now()
       WHERE id = v_req.id;

      v_fulfil := v_fulfil + 1;

    EXCEPTION
      -- ONLY insufficient stock is survivable. issue_stock raises it as
      -- check_violation; anything else (an RLS denial, a bad location, a
      -- constraint fault) is a real defect and must abort the whole batch
      -- rather than be logged and walked past.
      WHEN check_violation THEN
        v_skipped := v_skipped || jsonb_build_object(
          'requisition_id', v_req.id,
          'stock_item_id',  v_req.stock_item_id,
          'quantity',       v_req.quantity,
          'reason',         SQLERRM
        );
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'session_id', p_session_id,
    'fulfilled',  v_fulfil,
    'skipped',    jsonb_array_length(v_skipped),
    'details',    v_skipped
  );
END $function$;

revoke execute on function public.fulfil_requisition_batch(uuid) from public;
grant  execute on function public.fulfil_requisition_batch(uuid) to authenticated, service_role;

-- ── 9. placeholder par seed — the two bars only ─────────────────────────────
-- Standing rule: every new surface ships with placeholder seed in its own step.
-- Par is 2x the catalogue reorder level (bottles 5 -> 10, crates 8 -> 16), a
-- plausible spread rather than a flat number, and one UPDATE to replace when
-- the bar heads supply real values at real-data time.
--
-- Scoped to Main Bar and Sports Bar deliberately (Aman, 17 August 2026). The
-- other nine departments keep par_level NULL and never enter the refill cycle.
-- No-op on a from-files rebuild, which has no stock rows.

update public.current_stock cs
   set par_level = si.reorder_level * 2
  from public.stock_items si
 where si.id = cs.stock_item_id
   and cs.tier = 'department'
   and cs.location in ('Main Bar', 'Sports Bar')
   and cs.par_level is null
   and si.reorder_level is not null;

-- ── 10. close the anon-EXECUTE gap the 058 rebuild proof found ──────────────
-- Run 6 of the §2.6 proof (17 August 2026) rebuilt 001-058 into a throwaway and
-- found the ONLY function divergence from production: a rebuilt database grants
-- anon EXECUTE on current_app_role() and current_app_department(); production
-- does not.
--
-- Cause, measured not guessed: a fresh Supabase project's default privileges
-- grant EXECUTE on new functions to anon. 021 and 037 each pair their CREATE
-- with `revoke all ... from public`, which strips the PUBLIC grant but NOT the
-- separate explicit anon one. 050 then fixes the defaults going forward and
-- resets already-created TABLES, but never resets already-created FUNCTIONS —
-- its own header documents that ALTER DEFAULT PRIVILEGES is not retroactive and
-- then covers only half of it. These two are exactly the functions created
-- before 050 and never re-created after it (052 re-created the stock RPCs under
-- the restricted default; 054/055/057 were created after it).
--
-- Effect is inert — auth.uid() is NULL for anon so both return NULL — but these
-- are SECURITY DEFINER functions that every RLS policy in the system calls, and
-- "production defends twice, a rebuild defends once" is the same class of gap
-- that made 050 a finding in the first place.
--
-- SAFE TO EXECUTE AGAINST PRODUCTION, unlike 050: production already holds no
-- anon grant here (proacl {postgres,authenticated,service_role}, verified live),
-- so this is a no-op there and a real fix on a rebuild.
--
-- NOTE: WOODLANDS_FOLLOWUPS.md carries an entry saying this debt "does not exist
-- and must not be re-added to any migration." That entry is right about
-- PRODUCTION and wrong about the FILES — it was written from a production-only
-- probe, and only a rebuild distinguishes the two. The entry is corrected there.

revoke execute on function public.current_app_role()       from anon;
revoke execute on function public.current_app_department() from anon;

commit;
