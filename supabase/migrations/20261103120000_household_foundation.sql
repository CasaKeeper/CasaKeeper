create extension if not exists pgcrypto with schema extensions;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 120),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  unique (user_id),
  unique (household_id, user_id)
);

create table public.household_invitations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  invited_by uuid not null references auth.users(id),
  token_hash bytea not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create index household_members_household_idx on public.household_members(household_id);
create index household_invitations_household_idx on public.household_invitations(household_id);
create index household_invitations_active_idx on public.household_invitations(token_hash, expires_at) where revoked_at is null and accepted_at is null;

create or replace function public.current_user_household_id()
returns uuid language sql stable security definer set search_path = public
as $$ select household_id from public.household_members where user_id = (select auth.uid()) limit 1 $$;

create or replace function public.is_household_member(target_household_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.household_members where household_id = target_household_id and user_id = (select auth.uid())) $$;

create or replace function public.is_household_owner(target_household_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.household_members where household_id = target_household_id and user_id = (select auth.uid()) and role = 'owner') $$;

create or replace function public.create_household(household_name text)
returns public.households language plpgsql security definer set search_path = public, extensions
as $$
declare new_household public.households;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if current_user_household_id() is not null then raise exception 'user already belongs to a household' using errcode = '23505'; end if;
  insert into public.households(name, created_by) values (trim(household_name), auth.uid()) returning * into new_household;
  insert into public.household_members(household_id, user_id, role) values (new_household.id, auth.uid(), 'owner');
  insert into public.profiles(id) values (auth.uid()) on conflict (id) do nothing;
  return new_household;
end;
$$;

create or replace function public.create_household_invitation(target_household_id uuid, expires_at timestamptz default now() + interval '7 days')
returns table (invitation_id uuid, invitation_token text, invitation_expires_at timestamptz) language plpgsql security definer set search_path = public, extensions
as $$
declare raw_token text := encode(gen_random_bytes(32), 'hex'); invitation_id_value uuid;
begin
  if not is_household_owner(target_household_id) then raise exception 'household owner permission required' using errcode = '42501'; end if;
  if expires_at <= now() then raise exception 'expiration must be in the future' using errcode = '22023'; end if;
  insert into public.household_invitations(household_id, invited_by, token_hash, expires_at)
    values (target_household_id, auth.uid(), digest(raw_token, 'sha256'), expires_at)
    returning id into invitation_id_value;
  return query select invitation_id_value, raw_token, expires_at;
end;
$$;

create or replace function public.preview_household_invitation(raw_token text)
returns table (household_id uuid, household_name text, expires_at timestamptz) language sql stable security definer set search_path = public, extensions
as $$
  select i.household_id, h.name, i.expires_at
  from public.household_invitations i join public.households h on h.id = i.household_id
  where i.token_hash = digest(raw_token, 'sha256') and i.revoked_at is null and i.accepted_at is null and i.expires_at > now()
  limit 1
$$;

create or replace function public.accept_household_invitation(raw_token text)
returns public.households language plpgsql security definer set search_path = public, extensions
as $$
declare invitation public.household_invitations; joined_household public.households;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if current_user_household_id() is not null then raise exception 'user already belongs to a household' using errcode = '23505'; end if;
  select * into invitation from public.household_invitations where token_hash = digest(raw_token, 'sha256') for update;
  if invitation.id is null or invitation.revoked_at is not null or invitation.accepted_at is not null or invitation.expires_at <= now() then raise exception 'invalid or expired invitation' using errcode = '22023'; end if;
  insert into public.household_members(household_id, user_id, role) values (invitation.household_id, auth.uid(), 'member');
  update public.household_invitations set accepted_at = now(), accepted_by = auth.uid() where id = invitation.id;
  select * into joined_household from public.households where id = invitation.household_id;
  insert into public.profiles(id) values (auth.uid()) on conflict (id) do nothing;
  return joined_household;
end;
$$;

create or replace function public.revoke_household_invitation(invitation_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  update public.household_invitations i set revoked_at = now() where i.id = invitation_id and is_household_owner(i.household_id) and i.accepted_at is null;
  if not found then raise exception 'invitation not found or not authorized' using errcode = '42501'; end if;
end;
$$;

create table public.tasks (
  id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade,
  title text not null, description text not null default '', process_steps jsonb not null default '[]'::jsonb,
  links text[] not null default '{}', blockers text[] not null default '{}', notes text not null default '', completed boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.routines (
  id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade,
  title text not null, description text not null default '', start_date date not null, frequency_config jsonb,
  process_steps jsonb not null default '[]'::jsonb, links text[] not null default '{}', notes text not null default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.routine_completions (
  id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade,
  routine_id uuid not null references public.routines(id) on delete cascade, scheduled_date date not null, completed_at timestamptz not null default now(),
  unique (routine_id, scheduled_date)
);
create table public.wishlist_items (
  id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade,
  title text not null, price_cents integer check (price_cents is null or price_cents >= 0), links text[] not null default '{}', notes text not null default '', purchased boolean not null default false,
  sort_order integer not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.resources (
  id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade,
  title text not null, description text not null default '', links text[] not null default '{}', notes text not null default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.attachments (
  id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade,
  parent_type text not null check (parent_type in ('task', 'routine', 'resource')), parent_id uuid not null,
  original_filename text not null, mime_type text not null, file_size bigint not null check (file_size >= 0), storage_path text not null,
  created_at timestamptz not null default now()
);

create index tasks_household_idx on public.tasks(household_id); create index routines_household_idx on public.routines(household_id);
create index routine_completions_household_idx on public.routine_completions(household_id); create index wishlist_household_idx on public.wishlist_items(household_id);
create index resources_household_idx on public.resources(household_id); create index attachments_parent_idx on public.attachments(household_id, parent_type, parent_id);

create or replace function public.validate_attachment_parent()
returns trigger language plpgsql security definer set search_path = public
as $$ declare parent_household uuid;
begin
  if new.parent_type = 'task' then select household_id into parent_household from public.tasks where id = new.parent_id;
  elsif new.parent_type = 'routine' then select household_id into parent_household from public.routines where id = new.parent_id;
  elsif new.parent_type = 'resource' then select household_id into parent_household from public.resources where id = new.parent_id;
  end if;
  if parent_household is null or parent_household <> new.household_id then raise exception 'attachment parent is not in the same household' using errcode = '23514'; end if;
  return new;
end; $$;
create trigger attachments_parent_check before insert or update on public.attachments for each row execute function public.validate_attachment_parent();

create or replace function public.validate_routine_completion_parent()
returns trigger language plpgsql security definer set search_path = public
as $$
declare parent_household uuid;
begin
  select household_id into parent_household from public.routines where id = new.routine_id;
  if parent_household is null or parent_household <> new.household_id then raise exception 'routine completion parent is not in the same household' using errcode = '23514'; end if;
  return new;
end; $$;
create trigger routine_completions_parent_check before insert or update on public.routine_completions for each row execute function public.validate_routine_completion_parent();

create or replace function public.delete_parent_attachments()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  delete from public.attachments where household_id = old.household_id and parent_type = tg_argv[0] and parent_id = old.id;
  return old;
end; $$;
create trigger tasks_attachment_cleanup after delete on public.tasks for each row execute function public.delete_parent_attachments('task');
create trigger routines_attachment_cleanup after delete on public.routines for each row execute function public.delete_parent_attachments('routine');
create trigger resources_attachment_cleanup after delete on public.resources for each row execute function public.delete_parent_attachments('resource');

alter table public.profiles enable row level security; alter table public.households enable row level security; alter table public.household_members enable row level security; alter table public.household_invitations enable row level security;
alter table public.tasks enable row level security; alter table public.routines enable row level security; alter table public.routine_completions enable row level security; alter table public.wishlist_items enable row level security; alter table public.resources enable row level security; alter table public.attachments enable row level security;

create policy profiles_self on public.profiles for select using (id = (select auth.uid()));
create policy profiles_self_update on public.profiles for update using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy households_member_select on public.households for select using (public.is_household_member(id));
create policy households_owner_update on public.households for update using (public.is_household_owner(id)) with check (public.is_household_owner(id) and created_by = (select auth.uid()));
create policy household_members_same_household_select on public.household_members for select using (public.is_household_member(household_id));
create policy household_members_owner_delete on public.household_members for delete using (public.is_household_owner(household_id) and user_id <> (select auth.uid()));
create policy invitations_owner_select on public.household_invitations for select using (public.is_household_owner(household_id));

do $$ declare table_name text; begin for table_name in select unnest(array['tasks','routines','routine_completions','wishlist_items','resources','attachments']) loop execute format('create policy %I_member_select on public.%I for select using (public.is_household_member(household_id))', table_name, table_name); execute format('create policy %I_member_insert on public.%I for insert with check (public.is_household_member(household_id))', table_name, table_name); execute format('create policy %I_member_update on public.%I for update using (public.is_household_member(household_id)) with check (public.is_household_member(household_id))', table_name, table_name); execute format('create policy %I_member_delete on public.%I for delete using (public.is_household_member(household_id))', table_name, table_name); end loop; end $$;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$ begin insert into public.profiles(id) values (new.id) on conflict (id) do nothing; return new; end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

revoke all on function public.create_household(text) from public;
revoke all on function public.create_household_invitation(uuid, timestamptz) from public;
revoke all on function public.preview_household_invitation(text) from public;
revoke all on function public.accept_household_invitation(text) from public;
revoke all on function public.revoke_household_invitation(uuid) from public;
revoke all on function public.current_user_household_id() from public;
revoke all on function public.is_household_member(uuid) from public;
revoke all on function public.is_household_owner(uuid) from public;
revoke all on function public.validate_attachment_parent() from public;
revoke all on function public.validate_routine_completion_parent() from public;
revoke all on function public.delete_parent_attachments() from public;
grant execute on function public.create_household(text) to authenticated;
grant execute on function public.create_household_invitation(uuid, timestamptz) to authenticated;
grant execute on function public.preview_household_invitation(text) to authenticated;
grant execute on function public.accept_household_invitation(text) to authenticated;
grant execute on function public.revoke_household_invitation(uuid) to authenticated;
grant execute on function public.current_user_household_id() to authenticated;
grant execute on function public.is_household_member(uuid) to authenticated;
grant execute on function public.is_household_owner(uuid) to authenticated;
