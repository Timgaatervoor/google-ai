-- Alleen voor een testproject: deze policies geven alle gebruikers met de publieke key toegang.
create table public.race_operations (
  operation_id text primary key,
  event_id text not null,
  participant_id text,
  type text not null,
  device_id text not null,
  operator_id text not null,
  device_timestamp timestamptz not null,
  server_timestamp timestamptz,
  payload jsonb not null default '{}'::jsonb,
  revision integer not null default 1,
  created_at timestamptz not null default now()
);

alter table public.race_operations enable row level security;

create policy "race operations insert"
on public.race_operations for insert to anon
with check (true);

create policy "race operations read"
on public.race_operations for select to anon
using (true);

create policy "race operations update"
on public.race_operations for update to anon
using (true)
with check (true);
