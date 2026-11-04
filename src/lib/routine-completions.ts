export type RoutineCompletionWrite = {
  completed: boolean;
  completed_at: string | null;
  process_steps: Record<string, boolean>;
};

export function routineCompletionWrite(completed: boolean, progress: Record<string, boolean>, timestamp = new Date().toISOString()): RoutineCompletionWrite {
  return { completed, completed_at: completed ? timestamp : null, process_steps: progress };
}

export function toggleOccurrenceStep(progress: Record<string, boolean>, stepId: string) {
  return { ...progress, [stepId]: !progress[stepId] };
}
