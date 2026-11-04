export type WishlistFilter = "outstanding" | "purchased";

export type WishlistStatusItem = { purchased?: boolean; completed?: boolean };

export function wishlistLinks(item: { links?: string[]; link?: string }): string[] {
  const values = item.links?.length ? item.links : item.link ? [item.link] : [];
  return [...new Set(values.map((link) => link.trim()).filter(Boolean))];
}

export function isWishlistPurchased(item: WishlistStatusItem): boolean {
  return Boolean(item.purchased ?? item.completed);
}

export function filterWishlistItems<T extends WishlistStatusItem>(items: T[], filter: WishlistFilter): T[] {
  return items.filter((item) => isWishlistPurchased(item) === (filter === "purchased"));
}

export function countOutstandingWishlistItems<T extends WishlistStatusItem>(items: T[]): number {
  return items.filter((item) => !isWishlistPurchased(item)).length;
}
