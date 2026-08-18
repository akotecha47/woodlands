-- 061_fm_taxonomy_waiting_list_fees.sql
-- Phase 2, Farmers Market — 3-level product taxonomy, waiting list + stall
-- forfeiture, the attendance view, and the fee schedule (FUNCTIONAL_SPEC §7).
--
-- WRITTEN ON A PROVEN BASE. The §2.6 rebuild proof for 001-060 ran BEFORE a
-- line of this file existed (18 August 2026, throwaway qjltqaqmuqovhidustbr,
-- eu-west-2, deleted after): tables 32/32, columns 358/358 by set, constraints
-- 118/118, indexes 59/59, privileges 128/128, pg_default_acl 24/24, RLS
-- enablement 31/31 all true, triggers 2/2, object comments 22/22, and every
-- shared function byte-identical by md5(prosrc) with identical proacl. The four
-- divergences were the four pre-declared residuals and nothing else. That is the
-- gate 059 and 060 each observed, observed again here.
--
-- ── WHAT THIS BUILDS, AND THE FOUR FORKS ALREADY DECIDED ────────────────────
--   1. 3-level taxonomy  fm_categories > fm_product_types > fm_items, seeded
--      IN this migration (reference data, self-contained, exists on a rebuild).
--   2. Waiting list + forfeiture  fm_waiting_list, fm_stall_forfeitures, and
--      forfeit_stall() — FLAG + MANUAL CONFIRM, never automatic.
--   3. v_fm_attendance  a security_invoker view that REPLACES the client-side
--      write-on-read status mutation currently in HoldersTab.load().
--   4. fm_fee_schedule  six confirmed fees as DATA, and the product-change fee
--      is raised BY change_holder_products() reading this table.
--
-- Forks, decided with Aman 18 August, recorded so they are not re-litigated:
--   * FORFEITURE IS NOT AUTOMATIC. The system computes eligibility; an
--     owner/admin confirms. Rejected: flipping status off a query, the way
--     at_risk is flipped today. This revokes a stallholder's livelihood, and
--     today's equivalent writes to the database from a browser page load.
--   * FEES ARE DATA, NOT CONSTANTS. src/lib/constants.js currently carries
--     id_card_standard 5000 / id_card_extra 10000 / reprint 10000. Those
--     CONTRADICT Dhiren's confirmed 30000/20000 — they are wrong, not merely
--     stale, and are retired in the same commit as this file.
--   * stall_type IS DEPRECATED IN PLACE, NOT DROPPED. It is NOT NULL across 305
--     live rows and uniformly 'Other'. fm_holders.category_id becomes the real
--     classification; the column stays, commented, and the drop waits for the
--     real-data session. Backfilling it from fm_holders.products would mean
--     comma-splitting the register blob — the exact operation FOLLOWUPS defers
--     pending Rose's delimiter, because several product names contain internal
--     commas. Guessing it here would corrupt 289 rows invisibly.
--
-- ── WHY fm_approved_items CAN TAKE A NOT NULL FK TODAY ──────────────────────
-- It holds ZERO rows (verified live, 18 August). So item_id can be added NOT
-- NULL with no backfill and no nullable-then-tighten dance. §3 ASSERTS the table
-- is empty before doing it rather than assuming — if this file is ever replayed
-- against a database where someone has since inserted free-text items, it aborts
-- instead of inventing an item_id for them.
--
-- NAMING, stated because two of these names are one word apart:
--   fm_items          the CONTROLLED CATALOGUE — level 3 of the taxonomy, the
--                     list Dhiren's staff pick from. Reference data.
--   fm_approved_items WHICH HOLDER is approved for which catalogue item. A join
--                     table with a holder_id. Not a catalogue.
--
-- ── WHY THE MARKET-DAY MATHS EXISTS IN SQL AT ALL ───────────────────────────
-- This is now the THIRD implementation of "last Saturday of a non-December
-- month", alongside getMarketDayForMonth in src/components/farmers-market/
-- FarmersMarketUI.jsx and the Deno copy in supabase/functions/public-checkin.
-- FOLLOWUPS already carries that drift entry; this file is added to it in the
-- same commit rather than left to be discovered. It is unavoidable — SQL cannot
-- import the browser module — and the view has to compute the window server-side
-- or the "3 months" rule would live only in whichever client asked last.
--
-- ── NEW vs CHANGED ──────────────────────────────────────────────────────────
--   NEW     fm_categories, fm_product_types, fm_items      (+ RLS, grants, seed)
--   NEW     fm_fee_schedule                                 (+ RLS, grants, seed)
--   NEW     fm_waiting_list, fm_stall_forfeitures           (+ RLS, grants)
--   NEW     fm_holders.category_id, fm_approved_items.item_id
--   NEW     fm_market_day(), fm_last_n_market_days(), v_fm_attendance
--   NEW     forfeit_stall(), change_holder_products()       SECURITY DEFINER
--   CHANGED fm_payments.payment_type CHECK -> _v2, adding 'product_change'
--   CHANGED fm_holders.status       CHECK -> _v2, adding 'forfeited'
--   CHANGED fm_approved_items.item_name becomes NULLABLE (optional qualifier)
--   DROPPED nothing.
--
-- No existing function is touched, so the 052 overload/grant trap is not in
-- play here — every function below is brand new. The trap that IS in play is
-- the OTHER half of 060's finding: a NEW function gets Postgres's built-in
-- PUBLIC EXECUTE default, which on this project means anon. Every function
-- below is therefore `revoke execute ... from public, anon` before it is
-- granted, and §12 asserts no function this file creates carries PUBLIC or anon
-- EXECUTE. 060's first dry run failed on exactly that and it was caught by the
-- guard, not by review.

begin;

-- ── 1. the taxonomy: three levels, controlled lists ─────────────────────────
-- Three tables rather than one self-referencing table with a `level` column.
-- Three tables make "exactly three levels" a structural property instead of a
-- rule someone has to remember, and each level gets its own FK, its own
-- uniqueness and its own is_active without a CHECK on depth.
--
-- ON DELETE RESTRICT throughout, and no DELETE policy: a category a holder was
-- approved under is part of the record, the same decision rooms and
-- bar_count_sessions already carry. Retire with is_active.

create table if not exists public.fm_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.fm_categories drop constraint if exists fm_categories_name_key;
alter table public.fm_categories add constraint fm_categories_name_key unique (name);

create table if not exists public.fm_product_types (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.fm_categories(id) on delete restrict,
  name        text not null,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table public.fm_product_types drop constraint if exists fm_product_types_category_name_key;
alter table public.fm_product_types add constraint fm_product_types_category_name_key unique (category_id, name);

create index if not exists fm_product_types_category_idx on public.fm_product_types (category_id, sort_order);

create table if not exists public.fm_items (
  id              uuid primary key default gen_random_uuid(),
  product_type_id uuid not null references public.fm_product_types(id) on delete restrict,
  name            text not null,
  sort_order      integer not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

alter table public.fm_items drop constraint if exists fm_items_type_name_key;
alter table public.fm_items add constraint fm_items_type_name_key unique (product_type_id, name);

create index if not exists fm_items_type_idx on public.fm_items (product_type_id, sort_order);

comment on table public.fm_categories is
  'Level 1 of the Farmers Market product taxonomy (FUNCTIONAL_SPEC 7): Category > Product type > Item. Replaces the coarse five-value fm_holders.stall_type, which is uniformly Other across all 305 live rows and therefore useless as a filter.';
comment on table public.fm_product_types is
  'Level 2 of the product taxonomy. Example: Crafts > Paintings.';
comment on table public.fm_items is
  'Level 3 of the product taxonomy - the CONTROLLED CATALOGUE staff pick from. Example: Crafts > Paintings > Oil painting. NOT to be confused with fm_approved_items, which records which HOLDER is approved for which of these items. Selection from a controlled list is what removes the comma-splitting problem that blocked normalising fm_holders.products.';

alter table public.fm_categories    enable row level security;
alter table public.fm_product_types enable row level security;
alter table public.fm_items         enable row level security;

-- Table default privileges on this project give authenticated no DML at all
-- (pg_default_acl, verified live), so a new table is unusable until granted.
-- No DELETE grant anywhere here, matching the no-DELETE-policy decision.
grant select, insert, update on public.fm_categories    to authenticated;
grant select, insert, update on public.fm_product_types to authenticated;
grant select, insert, update on public.fm_items         to authenticated;
grant all on public.fm_categories    to service_role;
grant all on public.fm_product_types to service_role;
grant all on public.fm_items         to service_role;

drop policy if exists service_role_all_fm_categories on public.fm_categories;
create policy service_role_all_fm_categories on public.fm_categories
  for all to service_role using (true) with check (true);
drop policy if exists service_role_all_fm_product_types on public.fm_product_types;
create policy service_role_all_fm_product_types on public.fm_product_types
  for all to service_role using (true) with check (true);
drop policy if exists service_role_all_fm_items on public.fm_items;
create policy service_role_all_fm_items on public.fm_items
  for all to service_role using (true) with check (true);

-- Owner/admin only, matching every other fm_* table since 042. hr and
-- department_head have no Farmers Market access by decision; the taxonomy is
-- not sensitive in itself, but splitting the module's access model across
-- tables is how a gap gets introduced later.
drop policy if exists fm_categories_manage_select on public.fm_categories;
create policy fm_categories_manage_select on public.fm_categories
  for select to authenticated
  using (public.current_app_role() in ('owner', 'admin'));
drop policy if exists fm_categories_manage_insert on public.fm_categories;
create policy fm_categories_manage_insert on public.fm_categories
  for insert to authenticated
  with check (public.current_app_role() in ('owner', 'admin'));
drop policy if exists fm_categories_manage_update on public.fm_categories;
create policy fm_categories_manage_update on public.fm_categories
  for update to authenticated
  using      (public.current_app_role() in ('owner', 'admin'))
  with check (public.current_app_role() in ('owner', 'admin'));

drop policy if exists fm_product_types_manage_select on public.fm_product_types;
create policy fm_product_types_manage_select on public.fm_product_types
  for select to authenticated
  using (public.current_app_role() in ('owner', 'admin'));
drop policy if exists fm_product_types_manage_insert on public.fm_product_types;
create policy fm_product_types_manage_insert on public.fm_product_types
  for insert to authenticated
  with check (public.current_app_role() in ('owner', 'admin'));
drop policy if exists fm_product_types_manage_update on public.fm_product_types;
create policy fm_product_types_manage_update on public.fm_product_types
  for update to authenticated
  using      (public.current_app_role() in ('owner', 'admin'))
  with check (public.current_app_role() in ('owner', 'admin'));

drop policy if exists fm_items_manage_select on public.fm_items;
create policy fm_items_manage_select on public.fm_items
  for select to authenticated
  using (public.current_app_role() in ('owner', 'admin'));
drop policy if exists fm_items_manage_insert on public.fm_items;
create policy fm_items_manage_insert on public.fm_items
  for insert to authenticated
  with check (public.current_app_role() in ('owner', 'admin'));
drop policy if exists fm_items_manage_update on public.fm_items;
create policy fm_items_manage_update on public.fm_items
  for update to authenticated
  using      (public.current_app_role() in ('owner', 'admin'))
  with check (public.current_app_role() in ('owner', 'admin'));

-- ── 2. taxonomy seed — reference data, IN the migration ─────────────────────
-- Deliberately here and not in a data-op, unlike 053's and 059's seeds: this is
-- a controlled LIST, self-contained, referencing nothing that only exists in
-- production. It therefore exists on a from-files rebuild too, exactly like
-- 060's Housekeeping catalogue, and the next §2.6 run should expect these row
-- counts on both sides. Demo data that references real holder ids goes in
-- scripts/data-ops/008 instead, so the rebuild row counts stay predictable.
--
-- Real categories come from Dhiren; these are a working set built to cover what
-- the Feb 2026 register actually contains. Includes the spec's own worked
-- example, Crafts > Paintings > Oil / Wax.

insert into public.fm_categories (name, sort_order) values
  ('Produce',              1),
  ('Crafts',               2),
  ('Food & Beverages',     3),
  ('Clothing & Textiles',  4),
  ('Home & Garden',        5),
  ('Other',                9)
on conflict (name) do nothing;

insert into public.fm_product_types (category_id, name, sort_order)
select c.id, t.name, t.sort_order
from (values
  ('Produce',             'Fresh Vegetables',  1),
  ('Produce',             'Fresh Fruit',       2),
  ('Produce',             'Herbs & Spices',    3),
  ('Crafts',              'Paintings',         1),
  ('Crafts',              'Woodwork',          2),
  ('Crafts',              'Textile Crafts',    3),
  ('Food & Beverages',    'Baked Goods',       1),
  ('Food & Beverages',    'Preserves',         2),
  ('Food & Beverages',    'Drinks',            3),
  ('Clothing & Textiles', 'Ready-to-wear',     1),
  ('Clothing & Textiles', 'Accessories',       2),
  ('Clothing & Textiles', 'Home Textiles',     3),
  ('Home & Garden',       'Plants',            1),
  ('Home & Garden',       'Home Care',         2),
  ('Home & Garden',       'Garden Supplies',   3),
  ('Other',               'Services',          1),
  ('Other',               'Miscellaneous',     2)
) as t(category, name, sort_order)
join public.fm_categories c on c.name = t.category
on conflict (category_id, name) do nothing;

insert into public.fm_items (product_type_id, name, sort_order)
select pt.id, i.name, i.sort_order
from (values
  ('Fresh Vegetables',  'Leafy greens',            1),
  ('Fresh Vegetables',  'Tomatoes & peppers',      2),
  ('Fresh Vegetables',  'Root vegetables',         3),
  ('Fresh Fruit',       'Citrus',                  1),
  ('Fresh Fruit',       'Bananas & plantain',      2),
  ('Fresh Fruit',       'Seasonal stone fruit',    3),
  ('Herbs & Spices',    'Fresh herbs',             1),
  ('Herbs & Spices',    'Dried spices',            2),
  ('Herbs & Spices',    'Chillies',                3),
  ('Paintings',         'Oil painting',            1),
  ('Paintings',         'Wax painting',            2),
  ('Paintings',         'Acrylic painting',        3),
  ('Woodwork',          'Carved figures',          1),
  ('Woodwork',          'Small furniture',         2),
  ('Woodwork',          'Kitchen utensils',        3),
  ('Textile Crafts',    'Woven baskets',           1),
  ('Textile Crafts',    'Beadwork',                2),
  ('Textile Crafts',    'Embroidery',              3),
  ('Baked Goods',       'Bread & rolls',           1),
  ('Baked Goods',       'Cakes & slices',          2),
  ('Baked Goods',       'Pastries',                3),
  ('Preserves',         'Jams & marmalade',        1),
  ('Preserves',         'Chutneys & relish',       2),
  ('Preserves',         'Honey',                   3),
  ('Drinks',            'Roasted coffee',          1),
  ('Drinks',            'Tea & infusions',         2),
  ('Drinks',            'Juices & cordials',       3),
  ('Ready-to-wear',     'Chitenje garments',       1),
  ('Ready-to-wear',     'Childrenswear',           2),
  ('Ready-to-wear',     'Knitwear',                3),
  ('Accessories',       'Bags',                    1),
  ('Accessories',       'Jewellery',               2),
  ('Accessories',       'Hats & scarves',          3),
  ('Home Textiles',     'Cushions & throws',       1),
  ('Home Textiles',     'Table linen',             2),
  ('Home Textiles',     'Rugs',                    3),
  ('Plants',            'Seedlings',               1),
  ('Plants',            'Potted plants',           2),
  ('Plants',            'Cut flowers',             3),
  ('Home Care',         'Soaps & candles',         1),
  ('Home Care',         'Cleaning products',       2),
  ('Home Care',         'Essential oils',          3),
  ('Garden Supplies',   'Compost & soil',          1),
  ('Garden Supplies',   'Seeds',                   2),
  ('Garden Supplies',   'Garden tools',            3),
  ('Services',          'Knife sharpening',        1),
  ('Services',          'Repairs',                 2),
  ('Services',          'Photography',             3),
  ('Miscellaneous',     'Books & stationery',      1),
  ('Miscellaneous',     'Secondhand goods',        2),
  ('Miscellaneous',     'Pet supplies',            3)
) as i(type_name, name, sort_order)
join public.fm_product_types pt on pt.name = i.type_name
on conflict (product_type_id, name) do nothing;

-- ── 3. hanging the taxonomy off holders and approved items ──────────────────

alter table public.fm_holders
  add column if not exists category_id uuid references public.fm_categories(id) on delete restrict;

create index if not exists fm_holders_category_idx on public.fm_holders (category_id);

comment on column public.fm_holders.stall_type is
  'DEPRECATED as of 061. Superseded by fm_holders.category_id (level 1 of the product taxonomy). Kept rather than dropped because it is NOT NULL across 305 live rows and uniformly Other, and because backfilling category_id from fm_holders.products needs Rose to confirm the register delimiter first - several product names contain internal commas. Do not read this column in new code. Drop is a real-data-session cleanup.';

comment on column public.fm_holders.category_id is
  'Level 1 of the product taxonomy - the holder primary category. Nullable: the 305 imported holders are unclassified until Rose reclassifies them from the products blob.';

comment on column public.fm_holders.products is
  'DEPRECATED as of 061, but PRESERVED VERBATIM and deliberately not parsed. Comma-joined product text from the Feb 2026 register import (029). fm_approved_items + the taxonomy is the replacement. This stays as the provenance Rose reclassifies FROM; deleting it would destroy the only record of what each holder actually declared.';

-- item_id is added NOT NULL, which is only safe because the table is empty.
-- Assert that rather than trust it.
do $$
declare v_n bigint;
begin
  select count(*) into v_n from public.fm_approved_items;
  if v_n <> 0 then
    raise exception '061: fm_approved_items holds % row(s), expected 0. This file adds item_id NOT NULL with no backfill, which would fail or invent data. Normalise the existing rows into the taxonomy first, then re-run.', v_n;
  end if;
end $$;

alter table public.fm_approved_items
  add column if not exists item_id uuid references public.fm_items(id) on delete restrict;

alter table public.fm_approved_items alter column item_id   set not null;
alter table public.fm_approved_items alter column item_name drop not null;

alter table public.fm_approved_items drop constraint if exists fm_approved_items_holder_item_key;
alter table public.fm_approved_items add constraint fm_approved_items_holder_item_key unique (holder_id, item_id);

create index if not exists fm_approved_items_item_idx on public.fm_approved_items (item_id);

comment on column public.fm_approved_items.item_id is
  'The taxonomy item this holder is approved for (level 3). NOT NULL - approval is always against the controlled list, which is what removes the free-text comma-splitting problem.';
comment on column public.fm_approved_items.item_name is
  'OPTIONAL free-text qualifier on top of item_id, e.g. "60x80cm" against Crafts > Paintings > Oil painting. Was NOT NULL and was the whole record before 061; it is now a detail, never the classification. Do not filter or group on it.';

-- ── 4. fm_fee_schedule ──────────────────────────────────────────────────────
-- Fees become DATA. The immediate reason is that the product-change fee has to
-- be raised BY the change action (FUNCTIONAL_SPEC 7: "or it never gets
-- charged"), and a fee the RPC reads from a table cannot drift from a fee the
-- UI displays from a constant. The lasting reason is that Dhiren can change an
-- amount without a deploy.
--
-- WRITE IS owner ONLY, deliberately narrower than the rest of the module, which
-- is owner+admin. Changing a fee schedule is a money action under the build
-- standard, not front-desk day-to-day work. Widening it later is one policy.

create table if not exists public.fm_fee_schedule (
  id             uuid primary key default gen_random_uuid(),
  fee_code       text not null,
  label          text not null,
  amount         numeric not null,
  is_active      boolean not null default true,
  effective_from date not null default current_date,
  notes          text,
  updated_by     uuid references auth.users(id),
  updated_at     timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

alter table public.fm_fee_schedule drop constraint if exists fm_fee_schedule_code_key;
alter table public.fm_fee_schedule add constraint fm_fee_schedule_code_key unique (fee_code);
alter table public.fm_fee_schedule drop constraint if exists fm_fee_schedule_amount_positive;
alter table public.fm_fee_schedule add constraint fm_fee_schedule_amount_positive check (amount > 0);

comment on table public.fm_fee_schedule is
  'The Farmers Market fee schedule (FUNCTIONAL_SPEC 7). All six amounts CONFIRMED by Dhiren 18 August 2026 - none of these are placeholders. Supersedes the FM_FEES object in src/lib/constants.js, whose id_card_standard 5000 / id_card_extra 10000 / reprint 10000 values were wrong, not merely stale.';
comment on column public.fm_fee_schedule.fee_code is
  'Stable machine key. Maps onto fm_payments.payment_type, which is a coarser bucket: id_card_initial -> id_card, id_card_replace -> reprint, product_change -> product_change, and application/acceptance/visit map one to one.';

alter table public.fm_fee_schedule enable row level security;

grant select, insert, update on public.fm_fee_schedule to authenticated;
grant all                    on public.fm_fee_schedule to service_role;

drop policy if exists service_role_all_fm_fee_schedule on public.fm_fee_schedule;
create policy service_role_all_fm_fee_schedule on public.fm_fee_schedule
  for all to service_role using (true) with check (true);

drop policy if exists fm_fee_schedule_manage_select on public.fm_fee_schedule;
create policy fm_fee_schedule_manage_select on public.fm_fee_schedule
  for select to authenticated
  using (public.current_app_role() in ('owner', 'admin'));

drop policy if exists fm_fee_schedule_owner_insert on public.fm_fee_schedule;
create policy fm_fee_schedule_owner_insert on public.fm_fee_schedule
  for insert to authenticated
  with check (public.current_app_role() = 'owner');

drop policy if exists fm_fee_schedule_owner_update on public.fm_fee_schedule;
create policy fm_fee_schedule_owner_update on public.fm_fee_schedule
  for update to authenticated
  using      (public.current_app_role() = 'owner')
  with check (public.current_app_role() = 'owner');

-- The six confirmed fees. Reference data, so it belongs in the migration.
insert into public.fm_fee_schedule (fee_code, label, amount, notes) values
  ('application',      'Application fee',           10000, 'Confirmed by Dhiren 18 August 2026'),
  ('acceptance',       'Business registration fee', 20000, 'Confirmed by Dhiren 18 August 2026'),
  ('id_card_initial',  'ID cards (inclusive of 2)', 30000, 'Confirmed by Dhiren 18 August 2026. Covers the first two cards for a business.'),
  ('id_card_replace',  'Replacement card',          20000, 'Confirmed by Dhiren 18 August 2026'),
  ('visit',            'Market day visit fee',      10000, 'Confirmed by Dhiren 18 August 2026'),
  ('product_change',   'Product change',            10000, 'Confirmed by Dhiren 18 August 2026. Raised by change_holder_products() at the moment of change, never invoiced separately.')
on conflict (fee_code) do nothing;

-- ── 5. CHECK widenings ──────────────────────────────────────────────────────
-- Versioned constraint names, matching the discipline 055/058/060 established
-- on stock_movements: the name says which generation is live, so a stale
-- constraint cannot sit unnoticed beside a new one.

alter table public.fm_payments drop constraint if exists fm_payments_payment_type_check;
alter table public.fm_payments drop constraint if exists fm_payments_payment_type_check_v2;
alter table public.fm_payments add constraint fm_payments_payment_type_check_v2
  check (payment_type in ('application', 'acceptance', 'visit', 'id_card', 'reprint', 'product_change'));

alter table public.fm_holders drop constraint if exists fm_holders_status_check;
alter table public.fm_holders drop constraint if exists fm_holders_status_check_v2;
alter table public.fm_holders add constraint fm_holders_status_check_v2
  check (status in ('pending_review', 'accepted', 'active', 'inactive', 'at_risk', 'forfeited'));

-- ── 6. fm_waiting_list ────────────────────────────────────────────────────────
-- There is no waiting list in this system today - not a table, not a column,
-- not a line of code (grepped across src/, supabase/ and scripts/, 18 August).
-- So this is a build, not an extension.
--
-- POSITION IS DERIVED, NOT STORED. Order is (applied_at, created_at, id). A
-- stored position column has to be renumbered on every insert, withdrawal and
-- placement, and a renumbering that half-fails leaves a queue with two people
-- at position 4 and nobody able to tell which is right.
--
-- No DELETE policy and no DELETE grant: someone who withdrew is part of the
-- record of who was offered what. Withdraw sets status.

create table if not exists public.fm_waiting_list (
  id               uuid primary key default gen_random_uuid(),
  full_name        text not null,
  business_name    text,
  phone            text not null,
  email            text,
  category_id      uuid references public.fm_categories(id) on delete restrict,
  products_note    text,
  status           text not null default 'waiting',
  applied_at       date not null default current_date,
  offered_at       timestamptz,
  placed_at        timestamptz,
  placed_holder_id uuid references public.fm_holders(id) on delete restrict,
  notes            text,
  created_by       uuid references auth.users(id),
  created_at       timestamptz not null default now()
);

alter table public.fm_waiting_list drop constraint if exists fm_waiting_list_status_check;
alter table public.fm_waiting_list add constraint fm_waiting_list_status_check
  check (status in ('waiting', 'offered', 'placed', 'withdrawn'));

create index if not exists fm_waiting_list_queue_idx
  on public.fm_waiting_list (status, applied_at, created_at, id);

comment on table public.fm_waiting_list is
  'The Farmers Market waiting list (FUNCTIONAL_SPEC 7). Did not exist before 061. Queue position is DERIVED from (applied_at, created_at, id), never stored, so there is no renumbering step that can half-fail. A forfeited stall is OFFERED to the head of this queue by forfeit_stall(); placement is a separate deliberate act that creates the fm_holders row.';

alter table public.fm_waiting_list enable row level security;

grant select, insert, update on public.fm_waiting_list to authenticated;
grant all                    on public.fm_waiting_list to service_role;

drop policy if exists service_role_all_fm_waiting_list on public.fm_waiting_list;
create policy service_role_all_fm_waiting_list on public.fm_waiting_list
  for all to service_role using (true) with check (true);

drop policy if exists fm_waiting_list_manage_select on public.fm_waiting_list;
create policy fm_waiting_list_manage_select on public.fm_waiting_list
  for select to authenticated
  using (public.current_app_role() in ('owner', 'admin'));
drop policy if exists fm_waiting_list_manage_insert on public.fm_waiting_list;
create policy fm_waiting_list_manage_insert on public.fm_waiting_list
  for insert to authenticated
  with check (public.current_app_role() in ('owner', 'admin'));
drop policy if exists fm_waiting_list_manage_update on public.fm_waiting_list;
create policy fm_waiting_list_manage_update on public.fm_waiting_list
  for update to authenticated
  using      (public.current_app_role() in ('owner', 'admin'))
  with check (public.current_app_role() in ('owner', 'admin'));

-- ── 7. fm_stall_forfeitures ─────────────────────────────────────────────────
-- The record the spec asks for: a forfeiture that happened, why, and who got
-- the stall. WRITTEN ONLY BY forfeit_stall(). There is deliberately no INSERT
-- policy and no INSERT grant for authenticated - the SECURITY DEFINER function
-- is the single write path, so a forfeiture cannot be fabricated by hand
-- through PostgREST without also going through the eligibility check.

create table if not exists public.fm_stall_forfeitures (
  id                    uuid primary key default gen_random_uuid(),
  holder_id             uuid not null references public.fm_holders(id) on delete restrict,
  stall_number          text not null,
  released_stall_number text,
  last_visit_date       date,
  market_days_missed    integer,
  window_start          date,
  window_end            date,
  reason                text,
  awarded_to_waiting_id uuid references public.fm_waiting_list(id) on delete restrict,
  decided_by            uuid references auth.users(id),
  decided_at            timestamptz not null default now()
);

create index if not exists fm_stall_forfeitures_holder_idx on public.fm_stall_forfeitures (holder_id, decided_at desc);

comment on table public.fm_stall_forfeitures is
  'Record of a stall forfeited for three months of non-attendance (FUNCTIONAL_SPEC 7). Written ONLY by forfeit_stall() - no INSERT policy and no INSERT grant exist for authenticated, so the eligibility check cannot be bypassed via PostgREST.';
comment on column public.fm_stall_forfeitures.stall_number is
  'The stall number as it was at the moment of forfeiture. Kept here because the holder row no longer carries it unchanged - see released_stall_number.';
comment on column public.fm_stall_forfeitures.released_stall_number is
  'What the forfeited holder stall_number was rewritten TO, so the original number becomes free for the incoming holder. fm_holders.stall_number is UNIQUE and NOT NULL, so the number cannot simply be blanked or the next person could never be given it.';

alter table public.fm_stall_forfeitures enable row level security;

-- SELECT only. No insert/update/delete grant at all, by design.
grant select on public.fm_stall_forfeitures to authenticated;
grant all    on public.fm_stall_forfeitures to service_role;

drop policy if exists service_role_all_fm_stall_forfeitures on public.fm_stall_forfeitures;
create policy service_role_all_fm_stall_forfeitures on public.fm_stall_forfeitures
  for all to service_role using (true) with check (true);

drop policy if exists fm_stall_forfeitures_manage_select on public.fm_stall_forfeitures;
create policy fm_stall_forfeitures_manage_select on public.fm_stall_forfeitures
  for select to authenticated
  using (public.current_app_role() in ('owner', 'admin'));

-- ── 8. market-day maths, server-side ────────────────────────────────────────
-- Third implementation of the same rule; see the header. Mirrors
-- getMarketDayForMonth exactly: last Saturday of the month, and NULL for
-- December because there is no December market.

create or replace function public.fm_market_day(p_year integer, p_month integer)
returns date
language sql
immutable
set search_path to 'public'
as $function$
  SELECT CASE
    WHEN p_month = 12 THEN NULL
    ELSE (
      (date_trunc('month', make_date(p_year, p_month, 1)) + interval '1 month - 1 day')::date
      - ((extract(dow from (date_trunc('month', make_date(p_year, p_month, 1)) + interval '1 month - 1 day')::date)::int - 6 + 7) % 7)
    )
  END
$function$;

comment on function public.fm_market_day(integer, integer) is
  'Market day for a given year and month: the last Saturday, or NULL for December (no December market). THIRD implementation of this rule - the others are getMarketDayForMonth in src/components/farmers-market/FarmersMarketUI.jsx and the Deno copy in supabase/functions/public-checkin. If the rule changes, all three change. Logged in WOODLANDS_FOLLOWUPS.md.';

create or replace function public.fm_last_n_market_days(p_n integer)
returns setof date
language sql
stable
set search_path to 'public'
as $function$
  SELECT d FROM (
    SELECT public.fm_market_day(
             extract(year  from mth)::int,
             extract(month from mth)::int) AS d
    FROM generate_series(
           date_trunc('month', current_date) - interval '47 months',
           date_trunc('month', current_date),
           interval '1 month') AS mth
  ) s
  WHERE s.d IS NOT NULL AND s.d <= current_date
  ORDER BY s.d DESC
  LIMIT p_n
$function$;

comment on function public.fm_last_n_market_days(integer) is
  'The last p_n market days that have already happened, newest first. STABLE, not IMMUTABLE: it reads current_date.';

revoke execute on function public.fm_market_day(integer, integer)   from public, anon;
revoke execute on function public.fm_last_n_market_days(integer)    from public, anon;
grant  execute on function public.fm_market_day(integer, integer)   to authenticated, service_role;
grant  execute on function public.fm_last_n_market_days(integer)    to authenticated, service_role;

-- ── 9. v_fm_attendance ──────────────────────────────────────────────────────
-- The attended/not-attended grid over the last three market days, which for a
-- monthly market IS "the last three months". A VIEW for the same reason
-- v_stock_consumption is a view (060): fm_visits already holds the truth, and a
-- second table would have to be kept in step with it.
--
-- THIS REPLACES A WRITE. HoldersTab.load() currently UPDATEs fm_holders.status
-- to 'at_risk' from the browser on every page load, for every holder matching
-- the rule. That is a mutation performed by a read, it runs for whoever happens
-- to open the tab, and it silently overwrites a status a manager may have set
-- by hand. The view computes the same judgement and writes nothing.
--
-- security_invoker = true, so fm_holders' and fm_visits' own owner/admin
-- policies are the access control and this view adds no policy surface.
--
-- ON THE ELIGIBILITY GUARD. The old rule required created_at to be more than 90
-- days ago, to avoid flagging someone who had not had a chance to attend. That
-- intent is kept but expressed against the window rather than a rolling day
-- count: a holder is only eligible if they were registered BEFORE the earliest
-- of the three market days being judged. Same protection, and it cannot drift
-- out of step with the window the way "90 days" and "3 market days" can.
--
-- Note this means the 305 imported holders are NOT eligible today: their
-- created_at is the 26 July 2026 import date, which is after all three of the
-- current market days. That is correct behaviour on the data as it stands, and
-- is why scripts/data-ops/008 seeds a small set of clearly-marked placeholder
-- holders with a backdated created_at rather than backdating the real 305.

create or replace view public.v_fm_attendance
with (security_invoker = true) as
with md as (
  select t.d as market_date,
         row_number() over (order by t.d desc) as recency
  from public.fm_last_n_market_days(3) as t(d)
),
grid as (
  select
    h.id            as holder_id,
    h.stall_number,
    h.full_name,
    h.business_name,
    h.status,
    h.created_at,
    h.category_id,
    md.market_date,
    md.recency,
    (v.id is not null)              as attended,
    coalesce(v.fee_paid, false)     as fee_paid,
    v.checked_in_at
  from public.fm_holders h
  cross join md
  left join public.fm_visits v
    on v.holder_id = h.id
   and v.visit_date = md.market_date
)
select
  g.holder_id,
  g.stall_number,
  g.full_name,
  g.business_name,
  g.status,
  g.category_id,
  g.market_date,
  g.recency,
  g.attended,
  g.fee_paid,
  g.checked_in_at,
  count(*) filter (where g.attended)     over (partition by g.holder_id) as attended_count,
  count(*) filter (where not g.attended) over (partition by g.holder_id) as missed_count,
  (select max(v2.visit_date) from public.fm_visits v2 where v2.holder_id = g.holder_id) as last_visit_date,
  (
        g.status in ('active', 'at_risk')
    and count(*) filter (where g.attended) over (partition by g.holder_id) = 0
    and g.created_at::date < (select min(m2.market_date) from md m2)
  ) as forfeit_eligible
from grid g;

comment on view public.v_fm_attendance is
  'Attended / not-attended per holder across the last three market days - the three-month attendance history in FUNCTIONAL_SPEC 7, and the feed for the forfeiture flag. One row per holder per market day. REPLACES the client-side write-on-read that mutated fm_holders.status from HoldersTab.load(); this view writes nothing. security_invoker = true, so fm_holders and fm_visits policies are the access control.';

grant select on public.v_fm_attendance to authenticated, service_role;

-- ── 10. forfeit_stall ───────────────────────────────────────────────────────
-- FLAG + MANUAL CONFIRM. The view flags; an owner or admin calls this. It is
-- SECURITY DEFINER because it must write fm_stall_forfeitures, which has no
-- INSERT policy on purpose, and because the four writes below have to be one
-- atomic act - a forfeiture recorded without the stall being released, or a
-- stall released without the offer, is worse than neither.

create or replace function public.forfeit_stall(
  p_holder_id  uuid,
  p_waiting_id uuid  default null,
  p_reason     text  default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_role       text;
  v_holder     public.fm_holders%ROWTYPE;
  v_att        record;
  v_wait       public.fm_waiting_list%ROWTYPE;
  v_window_lo  date;
  v_window_hi  date;
  v_released   text;
  v_forfeit_id uuid;
BEGIN
  IF p_holder_id IS NULL THEN
    RAISE EXCEPTION 'forfeit_stall: holder is required'
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── the security boundary ────────────────────────────────────────────────
  -- SECURITY DEFINER, so RLS does not apply inside this body and this check IS
  -- the gate.
  v_role := public.current_app_role();
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'forfeit_stall: no active profile for this user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'forfeit_stall: % is not permitted to forfeit a stall', v_role
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_holder FROM public.fm_holders WHERE id = p_holder_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'forfeit_stall: no such holder %', p_holder_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_holder.status = 'forfeited' THEN
    RAISE EXCEPTION 'forfeit_stall: stall % has already been forfeited', v_holder.stall_number
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── eligibility, read from the view so there is ONE definition of the rule ─
  SELECT a.attended_count, a.missed_count, a.last_visit_date, a.forfeit_eligible
    INTO v_att
  FROM public.v_fm_attendance a
  WHERE a.holder_id = p_holder_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'forfeit_stall: no attendance window available for holder % - cannot judge eligibility', p_holder_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_att.forfeit_eligible IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'forfeit_stall: % (%) is not eligible - % of the last 3 market days attended, status %. Forfeiture requires zero attendance across the full window and registration before it began.',
      v_holder.full_name, v_holder.stall_number, v_att.attended_count, v_holder.status
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT min(t.d), max(t.d) INTO v_window_lo, v_window_hi
  FROM public.fm_last_n_market_days(3) AS t(d);

  -- ── the incoming holder, if one was named or one is waiting ──────────────
  -- p_waiting_id NULL means "whoever is next", which is the spec's wording.
  -- An explicit id is validated rather than trusted.
  IF p_waiting_id IS NOT NULL THEN
    SELECT * INTO v_wait FROM public.fm_waiting_list WHERE id = p_waiting_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'forfeit_stall: no such waiting-list entry %', p_waiting_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_wait.status <> 'waiting' THEN
      RAISE EXCEPTION 'forfeit_stall: waiting-list entry % is %, not waiting', v_wait.full_name, v_wait.status
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    SELECT * INTO v_wait
    FROM public.fm_waiting_list
    WHERE status = 'waiting'
    ORDER BY applied_at, created_at, id
    LIMIT 1
    FOR UPDATE;
  END IF;

  -- ── release the stall number ─────────────────────────────────────────────
  -- fm_holders.stall_number is UNIQUE and NOT NULL, so it can be neither
  -- blanked nor duplicated. To make the number genuinely available to the
  -- incoming holder it is rewritten on the outgoing one, and the original is
  -- preserved on the forfeiture row. Suffix collisions are possible in theory
  -- (same stall forfeited twice in one day by two different holders), so the
  -- loop below is a real guard, not decoration.
  v_released := v_holder.stall_number || '-FF' || to_char(current_date, 'YYYYMMDD');
  WHILE EXISTS (SELECT 1 FROM public.fm_holders WHERE stall_number = v_released) LOOP
    v_released := v_released || 'X';
  END LOOP;

  UPDATE public.fm_holders
     SET status       = 'forfeited',
         stall_number = v_released
   WHERE id = p_holder_id;

  INSERT INTO public.fm_stall_forfeitures (
    holder_id, stall_number, released_stall_number, last_visit_date,
    market_days_missed, window_start, window_end, reason,
    awarded_to_waiting_id, decided_by
  ) VALUES (
    p_holder_id, v_holder.stall_number, v_released, v_att.last_visit_date,
    v_att.missed_count, v_window_lo, v_window_hi, p_reason,
    v_wait.id, auth.uid()
  )
  RETURNING id INTO v_forfeit_id;

  -- OFFERED, not placed. Placement creates an fm_holders row and is a separate
  -- deliberate act - the person on the list has to actually accept and pay.
  IF v_wait.id IS NOT NULL THEN
    UPDATE public.fm_waiting_list
       SET status = 'offered', offered_at = now()
     WHERE id = v_wait.id;
  END IF;

  RETURN jsonb_build_object(
    'forfeiture_id',    v_forfeit_id,
    'holder_id',        p_holder_id,
    'holder_name',      v_holder.full_name,
    'stall_number',     v_holder.stall_number,
    'released_as',      v_released,
    'window_start',     v_window_lo,
    'window_end',       v_window_hi,
    'market_days_missed', v_att.missed_count,
    'last_visit_date',  v_att.last_visit_date,
    'offered_to_id',    v_wait.id,
    'offered_to_name',  v_wait.full_name,
    'stall_now_free',   v_holder.stall_number
  );
END;
$function$;

comment on function public.forfeit_stall(uuid, uuid, text) is
  'Forfeit a stall for three months of non-attendance, and offer it to the head of the waiting list. Gated owner/admin. Eligibility is read from v_fm_attendance so there is one definition of the rule. Atomic: releases the stall number, records the forfeiture, and marks the incoming entry offered, or does none of it.';

revoke execute on function public.forfeit_stall(uuid, uuid, text) from public, anon;
grant  execute on function public.forfeit_stall(uuid, uuid, text) to authenticated, service_role;

-- ── 11. change_holder_products ──────────────────────────────────────────────
-- The fee is raised BY the change. FUNCTIONAL_SPEC 7 is explicit that a product
-- change fee invoiced separately "never gets charged", so the payment row and
-- the product rows are written in one statement-level act by one function, and
-- the amount is read from fm_fee_schedule rather than passed in by the caller.
--
-- A NO-OP CHANGE RAISES NO FEE. Saving the same set of items twice must not
-- charge twice; that would turn an idempotent-looking Save button into a
-- money-losing one. The set comparison below is the whole reason this is not
-- just a delete-and-insert.

create or replace function public.change_holder_products(
  p_holder_id      uuid,
  p_item_ids       uuid[],
  p_category_id    uuid    default null,
  p_payment_method text    default 'cash',
  p_reference      text    default null,
  p_notes          text    default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_role       text;
  v_holder     public.fm_holders%ROWTYPE;
  v_fee        public.fm_fee_schedule%ROWTYPE;
  v_old        uuid[];
  v_new        uuid[];
  v_bad        integer;
  v_payment_id uuid;
BEGIN
  IF p_holder_id IS NULL THEN
    RAISE EXCEPTION 'change_holder_products: holder is required'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_item_ids IS NULL OR array_length(p_item_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'change_holder_products: at least one product must be selected'
      USING ERRCODE = 'check_violation';
  END IF;

  v_role := public.current_app_role();
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'change_holder_products: no active profile for this user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'change_holder_products: % is not permitted to change approved products', v_role
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_holder FROM public.fm_holders WHERE id = p_holder_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'change_holder_products: no such holder %', p_holder_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- Every id must be a live catalogue item. A dangling id would otherwise be
  -- caught by the FK, but with a message nobody can act on.
  SELECT count(*) INTO v_bad
  FROM unnest(p_item_ids) AS t(item_id)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.fm_items i WHERE i.id = t.item_id AND i.is_active
  );
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'change_holder_products: % of the selected products are not live catalogue items', v_bad
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF p_category_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.fm_categories c WHERE c.id = p_category_id AND c.is_active) THEN
    RAISE EXCEPTION 'change_holder_products: no such active category %', p_category_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- ── is this actually a change? ───────────────────────────────────────────
  SELECT coalesce(array_agg(DISTINCT ai.item_id), '{}'::uuid[]) INTO v_old
  FROM public.fm_approved_items ai WHERE ai.holder_id = p_holder_id;

  SELECT coalesce(array_agg(DISTINCT u), '{}'::uuid[]) INTO v_new
  FROM unnest(p_item_ids) AS u;

  IF v_old @> v_new AND v_new @> v_old THEN
    RETURN jsonb_build_object(
      'changed',     false,
      'fee_raised',  false,
      'holder_id',   p_holder_id,
      'item_count',  coalesce(array_length(v_new, 1), 0),
      'message',     'No change to the approved product list - no fee raised.'
    );
  END IF;

  -- ── the change ───────────────────────────────────────────────────────────
  DELETE FROM public.fm_approved_items WHERE holder_id = p_holder_id;

  INSERT INTO public.fm_approved_items (holder_id, item_id, added_by)
  SELECT p_holder_id, u, auth.uid()
  FROM unnest(v_new) AS u;

  IF p_category_id IS NOT NULL THEN
    UPDATE public.fm_holders SET category_id = p_category_id WHERE id = p_holder_id;
  END IF;

  -- ── and the fee, in the same transaction, from the schedule ──────────────
  -- Fail loudly if the fee is missing or retired. A silently-skipped fee is the
  -- exact failure the spec calls out, so it must not be possible to make the
  -- change succeed while the charge disappears.
  SELECT * INTO v_fee
  FROM public.fm_fee_schedule
  WHERE fee_code = 'product_change' AND is_active
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'change_holder_products: no active product_change fee in fm_fee_schedule - refusing to make a product change that raises no fee'
      USING ERRCODE = 'no_data_found';
  END IF;

  INSERT INTO public.fm_payments (
    holder_id, payment_type, amount, payment_date, payment_method,
    reference, recorded_by, notes
  ) VALUES (
    p_holder_id, 'product_change', v_fee.amount, current_date, p_payment_method,
    p_reference, auth.uid(),
    coalesce(p_notes, 'Product change fee, raised automatically at the point of change (061).')
  )
  RETURNING id INTO v_payment_id;

  RETURN jsonb_build_object(
    'changed',      true,
    'fee_raised',   true,
    'holder_id',    p_holder_id,
    'holder_name',  v_holder.full_name,
    'item_count',   coalesce(array_length(v_new, 1), 0),
    'removed',      coalesce(array_length(v_old, 1), 0),
    'fee_code',     v_fee.fee_code,
    'fee_amount',   v_fee.amount,
    'payment_id',   v_payment_id
  );
END;
$function$;

comment on function public.change_holder_products(uuid, uuid[], uuid, text, text, text) is
  'Replace a holder approved product list from the controlled taxonomy AND raise the product-change fee in the same transaction, reading the amount from fm_fee_schedule (FUNCTIONAL_SPEC 7: a fee invoiced separately never gets charged). Gated owner/admin. A no-op change raises no fee.';

revoke execute on function public.change_holder_products(uuid, uuid[], uuid, text, text, text) from public, anon;
grant  execute on function public.change_holder_products(uuid, uuid[], uuid, text, text, text) to authenticated, service_role;

-- ── 12. guards ──────────────────────────────────────────────────────────────
-- 060's first dry run failed here and that is the point of having it: a new
-- function inherits Postgres's PUBLIC EXECUTE default, which on this project
-- means anon could execute it. Run 6 found the same class of defect in the
-- files for current_app_role/current_app_department. Assert, do not assume.

do $$
declare
  v_bad text;
begin
  select string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', ', ')
    into v_bad
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('fm_market_day', 'fm_last_n_market_days', 'forfeit_stall', 'change_holder_products')
    and (
      has_function_privilege('anon',   p.oid, 'EXECUTE')
      or coalesce(array_to_string(p.proacl::text[], ','), '') ~ '(^|,)=X'
    );

  if v_bad is not null then
    raise exception '061 GUARD FAILED: PUBLIC or anon EXECUTE present on %. This is the 060 defect and the run 6 files gap. Rolling back - fix the revoke/grant pair in this file.', v_bad;
  end if;
end $$;

do $$
declare
  v_missing text;
begin
  select string_agg(t, ', ') into v_missing
  from unnest(array[
    'fm_categories', 'fm_product_types', 'fm_items', 'fm_fee_schedule',
    'fm_waiting_list', 'fm_stall_forfeitures'
  ]) as t
  where not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = t and c.relrowsecurity
  );

  if v_missing is not null then
    raise exception '061 GUARD FAILED: RLS not enabled on %. Standard rule 2 - a table without RLS is not built. Rolling back.', v_missing;
  end if;
end $$;

do $$
declare
  v_inv text;
begin
  select coalesce(array_to_string(c.reloptions, ','), 'none') into v_inv
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'v_fm_attendance';

  if v_inv is distinct from 'security_invoker=true' then
    raise exception '061 GUARD FAILED: v_fm_attendance reloptions are %, expected security_invoker=true. Without it the view runs as its owner and silently bypasses fm_holders/fm_visits RLS. Rolling back.', v_inv;
  end if;
end $$;

do $$
declare
  v_cat int; v_typ int; v_itm int; v_fee int;
begin
  select count(*) into v_cat from public.fm_categories;
  select count(*) into v_typ from public.fm_product_types;
  select count(*) into v_itm from public.fm_items;
  select count(*) into v_fee from public.fm_fee_schedule where is_active;

  if v_cat < 6 or v_typ < 17 or v_itm < 51 or v_fee < 6 then
    raise exception '061 GUARD FAILED: seed incomplete - categories %, product types %, items %, active fees % (expected at least 6/17/51/6). Rolling back.', v_cat, v_typ, v_itm, v_fee;
  end if;

  raise notice '061: taxonomy seeded % categories / % product types / % items; % active fees.', v_cat, v_typ, v_itm, v_fee;
end $$;

do $$
declare
  v_amt numeric;
begin
  select amount into v_amt from public.fm_fee_schedule where fee_code = 'product_change' and is_active;
  if v_amt is distinct from 10000 then
    raise exception '061 GUARD FAILED: product_change fee is %, expected 10000 (confirmed by Dhiren). change_holder_products reads this value, so a wrong amount here charges every stallholder wrongly. Rolling back.', v_amt;
  end if;
  raise notice '061: product_change fee confirmed at MWK %.', v_amt;
end $$;

commit;
