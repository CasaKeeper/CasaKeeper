-- Phase 3D private Resource storage foundation. Review and apply only after approval.
-- Resource attachment metadata remains protected by the existing public.attachments RLS.

do $$
declare
  existing_bucket storage.buckets%rowtype;
  wanted_types text[] := array['image/jpeg','image/png','image/heic','image/heif','video/quicktime','video/mp4','application/pdf']::text[];
begin
  select * into existing_bucket from storage.buckets where id = 'casakeeper-private' for update;
  if not found then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('casakeeper-private', 'casakeeper-private', false, 52428800, wanted_types);
  elsif existing_bucket.name is distinct from 'casakeeper-private'
     or existing_bucket.public is distinct from false
     or existing_bucket.file_size_limit is distinct from 52428800
     or not (wanted_types <@ coalesce(existing_bucket.allowed_mime_types, '{}'::text[])) then
    raise exception 'Existing casakeeper-private bucket has incompatible settings; refusing to overwrite it.';
  end if;
end $$;

create or replace function public.casakeeper_valid_resource_storage_path(object_name text)
returns boolean language sql immutable as $$
  select object_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/resources/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[A-Za-z0-9][A-Za-z0-9._-]{0,127}$';
$$;

create or replace function public.casakeeper_can_insert_resource_object(object_name text)
returns boolean language plpgsql stable security definer set search_path = public, storage as $$
declare household uuid; resource uuid;
begin
  if not public.casakeeper_valid_resource_storage_path(object_name) then return false; end if;
  household := split_part(object_name, '/', 1)::uuid; resource := split_part(object_name, '/', 3)::uuid;
  return public.is_household_member(household) and exists (select 1 from public.resources r where r.id = resource and r.household_id = household);
end;
$$;

create or replace function public.casakeeper_can_manage_resource_object(object_name text)
returns boolean language plpgsql stable security definer set search_path = public, storage as $$
declare household uuid; resource uuid; attachment uuid;
begin
  if not public.casakeeper_valid_resource_storage_path(object_name) then return false; end if;
  household := split_part(object_name, '/', 1)::uuid; resource := split_part(object_name, '/', 3)::uuid; attachment := split_part(object_name, '/', 4)::uuid;
  return public.is_household_member(household)
    and exists (select 1 from public.resources r where r.id = resource and r.household_id = household)
    and exists (select 1 from public.attachments a where a.id = attachment and a.household_id = household and a.parent_type = 'resource' and a.parent_id = resource and a.storage_path = object_name);
end;
$$;

revoke all on function public.casakeeper_valid_resource_storage_path(text) from public, anon, authenticated;
revoke all on function public.casakeeper_can_insert_resource_object(text) from public, anon, authenticated;
revoke all on function public.casakeeper_can_manage_resource_object(text) from public, anon, authenticated;
grant execute on function public.casakeeper_can_insert_resource_object(text) to authenticated;
grant execute on function public.casakeeper_can_manage_resource_object(text) to authenticated;

create or replace function public.validate_resource_attachment_storage_path()
returns trigger language plpgsql security definer set search_path = public as $$
declare path_household uuid; path_resource uuid; path_attachment uuid;
begin
  if new.parent_type <> 'resource' then return new; end if;
  if not public.casakeeper_valid_resource_storage_path(new.storage_path) then raise exception 'Resource attachment storage_path must use the canonical household/resource/attachment/filename format.'; end if;
  path_household := split_part(new.storage_path, '/', 1)::uuid; path_resource := split_part(new.storage_path, '/', 3)::uuid; path_attachment := split_part(new.storage_path, '/', 4)::uuid;
  if path_household <> new.household_id or path_resource <> new.parent_id or path_attachment <> new.id then raise exception 'Resource attachment storage_path does not match its identifiers.'; end if;
  if not exists (select 1 from public.resources r where r.id = new.parent_id and r.household_id = new.household_id) then raise exception 'Resource attachment parent is not in the attachment household.'; end if;
  return new;
end;
$$;

drop trigger if exists attachments_resource_storage_path_check on public.attachments;
create trigger attachments_resource_storage_path_check before insert or update on public.attachments for each row execute function public.validate_resource_attachment_storage_path();

drop policy if exists casakeeper_resource_storage_select on storage.objects;
create policy casakeeper_resource_storage_select on storage.objects for select to authenticated
using (bucket_id = 'casakeeper-private' and public.casakeeper_can_manage_resource_object(name));

drop policy if exists casakeeper_resource_storage_insert on storage.objects;
create policy casakeeper_resource_storage_insert on storage.objects for insert to authenticated
with check (bucket_id = 'casakeeper-private' and public.casakeeper_can_insert_resource_object(name));

drop policy if exists casakeeper_resource_storage_update on storage.objects;
create policy casakeeper_resource_storage_update on storage.objects for update to authenticated
using (bucket_id = 'casakeeper-private' and public.casakeeper_can_manage_resource_object(name))
with check (bucket_id = 'casakeeper-private' and public.casakeeper_can_manage_resource_object(name));

drop policy if exists casakeeper_resource_storage_delete on storage.objects;
create policy casakeeper_resource_storage_delete on storage.objects for delete to authenticated
using (bucket_id = 'casakeeper-private' and public.casakeeper_can_manage_resource_object(name));
