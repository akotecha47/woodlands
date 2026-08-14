-- 005_transfer_orphan_ledger_cleanup.sql
-- Data operation, NOT a migration. No schema change.
--
-- Removes the two orphan stock_movements rows written by the transfers bug on
-- 27 July 2026 - a transfer the ledger claims happened and the balances never
-- reflected, because TransfersTab.jsx:57-60 wrote ledger rows and called no
-- RPC. Migration 057 makes that shape unwriteable; this removes the one
-- instance already in production.
--
-- AUTHORISED: Aman, 13 August 2026, explicitly, for this production write.
-- Snapshot: this morning's daily backup, confirmed by Aman before running.
--
-- THE ROWS - full identity read off production, not inferred:
--   item     1 LITER WATER (RBA-1433), department Main Bar
--   claim    Main Bar -> Sports Bar, 1 unit
--   written  2026-07-27 07:10:18.665704+00, both rows same timestamp
--   by       73d1c4cc-... (owner)
--   ids      06147eea-a79d-48a3-8489-5e24db56b376  (quantity_change -1)
--            c01d1c9d-8fb1-4aee-afce-693d1492e8d9  (quantity_change +1)
--
-- WHY DELETING IS CORRECT, AND WHY NO BALANCE IS TOUCHED
--   The movement never happened. Main Bar still holds 12 (never deducted) and
--   RBA-1433 has no Sports Bar row at all - the catalogue is not deduped, so
--   Sports Bar carries its own SBA-tagged water row. The BALANCES ARE ALREADY
--   CORRECT. It is the ledger that is wrong.
--
--   So this deletes a false record; it does not discard a real one, and it must
--   NOT be "corrected" by moving a unit of stock. There are no triggers on
--   stock_movements (verified: the only non-internal trigger in public is
--   trg_current_stock_validate_location on current_stock), so deleting these
--   rows cannot cascade into a balance change.
--
--   Left in place they would corrupt the Movement Ledger's history and totals
--   the moment it is built - which is the next inventory work.
--
-- WHY THIS IS A DATA-OPS SCRIPT AND NOT A MIGRATION
--   It deletes two specific production rows by id. It is not replayable on a
--   rebuild (a rebuilt database has no such rows) and must never appear in
--   schema_migrations. Same class as data-ops/002/003/004.
--
-- WHY IT RUNS THROUGH THE MANAGEMENT API
--   `authenticated` holds no DELETE grant on stock_movements and no DELETE
--   policy exists, so this is fail-closed to every application role by design.
--   It runs as postgres, deliberately, once.
--
-- SAFETY: fail-loud on every assumption. If production does not look exactly as
-- described above, this aborts having changed nothing.

begin;

-- 1. Assert the rows are exactly what we believe, BEFORE deleting -----------

do $$
declare
  n_match int;
  n_total int;
begin
  select count(*) into n_match
    from public.stock_movements m
    join public.stock_items si on si.id = m.stock_item_id
   where m.id in ('06147eea-a79d-48a3-8489-5e24db56b376',
                  'c01d1c9d-8fb1-4aee-afce-693d1492e8d9')
     and m.movement_type   = 'transfer'
     and m.from_department = 'Main Bar'
     and m.to_department   = 'Sports Bar'
     and si.sku            = 'RBA-1433'
     and m.created_at      = '2026-07-27 07:10:18.665704+00'::timestamptz
     and m.quantity_change in (-1, 1);

  if n_match <> 2 then
    raise exception
      '005: expected exactly 2 matching orphan rows, found % - production does not match the diagnosis, aborting', n_match;
  end if;

  -- Nothing else may be carrying movement_type = 'transfer' yet. If it is,
  -- someone recorded a transfer after the diagnosis and this script's premise
  -- ("these are the only two, and they are orphans") no longer holds.
  select count(*) into n_total
    from public.stock_movements where movement_type = 'transfer';

  if n_total <> 2 then
    raise exception
      '005: found % transfer rows in total, expected exactly 2 - a transfer was recorded after the diagnosis, aborting', n_total;
  end if;
end $$;

-- 2. Capture the balances so step 4 can prove they did not move -------------

create temporary table _bal_before on commit drop as
  select cs.id, cs.location, cs.quantity
    from public.current_stock cs
    join public.stock_items si on si.id = cs.stock_item_id
   where si.sku = 'RBA-1433';

-- 3. The delete, by id only -------------------------------------------------

delete from public.stock_movements
 where id in ('06147eea-a79d-48a3-8489-5e24db56b376',
              'c01d1c9d-8fb1-4aee-afce-693d1492e8d9');

-- 4. Assert the outcome -----------------------------------------------------

do $$
declare
  n_left    int;
  n_moved   int;
  n_ledger  int;
begin
  select count(*) into n_left
    from public.stock_movements
   where id in ('06147eea-a79d-48a3-8489-5e24db56b376',
                'c01d1c9d-8fb1-4aee-afce-693d1492e8d9');
  if n_left <> 0 then
    raise exception '005: % orphan row(s) survived the delete', n_left;
  end if;

  -- No balance may have changed. There is no trigger that could do it, which
  -- is exactly why it is worth asserting rather than assuming.
  select count(*) into n_moved
    from public.current_stock cs
    join _bal_before b on b.id = cs.id
   where cs.quantity is distinct from b.quantity;
  if n_moved <> 0 then
    raise exception '005: % balance row(s) changed - a ledger delete must never move stock', n_moved;
  end if;

  select count(*) into n_ledger
    from public.stock_movements where movement_type = 'transfer';
  if n_ledger <> 0 then
    raise exception '005: % transfer row(s) remain, expected 0', n_ledger;
  end if;
end $$;

commit;
