export type SortDirection = "asc" | "desc";

export function filterAndSortByTitle<T>(
  items: readonly T[],
  query: string,
  direction: SortDirection,
  getTitle: (item: T) => string,
  getKey?: (item: T) => string,
): T[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return items
    .map((item, index) => ({ item, index, title: getTitle(item).trim() }))
    .filter(({ title }) => !normalizedQuery || title.toLocaleLowerCase().includes(normalizedQuery))
    .sort((left, right) => {
      const titleOrder = left.title.localeCompare(right.title, undefined, { sensitivity: "base", numeric: true });
      if (titleOrder !== 0) return direction === "asc" ? titleOrder : -titleOrder;
      const exactOrder = left.title.localeCompare(right.title, undefined, { numeric: true });
      if (exactOrder !== 0) return exactOrder;
      const keyOrder = getKey ? getKey(left.item).localeCompare(getKey(right.item), undefined, { numeric: true }) : 0;
      return keyOrder !== 0 ? keyOrder : left.index - right.index;
    })
    .map(({ item }) => item);
}
