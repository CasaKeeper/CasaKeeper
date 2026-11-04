-- Household-owned Resource Types and shared Task/Routine Resource links.
create table if not exists public.resource_types (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  created_at timestamptz not null default now()
);

create unique index if not exists resource_types_household_name_idx
  on public.resource_types (household_id, lower(trim(name)));
create index if not exists resource_types_household_idx on public.resource_types (household_id);

insert into public.resource_types (household_id, name)
select h.id, defaults.name
from public.households h
cross join (values
  ('Receipts'), ('Manuals & Instructions'), ('Warranties'), ('Contact Information'),
  ('Maintenance Records'), ('Home Systems'), ('Property Documents'), ('Financial & Insurance'),
  ('Projects & Plans'), ('Photos & Videos'), ('Guides & How-Tos'), ('Other')
) as defaults(name)
on conflict do nothing;

create or replace function public.seed_default_resource_types()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.resource_types (household_id, name)
  select new.id, defaults.name
  from (values
    ('Receipts'), ('Manuals & Instructions'), ('Warranties'), ('Contact Information'),
    ('Maintenance Records'), ('Home Systems'), ('Property Documents'), ('Financial & Insurance'),
    ('Projects & Plans'), ('Photos & Videos'), ('Guides & How-Tos'), ('Other')
  ) as defaults(name)
  on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists households_seed_resource_types on public.households;
create trigger households_seed_resource_types after insert on public.households
for each row execute function public.seed_default_resource_types();

alter table public.resources add column if not exists resource_type_id uuid;
alter table public.resources add column if not exists attachment_operation_id uuid;
alter table public.resources add column if not exists attachment_pending boolean not null default false;
update public.resources r
set resource_type_id = t.id
from public.resource_types t
where t.household_id = r.household_id and lower(trim(t.name)) = 'other' and r.resource_type_id is null;

alter table public.resources drop constraint if exists resources_resource_type_id_fkey;
alter table public.resources add constraint resources_resource_type_id_fkey
  foreign key (resource_type_id) references public.resource_types(id) on delete restrict;
create index if not exists resources_type_idx on public.resources (household_id, resource_type_id);
create unique index if not exists resources_attachment_operation_idx
  on public.resources (household_id, attachment_operation_id)
  where attachment_operation_id is not null;
create index if not exists resources_attachment_pending_idx
  on public.resources (attachment_pending, created_at)
  where attachment_pending;

create or replace function public.validate_resource_type_household()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.resource_types
    where id = new.resource_type_id and household_id = new.household_id
  ) then
    raise exception 'Resource Type must belong to the Resource household.' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists resource_type_household_check on public.resources;
create trigger resource_type_household_check before insert or update of household_id, resource_type_id on public.resources
for each row execute function public.validate_resource_type_household();

create table if not exists public.resource_links (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  resource_id uuid not null references public.resources(id) on delete cascade,
  parent_type text not null check (parent_type in ('task', 'routine')),
  parent_id uuid not null,
  created_at timestamptz not null default now(),
  unique (resource_id, parent_type, parent_id)
);
create index if not exists resource_links_parent_idx on public.resource_links (household_id, parent_type, parent_id);

create or replace function public.validate_resource_link()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.parent_type = 'task' then
    if not exists (select 1 from public.tasks where id = new.parent_id and household_id = new.household_id) then
      raise exception 'Task link must reference a task in the same household.' using errcode = '23514';
    end if;
  elsif not exists (select 1 from public.routines where id = new.parent_id and household_id = new.household_id) then
    raise exception 'Routine link must reference a routine in the same household.' using errcode = '23514';
  end if;
  if not exists (select 1 from public.resources where id = new.resource_id and household_id = new.household_id) then
    raise exception 'Resource link must reference a Resource in the same household.' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists resource_link_parent_check on public.resource_links;
create trigger resource_link_parent_check before insert or update on public.resource_links
for each row execute function public.validate_resource_link();

create or replace function public.delete_parent_resource_links()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.resource_links
  where household_id = old.household_id
    and parent_type = tg_argv[0]
    and parent_id = old.id;
  return old;
end;
$$;
drop trigger if exists task_resource_links_cleanup on public.tasks;
create trigger task_resource_links_cleanup after delete on public.tasks
for each row execute function public.delete_parent_resource_links('task');
drop trigger if exists routine_resource_links_cleanup on public.routines;
create trigger routine_resource_links_cleanup after delete on public.routines
for each row execute function public.delete_parent_resource_links('routine');

alter table public.resource_types enable row level security;
alter table public.resource_links enable row level security;
drop policy if exists resource_types_member_select on public.resource_types;
create policy resource_types_member_select on public.resource_types for select to authenticated using (public.is_household_member(household_id));
drop policy if exists resource_types_member_insert on public.resource_types;
create policy resource_types_member_insert on public.resource_types for insert to authenticated with check (public.is_household_member(household_id));
drop policy if exists resource_types_member_update on public.resource_types;
create policy resource_types_member_update on public.resource_types for update to authenticated using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
drop policy if exists resource_types_member_delete on public.resource_types;
create policy resource_types_member_delete on public.resource_types for delete to authenticated using (public.is_household_member(household_id));
drop policy if exists resource_links_member_select on public.resource_links;
create policy resource_links_member_select on public.resource_links for select to authenticated using (public.is_household_member(household_id));
drop policy if exists resource_links_member_insert on public.resource_links;
create policy resource_links_member_insert on public.resource_links for insert to authenticated with check (public.is_household_member(household_id));
drop policy if exists resource_links_member_update on public.resource_links;
create policy resource_links_member_update on public.resource_links for update to authenticated using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
drop policy if exists resource_links_member_delete on public.resource_links;
create policy resource_links_member_delete on public.resource_links for delete to authenticated using (public.is_household_member(household_id));
