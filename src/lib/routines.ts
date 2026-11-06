export type Ordinal = "first" | "second" | "third" | "fourth" | "last";

export type RoutineFrequency =
  | { type: "daily"; mode: "weekday" | "interval"; interval: number }
  | { type: "weekly"; interval: number; weekdays: number[] }
  | { type: "monthly"; mode: "day"; day: number; interval: number }
  | { type: "monthly"; mode: "ordinal"; ordinal: Ordinal; weekday: number; interval: number }
  | { type: "yearly"; mode: "date"; month: number; day: number }
  | { type: "yearly"; mode: "ordinal"; ordinal: Ordinal; weekday: number; month: number };

export type RoutineEndCondition =
  | { type: "indefinite" }
  | { type: "count"; count: number }
  | { type: "date"; date: string };

export type RoutineSchedule = {
  id: string | number;
  startDate: string;
  frequency: RoutineFrequency | null;
  completedDates: Record<string, boolean>;
  endCondition?: RoutineEndCondition;
};

export type RoutineOccurrence = {
  id: string;
  routineId: string | number;
  scheduledDate: string;
  completed: boolean;
};

export type CalendarMode = "day" | "week" | "month";
export type OccurrenceStatus = "overdue" | "upcoming" | "completed";

export function parseCalendarMode(value: string | null): CalendarMode {
  return value === "day" || value === "week" || value === "month" ? value : "month";
}

export type RoutineFormValues<Media = unknown> = {
  title: string;
  description: string;
  process: string[];
  links: string[];
  media: Media[];
  blockers: string[];
  notes: string;
  startDate: string;
  scheduledTime?: string | null;
  frequencyConfig: RoutineFrequency;
  endCondition?: RoutineEndCondition;
};

export function mergeRoutineFormValues<Media, Routine extends { completedDates: Record<string, boolean> }>(routine: Routine, values: RoutineFormValues<Media>): Routine & RoutineFormValues<Media> {
  return { ...routine, ...values, completedDates: routine.completedDates };
}

export function createRoutineFromForm<Media>(id: number, values: RoutineFormValues<Media>): RoutineFormValues<Media> & { id: number; completedDates: Record<string, boolean> } {
  return { id, ...values, completedDates: {} };
}

export const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const ordinalLabels: { value: Ordinal; label: string }[] = [
  { value: "first", label: "First" },
  { value: "second", label: "Second" },
  { value: "third", label: "Third" },
  { value: "fourth", label: "Fourth" },
  { value: "last", label: "Last" },
];

export function dateKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function parseDateKey(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function calendarDaysBetween(start: Date, end: Date): number {
  return Math.round((Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()) - Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) / 86400000);
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function ordinalNumber(ordinal: Ordinal): number | null {
  return ordinal === "first" ? 1 : ordinal === "second" ? 2 : ordinal === "third" ? 3 : ordinal === "fourth" ? 4 : null;
}

function matchesOrdinal(date: Date, ordinal: Ordinal, weekday: number): boolean {
  if (date.getDay() !== weekday) return false;
  if (ordinal === "last") return date.getDate() + 7 > daysInMonth(date.getFullYear(), date.getMonth());
  return Math.ceil(date.getDate() / 7) === ordinalNumber(ordinal);
}

function matchesFrequency(schedule: RoutineSchedule, date: Date, start: Date): boolean {
  const daysSinceStart = calendarDaysBetween(start, date);
  const frequency = schedule.frequency;
  if (!frequency) return false;
  if (frequency.type === "daily") {
    return frequency.mode === "weekday" ? date.getDay() >= 1 && date.getDay() <= 5 : daysSinceStart % Math.max(1, frequency.interval) === 0;
  }
  if (frequency.type === "weekly") {
    return Math.floor(daysSinceStart / 7) % Math.max(1, frequency.interval) === 0 && frequency.weekdays.includes(date.getDay());
  }
  if (frequency.type === "monthly") {
    const monthIndex = (date.getFullYear() - start.getFullYear()) * 12 + date.getMonth() - start.getMonth();
    if (monthIndex < 0 || monthIndex % Math.max(1, frequency.interval) !== 0) return false;
    return frequency.mode === "day"
      ? date.getDate() === Math.min(frequency.day, daysInMonth(date.getFullYear(), date.getMonth()))
      : matchesOrdinal(date, frequency.ordinal, frequency.weekday);
  }
  if (frequency.mode === "date") {
    return date.getMonth() === frequency.month - 1 && date.getDate() === Math.min(frequency.day, daysInMonth(date.getFullYear(), date.getMonth()));
  }
  return date.getMonth() === frequency.month - 1 && matchesOrdinal(date, frequency.ordinal, frequency.weekday);
}

export function generateOccurrences(schedule: RoutineSchedule, today = dateKey(), limit = 18, includeHistory = false): RoutineOccurrence[] {
  const start = parseDateKey(schedule.startDate);
  const todayDate = parseDateKey(today);
  const lowerBound = includeHistory ? start : start > addDays(todayDate, -366) ? start : addDays(todayDate, -366);
  const endDate = schedule.endCondition?.type === "date" ? parseDateKey(schedule.endCondition.date) : null;
  const results: RoutineOccurrence[] = [];
  const seen = new Set<string>();
  let scheduledCount = 0;
  if (schedule.endCondition?.type === "count" && lowerBound > start) {
    for (let offset = 0; offset <= 36525; offset += 1) {
      const date = addDays(start, offset);
      if (date >= lowerBound) break;
      if (matchesFrequency(schedule, date, start)) scheduledCount += 1;
    }
  }
  for (let offset = 0; offset <= 1095 && results.length < limit; offset += 1) {
    const date = addDays(lowerBound, offset);
    if (date < start || (endDate && date > endDate)) continue;
    if (!matchesFrequency(schedule, date, start)) continue;
    scheduledCount += 1;
    if (schedule.endCondition?.type === "count" && scheduledCount > Math.max(1, schedule.endCondition.count)) break;
    const scheduledDate = dateKey(date);
    if (seen.has(scheduledDate)) continue;
    seen.add(scheduledDate);
    results.push({ id: `${schedule.id}-${scheduledDate}`, routineId: schedule.id, scheduledDate, completed: Boolean(schedule.completedDates[scheduledDate]) });
  }
  return results;
}

export function scheduledOccurrenceDate(schedule: RoutineSchedule, occurrenceNumber: number): string | null {
  if (occurrenceNumber < 1) return null;
  const start = parseDateKey(schedule.startDate);
  let count = 0;
  for (let offset = 0; offset <= 36525; offset += 1) {
    const date = addDays(start, offset);
    if (!matchesFrequency(schedule, date, start)) continue;
    count += 1;
    if (count === occurrenceNumber) return dateKey(date);
  }
  return null;
}

export function countScheduledOccurrencesThrough(schedule: RoutineSchedule, endDate: string): number {
  const start = parseDateKey(schedule.startDate);
  const end = parseDateKey(endDate);
  if (end < start) return 0;
  let count = 0;
  for (let offset = 0; offset <= 36525; offset += 1) {
    const date = addDays(start, offset);
    if (date > end) break;
    if (matchesFrequency(schedule, date, start)) count += 1;
  }
  return count;
}

export function shiftDateKey(value: string, amount: number): string {
  return dateKey(addDays(parseDateKey(value), amount));
}

export function calendarPeriodRange(mode: CalendarMode, anchor: string): { start: string; end: string } {
  const date = parseDateKey(anchor);
  if (mode === "day") return { start: dateKey(date), end: dateKey(date) };
  if (mode === "week") {
    const start = addDays(date, -date.getDay());
    return { start: dateKey(start), end: dateKey(addDays(start, 6)) };
  }
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  return { start: dateKey(start), end: dateKey(new Date(date.getFullYear(), date.getMonth() + 1, 0)) };
}

export function occurrenceStatus(scheduledDate: string, today: string, completed: boolean): OccurrenceStatus {
  if (completed) return "completed";
  return scheduledDate < today ? "overdue" : "upcoming";
}

export function generateOccurrencesInRange(schedule: RoutineSchedule, fromDate: string, throughDate: string, limit = 500): RoutineOccurrence[] {
  const start = parseDateKey(schedule.startDate);
  const from = parseDateKey(fromDate);
  const through = parseDateKey(throughDate);
  if (through < start || through < from) return [];
  const rangeStart = from < start ? start : from;
  const endDate = schedule.endCondition?.type === "date" ? parseDateKey(schedule.endCondition.date) : null;
  let scheduledCount = 0;
  if (schedule.endCondition?.type === "count" && rangeStart > start) {
    for (let offset = 0; offset <= 36525; offset += 1) {
      const date = addDays(start, offset);
      if (date >= rangeStart) break;
      if (matchesFrequency(schedule, date, start)) scheduledCount += 1;
    }
  }
  const results: RoutineOccurrence[] = [];
  for (let offset = 0; offset <= calendarDaysBetween(rangeStart, through) && results.length < limit; offset += 1) {
    const date = addDays(rangeStart, offset);
    if (endDate && date > endDate) break;
    if (!matchesFrequency(schedule, date, start)) continue;
    scheduledCount += 1;
    if (schedule.endCondition?.type === "count" && scheduledCount > Math.max(1, schedule.endCondition.count)) break;
    const scheduledDate = dateKey(date);
    results.push({ id: `${schedule.id}-${scheduledDate}`, routineId: schedule.id, scheduledDate, completed: Boolean(schedule.completedDates[scheduledDate]) });
  }
  return results;
}

export function formatDate(value: string): string {
  return parseDateKey(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function summarizeFrequency(frequency: RoutineFrequency | null): string {
  if (!frequency) return "Selection required";
  if (frequency.type === "daily") return frequency.mode === "weekday" ? "Every weekday" : `Every ${frequency.interval} days`;
  if (frequency.type === "weekly") return `Every ${frequency.interval} week${frequency.interval === 1 ? "" : "s"} - ${frequency.weekdays.map((day) => weekdays[day]).join(", ")}`;
  if (frequency.type === "monthly") return frequency.mode === "day" ? `Day ${frequency.day} every ${frequency.interval} month${frequency.interval === 1 ? "" : "s"}` : `${frequency.ordinal} ${weekdays[frequency.weekday]} every ${frequency.interval} month${frequency.interval === 1 ? "" : "s"}`;
  if (frequency.mode === "date") return `Every ${new Date(2020, frequency.month - 1, 1).toLocaleString("en-US", { month: "long" })} ${frequency.day}`;
  return `${frequency.ordinal} ${weekdays[frequency.weekday]} of ${new Date(2020, frequency.month - 1, 1).toLocaleString("en-US", { month: "long" })}`;
}
