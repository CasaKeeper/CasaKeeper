-- Optional shared preset types for Tasks and Routines. Existing records remain untyped.
alter table public.tasks add column if not exists type text;
alter table public.routines add column if not exists type text;

alter table public.tasks drop constraint if exists tasks_type_check;
alter table public.tasks add constraint tasks_type_check check (type is null or type in ('interior-repairs', 'plumbing', 'electrical', 'seasonal-outdoor', 'safety-upgrades', 'general-maintenance'));
alter table public.routines drop constraint if exists routines_type_check;
alter table public.routines add constraint routines_type_check check (type is null or type in ('interior-repairs', 'plumbing', 'electrical', 'seasonal-outdoor', 'safety-upgrades', 'general-maintenance'));
