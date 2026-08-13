-- 054_current_stock_location_guard.sql
-- Phase 2, two-tier inventory — make a mis-located balance row structurally
-- impossible, not merely currently-unreached.
--
-- WHAT WAS ALREADY GUARDED BEFORE THIS FILE (do not re-add it)
--   A NULL location, and therefore a row belonging to NO tier, was already
--   impossible as of 051:
--     - current_stock.location is NOT NULL (verified live: is_nullable = NO).
--     - current_stock.tier is GENERATED ALWAYS from location, so it cannot be
--       supplied, omitted, or set inconsistently by any writer.
--     - 052's RPCs resolve p_location via coalesce(p_location,
--       stock_items.department) and RAISE if that is NULL rather than writing
--       a fallback row.
--   A NOT NULL or a CHECK (location IS NOT NULL) here would be a no-op.
--
-- WHAT WAS ACTUALLY STILL OPEN, AND IS WHAT THIS FILE CLOSES
--   `location` is free text, so nothing rejected a location that is non-null
--   but WRONG — 'Sport Bar', 'main store', or a department that does not
--   exist. Such a row is not null-tiered (it reads tier='department'), which
--   is precisely what makes it dangerous: it looks well-formed, matches no
--   user_profiles.department, and is therefore invisible to every
--   department_head while still counting in totals.
--
--   This is not hypothetical. scripts/data-ops/004 (13 August 2026, earlier
--   the same session as this migration) existed solely to re-tag four rows
--   orphaned by exactly this failure mode — free-text department values left
--   behind by a vocabulary rename. The guard exists so that class of bug
--   cannot recur on the balance table.
--
-- WHY A TRIGGER AND NOT A CHECK OR AN FK
--   - A CHECK constraint cannot contain a subquery, so it cannot consult the
--     departments table. It would have to hard-code the 11 canonical names,
--     creating a FOURTH copy of the department vocabulary — and reconciling
--     the three that had already drifted apart is what data-ops 003 and 004
--     spent a session doing. A hard-coded list would also need a migration
--     every time a department is added.
--   - An FK is forbidden by the standing project rule: department references
--     are plain text, never a foreign key to `departments`. 'Main Store' is
--     not a department either, so it could not satisfy such an FK anyway.
--   - A trigger validating against `departments` is a soft FK: one vocabulary
--     source, adapts automatically as departments change, and fails loudly.
--
-- SECURITY DEFINER, deliberately: validation must not depend on the writing
-- role's read access to `departments`. It only reads and raises.
--
-- SCOPED TO `UPDATE OF location, sub_location` so ordinary quantity updates —
-- the hot path, every delivery/fulfil/adjustment — do not pay for it.
--
-- REBUILD NOTE
--   On a from-files rebuild `departments` holds whatever the migrations seed,
--   which is not necessarily today's 11 canonical names (the canonical set was
--   reached by data-ops 003, which is deliberately not a migration). Harmless:
--   a rebuilt database has no stock rows to insert either. Worth knowing
--   before assuming a rebuild can accept production's stock data verbatim.

begin;

create or replace function public.current_stock_validate_location()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
BEGIN
  IF new.location IS NULL OR btrim(new.location) = '' THEN
    RAISE EXCEPTION 'current_stock: location is required'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The reserved store tier. Not a department, and holds no sub-location.
  IF new.location = 'Main Store' THEN
    IF new.sub_location IS NOT NULL THEN
      RAISE EXCEPTION 'current_stock: the Main Store tier takes no sub_location (got %)', new.sub_location
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN new;
  END IF;

  -- Every other location must be a real department, by name.
  IF NOT EXISTS (SELECT 1 FROM public.departments d WHERE d.name = new.location) THEN
    RAISE EXCEPTION 'current_stock: % is not a valid stock location - expected ''Main Store'' or a name from the departments table', new.location
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  RETURN new;
END $function$;

-- Same grant discipline as 052: CREATE FUNCTION grants EXECUTE to PUBLIC by
-- default, and this project's function default privileges are
-- {postgres=X/postgres}. Set both ends explicitly rather than inherit either.
revoke execute on function public.current_stock_validate_location() from public;
grant  execute on function public.current_stock_validate_location() to authenticated, service_role;

drop trigger if exists trg_current_stock_validate_location on public.current_stock;
create trigger trg_current_stock_validate_location
  before insert or update of location, sub_location
  on public.current_stock
  for each row
  execute function public.current_stock_validate_location();

commit;
