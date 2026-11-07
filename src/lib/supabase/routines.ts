import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeProcessSteps, type ProcessStep } from "@/lib/process-steps";
import type { RoutineEndCondition, RoutineFrequency } from "@/lib/routines";
import type { ItemType } from "@/lib/item-types";

export type RoutineRow = {
  id: string;
  created_at: string;
  type: ItemType | null;
  title: string;
  description: string;
  start_date: string;
  scheduled_time: string | null;
  frequency_config: RoutineFrequency | null;
  end_condition: RoutineEndCondition | null;
  process_steps: unknown;
  links: string[];
  notes: string;
};

export type RoutineCompletionRow = {
  routine_id: string;
  scheduled_date: string;
  completed: boolean;
  completed_at: string | null;
  process_steps: unknown;
};

export async function loadHouseholdRoutines(supabase: SupabaseClient) {
  const routinesResult = await supabase.from("routines").select("id, created_at, type, title, description, start_date, scheduled_time, frequency_config, end_condition, process_steps, links, notes").order("created_at", { ascending: false });
  if (routinesResult.error) return { routines: [] as RoutineRow[], completions: [] as RoutineCompletionRow[], error: routinesResult.error };
  const ids = (routinesResult.data || []).map((routine) => routine.id);
  if (!ids.length) return { routines: (routinesResult.data || []) as RoutineRow[], completions: [] as RoutineCompletionRow[], error: null };
  const completionsResult = await supabase.from("routine_completions").select("routine_id, scheduled_date, completed, completed_at, process_steps").in("routine_id", ids);
  if (completionsResult.error) return { routines: (routinesResult.data || []) as RoutineRow[], completions: [] as RoutineCompletionRow[], error: completionsResult.error };
  return { routines: (routinesResult.data || []) as RoutineRow[], completions: (completionsResult.data || []) as RoutineCompletionRow[], error: null };
}

export function routineProcessSteps(value: unknown): ProcessStep[] {
  return normalizeProcessSteps(value);
}
