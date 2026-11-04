import type { SupabaseClient } from "@supabase/supabase-js";

export type TaskRow = {
  id: string;
  title: string;
  description: string;
  process_steps: unknown;
  links: string[];
  blockers: string[];
  notes: string;
  completed: boolean;
  scheduled_date: string | null;
};

export async function loadHouseholdTasks(supabase: SupabaseClient) {
  const { data, error } = await supabase.from("tasks").select("id, title, description, process_steps, links, blockers, notes, completed, scheduled_date").order("created_at", { ascending: false });
  if (error) return { tasks: [] as TaskRow[], error };
  return { tasks: (data || []) as TaskRow[], error: null };
}
