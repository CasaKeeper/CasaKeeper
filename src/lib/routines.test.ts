import { deepStrictEqual, equal } from "node:assert/strict";
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { toggleAccordion } from "./accordion.ts";
import { calendarPeriodRange, countScheduledOccurrencesThrough, createRoutineFromForm, dateKey, generateOccurrences, generateOccurrencesInRange, mergeRoutineFormValues, occurrenceStatus, parseCalendarMode, parseDateKey, scheduledOccurrenceDate, summarizeFrequency, type RoutineFormValues, type RoutineSchedule } from "./routines.ts";
import { isSupportedMedia, mediaKind, partitionSupportedMediaFiles } from "./media.ts";
import { countOutstandingWishlistItems, filterWishlistItems, isWishlistPurchased, wishlistLinks } from "./wishlist.ts";
import { formatWishlistPrice, parseWishlistPrice } from "./wishlist-price.ts";

const schedule = (frequency: RoutineSchedule["frequency"], startDate = "2026-01-01", completedDates: Record<string, boolean> = {}): RoutineSchedule => ({ id: 1, startDate, frequency, completedDates });
const dates = (result: ReturnType<typeof generateOccurrences>) => result.map((item) => item.scheduledDate);

test("wishlist filters default to outstanding and preserve data while toggling purchase status", () => {
  const items = [{ id: 1, title: "Lamp", notes: "Brass", purchased: false }, { id: 2, title: "Batteries", link: "https://example.com", completed: true }];
  deepStrictEqual(filterWishlistItems(items, "outstanding").map((item) => item.id), [1]);
  deepStrictEqual(filterWishlistItems(items, "purchased").map((item) => item.id), [2]);
  const purchased = { ...items[0], purchased: true };
  equal(isWishlistPurchased(purchased), true);
  deepStrictEqual({ ...purchased, purchased: false }, { id: 1, title: "Lamp", notes: "Brass", purchased: false });
});

test("wishlist links normalize legacy single links without duplicating ordered links", () => {
  deepStrictEqual(wishlistLinks({ link: " https://legacy.example " }), ["https://legacy.example"]);
  deepStrictEqual(wishlistLinks({ link: "https://legacy.example", links: ["https://first.example", "https://first.example", " https://second.example "] }), ["https://first.example", "https://second.example"]);
});

test("wishlist status indicators and outstanding dashboard counts follow purchased state", () => {
  const items = [{ purchased: false }, { purchased: true }, { completed: true }, { purchased: false }];
  equal(isWishlistPurchased(items[0]), false);
  equal(isWishlistPurchased(items[1]), true);
  equal(isWishlistPurchased(items[2]), true);
  equal(countOutstandingWishlistItems(items), 2);
});

test("wishlist prices accept optional nonnegative cents and format without inventing zero", () => {
  equal(parseWishlistPrice(""), undefined);
  equal(parseWishlistPrice("12.5"), 1250);
  equal(parseWishlistPrice("12.345"), undefined);
  equal(formatWishlistPrice(undefined), undefined);
  equal(formatWishlistPrice(1250), "$12.50");
});

test("supports weekdays and positive daily intervals", () => {
  deepStrictEqual(dates(generateOccurrences(schedule({ type: "daily", mode: "weekday", interval: 1 }, "2026-01-05"), "2026-01-05", 5)), ["2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08", "2026-01-09"]);
  deepStrictEqual(dates(generateOccurrences(schedule({ type: "daily", mode: "interval", interval: 3 }), "2026-01-01", 4)), ["2026-01-01", "2026-01-04", "2026-01-07", "2026-01-10"]);
});

test("supports weekly intervals and multiple weekdays", () => {
  deepStrictEqual(dates(generateOccurrences(schedule({ type: "weekly", interval: 2, weekdays: [1, 4] }, "2026-01-05"), "2026-01-05", 4)), ["2026-01-05", "2026-01-08", "2026-01-19", "2026-01-22"]);
  deepStrictEqual(dates(generateOccurrences(schedule({ type: "weekly", interval: 2, weekdays: [3] }, "2026-01-07"), "2026-01-07", 2)), ["2026-01-07", "2026-01-21"]);
});

test("supports fixed-day and ordinal monthly schedules", () => {
  deepStrictEqual(dates(generateOccurrences(schedule({ type: "monthly", mode: "day", day: 31, interval: 1 }, "2026-01-31"), "2026-01-31", 3)), ["2026-01-31", "2026-02-28", "2026-03-31"]);
  deepStrictEqual(dates(generateOccurrences(schedule({ type: "monthly", mode: "ordinal", ordinal: "last", weekday: 1, interval: 2 }, "2026-01-01"), "2026-01-01", 3)), ["2026-01-26", "2026-03-30", "2026-05-25"]);
});

test("supports fixed yearly dates, leap-year clamping, and ordinal weekdays", () => {
  deepStrictEqual(dates(generateOccurrences(schedule({ type: "yearly", mode: "date", month: 2, day: 29 }, "2024-02-29"), "2026-02-01", 2)), ["2025-02-28", "2026-02-28"]);
  deepStrictEqual(dates(generateOccurrences(schedule({ type: "yearly", mode: "ordinal", ordinal: "first", weekday: 1, month: 5 }, "2026-01-01"), "2026-01-01", 2)), ["2026-05-04", "2027-05-03"]);
});

test("uses calendar days across daylight-saving transitions and year boundaries", () => {
  deepStrictEqual(dates(generateOccurrences(schedule({ type: "daily", mode: "interval", interval: 2 }, "2026-03-07"), "2026-03-07", 4)), ["2026-03-07", "2026-03-09", "2026-03-11", "2026-03-13"]);
  deepStrictEqual(dates(generateOccurrences(schedule({ type: "daily", mode: "interval", interval: 2 }, "2026-10-31"), "2026-10-31", 4)), ["2026-10-31", "2026-11-02", "2026-11-04", "2026-11-06"]);
  deepStrictEqual(dates(generateOccurrences(schedule({ type: "weekly", interval: 2, weekdays: [0, 3] }, "2026-03-01"), "2026-03-01", 4)), ["2026-03-01", "2026-03-04", "2026-03-15", "2026-03-18"]);
  deepStrictEqual(dates(generateOccurrences(schedule({ type: "weekly", interval: 1, weekdays: [0, 4] }, "2026-12-31"), "2026-12-31", 4)), ["2026-12-31", "2027-01-03", "2027-01-07", "2027-01-10"]);
});
test("calculates calendar ranges and occurrence status without time slots", () => {
  deepStrictEqual(calendarPeriodRange("day", "2026-03-11"), { start: "2026-03-11", end: "2026-03-11" });
  deepStrictEqual(calendarPeriodRange("week", "2026-03-11"), { start: "2026-03-08", end: "2026-03-14" });
  deepStrictEqual(calendarPeriodRange("month", "2026-12-11"), { start: "2026-12-01", end: "2026-12-31" });
  equal(occurrenceStatus("2026-03-10", "2026-03-11", false), "overdue");
  equal(occurrenceStatus("2026-03-10", "2026-03-11", true), "completed");
  equal(occurrenceStatus("2026-03-11", "2026-03-11", false), "upcoming");
  equal(parseCalendarMode("day"), "day");
  equal(parseCalendarMode("month"), "month");
  equal(parseCalendarMode("week"), "week");
  equal(parseCalendarMode("invalid"), "month");
  equal(parseCalendarMode(null), "month");
});

test("keeps multiple routines on the same calendar date distinct", () => {
  const first = generateOccurrencesInRange(schedule({ type: "daily", mode: "interval", interval: 1 }, "2026-04-15"), "2026-04-15", "2026-04-15");
  const second = generateOccurrencesInRange({ ...schedule({ type: "daily", mode: "interval", interval: 1 }, "2026-04-15"), id: 2 }, "2026-04-15", "2026-04-15");
  equal(first.length, 1);
  equal(second.length, 1);
  equal(first[0].scheduledDate, second[0].scheduledDate);
  equal(new Set([`${first[0].routineId}-${first[0].scheduledDate}`, `${second[0].routineId}-${second[0].scheduledDate}`]).size, 2);
});

test("preserves history, respects the start date, and avoids duplicates", () => {
  const result = generateOccurrences(schedule({ type: "daily", mode: "interval", interval: 1 }, "2026-05-10", { "2026-05-10": true }), "2026-05-01", 2);
  equal(result[0].scheduledDate, "2026-05-10");
  equal(result[0].completed, true);
  equal(new Set(dates(result)).size, result.length);
  equal(dateKey(parseDateKey("2026-05-10")), "2026-05-10");
  equal(summarizeFrequency({ type: "monthly", mode: "day", day: 31, interval: 1 }), "Day 31 every 1 month");
});

test("preserves routine fields and completion history across create and edit values", () => {
  const values: RoutineFormValues<{ name: string }> = { title: "Water plants", description: "Deep water", process: ["Fill can"], links: ["https://example.com/guide"], media: [{ name: "plant.jpg" }], blockers: ["Need fertilizer"], notes: "Use the balcony tap", startDate: "2026-06-01", scheduledTime: "08:30", frequencyConfig: { type: "weekly", interval: 2, weekdays: [1, 4] }, endCondition: { type: "count", count: 5 } };
  const created = createRoutineFromForm(7, values);
  const edited = mergeRoutineFormValues({ ...created, completedDates: { "2026-06-01": true } }, { ...values, title: "Water balcony plants", frequencyConfig: { type: "daily", mode: "weekday", interval: 1 } });
  equal(created.media[0].name, "plant.jpg");
  equal(edited.title, "Water balcony plants");
  equal(edited.description, values.description);
  deepStrictEqual(edited.process, values.process);
  deepStrictEqual(edited.links, values.links);
  deepStrictEqual(edited.media, values.media);
  deepStrictEqual(edited.blockers, values.blockers);
  equal(edited.startDate, values.startDate);
  equal(edited.scheduledTime, "08:30");
  equal(edited.frequencyConfig.type, "daily");
  deepStrictEqual(edited.endCondition, values.endCondition);
  deepStrictEqual(edited.completedDates, { "2026-06-01": true });
});

test("accepts supported media by extension and classifies previews safely", () => {
  equal(isSupportedMedia("floorplan.PDF", ""), true);
  equal(isSupportedMedia("photo.HEIC", ""), true);
  equal(isSupportedMedia("clip.webm", ""), true);
  equal(isSupportedMedia("notes.exe", "application/octet-stream"), false);
  equal(mediaKind("photo.heif", ""), "image");
  equal(mediaKind("clip.mp4", ""), "video");
  equal(mediaKind("budget.xlsx", ""), "document");
});

test("partitions dropped files without changing order", () => {
  const files = [
    { name: "photo.png", type: "image/png" },
    { name: "guide.pdf", type: "application/pdf" },
    { name: "clip.mov", type: "video/quicktime" },
    { name: "script.exe", type: "application/x-msdownload" },
  ];
  const result = partitionSupportedMediaFiles(files);
  deepStrictEqual(result.supported.map((file) => file.name), ["photo.png", "guide.pdf", "clip.mov"]);
  deepStrictEqual(result.unsupported.map((file) => file.name), ["script.exe"]);
});

test("represents an unselected routine frequency without generating occurrences", () => {
  deepStrictEqual(generateOccurrences({ id: 9, startDate: "2026-06-01", frequency: null, completedDates: {} }, "2026-06-01", 2), []);
  equal(summarizeFrequency(null), "Selection required");
});
test("stops after an exact number of scheduled occurrences", () => {
  const scheduleWithEnd = schedule({ type: "weekly", interval: 1, weekdays: [1] }, "2026-01-05");
  scheduleWithEnd.endCondition = { type: "count", count: 3 };
  deepStrictEqual(dates(generateOccurrences(scheduleWithEnd, "2026-01-01", 10)), ["2026-01-05", "2026-01-12", "2026-01-19"]);
  equal(scheduledOccurrenceDate(scheduleWithEnd, 3), "2026-01-19");
  equal(scheduledOccurrenceDate(scheduleWithEnd, 4), "2026-01-26");
});
test("date end conditions count inclusive scheduled dates and support zero ranges", () => {
  const scheduleWithEnd = schedule({ type: "monthly", mode: "day", day: 15, interval: 1 }, "2026-01-01");
  scheduleWithEnd.endCondition = { type: "date", date: "2026-03-15" };
  deepStrictEqual(dates(generateOccurrences(scheduleWithEnd, "2026-01-01", 10)), ["2026-01-15", "2026-02-15", "2026-03-15"]);
  equal(countScheduledOccurrencesThrough(scheduleWithEnd, "2025-12-31"), 0);
  equal(countScheduledOccurrencesThrough(scheduleWithEnd, "2026-03-15"), 3);
});
test("accordion keeps one section active and toggles the active section closed", () => {
  assert.equal(toggleAccordion(null, "frequency"), "frequency");
  assert.equal(toggleAccordion("frequency", "links"), "links");
  assert.equal(toggleAccordion("links", "links"), null);
  assert.equal(toggleAccordion(null, "schedule"), "schedule");
});

