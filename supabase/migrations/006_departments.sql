create table if not exists departments (
  id         uuid primary key default gen_random_uuid(),
  name       text unique not null,
  created_at timestamptz default now()
);

alter table departments enable row level security;

drop policy if exists "authenticated read departments" on departments;
create policy "authenticated read departments"
  on departments for select
  to authenticated
  using (true);

insert into departments (name) values
  ('Kitchen'),
  ('Restaurant Bar'),
  ('Sports Bar'),
  ('Restaurant'),
  ('Housekeeping'),
  ('Grounds'),
  ('Security')
on conflict (name) do nothing;
