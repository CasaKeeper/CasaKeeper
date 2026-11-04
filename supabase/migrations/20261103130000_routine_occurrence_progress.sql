alter table public.routine_completions
  alter column completed_at drop not null,
  add column completed boolean not null default true,
  add column process_steps jsonb not null default '{}'::jsonb;
