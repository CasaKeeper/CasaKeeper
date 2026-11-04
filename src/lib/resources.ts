export function normalizeResourceNotes(value: string | string[] | null | undefined): string[] {
  const values = Array.isArray(value) ? value : value ? value.split("\n") : [];
  return values.map((note) => note.trim()).filter(Boolean);
}

export function validResourceLinks(links: string[]): boolean {
  return links.every((link) => !link.trim() || /^https?:\/\/\S+$/i.test(link.trim()));
}
