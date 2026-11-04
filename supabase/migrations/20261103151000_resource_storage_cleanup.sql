-- Phase 3D cleanup coordination. Apply only after the Resource Storage migration is approved.

alter table public.resources
  add column if not exists storage_cleanup_pending boolean not null default false;

create or replace function public.casakeeper_can_insert_resource_object(object_name text)
returns boolean language plpgsql stable security definer set search_path = public, storage as $$
declare household uuid; resource uuid;
begin
  if not public.casakeeper_valid_resource_storage_path(object_name) then return false; end if;
  household := split_part(object_name, '/', 1)::uuid;
  resource := split_part(object_name, '/', 3)::uuid;
  return public.is_household_member(household)
    and exists (select 1 from public.resources r where r.id = resource and r.household_id = household and not r.storage_cleanup_pending);
end;
$$;

revoke all on function public.casakeeper_can_insert_resource_object(text) from public, anon, authenticated;
grant execute on function public.casakeeper_can_insert_resource_object(text) to authenticated;

create or replace function public.validate_resource_attachment_storage_path()
returns trigger language plpgsql security definer set search_path = public as $$
declare path_household uuid; path_resource uuid; path_attachment uuid;
begin
  if new.parent_type <> 'resource' then return new; end if;
  if not public.casakeeper_valid_resource_storage_path(new.storage_path) then raise exception 'Resource attachment storage_path must use the canonical household/resource/attachment/filename format.'; end if;
  path_household := split_part(new.storage_path, '/', 1)::uuid;
  path_resource := split_part(new.storage_path, '/', 3)::uuid;
  path_attachment := split_part(new.storage_path, '/', 4)::uuid;
  if path_household <> new.household_id or path_resource <> new.parent_id or path_attachment <> new.id then raise exception 'Resource attachment storage_path does not match its identifiers.'; end if;
  if not exists (select 1 from public.resources r where r.id = new.parent_id and r.household_id = new.household_id and not r.storage_cleanup_pending) then raise exception 'Resource is unavailable for new attachments.'; end if;
  return new;
end;
$$;

create table if not exists public.resource_storage_cleanup_jobs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  resource_id uuid not null references public.resources(id) on delete cascade,
  attachment_ids uuid[] not null default '{}',
  storage_paths text[] not null,
  reason text not null check (reason in ('upload_rollback', 'resource_delete', 'attachment_delete')),
  last_error text,
  retry_count integer not null default 0 check (retry_count >= 0),
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cardinality(storage_paths) > 0)
);

create index if not exists resource_storage_cleanup_jobs_scope_idx
  on public.resource_storage_cleanup_jobs (household_id, resource_id, created_at);

alter table public.resource_storage_cleanup_jobs enable row level security;

-- Cleanup jobs are server-owned records. Authenticated clients may inspect their
-- household's jobs for status, but cannot insert, update, or delete them.
revoke all on table public.resource_storage_cleanup_jobs from anon, authenticated;
grant select on table public.resource_storage_cleanup_jobs to authenticated;

create or replace function public.validate_resource_storage_cleanup_job()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  expected_household uuid;
  expected_resource uuid;
  attachment_id uuid;
  attachment_path text;
begin
  select r.household_id into expected_household from public.resources r where r.id = new.resource_id;
  if expected_household is null or expected_household <> new.household_id then
    raise exception 'Cleanup job Resource is not in its household.' using errcode = '23514';
  end if;
  if cardinality(new.storage_paths) is null or cardinality(new.storage_paths) = 0 or array_position(new.storage_paths, null) is not null then
    raise exception 'Cleanup job must contain Storage paths.' using errcode = '23514';
  end if;
  foreach attachment_id in array new.attachment_ids loop
    select a.storage_path, a.parent_id into attachment_path, expected_resource
      from public.attachments a
      where a.id = attachment_id and a.household_id = new.household_id
        and a.parent_type = 'resource' and a.parent_id = new.resource_id;
    if attachment_path is null or attachment_path <> all(new.storage_paths) then
      raise exception 'Cleanup job attachment is not owned by its Resource.' using errcode = '23514';
    end if;
  end loop;
  foreach attachment_path in array new.storage_paths loop
    if not public.casakeeper_valid_resource_storage_path(attachment_path)
       or split_part(attachment_path, '/', 1)::uuid <> new.household_id
       or split_part(attachment_path, '/', 3)::uuid <> new.resource_id then
      raise exception 'Cleanup job contains an invalid Storage path.' using errcode = '23514';
    end if;
  end loop;
  if new.reason <> 'upload_rollback' and cardinality(new.attachment_ids) <> cardinality(new.storage_paths) then
    raise exception 'Non-upload cleanup jobs require metadata for every Storage path.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists resource_storage_cleanup_job_check on public.resource_storage_cleanup_jobs;
create trigger resource_storage_cleanup_job_check
before insert or update on public.resource_storage_cleanup_jobs
for each row execute function public.validate_resource_storage_cleanup_job();

drop policy if exists resource_storage_cleanup_jobs_select on public.resource_storage_cleanup_jobs;
create policy resource_storage_cleanup_jobs_select on public.resource_storage_cleanup_jobs
  for select to authenticated using (public.is_household_member(household_id));

drop policy if exists resources_member_delete on public.resources;
drop policy if exists attachments_member_delete on public.attachments;
revoke update (storage_cleanup_pending) on public.resources from anon, authenticated;
