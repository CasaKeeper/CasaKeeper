export type ResourceAttachmentRef = { id: string; resourceLinkId?: string; resourceTypeId?: string; file?: unknown };

export function attachmentsMissingResourceType(files: ResourceAttachmentRef[], validTypeIds: Set<string>): string[] {
  return files.filter((file) => file.file && (!file.resourceTypeId || !validTypeIds.has(file.resourceTypeId))).map((file) => file.id);
}

export function removedResourceLinkIds(previous: ResourceAttachmentRef[], current: ResourceAttachmentRef[]): string[] {
  const retained = new Set(current.map((file) => file.resourceLinkId).filter(Boolean));
  return previous.map((file) => file.resourceLinkId).filter((id): id is string => Boolean(id) && !retained.has(id));
}
