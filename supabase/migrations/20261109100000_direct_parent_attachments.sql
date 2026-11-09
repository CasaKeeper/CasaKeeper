-- Stage 2: allow secure direct Task/Routine attachments through the existing
-- private Storage bucket and upload-intent pipeline.

alter table public.resource_upload_intents
  alter column resource_id drop not null;

alter table public.resource_upload_intents
  add column if not exists parent_type text not null default 'resource'
    check (parent_type in ('task', 'routine', 'resource')),
  add column if not exists parent_id uuid;

update public.resource_upload_intents
set parent_id = resource_id
where parent_id is null;

alter table public.resource_upload_intents
  alter column parent_id set not null;

create or replace function public.casakeeper_valid_resource_storage_path(object_name text)
returns boolean language sql immutable as $$
  select object_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/(resources|tasks|routines)/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[A-Za-z0-9][A-Za-z0-9._-]{0,127}$';
$$;

create or replace function public.casakeeper_can_insert_resource_object(object_name text)
returns boolean language plpgsql stable security definer set search_path = public, storage as $$
declare household uuid; parent_type text; parent_id uuid;
begin
  if not public.casakeeper_valid_resource_storage_path(object_name) then return false; end if;
  household := split_part(object_name, '/', 1)::uuid;
  parent_type := rtrim(split_part(object_name, '/', 2), 's');
  parent_id := split_part(object_name, '/', 3)::uuid;
  if not public.is_household_member(household) then return false; end if;
  if parent_type = 'resource' then
    return exists (select 1 from public.resources r where r.id = parent_id and r.household_id = household and not r.storage_cleanup_pending);
  elsif parent_type = 'task' then
    return exists (select 1 from public.tasks t where t.id = parent_id and t.household_id = household);
  elsif parent_type = 'routine' then
    return exists (select 1 from public.routines r where r.id = parent_id and r.household_id = household);
  end if;
  return false;
end;
$$;

create or replace function public.casakeeper_can_manage_resource_object(object_name text)
returns boolean language plpgsql stable security definer set search_path = public, storage as $$
declare household uuid; parent_type text; parent_id uuid; attachment uuid;
begin
  if not public.casakeeper_valid_resource_storage_path(object_name) then return false; end if;
  household := split_part(object_name, '/', 1)::uuid;
  parent_type := rtrim(split_part(object_name, '/', 2), 's');
  parent_id := split_part(object_name, '/', 3)::uuid;
  attachment := split_part(object_name, '/', 4)::uuid;
  return public.is_household_member(household)
    and exists (select 1 from public.attachments a where a.id = attachment and a.household_id = household and a.parent_type = parent_type and a.parent_id = parent_id and a.storage_path = object_name);
end;
$$;

create or replace function public.validate_resource_attachment_storage_path()
returns trigger language plpgsql security definer set search_path = public as $$
declare path_household uuid; path_parent uuid; path_attachment uuid; path_type text;
begin
  if not public.casakeeper_valid_resource_storage_path(new.storage_path) then raise exception 'Attachment storage_path must use the canonical household/parent/attachment/filename format.'; end if;
  path_household := split_part(new.storage_path, '/', 1)::uuid;
  path_type := rtrim(split_part(new.storage_path, '/', 2), 's');
  path_parent := split_part(new.storage_path, '/', 3)::uuid;
  path_attachment := split_part(new.storage_path, '/', 4)::uuid;
  if path_household <> new.household_id or path_type <> new.parent_type or path_parent <> new.parent_id or path_attachment <> new.id then raise exception 'Attachment storage_path does not match its identifiers.'; end if;
  if new.parent_type = 'resource' and not exists (select 1 from public.resources r where r.id = new.parent_id and r.household_id = new.household_id and not r.storage_cleanup_pending) then raise exception 'Resource is unavailable for new attachments.'; end if;
  if new.parent_type = 'task' and not exists (select 1 from public.tasks t where t.id = new.parent_id and t.household_id = new.household_id) then raise exception 'Task attachment parent is not in the attachment household.'; end if;
  if new.parent_type = 'routine' and not exists (select 1 from public.routines r where r.id = new.parent_id and r.household_id = new.household_id) then raise exception 'Routine attachment parent is not in the attachment household.'; end if;
  return new;
end;
$$;

create or replace function public.validate_resource_upload_intent()
returns trigger language plpgsql security definer set search_path = public, storage as $$
declare path_household uuid; path_parent uuid; path_attachment uuid; path_type text;
begin
  if new.parent_type = 'resource' and (new.resource_id is null or new.resource_id <> new.parent_id) then raise exception 'Resource upload intent parent identifiers do not match.' using errcode = '23514'; end if;
  if new.parent_type <> 'resource' and new.resource_id is not null then raise exception 'Direct upload intents cannot reference a Resource.' using errcode = '23514'; end if;
  if not public.casakeeper_valid_resource_storage_path(new.storage_path) then raise exception 'Upload intent must use the canonical Storage path.' using errcode = '23514'; end if;
  path_household := split_part(new.storage_path, '/', 1)::uuid;
  path_type := rtrim(split_part(new.storage_path, '/', 2), 's');
  path_parent := split_part(new.storage_path, '/', 3)::uuid;
  path_attachment := split_part(new.storage_path, '/', 4)::uuid;
  if path_household <> new.household_id or path_type <> new.parent_type or path_parent <> new.parent_id or path_attachment <> new.attachment_id then raise exception 'Upload intent path does not match its identifiers.' using errcode = '23514'; end if;
  if new.parent_type = 'resource' and not exists (select 1 from public.resources r where r.id = new.parent_id and r.household_id = new.household_id and not r.storage_cleanup_pending) then raise exception 'Resource is unavailable for new uploads.' using errcode = '23514'; end if;
  if new.parent_type = 'task' and not exists (select 1 from public.tasks t where t.id = new.parent_id and t.household_id = new.household_id) then raise exception 'Task is unavailable for new uploads.' using errcode = '23514'; end if;
  if new.parent_type = 'routine' and not exists (select 1 from public.routines r where r.id = new.parent_id and r.household_id = new.household_id) then raise exception 'Routine is unavailable for new uploads.' using errcode = '23514'; end if;
  return new;
end;
$$;

create or replace function public.finalize_resource_upload(p_intent_id uuid)
returns table (id uuid, parent_id uuid, original_filename text, mime_type text, file_size bigint, storage_path text, created_at timestamptz)
language plpgsql security definer set search_path = public, extensions as $$
declare current_household uuid; intent public.resource_upload_intents; existing_attachment public.attachments;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select hm.household_id into current_household from public.household_members hm where hm.user_id = auth.uid() limit 1;
  if current_household is null then raise exception 'household membership required' using errcode = '42501'; end if;
  select i.* into intent from public.resource_upload_intents i where i.id = p_intent_id and i.household_id = current_household for update;
  if not found then raise exception 'upload authorization not found' using errcode = 'P0002'; end if;
  if intent.parent_type = 'resource' and not exists (select 1 from public.resources r where r.id = intent.parent_id and r.household_id = current_household and not r.storage_cleanup_pending) then raise exception 'Resource is unavailable' using errcode = '42501'; end if;
  if intent.parent_type = 'task' and not exists (select 1 from public.tasks t where t.id = intent.parent_id and t.household_id = current_household) then raise exception 'Task is unavailable' using errcode = '42501'; end if;
  if intent.parent_type = 'routine' and not exists (select 1 from public.routines r where r.id = intent.parent_id and r.household_id = current_household) then raise exception 'Routine is unavailable' using errcode = '42501'; end if;
  select a.* into existing_attachment from public.attachments a where a.id = intent.attachment_id;
  if found then
    if existing_attachment.household_id <> current_household or existing_attachment.parent_type <> intent.parent_type or existing_attachment.parent_id <> intent.parent_id or existing_attachment.storage_path <> intent.storage_path then raise exception 'Attachment authorization does not match existing metadata' using errcode = '42501'; end if;
    update public.resource_upload_intents set finalized_at = coalesce(finalized_at, now()), cleanup_locked_until = null where id = intent.id;
    return query select existing_attachment.id, existing_attachment.parent_id, existing_attachment.original_filename, existing_attachment.mime_type, existing_attachment.file_size, existing_attachment.storage_path, existing_attachment.created_at; return;
  end if;
  if intent.finalized_at is not null then raise exception 'Upload was finalized without matching metadata' using errcode = 'XX000'; end if;
  if intent.expires_at <= now() then raise exception 'upload authorization expired' using errcode = '22023'; end if;
  insert into public.attachments (id, household_id, parent_type, parent_id, original_filename, mime_type, file_size, storage_path) values (intent.attachment_id, current_household, intent.parent_type, intent.parent_id, intent.original_filename, intent.mime_type, intent.file_size, intent.storage_path);
  update public.resource_upload_intents set finalized_at = now(), cleanup_locked_until = null where id = intent.id;
  return query select a.id, a.parent_id, a.original_filename, a.mime_type, a.file_size, a.storage_path, a.created_at from public.attachments a where a.id = intent.attachment_id;
end;
$$;

drop policy if exists casakeeper_resource_storage_insert on storage.objects;
create policy casakeeper_resource_storage_insert on storage.objects for insert to authenticated with check (bucket_id = 'casakeeper-private' and public.casakeeper_can_insert_resource_object(name));
drop policy if exists casakeeper_resource_storage_select on storage.objects;
create policy casakeeper_resource_storage_select on storage.objects for select to authenticated using (bucket_id = 'casakeeper-private' and public.casakeeper_can_manage_resource_object(name));
drop policy if exists casakeeper_resource_storage_update on storage.objects;
create policy casakeeper_resource_storage_update on storage.objects for update to authenticated using (bucket_id = 'casakeeper-private' and public.casakeeper_can_manage_resource_object(name)) with check (bucket_id = 'casakeeper-private' and public.casakeeper_can_manage_resource_object(name));
drop policy if exists casakeeper_resource_storage_delete on storage.objects;
create policy casakeeper_resource_storage_delete on storage.objects for delete to authenticated using (bucket_id = 'casakeeper-private' and public.casakeeper_can_manage_resource_object(name));
