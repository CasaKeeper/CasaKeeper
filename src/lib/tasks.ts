import { mergeProcessSteps, normalizeProcessSteps, type ProcessStep } from "./process-steps.ts";
import { normalizeLocalTime } from "./local-time.ts";

export function taskSteps(value: unknown) {
  return normalizeProcessSteps(value);
}

export function validTaskLinks(links: string[]) {
  return links.every((link) => !link || /^https?:\/\/\S+$/i.test(link));
}

export function normalizeTaskDate(value: string | null | undefined): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export function filterTasksByCompletion<T extends { completed: boolean }>(tasks: T[], completed: boolean): T[] {
  return tasks.filter((task) => task.completed === completed);
}

export function taskPayload(value: { title: string; description: string; process: string[]; processSteps?: ProcessStep[]; links: string[]; blockers: string[]; additionalNotes: string; scheduledDate?: string | null; scheduledTime?: string | null }) {
  const scheduledDate = normalizeTaskDate(value.scheduledDate);
  return { title: value.title.trim(), description: value.description, process_steps: mergeProcessSteps(value.process, value.processSteps), links: value.links.filter(Boolean), blockers: value.blockers.filter(Boolean), notes: value.additionalNotes, scheduled_date: scheduledDate, scheduled_time: scheduledDate ? normalizeLocalTime(value.scheduledTime) : null };
}
