-- ─── Role Enum ────────────────────────────────────────────────────────────────

create type user_role as enum (
  'owner',
  'manager',
  'store_supervisor',
  'head_of_department',
  'barman',
  'head_waiter',
  'waiter',
  'kitchen_staff',
  'housekeeping',
  'grounds',
  'security',
  'farmers_market_admin'
);

-- ─── User Profiles ────────────────────────────────────────────────────────────
-- One row per auth user. Created by the admin panel via service-role client.

create table if not exists user_profiles (
  id            uuid        primary key references auth.users(id) on delete cascade,
  full_name     text        not null,
  email         text        not null,
  role          user_role   not null,
  department_id bigint      references departments(id) on delete set null,
  is_active     boolean     not null default true,
  created_at    timestamptz not null default now()
);

-- ─── Row-Level Security ───────────────────────────────────────────────────────

alter table user_profiles enable row level security;

-- Any authenticated user can read all profiles
-- (needed for AuthContext to fetch own profile and for admin to list users)
create policy "profiles_select"
  on user_profiles for select
  to authenticated
  using (true);

-- INSERT / UPDATE / DELETE are performed exclusively via the service-role
-- admin client (bypasses RLS). No user-facing write policies needed.

-- ─── Setup Note ───────────────────────────────────────────────────────────────
-- The first owner account must be created manually:
--   1. Create the user in Supabase Auth dashboard (Authentication → Users → Add user)
--   2. Run the following INSERT (replace <uuid> and <dept_id>):
--
--   insert into user_profiles (id, full_name, email, role)
--   values ('<uuid-from-auth>', 'Owner Name', 'owner@example.com', 'owner');
