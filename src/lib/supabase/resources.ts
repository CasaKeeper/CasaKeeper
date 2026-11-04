import type { SupabaseClient } from "@supabase/supabase-js";

export type ResourceRow = {
  id: string;
  title: string;
  description: string;
  links: string[];
  notes: string;
};

export type ResourceAttachmentRow = {
  id: string;
  parent_id: string;
  original_filename: string;
  mime_type: string;
  file_size: number;
  storage_path: string;
};

export async function loadHouseholdResources(supabase: SupabaseClient) {
  const resourcesResult = await supabase.from("resources").select("id, title, description, links, notes").order("created_at", { ascending: false });
  if (resourcesResult.error) return { resources: [] as ResourceRow[], attachments: [] as ResourceAttachmentRow[], error: resourcesResult.error };
  const resources = (resourcesResult.data || []) as ResourceRow[];
  if (!resources.length) return { resources, attachments: [] as ResourceAttachmentRow[], error: null };
  const attachmentsResult = await supabase.from("attachments").select("id, parent_id, original_filename, mime_type, file_size, storage_path").eq("parent_type", "resource").in("parent_id", resources.map((resource) => resource.id));
  if (attachmentsResult.error) return { resources, attachments: [] as ResourceAttachmentRow[], error: attachmentsResult.error };
  return { resources, attachments: (attachmentsResult.data || []) as ResourceAttachmentRow[], error: null };
}
