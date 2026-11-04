create or replace function public.is_valid_routine_end_condition(value jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  parsed_date date;
begin
  if jsonb_typeof(value) <> 'object' or not (value ? 'type') or jsonb_typeof(value->'type') <> 'string' then
    return false;
  end if;

  if value->>'type' = 'indefinite' then
    return value - 'type' = '{}'::jsonb;
  end if;

  if value->>'type' = 'count' then
    if value - 'type' - 'count' <> '{}'::jsonb
      or jsonb_typeof(value->'count') <> 'number'
      or (value->>'count') !~ '^[1-9][0-9]*$' then
      return false;
    end if;
    return true;
  end if;

  if value->>'type' = 'date' then
    if value - 'type' - 'date' <> '{}'::jsonb
      or jsonb_typeof(value->'date') <> 'string'
      or (value->>'date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      return false;
    end if;
    begin
      parsed_date := (value->>'date')::date;
    exception when others then
      return false;
    end;
    return to_char(parsed_date, 'YYYY-MM-DD') = value->>'date';
  end if;

  return false;
end;
$$;

alter table public.routines
  add column end_condition jsonb not null default '{"type":"indefinite"}'::jsonb;

update public.routines
set end_condition = jsonb_build_object('type', 'count', 'count', (end_condition->>'count')::integer)
where end_condition->>'type' = 'occurrences'
  and end_condition->>'count' ~ '^[1-9][0-9]*$';

alter table public.routines
  add constraint routines_end_condition_valid
  check (public.is_valid_routine_end_condition(end_condition));
