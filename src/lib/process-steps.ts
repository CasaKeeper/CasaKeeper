export type ProcessStep = { id: string; text: string; completed: boolean };

function legacyId(text: string, index: number) {
  return `legacy-${index}-${text.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "step"}`;
}

export function normalizeProcessSteps(value: unknown): ProcessStep[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((step, index) => {
    if (typeof step === "string") return [{ id: legacyId(step, index), text: step, completed: false }];
    if (!step || typeof step !== "object") return [];
    const item = step as { id?: unknown; text?: unknown; completed?: unknown };
    if (typeof item.text !== "string") return [];
    return [{ id: typeof item.id === "string" && item.id ? item.id : legacyId(item.text, index), text: item.text, completed: item.completed === true }];
  });
}

export function mergeProcessSteps(texts: string[], previous: ProcessStep[] = []): ProcessStep[] {
  const unused = [...previous];
  return texts.filter((text) => text.trim()).map((text) => {
    const matchIndex = unused.findIndex((step) => step.text === text);
    const match = matchIndex >= 0 ? unused.splice(matchIndex, 1)[0] : undefined;
    return match || { id: `step-${crypto.randomUUID()}`, text, completed: false };
  });
}

export function nextProcessStep(steps: ProcessStep[]) {
  return steps.find((step) => !step.completed);
}

export function toggleProcessStep(steps: ProcessStep[], id: string) {
  return steps.map((step) => step.id === id ? { ...step, completed: !step.completed } : step);
}

export function processProgress(steps: ProcessStep[]) {
  const completed = steps.filter((step) => step.completed).length;
  return { completed, total: steps.length, allComplete: steps.length > 0 && completed === steps.length };
}
