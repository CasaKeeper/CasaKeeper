import { mergeProcessSteps, normalizeProcessSteps, type ProcessStep } from "./process-steps.ts";

export function taskSteps(value: unknown) {
  return normalizeProcessSteps(value);
}

export function validTaskLinks(links: string[]) {
  return links.every((link) => !link || /^https?:\/\/\S+$/i.test(link));
}

export function taskPayload(value: { title: string; description: string; process: string[]; processSteps?: ProcessStep[]; links: string[]; blockers: string[]; additionalNotes: string }) {
  return { title: value.title.trim(), description: value.description, process_steps: mergeProcessSteps(value.process, value.processSteps), links: value.links.filter(Boolean), blockers: value.blockers.filter(Boolean), notes: value.additionalNotes };
}
