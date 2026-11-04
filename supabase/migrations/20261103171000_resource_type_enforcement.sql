-- Enforce Resource Types only after the expansion migration and new application are deployed.
do $$
begin
  if exists (select 1 from public.resources where resource_type_id is null) then
    raise exception 'Cannot enforce Resource Types: Resources without a Resource Type remain.';
  end if;
  if exists (
    select 1
    from public.resources r
    left join public.resource_types t on t.id = r.resource_type_id
    where t.id is null or t.household_id <> r.household_id
  ) then
    raise exception 'Cannot enforce Resource Types: a Resource references a missing or cross-household type.';
  end if;
end;
$$;

alter table public.resources alter column resource_type_id set not null;
