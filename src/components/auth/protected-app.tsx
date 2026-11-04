import CasaKeeperApp from "@/components/casakeeper-app";
import { connection } from "next/server";
import { getCurrentHouseholdId, getHouseholdContext, requireHousehold } from "@/lib/supabase/auth";
import { loadHouseholdTasks } from "@/lib/supabase/tasks";
import { normalizeProcessSteps } from "@/lib/process-steps";
import { loadHouseholdRoutines } from "@/lib/supabase/routines";
import { loadHouseholdWishlist } from "@/lib/supabase/wishlist";
import { loadHouseholdResources } from "@/lib/supabase/resources";

export default async function ProtectedApp({ account }: { account?: boolean }) {
  // Supabase session validation checks token expiry against the current clock.
  // Keep that request-dependent work out of the prerender pass.
  await connection();
  const auth = await requireHousehold(account ? "/account" : "/");
  const household = account ? await getHouseholdContext(auth.supabase, auth.user.id) : undefined;
  const householdId = await getCurrentHouseholdId(auth.supabase, auth.user.id);
  const taskResult = await loadHouseholdTasks(auth.supabase);
  const routineResult = await loadHouseholdRoutines(auth.supabase);
  const wishlistResult = await loadHouseholdWishlist(auth.supabase);
  const resourceResult = await loadHouseholdResources(auth.supabase);
  const initialTasks = taskResult.tasks.map((task) => ({ id: task.id, title: task.title, description: task.description, due: task.scheduled_date || undefined, scheduledDate: task.scheduled_date, process: normalizeProcessSteps(task.process_steps), links: task.links || [], media: [], blockers: task.blockers || [], notes: task.notes, completed: task.completed }));
  const initialRoutines = routineResult.routines.map((routine) => { const routineCompletions = routineResult.completions.filter((completion) => completion.routine_id === routine.id); return { id: routine.id, title: routine.title, description: routine.description, process: normalizeProcessSteps(routine.process_steps).map((step) => step.text), processSteps: normalizeProcessSteps(routine.process_steps), links: routine.links || [], media: [], blockers: [], notes: routine.notes, startDate: routine.start_date, frequencyConfig: routine.frequency_config, endCondition: routine.end_condition || { type: "indefinite" as const }, completedDates: Object.fromEntries(routineCompletions.filter((completion) => completion.completed).map((completion) => [completion.scheduled_date, true])), completedAt: Object.fromEntries(routineCompletions.map((completion) => [completion.scheduled_date, completion.completed_at])), occurrenceProcess: Object.fromEntries(routineCompletions.map((completion) => [completion.scheduled_date, (completion.process_steps && typeof completion.process_steps === "object" ? completion.process_steps : {}) as Record<string, boolean>])), completionHistory: routineCompletions.map((completion) => ({ scheduledDate: completion.scheduled_date, completed: completion.completed, completedAt: completion.completed_at, processSteps: (completion.process_steps && typeof completion.process_steps === "object" ? completion.process_steps : {}) as Record<string, boolean> })) }; });
  const initialWishlist = wishlistResult.items.map((item) => ({ id: item.id, title: item.title, link: item.links[0], links: item.links, notes: item.notes, priceCents: item.price_cents === null ? undefined : item.price_cents, purchased: item.purchased }));
  const resourceAttachments = new Map<string, typeof resourceResult.attachments>();
  resourceResult.attachments.forEach((attachment) => resourceAttachments.set(attachment.parent_id, [...(resourceAttachments.get(attachment.parent_id) || []), attachment]));
  const initialResources = resourceResult.resources.map((resource) => ({ id: resource.id, title: resource.title, description: resource.description, notes: resource.notes ? [resource.notes] : [], links: resource.links || [], attachments: (resourceAttachments.get(resource.id) || []).map((attachment) => ({ id: attachment.id, name: attachment.original_filename, type: attachment.mime_type, size: attachment.file_size, storagePath: attachment.storage_path })) }));
  return <CasaKeeperApp accountEmail={account ? auth.user.email ?? "" : undefined} household={household} householdId={householdId} initialTasks={initialTasks} initialRoutines={initialRoutines} initialWishlist={initialWishlist} initialResources={initialResources} taskLoadError={taskResult.error ? "Tasks could not be loaded. Refresh and try again." : undefined} routineLoadError={routineResult.error ? "Routines could not be loaded. Refresh and try again." : undefined} wishlistLoadError={wishlistResult.error ? "Wishlist items could not be loaded. Refresh and try again." : undefined} resourceLoadError={resourceResult.error ? "Resources could not be loaded. Refresh and try again." : undefined} />;
}
