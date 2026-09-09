-- Run once in the SQL editor of the project's existing Supabase database.
-- Central timestamp in milliseconds; no participant data or elevated privileges.
create or replace function public.race_server_time()
returns double precision language sql volatile security invoker
set search_path = '' as $$ select extract(epoch from clock_timestamp())::double precision * 1000 $$;
revoke all on function public.race_server_time() from public;
grant execute on function public.race_server_time() to anon, authenticated;

-- Invitations are inaccessible through table APIs. A random 128-bit code is
-- required, expires after ten minutes, and can be redeemed only once.
create schema if not exists race_private;
revoke all on schema race_private from public, anon, authenticated;
create table if not exists race_private.pairings (
  code_hash text primary key,
  snapshot jsonb not null,
  expires_at timestamptz not null
);
create or replace function public.race_create_pairing(p_code_hash text, p_snapshot jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_code_hash !~ '^[a-f0-9]{64}$' or octet_length(p_snapshot::text) > 10000000
     or p_snapshot #>> '{data,event,id}' is null then raise exception 'Invalid invitation'; end if;
  delete from race_private.pairings where expires_at < clock_timestamp();
  insert into race_private.pairings values(p_code_hash, p_snapshot, clock_timestamp() + interval '10 minutes');
end $$;
create or replace function public.race_consume_pairing(p_code_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  delete from race_private.pairings where code_hash = p_code_hash and expires_at > clock_timestamp()
    returning snapshot into result;
  if result is null then raise exception 'Invitation expired, invalid or already used'; end if;
  return result;
end $$;
revoke all on function public.race_create_pairing(text,jsonb) from public;
revoke all on function public.race_consume_pairing(text) from public;
grant execute on function public.race_create_pairing(text,jsonb) to anon, authenticated;
grant execute on function public.race_consume_pairing(text) to anon, authenticated;
