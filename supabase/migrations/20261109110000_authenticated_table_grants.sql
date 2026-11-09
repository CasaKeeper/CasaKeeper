-- Grant only the table privileges used by authenticated CasaKeeper clients.
-- RLS remains the authorization boundary for every grant below.

grant usage on schema public to authenticated;

grant select, update on table public.profiles to authenticated;
grant select on table public.households, public.household_members, public.household_invitations to authenticated;

grant select, insert, update, delete on table public.tasks to authenticated;
grant select, insert, update, delete on table public.routines to authenticated;
grant select, insert, update, delete on table public.routine_completions to authenticated;
grant select, insert, update, delete on table public.wishlist_items to authenticated;
grant select, insert, update, delete on table public.resources to authenticated;
grant select, delete on table public.attachments to authenticated;
grant select, insert, update, delete on table public.resource_types to authenticated;
grant select, insert, update, delete on table public.resource_links to authenticated;

-- Upload intents and cleanup jobs remain unavailable to browser clients.
revoke all on table public.resource_upload_intents from anon, authenticated;
revoke insert, update, delete on table public.resource_storage_cleanup_jobs from anon, authenticated;

-- Server-side cleanup and finalization use the service role, but only for
-- these narrowly scoped metadata tables. Application authorization still
-- validates the household and parent before each privileged operation.
grant select, insert, update, delete on table public.resource_upload_intents to service_role;
grant select, insert, update, delete on table public.resource_storage_cleanup_jobs to service_role;
grant select, insert, update, delete on table public.attachments to service_role;
grant select, update, delete on table public.resources to service_role;
grant select on table public.resource_links to service_role;
