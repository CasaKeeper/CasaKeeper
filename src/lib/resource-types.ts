export const DEFAULT_RESOURCE_TYPE_NAMES = [
  "Receipts",
  "Manuals & Instructions",
  "Warranties",
  "Contact Information",
  "Maintenance Records",
  "Home Systems",
  "Property Documents",
  "Financial & Insurance",
  "Projects & Plans",
  "Photos & Videos",
  "Guides & How-Tos",
  "Other",
] as const;

export function normalizeResourceTypeName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function hasDuplicateResourceTypeName(types: Array<{ id: string; name: string }>, value: string, excludeId?: string): boolean {
  const normalized = normalizeResourceTypeName(value).toLocaleLowerCase();
  return types.some((type) => type.id !== excludeId && normalizeResourceTypeName(type.name).toLocaleLowerCase() === normalized);
}
