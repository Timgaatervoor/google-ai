-- Additive migration for the existing operation-log architecture.
-- Run after the existing race_operations setup. No rows/policies are removed.
begin;

create index if not exists race_operations_event_created_id_idx
  on public.race_operations (event_id, created_at, operation_id);

-- Metadata lives in payload.record; old operation types remain valid.
-- NOT VALID preserves historic rows while checking all new writes.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'race_operations_entity_scope'
    and conrelid = 'public.race_operations'::regclass) then
    alter table public.race_operations add constraint race_operations_entity_scope check (
      type not in ('ENTITY_UPSERT', 'ENTITY_DELETED') or coalesce((
        length(event_id) > 0 and
        payload->>'table' in ('waves', 'participants', 'raceProfiles', 'categories', 'timingRecords', 'shootingResults') and
        length(payload->>'recordId') > 0 and
        payload#>>'{record,id}' = payload->>'recordId' and
        payload#>>'{record,eventId}' = event_id and
        payload#>>'{record,updatedAt}' is not null and
        (type <> 'ENTITY_DELETED' or payload#>>'{record,deletedAt}' is not null)
      ), false)
    ) not valid;
  end if;
end $$;

-- Keep the project's existing SELECT/INSERT policies and authentication model.
-- Existing anon test policies are NOT event authorization; see docs/supabase-sync.md.
alter table public.race_operations enable row level security;
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') and
     not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
       and schemaname = 'public' and tablename = 'race_operations') then
    alter publication supabase_realtime add table public.race_operations;
  end if;
end $$;

commit;
