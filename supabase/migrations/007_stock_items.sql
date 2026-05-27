create table if not exists stock_items (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  sku           text unique not null,
  unit          text not null,
  department    text,
  reorder_level integer default 0,
  is_active     boolean default true,
  created_at    timestamptz default now()
);
alter table stock_items enable row level security;
create policy "authenticated read stock_items" on stock_items for select to authenticated using (true);
create policy "service role full access on stock_items" on stock_items for all to service_role using (true) with check (true);
