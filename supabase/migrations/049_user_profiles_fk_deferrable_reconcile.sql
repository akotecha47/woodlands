-- 049_user_profiles_fk_deferrable_reconcile.sql
-- §2.6 reconciliation, part 4 of 5 — the deferrable user_profiles FK.
--
-- This is the divergence that runs in the SAFETY-CRITICAL direction: the
-- files were WEAKER than production, and a rebuild would have produced a
-- database that breaks user creation.
--
-- standards.md §6 states the requirement outright:
--
--     `user_profiles.id -> auth.users(id)` must be DEFERRABLE INITIALLY
--     DEFERRED. The Edge Function creates the auth user then immediately
--     inserts the profile row. A non-deferred constraint fires before commit
--     and raises a violation. Deferred checks at commit, by which point both
--     rows exist.
--
-- §6 even gives the exact ALTER. It was applied to production by hand and
-- never filed: grepping all 45 migration files (case-insensitively) for
-- "deferrable" returns ZERO hits. Production carries it
-- (pg_constraint.condeferrable = t, condeferred = t, verified read-only);
-- 001_schema.sql:7 declares only `REFERENCES auth.users(id) ON DELETE
-- CASCADE`. So a from-files rebuild yields a non-deferred constraint, and
-- `create-user` — the one Edge Function that provisions every user in the
-- system — would fail on its very first call against it.
--
-- The rebuild proof existed to catch exactly this: a documented, load-bearing
-- requirement that lived only in prose and in production, never in the schema
-- the files describe.
--
-- FILE-ONLY for production: production already has the deferrable form.
-- Record with `supabase migration repair --status applied 049`; do NOT run it
-- there — dropping and recreating an FK on the live user_profiles table is a
-- real (if brief) window against auth, taken for no gain when the end state
-- is already correct.
--
-- Idempotent: re-derives the constraint only when it is missing or is not
-- already deferrable, so running it twice is a no-op.

begin;

do $$
declare
  v_is_deferrable boolean;
begin
  select con.condeferrable into v_is_deferrable
    from pg_constraint con
   where con.conname = 'user_profiles_id_fkey'
     and con.conrelid = 'public.user_profiles'::regclass;

  -- Already correct — nothing to do (this is the production case).
  if v_is_deferrable is true then
    return;
  end if;

  -- Present but not deferrable (the from-files rebuild case): replace it.
  if v_is_deferrable is false then
    alter table public.user_profiles drop constraint user_profiles_id_fkey;
  end if;

  -- Absent or just dropped: create it in the form standards.md §6 requires
  -- and production actually has.
  alter table public.user_profiles
    add constraint user_profiles_id_fkey
    foreign key (id) references auth.users(id) on delete cascade
    deferrable initially deferred;
end $$;

commit;
