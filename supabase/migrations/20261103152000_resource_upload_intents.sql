-- Phase 3D direct-upload authorization. Apply after Resource Storage cleanup.
create table if not exists public.resource_upload_intents (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  resource_id uuid not null references public.resources(id) on delete cascade,
  attachment_id uuid not null unique,
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null,
  file_size bigint not null check (file_size > 0 and file_size <= 52428800),
  expires_at timestamptz not null,
  finalized_at timestamptz,
  cleanup_locked_until timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create index if not exists resource_upload_intents_expiry_idx
  on public.resource_upload_intents (household_id, resource_id, expires_at)
  where finalized_at is null;

alter table public.resource_upload_intents enable row level security;
revoke all on table public.resource_upload_intents from anon, authenticated;

create or replace function public.validate_resource_upload_intent()
returns trigger language plpgsql security definer set search_path = public, storage as $$
declare path_household uuid; path_resource uuid; path_attachment uuid;
begin
  if not public.casakeeper_valid_resource_storage_path(new.storage_path) then
    raise exception 'Upload intent must use the canonical Resource Storage path.' using errcode = '23514';
  end if;
  path_household := split_part(new.storage_path, '/', 1)::uuid;
  path_resource := split_part(new.storage_path, '/', 3)::uuid;
  path_attachment := split_part(new.storage_path, '/', 4)::uuid;
  if path_household <> new.household_id or path_resource <> new.resource_id or path_attachment <> new.attachment_id then
    raise exception 'Upload intent path does not match its identifiers.' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.resources r
    where r.id = new.resource_id and r.household_id = new.household_id and not r.storage_cleanup_pending
  ) then
    raise exception 'Resource is unavailable for new uploads.' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.validate_resource_upload_intent() from public, anon, authenticated;

drop trigger if exists resource_upload_intent_check on public.resource_upload_intents;
create trigger resource_upload_intent_check
before insert or update on public.resource_upload_intents
for each row execute function public.validate_resource_upload_intent();

create or replace function public.finalize_resource_upload(p_intent_id uuid)
returns table (
  id uuid,
  parent_id uuid,
  original_filename text,
  mime_type text,
  file_size bigint,
  storage_path text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  current_household uuid;
  intent public.resource_upload_intents;
  resource_household uuid;
  existing_attachment public.attachments;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select hm.household_id into current_household
  from public.household_members hm
  where hm.user_id = auth.uid()
  limit 1;
  if current_household is null then
    raise exception 'household membership required' using errcode = '42501';
  end if;

  select i.* into intent
  from public.resource_upload_intents i
  where i.id = p_intent_id and i.household_id = current_household
  for update;
  if not found then
    raise exception 'upload authorization not found' using errcode = 'P0002';
  end if;

  select r.household_id into resource_household
  from public.resources r
  where r.id = intent.resource_id;
  if resource_household is null or resource_household <> current_household then
    raise exception 'Resource is not in the authenticated household' using errcode = '42501';
  end if;
  if exists (select 1 from public.resources r where r.id = intent.resource_id and r.storage_cleanup_pending) then
    raise exception 'Resource is pending deletion' using errcode = '40901';
  end if;

  select a.* into existing_attachment
  from public.attachments a
  where a.id = intent.attachment_id;
  if found then
    if existing_attachment.household_id <> current_household
       or existing_attachment.parent_type <> 'resource'
       or existing_attachment.parent_id <> intent.resource_id
       or existing_attachment.storage_path <> intent.storage_path then
      raise exception 'Attachment authorization does not match existing metadata' using errcode = '42501';
    end if;
    if intent.finalized_at is null then
      update public.resource_upload_intents
      set finalized_at = now(), cleanup_locked_until = null
      where resource_upload_intents.id = intent.id;
    end if;
    return query
      select existing_attachment.id, existing_attachment.parent_id, existing_attachment.original_filename,
             existing_attachment.mime_type, existing_attachment.file_size, existing_attachment.storage_path,
             existing_attachment.created_at;
    return;
  end if;

  if intent.finalized_at is not null then
    raise exception 'Upload was finalized without matching metadata' using errcode = 'XX000';
  end if;
  if intent.expires_at <= now() then
    raise exception 'upload authorization expired' using errcode = '22023';
  end if;

  insert into public.attachments (id, household_id, parent_type, parent_id, original_filename, mime_type, file_size, storage_path)
  values (intent.attachment_id, current_household, 'resource', intent.resource_id, intent.original_filename, intent.mime_type, intent.file_size, intent.storage_path);

  update public.resource_upload_intents
  set finalized_at = now(), cleanup_locked_until = null
  where resource_upload_intents.id = intent.id;

  return query
    select a.id, a.parent_id, a.original_filename, a.mime_type, a.file_size, a.storage_path, a.created_at
    from public.attachments a
    where a.id = intent.attachment_id;
end;
$$;

revoke all on function public.finalize_resource_upload(uuid) from public, anon, authenticated;
grant execute on function public.finalize_resource_upload(uuid) to authenticated;
