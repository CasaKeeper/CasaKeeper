import { normalizeLocalTime } from "./local-time.ts";
import { dateKey } from "./routines.ts";
import type { ItemType } from "./item-types.ts";

export type SortMode = "title-asc" | "title-desc" | "created-desc" | "created-asc";
export type ScheduledMode = "all" | "scheduled" | "unscheduled" | "overdue";
export type TypeFilter = ItemType | "none";
export type FilterRow = { id: string; field: "type" | "scheduled"; types?: TypeFilter[]; scheduled?: Exclude<ScheduledMode, "all"> };

export function localNowKey(now: Date = new Date()) {
  return dateKey(now) + "T" + String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
}

export function isTaskOverdue(task: { completed: boolean; scheduledDate?: string | null; scheduledTime?: string | null }, today: string, now: Date = new Date()) {
  if (task.completed || !task.scheduledDate) return false;
  if (task.scheduledDate < today) return true;
  if (task.scheduledDate > today || !normalizeLocalTime(task.scheduledTime)) return false;
  return task.scheduledDate + "T" + normalizeLocalTime(task.scheduledTime) < localNowKey(now);
}

export function sortByMode<T extends { title: string; createdAt?: string | null; id: string | number }>(items: readonly T[], mode: SortMode) {
  return [...items].sort((a, b) => {
    if (mode === "title-asc" || mode === "title-desc") {
      const result = a.title.localeCompare(b.title, undefined, { sensitivity: "base", numeric: true });
      return result === 0 ? String(a.id).localeCompare(String(b.id)) : mode === "title-asc" ? result : -result;
    }
    const result = (a.createdAt || "").localeCompare(b.createdAt || "");
    return result === 0 ? String(a.id).localeCompare(String(b.id)) : mode === "created-asc" ? result : -result;
  });
}

export function matchesType(value: ItemType | null | undefined, types: TypeFilter[]) {
  return !types.length || types.some((type) => type === "none" ? !value : value === type);
}
