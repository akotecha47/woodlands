-- 053_main_store_seed.sql
-- Phase 2, two-tier inventory — FOUNDATION, part 3 of 3: populate the main
-- store tier.
--
-- WHY SEEDED AT ALL, AND WHY NOT ZERO
--   Standing project rule: placeholder data is fine, blank screens are not.
--   Seeding the store at zero would be worse than blank — every store item
--   would read "Low" on day one and bury the department alerts that matter.
--   The dashboard's low-stock figure is already 122; the store must not add to
--   it.
--
-- THE PLACEHOLDER QUANTITY IS A SINGLE FLAT VALUE — 100 units, every item.
--   Deliberately uniform, not a per-item guess. There is no basis in the data
--   for varying it: all 559 bar quantities are themselves placeholder pending
--   Dhiren's stocktake, so a computed spread would only dress invented numbers
--   up as real ones. 100 clears every reorder threshold in the system
--   (catalogue max 8; store tier max 32 below), so nothing reads Low.
--   REPLACED AT REAL-DATA STOCKTAKE — this is demo scaffolding, not an
--   opening balance.
--
-- PER-TIER REORDER LEVELS
--   Store rows get an explicit reorder_level of 4x the catalogue value
--   (bottles 5 -> 20, crates 8 -> 32), derived per row rather than typed in.
--   Department rows keep reorder_level NULL, which inherits
--   stock_items.reorder_level — exactly today's behaviour, and it avoids
--   freezing 559 copies of a value Rose still has to review per item.
--   The point of the split: "the store is running out" and "this department is
--   running out" become different alerts at different thresholds.
--
-- ONE ROW PER CATALOGUE ROW — 559, NOT 283
--   The catalogue is not deduped, so this seeds a store balance for every
--   catalogue row, which means the 276 products that exist once per bar appear
--   TWICE in the main store until the real-data dedupe merges them. That is a
--   known, accepted consequence of deferring the dedupe (WOODLANDS_FOLLOWUPS.md).
--   It is done this way deliberately: collapsing them here would require
--   trusting the SKU-suffix key to decide which rows are "the same product",
--   and that judgement belongs to the real-data session against real SKUs.
--   Switching to one-row-per-product later is a DELETE, not a rebuild.
--
-- NO stock_movements ROWS ARE WRITTEN
--   An opening_balance ledger entry per item would imply stock physically
--   arrived and was counted. It did not — these are invented numbers. Writing
--   533-plus ledger rows for them would corrupt the very audit trail the
--   Movement Ledger session is about to surface. The seed is a balance, not a
--   movement.
--
-- REBUILD BEHAVIOUR
--   INSERT ... SELECT from stock_items, so on a from-files rebuild (where the
--   catalogue is empty — it came from scripts/data-ops/002, not a migration)
--   this inserts nothing and the migration is a clean no-op.
--   NOT EXISTS makes it idempotent: re-running never double-seeds.

begin;

insert into public.current_stock (stock_item_id, location, sub_location, quantity, reorder_level, last_updated)
select si.id,
       'Main Store',
       null,
       100,                          -- flat placeholder, see header
       coalesce(si.reorder_level, 5) * 4,
       now()
  from public.stock_items si
 where si.is_active = true
   and not exists (
         select 1
           from public.current_stock cs
          where cs.stock_item_id = si.id
            and cs.location      = 'Main Store'
            and cs.sub_location is null
       );

commit;
