-- 051_current_stock_location_dimension.sql
-- Phase 2, two-tier inventory — FOUNDATION, part 1 of 3: the location dimension.
--
-- WHAT THIS DOES
--   current_stock stops being "one balance per item" and becomes
--   "one balance per (item, location)". A location is either the reserved
--   store location 'Main Store' or a department name.
--
-- WHAT IT DELIBERATELY DOES NOT DO
--   - No catalogue dedupe. stock_items keeps all 559 rows, including the 276
--     products that exist twice (once per bar). Deferred to the real-data
--     session — see WOODLANDS_FOLLOWUPS.md.
--   - No transfer primitive, no movement_type widening, no Movement Ledger.
--   - No RLS changes. Both tables remain tables and no column any policy
--     references is dropped or renamed, so all 10 existing policies on
--     stock_items / current_stock keep applying unchanged.
--
-- THE MODEL
--   stock_items      identity (the product catalogue). Not yet deduped.
--   current_stock    balance, keyed by (stock_item_id, location, sub_location).
--
--   'Main Store' is a RESERVED LOCATION, not a department. It is deliberately
--   NOT a row in the `departments` table, so it can never appear in the
--   Add-User department dropdown (AddUserTab reads `departments`). The
--   stock-location list is composed in code as ['Main Store', ...departments]
--   — see src/lib/constants.js. No stock_locations reference table is created:
--   that would be a FOURTH department vocabulary, and reconciling the three
--   that had already drifted is exactly what scripts/data-ops/003 and 004 did.
--
--   'Laundry' is a SUB-LOCATION of Housekeeping, not a department:
--   (location = 'Housekeeping', sub_location = 'Laundry').
--
-- WHY location LIVES HERE AND NOT ON stock_items
--   Putting location on the balance row is what makes the eventual real-data
--   dedupe a pure DATA operation: balances are re-pointed to the surviving
--   catalogue row and their `location` is kept as-is. Nothing structural moves.
--   It is also what makes the later stock_catalogue / stock_locations split two
--   renames rather than a retrofit — current_stock already has the balance
--   table's shape.
--
-- stock_items.department IS NOW DEPRECATED, NOT AUTHORITATIVE.
--   It stays populated because migration 039's stock_items_dept_select and
--   current_stock_dept_select both key on it, and RLS is out of scope for this
--   session. The invariant this migration establishes — for every pre-existing
--   balance, current_stock.location = that item's stock_items.department — is
--   what lets the RLS pass re-point those policies at current_stock.location
--   and the column then be dropped.
--
-- REBUILD BEHAVIOUR
--   The backfill is UPDATE ... FROM, so on a from-files rebuild (where
--   stock_items is empty — the catalogue came from scripts/data-ops/002, which
--   is not a migration) this applies as a clean no-op.

begin;

-- ── 1. the three new columns ────────────────────────────────────────────────

alter table public.current_stock
  add column if not exists location      text,
  add column if not exists sub_location  text,
  add column if not exists reorder_level integer;

-- ── 2. backfill: every pre-existing balance is a DEPARTMENT-tier balance ────
-- Derived per row from the catalogue row it belongs to, never assumed.
-- Production: 559 rows -> 276 'Main Bar' + 283 'Sports Bar'.

update public.current_stock cs
   set location = si.department
  from public.stock_items si
 where si.id = cs.stock_item_id
   and cs.location is null;

-- Fail loudly rather than silently defaulting a balance to some fallback
-- location. A NULL here would mean a balance whose catalogue row carries no
-- department — which would make the row invisible to department scoping.
do $$
declare v_orphans integer;
begin
  select count(*) into v_orphans from public.current_stock where location is null;
  if v_orphans > 0 then
    raise exception '051: % balance row(s) have no location — stock_items.department is NULL for them', v_orphans;
  end if;
end $$;

alter table public.current_stock alter column location set not null;

-- ── 3. tier — generated, so it cannot drift from location ───────────────────
-- Exists so the application and future policies can say tier = 'department'
-- instead of negating against the reserved name in five places.

alter table public.current_stock
  add column if not exists tier text
  generated always as (
    case when location = 'Main Store' then 'store' else 'department' end
  ) stored;

-- ── 4. the key swap ─────────────────────────────────────────────────────────
-- UNIQUE (stock_item_id) is what made two tiers impossible. NULLS NOT
-- DISTINCT (PG15+; this project is on 17.6) lets sub_location stay honestly
-- NULL for the ordinary case instead of carrying an empty-string sentinel,
-- while still preventing two NULL-sub_location rows for the same
-- (item, location).

alter table public.current_stock drop constraint if exists current_stock_stock_item_id_key;

alter table public.current_stock drop constraint if exists current_stock_item_location_key;
alter table public.current_stock
  add constraint current_stock_item_location_key
  unique nulls not distinct (stock_item_id, location, sub_location);

create index if not exists idx_current_stock_location on public.current_stock (location);
create index if not exists idx_current_stock_tier     on public.current_stock (tier);

-- ── 5. documentation of the reserved vocabulary ─────────────────────────────

comment on column public.current_stock.location is
  'Stock location: the reserved value ''Main Store'', or a department name. Plain text, never a FK (standing rule). ''Main Store'' is NOT a department and must never be added to the departments table.';

comment on column public.current_stock.sub_location is
  'Optional sub-location within a location. Currently only ''Laundry'', under location ''Housekeeping''. NULL for ordinary balances.';

comment on column public.current_stock.reorder_level is
  'Per-tier reorder threshold. NULL inherits stock_items.reorder_level (the catalogue default), which is what every department-tier row does today. Set explicitly on main-store rows so "store running out" and "department running out" are distinct alerts.';

comment on column public.current_stock.tier is
  'Generated from location: ''store'' for ''Main Store'', otherwise ''department''.';

comment on column public.stock_items.department is
  'DEPRECATED as of migration 051. Location is now authoritative on current_stock.location. Retained only because migration 039 policies (stock_items_dept_select, current_stock_dept_select) still key on it. To be dropped once the RLS pass re-points those policies at current_stock.location and the real-data catalogue dedupe runs.';

commit;
