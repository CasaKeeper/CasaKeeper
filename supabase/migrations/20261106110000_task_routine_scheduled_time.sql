-- Optional local wall-clock times for scheduled Tasks and recurring Routines.
-- Existing records remain NULL, which represents All Day.
alter table public.tasks add column if not exists scheduled_time time without time zone;
alter table public.routines add column if not exists scheduled_time time without time zone;
