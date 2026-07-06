create extension if not exists "pgcrypto";

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  event_date date,
  venue text,
  created_at timestamptz default now()
);

create table if not exists attendees (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  team text,
  category text,
  qr_code text unique not null,
  status text not null default 'pending' check (status in ('pending','checked_in')),
  check_in_time timestamptz,
  checked_by text,
  is_walk_in boolean default false,
  created_at timestamptz default now()
);

create index if not exists idx_attendees_event_id on attendees(event_id);
create index if not exists idx_attendees_qr_code on attendees(qr_code);
create index if not exists idx_attendees_status on attendees(status);

alter table events enable row level security;
alter table attendees enable row level security;

-- Phase 1 simple policy. Tighten later when staff login is added.
create policy "Allow public read events" on events for select using (true);
create policy "Allow public insert events" on events for insert with check (true);
create policy "Allow public update events" on events for update using (true);
create policy "Allow public delete events" on events for delete using (true);

create policy "Allow public read attendees" on attendees for select using (true);
create policy "Allow public insert attendees" on attendees for insert with check (true);
create policy "Allow public update attendees" on attendees for update using (true);
create policy "Allow public delete attendees" on attendees for delete using (true);
