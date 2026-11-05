import { filterAndSortByTitle, type SortDirection } from "./listing.ts";

export function normalizeResourceNotes(value: string | string[] | null | undefined): string[] {
  const values = Array.isArray(value) ? value : value ? value.split("\n") : [];
  return values.map((note) => note.trim()).filter(Boolean);
}

export function validResourceLinks(links: string[]): boolean {
  return links.every((link) => !link.trim() || /^https?:\/\/\S+$/i.test(link.trim()));
}

export function filterVisibleResources<T extends { id: string | number; title: string; resourceTypeId: string | null | undefined }>(items: T[], query: string, sort: SortDirection, typeFilter: string): T[] {
  const sorted = filterAndSortByTitle(items, query, sort, (item) => item.title, (item) => String(item.id));
  return typeFilter ? sorted.filter((item) => item.resourceTypeId === typeFilter) : sorted;
}
