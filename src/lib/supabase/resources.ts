import type { SupabaseClient } from "@supabase/supabase-js";

export type ResourceRow = {
  id: string;
  created_at: string;
  title: string;
  description: string;
  links: string[];
  notes: string;
  resource_type_id: string | null;
  attachment_pending: boolean;
};

export type ResourceTypeRow = { id: string; name: string; household_id: string };

export type ResourceAttachmentRow = {
  id: string;
  parent_id: string;
  original_filename: string;
  mime_type: string;
  file_size: number;
  storage_path: string;
  signed_url?: string;
};

export type ResourceLinkRow = { id: string; resource_id: string; parent_type: "task" | "routine"; parent_id: string };

export async function loadHouseholdResources(supabase: SupabaseClient) {
  const [resourcesResult, typesResult] = await Promise.all([
    supabase.from("resources").select("id, created_at, title, description, links, notes, resource_type_id, attachment_pending").eq("attachment_pending", false).order("created_at", { ascending: false }),
    supabase.from("resource_types").select("id, name, household_id").order("name"),
  ]);
  if (resourcesResult.error || typesResult.error) return { resources: [] as ResourceRow[], resourceTypes: [] as ResourceTypeRow[], attachments: [] as ResourceAttachmentRow[], links: [] as ResourceLinkRow[], error: resourcesResult.error || typesResult.error };
  const resources = (resourcesResult.data || []) as ResourceRow[];
  const linksResult = await supabase.from("resource_links").select("id, resource_id, parent_type, parent_id");
  if (linksResult.error) return { resources, resourceTypes: (typesResult.data || []) as ResourceTypeRow[], attachments: [] as ResourceAttachmentRow[], links: [] as ResourceLinkRow[], error: linksResult.error };
  if (!resources.length) return { resources, resourceTypes: (typesResult.data || []) as ResourceTypeRow[], attachments: [] as ResourceAttachmentRow[], links: (linksResult.data || []) as ResourceLinkRow[], error: null };
  const attachmentsResult = await supabase.from("attachments").select("id, parent_id, original_filename, mime_type, file_size, storage_path").eq("parent_type", "resource").in("parent_id", resources.map((resource) => resource.id));
  if (attachmentsResult.error) return { resources, resourceTypes: (typesResult.data || []) as ResourceTypeRow[], attachments: [] as ResourceAttachmentRow[], links: (linksResult.data || []) as ResourceLinkRow[], error: attachmentsResult.error };
  const attachments = (attachmentsResult.data || []) as ResourceAttachmentRow[];
  if (attachments.length) {
    const signed = await supabase.storage.from("casakeeper-private").createSignedUrls(attachments.map((attachment) => attachment.storage_path), 600);
    if (!signed.error) attachments.forEach((attachment, index) => { attachment.signed_url = signed.data?.[index]?.signedUrl || undefined; });
  }
  return { resources, resourceTypes: (typesResult.data || []) as ResourceTypeRow[], attachments, links: (linksResult.data || []) as ResourceLinkRow[], error: null };
}
