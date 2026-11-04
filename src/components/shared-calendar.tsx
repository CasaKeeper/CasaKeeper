"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, CheckCircle2, ClipboardCheck, Clock3 } from "lucide-react";
import { calendarPeriodRange, dateKey, formatDate, generateOccurrencesInRange, occurrenceStatus, parseCalendarMode, shiftDateKey, weekdays, type CalendarMode, type RoutineFrequency, type RoutineEndCondition } from "@/lib/routines";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export type CalendarTask = { id: string; title: string; scheduledDate?: string | null; completed: boolean };
export type CalendarRoutine = { id: string; title: string; startDate: string; frequencyConfig: RoutineFrequency | null; endCondition: RoutineEndCondition; completedDates: Record<string, boolean>; completionHistory?: { scheduledDate: string; completed: boolean }[] };
type CalendarEvent =
  | { type: "task"; task: CalendarTask; scheduledDate: string; completed: boolean; status: "overdue" | "upcoming" | "completed" }
  | { type: "routine"; routine: CalendarRoutine; scheduledDate: string; completed: boolean; status: "overdue" | "upcoming" | "completed" };

function eventKey(event: CalendarEvent) { return `${event.type}:${event.type === "task" ? event.task.id : event.routine.id}:${event.scheduledDate}`; }

export default function SharedCalendarView({ tasks, routines, today, storageKey = "casakeeper-routines-calendar-mode", onOpenTask, onOpenRoutine, onCompleteRoutine }: { tasks: CalendarTask[]; routines: CalendarRoutine[]; today: string; storageKey?: string; onOpenTask?: (id: string) => void; onOpenRoutine?: (id: string) => void; onCompleteRoutine?: (id: string, scheduledDate: string) => Promise<boolean> }) {
  const router = useRouter();
  const [mode, setMode] = useState<CalendarMode>("month");
  const [anchor, setAnchor] = useState("2026-01-01");
  const [selectedDate, setSelectedDate] = useState("2026-01-01");
  const [preferenceLoaded, setPreferenceLoaded] = useState(false);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  const [loadedTasks, setLoadedTasks] = useState<CalendarTask[]>(tasks);
  useEffect(() => {
    let cancelled = false;
    createSupabaseBrowserClient().from("tasks").select("id, title, scheduled_date, completed").then(({ data }) => {
      if (!cancelled) setLoadedTasks((data || []).map((task) => ({ id: task.id as string, title: task.title as string, scheduledDate: task.scheduled_date as string | null, completed: Boolean(task.completed) })));
    }, () => undefined);
    return () => { cancelled = true; };
  }, [tasks]);
  useEffect(() => { const timer = window.setTimeout(() => { const saved = window.localStorage.getItem(storageKey); setMode(parseCalendarMode(saved)); const current = dateKey(); setAnchor(current); setSelectedDate(current); setPreferenceLoaded(true); }, 0); return () => window.clearTimeout(timer); }, [storageKey]);
  useEffect(() => { if (preferenceLoaded) window.localStorage.setItem(storageKey, mode); }, [mode, preferenceLoaded, storageKey]);
  const range = calendarPeriodRange(mode, anchor);
  const visibleSelectedDate = selectedDate >= range.start && selectedDate <= range.end ? selectedDate : range.start;
  const events: CalendarEvent[] = (() => {
    const taskEvents: CalendarEvent[] = loadedTasks.flatMap((task) => task.scheduledDate && task.scheduledDate >= range.start && task.scheduledDate <= range.end ? [{ type: "task" as const, task, scheduledDate: task.scheduledDate, completed: task.completed, status: occurrenceStatus(task.scheduledDate, today, task.completed) }] : []);
    const routineEvents: CalendarEvent[] = routines.flatMap((routine) => {
      const schedule = { id: routine.id, startDate: routine.startDate, frequency: routine.frequencyConfig, endCondition: routine.endCondition, completedDates: routine.completedDates };
      const byDate = new Map(generateOccurrencesInRange(schedule, range.start, range.end).map((occurrence) => [occurrence.scheduledDate, occurrence]));
      (routine.completionHistory || []).filter((record) => record.scheduledDate >= range.start && record.scheduledDate <= range.end).forEach((record) => byDate.set(record.scheduledDate, { id: `${routine.id}-${record.scheduledDate}`, routineId: routine.id, scheduledDate: record.scheduledDate, completed: record.completed }));
      return [...byDate.values()].map((occurrence) => ({ type: "routine" as const, routine, scheduledDate: occurrence.scheduledDate, completed: occurrence.completed, status: occurrenceStatus(occurrence.scheduledDate, today, occurrence.completed) }));
    });
    return [...taskEvents, ...routineEvents].sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate) || a.type.localeCompare(b.type) || (a.type === "task" ? a.task.title : a.routine.title).localeCompare(b.type === "task" ? b.task.title : b.routine.title));
  })();
  const eventsByDate = new Map<string, CalendarEvent[]>();
  events.forEach((event) => eventsByDate.set(event.scheduledDate, [...(eventsByDate.get(event.scheduledDate) || []), event]));
  const move = (amount: number) => { if (mode === "month") { const date = new Date(`${anchor}T00:00:00`); setAnchor(dateKey(new Date(date.getFullYear(), date.getMonth() + amount, 1))); } else setAnchor(shiftDateKey(anchor, mode === "week" ? amount * 7 : amount)); };
  const complete = async (event: CalendarEvent) => { if (event.type !== "routine" || event.completed || !onCompleteRoutine) return; const key = eventKey(event); if (pending[key]) return; setPending((current) => ({ ...current, [key]: true })); setError(""); try { if (!(await onCompleteRoutine(event.routine.id, event.scheduledDate))) setError("Unable to complete this occurrence."); } finally { setPending((current) => ({ ...current, [key]: false })); } };
  const eventRow = (event: CalendarEvent) => { const title = event.type === "task" ? event.task.title : event.routine.title; const key = eventKey(event); const open = event.type === "task" ? onOpenTask || ((id: string) => router.push(`/tasks?task=${encodeURIComponent(id)}`)) : onOpenRoutine || ((id: string) => router.push(`/routines?routine=${encodeURIComponent(id)}`)); return <div key={key} className={`calendar-event-row calendar-event-${event.status}`}><button type="button" className="calendar-event" onClick={() => open(event.type === "task" ? event.task.id : event.routine.id)} aria-label={`Open ${event.type} ${title}, ${formatDate(event.scheduledDate)}, ${event.status}`}>{event.type === "task" ? <ClipboardCheck size={13} /> : event.status === "completed" ? <CheckCircle2 size={13} /> : event.status === "overdue" ? <AlertCircle size={13} /> : <Clock3 size={13} />}<span className="calendar-event-copy"><strong>{title}</strong><small>{event.type === "task" ? "Task" : "Routine"}</small></span></button>{event.completed ? <span className="calendar-completed-indicator"><CheckCircle2 size={13} /> Completed</span> : event.type === "routine" && onCompleteRoutine ? <button type="button" className="calendar-quick-complete" onClick={(clickEvent) => { clickEvent.stopPropagation(); void complete(event); }} disabled={Boolean(pending[key])} aria-label={`Quick complete ${title} on ${formatDate(event.scheduledDate)}`}>{pending[key] ? "Saving…" : <><Check size={13} /> Complete</>}</button> : <span className="calendar-task-indicator">Task</span>}</div>; };
  const eventBar = (event: CalendarEvent) => <span key={eventKey(event)} className={`calendar-event-bar calendar-event-${event.status}`} role="img" aria-label={`${event.type === "task" ? "Task" : "Routine"}: ${event.type === "task" ? event.task.title : event.routine.title}, ${event.status}`} />;
  const dayEvents = eventsByDate.get(visibleSelectedDate) || [];
  const monthStart = new Date(`${range.start}T00:00:00`).getDay();
  const monthDays = mode === "month" ? Number(range.end.slice(-2)) : 0;
  const heading = mode === "day" ? formatDate(range.start) : `${formatDate(range.start)} – ${formatDate(range.end)}`;
  return <section className="routine-calendar"><div className="calendar-legend" aria-label="Calendar event legend"><span><i className="calendar-legend-dot routine" /> Routine</span><span><i className="calendar-legend-dot task" /> Task</span></div><div className="calendar-mode-switch" role="group" aria-label="Calendar mode"><button type="button" className={mode === "day" ? "selected" : ""} aria-pressed={mode === "day"} onClick={() => setMode("day")}>Day</button><button type="button" className={mode === "week" ? "selected" : ""} aria-pressed={mode === "week"} onClick={() => setMode("week")}>Week</button><button type="button" className={mode === "month" ? "selected" : ""} aria-pressed={mode === "month"} onClick={() => setMode("month")}>Month</button></div><div className="calendar-toolbar"><button type="button" className="button button-ghost" onClick={() => move(-1)} aria-label="Previous period">Previous</button><strong>{heading}</strong><div><button type="button" className="button button-soft" onClick={() => { const current = dateKey(); setAnchor(current); setSelectedDate(current); }} aria-label="Go to today">Today</button><button type="button" className="button button-ghost" onClick={() => move(1)} aria-label="Next period">Next</button></div></div>{mode === "month" ? <div className="calendar-month-grid" aria-label={`Month of ${heading}`}><div className="calendar-weekday-labels">{weekdays.map((day) => <span key={day}>{day}</span>)}</div><div className="calendar-month-days">{Array.from({ length: monthStart }, (_, index) => <span className="calendar-day calendar-day-empty" key={`empty-${index}`} />)}{Array.from({ length: monthDays }, (_, index) => { const day = `${range.start.slice(0, 8)}${String(index + 1).padStart(2, "0")}`; const dayItems = eventsByDate.get(day) || []; return <div className={`calendar-day ${visibleSelectedDate === day ? "selected" : ""}`} key={day}><button type="button" className="calendar-day-select" aria-label={`Select ${formatDate(day)}${dayItems.length ? `, ${dayItems.length} scheduled events` : ", no events"}`} onClick={() => setSelectedDate(day)}><span className="calendar-day-number">{index + 1}</span><span className="calendar-day-bars">{dayItems.slice(0, 5).map(eventBar)}{dayItems.length > 5 && <small className="calendar-overflow-count">+{dayItems.length - 5}</small>}</span></button></div>; })}</div></div> : mode === "week" ? <div className="calendar-week-grid">{Array.from({ length: 7 }, (_, index) => { const day = shiftDateKey(range.start, index); const dayItems = eventsByDate.get(day) || []; return <div className="calendar-week-day" key={day}><strong>{formatDate(day)}</strong>{dayItems.length ? dayItems.map(eventRow) : <span className="calendar-empty-day">No events</span>}</div>; })}</div> : <div className="calendar-day-list">{events.map(eventRow)}</div>}{error && <p className="calendar-quick-error" role="alert">{error}</p>}{mode === "month" && <section className="calendar-day-inspector"><h3>{formatDate(visibleSelectedDate)} <span>{dayEvents.length} {dayEvents.length === 1 ? "event" : "events"}</span></h3>{dayEvents.length ? dayEvents.map(eventRow) : <p className="detail-note">No tasks or routine occurrences on this day.</p>}</section>}</section>;
}
