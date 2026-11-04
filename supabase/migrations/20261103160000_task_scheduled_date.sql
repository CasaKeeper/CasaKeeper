-- Optional date-only scheduling for one-time tasks. Existing tasks remain undated.
alter table public.tasks add column if not exists scheduled_date date;
