import type { ResourceAttachmentRow, ResourceLinkRow } from "./resources";

export type LinkedMedia = {
  id: string;
  name: string;
  type: string;
  size: number;
  storagePath: string;
  previewUrl?: string;
  refreshUrl?: string;
  resourceId: string;
  resourceLinkId: string;
};

export function indexResourceAttachments(attachments: ResourceAttachmentRow[]) {
  const indexed = new Map<string, ResourceAttachmentRow[]>();
  attachments.filter((attachment) => !attachment.parent_type || attachment.parent_type === "resource").forEach((attachment) => indexed.set(attachment.parent_id, [...(indexed.get(attachment.parent_id) || []), attachment]));
  return indexed;
}

export function getLinkedMedia(
  parentType: ResourceLinkRow["parent_type"],
  parentId: string,
  links: ResourceLinkRow[],
  attachmentsByResource: Map<string, ResourceAttachmentRow[]>,
): LinkedMedia[] {
  return links
    .filter((link) => link.parent_type === parentType && link.parent_id === parentId)
    .flatMap((link) => (attachmentsByResource.get(link.resource_id) || []).map((attachment) => ({
      id: attachment.id,
      name: attachment.original_filename,
      type: attachment.mime_type,
      size: attachment.file_size,
      storagePath: attachment.storage_path,
      previewUrl: attachment.signed_url,
      refreshUrl: `/api/resources/${encodeURIComponent(link.resource_id)}/attachments/${encodeURIComponent(attachment.id)}`,
      resourceId: link.resource_id,
      resourceLinkId: link.id,
    })));
}
