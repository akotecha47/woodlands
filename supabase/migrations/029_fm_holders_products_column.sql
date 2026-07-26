-- 029_fm_holders_products_column.sql
-- Add fm_holders.products to receive the Feb 2026 register import.
--
-- ADDITIVE ONLY. One nullable column. No policy or grant change needed —
-- migration 022 granted authenticated SELECT/INSERT/UPDATE on fm_holders at
-- table level with role-scoped write policies, so the column inherits both.
--
-- ------------------------------------------------------------------
-- WHY A COLUMN AND NOT fm_approved_items
-- ------------------------------------------------------------------
-- The schema already models stallholder products as a child table,
-- fm_approved_items (holder_id, item_name), which HoldersTab reads. Normalising
-- into it is the correct end state.
--
-- It is not done tonight because the source values cannot be split safely: the
-- register's product strings are comma-joined, but several individual product
-- names contain internal commas — e.g. stall 79's
-- 'Chocolate "Salame Slab", Focaccia Slab'. Splitting on commas would silently
-- fragment real product names across hundreds of rows, and the damage would be
-- invisible until someone read them back.
--
-- So the import preserves the source text verbatim in one column, and
-- normalisation waits until Rose has confirmed the intended delimiter.
-- Logged in WOODLANDS_FOLLOWUPS.md.

ALTER TABLE public.fm_holders ADD COLUMN IF NOT EXISTS products text;

COMMENT ON COLUMN public.fm_holders.products IS
  'Comma-joined product descriptions from Feb 2026 register import. Post-meeting: split into fm_approved_items after clarifying delimiter with Rose (some product names contain internal commas).';
