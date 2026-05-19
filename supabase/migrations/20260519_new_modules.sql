-- ─── Events ───────────────────────────────────────────────────────────────────

create table if not exists events (
  id          bigserial primary key,
  title       text        not null,
  description text,
  event_date  date        not null,
  start_time  time,
  end_time    time,
  location    text,
  capacity    integer,
  status      text        not null default 'upcoming'
                          check (status in ('upcoming','ongoing','completed','cancelled')),
  created_at  timestamptz not null default now()
);

-- ─── Table Bookings ───────────────────────────────────────────────────────────

create table if not exists table_bookings (
  id           bigserial primary key,
  guest_name   text        not null,
  guest_phone  text,
  table_number text,
  party_size   integer     not null default 1,
  booking_date date        not null,
  booking_time time        not null,
  status       text        not null default 'confirmed'
               check (status in ('confirmed','seated','completed','cancelled','no_show')),
  notes        text,
  created_at   timestamptz not null default now()
);

-- ─── Farmers Market Holders ───────────────────────────────────────────────────

create table if not exists farmers_market_holders (
  id            bigserial primary key,
  name          text        not null,
  business_name text,
  phone         text,
  email         text,
  stall_type    text,
  stall_number  text,
  active        boolean     not null default true,
  created_at    timestamptz not null default now()
);

-- ─── Farmers Market Visits ────────────────────────────────────────────────────

create table if not exists farmers_market_visits (
  id           bigserial primary key,
  visit_date   date        not null default current_date,
  holder_id    bigint      not null references farmers_market_holders(id) on delete cascade,
  checked_in   boolean     not null default false,
  notes        text,
  created_at   timestamptz not null default now(),
  unique (visit_date, holder_id)
);
