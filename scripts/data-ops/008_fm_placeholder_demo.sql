-- scripts/data-ops/008_fm_placeholder_demo.sql
-- DATA-OP, NOT A MIGRATION. Placeholder Farmers Market demo data for 061.
--
-- WHY THIS IS NOT IN 061
--   Everything here references real holder ids, or invents demo people. 061
--   carries only reference data (the taxonomy lists and the six confirmed fees),
--   which is self-contained and therefore exists on a from-files rebuild. Demo
--   data must NOT, or every future §2.6 run has to explain a row-count gap that
--   means nothing. Same split 060 made between its Housekeeping catalogue (in
--   the migration) and 053/059's balances (data-ops).
--
-- STANDING RULE THIS SATISFIES: placeholder seed ships with the build step,
-- because a blank screen reads as broken. Without this file the 3-month
-- attendance grid renders 305 rows of "not attended" and the waiting list,
-- forfeiture and product-taxonomy surfaces are all empty.
--
-- ── THE created_at PROBLEM, AND WHAT THIS FILE DELIBERATELY DOES NOT DO ─────
-- All 305 imported holders carry created_at = 2026-07-26. That is the moment the
-- import ran, not when anyone registered — the source register is from February
-- 2026. Every market day in the current three-month window (2026-05-30,
-- 2026-06-27, 2026-07-25) therefore PRE-DATES every holder's created_at.
--
-- Consequence: no real holder can be forfeit_eligible today, because
-- v_fm_attendance requires registration before the window began. That is the
-- view behaving correctly on the data as it stands, not a bug.
--
-- The tempting fix is to backdate created_at on all 305 to the register date.
-- NOT DONE HERE, deliberately: it mutates 305 rows of real client data to
-- improve a demo, and this project's standing discipline is that real data is
-- left alone. Instead the forfeiture path is demonstrated on six clearly-marked
-- PLACEHOLDER holders (stalls Z001-Z006) with a genuinely backdated created_at.
-- Whether the real cohort's created_at should be corrected to the register date
-- is a real-data-session decision for Dhiren and Rose; logged in FOLLOWUPS.
--
-- IDEMPOTENT. Every insert carries an ON CONFLICT or a NOT EXISTS guard, so
-- re-running changes nothing. Run AFTER 061.

begin;

-- ── 0. refuse to run before 061 ─────────────────────────────────────────────
do $$
begin
  if to_regclass('public.fm_items') is null or to_regclass('public.v_fm_attendance') is null then
    raise exception 'data-ops/008: 061 has not been applied - fm_items or v_fm_attendance is missing. Apply the migration first.';
  end if;
end $$;

-- ── 1. six PLACEHOLDER holders for the forfeiture path ──────────────────────
-- Z-prefixed so they cannot collide with the real A001-A347 range, and so they
-- are obvious in any list. Three attend, three do not — the three that do not
-- become the forfeit_eligible rows the Businesses screen needs to show.
-- created_at is genuinely backdated to before the window, which is what makes
-- them eligible; that is legitimate here because these people do not exist.

insert into public.fm_holders
  (stall_number, full_name, business_name, stall_type, phone, email, status, notes, created_at)
values
  ('Z001', 'Placeholder: Tadala Banda',   'PLACEHOLDER - Tadala Fresh Greens',  'Other', '+265991000001', null, 'active', 'PLACEHOLDER demo holder created by data-ops/008. Not a real stallholder.', '2026-02-01 09:00:00+02'),
  ('Z002', 'Placeholder: Chikondi Phiri', 'PLACEHOLDER - Chikondi Woodcraft',   'Other', '+265991000002', null, 'active', 'PLACEHOLDER demo holder created by data-ops/008. Not a real stallholder.', '2026-02-01 09:00:00+02'),
  ('Z003', 'Placeholder: Mercy Gondwe',   'PLACEHOLDER - Mercy Bakes',          'Other', '+265991000003', null, 'active', 'PLACEHOLDER demo holder created by data-ops/008. Not a real stallholder.', '2026-02-01 09:00:00+02'),
  ('Z004', 'Placeholder: Yamikani Zulu',  'PLACEHOLDER - Yamikani Textiles',    'Other', '+265991000004', null, 'active', 'PLACEHOLDER demo holder created by data-ops/008. ABSENT three market days - demonstrates the forfeiture path.', '2026-02-01 09:00:00+02'),
  ('Z005', 'Placeholder: Thoko Mvula',    'PLACEHOLDER - Thoko Pottery',        'Other', '+265991000005', null, 'active', 'PLACEHOLDER demo holder created by data-ops/008. ABSENT three market days - demonstrates the forfeiture path.', '2026-02-01 09:00:00+02'),
  ('Z006', 'Placeholder: Limbani Kaunda', 'PLACEHOLDER - Limbani Honey',        'Other', '+265991000006', null, 'active', 'PLACEHOLDER demo holder created by data-ops/008. ABSENT three market days - demonstrates the forfeiture path.', '2026-02-01 09:00:00+02')
on conflict (stall_number) do nothing;

-- ── 2. attendance across the three market days ──────────────────────────────
-- Deterministic spread over the real 305 so the grid is populated and varied
-- rather than uniformly full, plus full attendance for Z001-Z003 and none for
-- Z004-Z006. The modulus pattern is arbitrary but stable, so re-running picks
-- the same holders.
--
-- NOTE these visits sit before the holders' import-stamped created_at, for the
-- reason set out in the header. Attendance is what the grid shows; created_at
-- only gates forfeiture, and an attending holder is never forfeitable.

with days as (
  select t.d as market_date, row_number() over (order by t.d) as day_no
  from public.fm_last_n_market_days(3) as t(d)
),
ranked as (
  select h.id, row_number() over (order by h.stall_number) as n
  from public.fm_holders h
  where h.stall_number ~ '^A[0-9]{3}$'
),
plan as (
  select r.id as holder_id, d.market_date, r.n
  from ranked r cross join days d
  where (d.day_no = 1 and r.n % 4 <> 0)
     or (d.day_no = 2 and r.n % 5 <> 0)
     or (d.day_no = 3 and r.n % 3 <> 0)
)
insert into public.fm_visits (holder_id, visit_date, fee_paid, checked_in_at)
select p.holder_id, p.market_date, (p.n % 7 <> 0),
       (p.market_date + time '08:30') at time zone 'Africa/Blantyre' + ((p.n % 90) || ' minutes')::interval
from plan p
on conflict (holder_id, visit_date) do nothing;

with days as (
  select t.d as market_date, row_number() over (order by t.d) as day_no
  from public.fm_last_n_market_days(3) as t(d)
)
insert into public.fm_visits (holder_id, visit_date, fee_paid, checked_in_at)
select h.id, d.market_date, true,
       (d.market_date + time '09:00') at time zone 'Africa/Blantyre'
from public.fm_holders h
cross join days d
where h.stall_number in ('Z001', 'Z002', 'Z003')
on conflict (holder_id, visit_date) do nothing;

-- ── 3. approved products from the controlled taxonomy ───────────────────────
-- A sample of real holders classified against the 061 taxonomy, so the
-- Businesses screen and the product picker are populated. Deliberately a
-- SAMPLE, not all 305: reclassifying the full register from fm_holders.products
-- needs Rose to confirm the delimiter first, and guessing it here would fragment
-- product names that contain internal commas. The unclassified remainder is
-- honest — it is exactly the work that is still outstanding.

with ranked as (
  select h.id, row_number() over (order by h.stall_number) as n
  from public.fm_holders h
  where h.stall_number ~ '^A[0-9]{3}$'
),
sample as (
  select id, n from ranked where n % 7 = 1
),
cat_items as (
  select i.id as item_id, i.product_type_id, pt.category_id,
         row_number() over (order by c.sort_order, pt.sort_order, i.sort_order) as k,
         count(*) over () as total
  from public.fm_items i
  join public.fm_product_types pt on pt.id = i.product_type_id
  join public.fm_categories c on c.id = pt.category_id
)
insert into public.fm_approved_items (holder_id, item_id)
select s.id, ci.item_id
from sample s
join cat_items ci on ci.k = ((s.n * 3) % ci.total) + 1
on conflict (holder_id, item_id) do nothing;

-- Second item for the same sample, so some holders show more than one product.
with ranked as (
  select h.id, row_number() over (order by h.stall_number) as n
  from public.fm_holders h
  where h.stall_number ~ '^A[0-9]{3}$'
),
sample as (
  select id, n from ranked where n % 7 = 1 and n % 2 = 1
),
cat_items as (
  select i.id as item_id,
         row_number() over (order by i.sort_order, i.name) as k,
         count(*) over () as total
  from public.fm_items i
)
insert into public.fm_approved_items (holder_id, item_id)
select s.id, ci.item_id
from sample s
join cat_items ci on ci.k = ((s.n * 11) % ci.total) + 1
on conflict (holder_id, item_id) do nothing;

-- Products for the placeholder holders too, so their rows are not hollow.
insert into public.fm_approved_items (holder_id, item_id)
select h.id, i.id
from (values
  ('Z001', 'Leafy greens'),
  ('Z002', 'Carved figures'),
  ('Z003', 'Bread & rolls'),
  ('Z004', 'Cushions & throws'),
  ('Z005', 'Potted plants'),
  ('Z006', 'Honey')
) as x(stall, item_name)
join public.fm_holders h on h.stall_number = x.stall
join public.fm_items   i on i.name         = x.item_name
on conflict (holder_id, item_id) do nothing;

-- Backfill each holder's primary category from whatever they are approved for.
-- Only where it is still null, so a hand-set category is never overwritten.
update public.fm_holders h
   set category_id = sub.category_id
from (
  select ai.holder_id, min(pt.category_id::text)::uuid as category_id
  from public.fm_approved_items ai
  join public.fm_items i         on i.id  = ai.item_id
  join public.fm_product_types pt on pt.id = i.product_type_id
  group by ai.holder_id
) sub
where sub.holder_id = h.id
  and h.category_id is null;

-- ── 4. waiting list ─────────────────────────────────────────────────────────
-- Eight entries so the queue, its ordering and the "offer to the next entry"
-- step in forfeit_stall() all have something to act on. Guarded on phone so a
-- re-run does not duplicate the queue.

insert into public.fm_waiting_list (full_name, business_name, phone, email, category_id, products_note, applied_at, notes)
select v.full_name, v.business_name, v.phone, v.email,
       (select id from public.fm_categories where name = v.category),
       v.products_note, v.applied_at::date,
       'PLACEHOLDER waiting-list entry created by data-ops/008.'
from (values
  ('Placeholder: Grace Nyirenda',  'PLACEHOLDER - Grace Preserves',    '+265992000001', null, 'Food & Beverages',    'Jams and chutneys',            '2026-03-04'),
  ('Placeholder: Isaac Chirwa',    'PLACEHOLDER - Isaac Leatherworks', '+265992000002', null, 'Crafts',              'Leather bags and belts',       '2026-03-19'),
  ('Placeholder: Ruth Mwale',      'PLACEHOLDER - Ruth Seedlings',     '+265992000003', null, 'Home & Garden',       'Vegetable seedlings',          '2026-04-02'),
  ('Placeholder: Peter Kalua',     'PLACEHOLDER - Kalua Coffee',       '+265992000004', null, 'Food & Beverages',    'Roasted coffee beans',         '2026-04-27'),
  ('Placeholder: Esther Msiska',   'PLACEHOLDER - Esther Chitenje',    '+265992000005', null, 'Clothing & Textiles', 'Chitenje dresses',             '2026-05-11'),
  ('Placeholder: Daniel Tembo',    'PLACEHOLDER - Tembo Carvings',     '+265992000006', null, 'Crafts',              'Wood carvings',                '2026-06-08'),
  ('Placeholder: Agnes Kachale',   'PLACEHOLDER - Agnes Herbs',        '+265992000007', null, 'Produce',             'Fresh herbs and chillies',     '2026-06-30'),
  ('Placeholder: Samuel Nkhoma',   'PLACEHOLDER - Nkhoma Honey',       '+265992000008', null, 'Food & Beverages',    'Honey and beeswax',            '2026-07-21')
) as v(full_name, business_name, phone, email, category, products_note, applied_at)
where not exists (
  select 1 from public.fm_waiting_list w where w.phone = v.phone
);

-- ── 5. report ───────────────────────────────────────────────────────────────
select
  (select count(*) from public.fm_holders)                                        as holders_total,
  (select count(*) from public.fm_holders where stall_number ~ '^Z[0-9]{3}$')     as placeholder_holders,
  (select count(*) from public.fm_visits)                                         as visits_total,
  (select count(*) from public.fm_approved_items)                                 as approved_items,
  (select count(*) from public.fm_holders where category_id is not null)          as holders_classified,
  (select count(*) from public.fm_waiting_list where status = 'waiting')          as waiting,
  (select count(distinct holder_id) from public.v_fm_attendance where forfeit_eligible) as forfeit_eligible;

commit;
