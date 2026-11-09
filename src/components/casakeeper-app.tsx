"use client";
import Image from "next/image";
import Link from "next/link";
import { createPortal } from "react-dom";
import { calendarPeriodRange, countScheduledOccurrencesThrough, dateKey, formatDate, generateOccurrences, generateOccurrencesInRange, occurrenceStatus, ordinalLabels, parseCalendarMode, scheduledOccurrenceDate, shiftDateKey, summarizeFrequency, weekdays, type CalendarMode, type Ordinal, type RoutineEndCondition, type RoutineFrequency, type RoutineOccurrence } from "@/lib/routines";
import { isSupportedMedia, mediaExtension, mediaKind, partitionSupportedMediaFiles, supportedMediaAccept } from "@/lib/media";
import { toggleAccordion, type AccordionSection } from "@/lib/accordion";
import { countOutstandingWishlistItems, filterWishlistItems, isWishlistPurchased, wishlistLinks, type WishlistFilter } from "@/lib/wishlist";
import { formatWishlistPrice, parseWishlistPrice } from "@/lib/wishlist-price";
import { usePathname } from "next/navigation";
import { createContext, FormEvent, useContext, useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowUpRight, CalendarDays, Check, CheckCircle2, ChevronRight, CircleUserRound, ClipboardCheck, ClipboardList, Clock3, Droplet, ExternalLink, Folder, Hammer, House, Link2, MoreHorizontal, Pencil, Plus, Repeat2, Search, ShieldCheck, ShoppingBag, Sparkles, Sprout, Trash2, Undo2, Upload, X, Zap } from "lucide-react";
import SignOutButton from "@/components/auth/sign-out-button";
import HouseholdPanel from "@/components/auth/household-panel";
import ProfilePanel from "@/components/auth/profile-panel";
import ResourceTypePanel from "@/components/resource-type-panel";
import BackButton from "@/components/back-button";
import SharedCalendarView from "@/components/shared-calendar";
import { attachmentsMissingResourceType, removedResourceLinkIds } from "@/lib/resource-attachments";
import type { HouseholdContext } from "@/lib/supabase/auth";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { filterTasksByCompletion, normalizeTaskDate, taskPayload, validTaskLinks } from "@/lib/tasks";
import { formatLocalTime, normalizeLocalTime } from "@/lib/local-time";
import { validResourceLinks } from "@/lib/resources";
import { attachmentPreviewMode } from "@/lib/attachment-viewer";
import { appendResourceDiagnostic, knownResourcePresence, sanitizeResourceDiagnostics, type ResourceDiagnosticSnapshot } from "@/lib/resource-diagnostics";
import { mergeProcessSteps, normalizeProcessSteps, nextProcessStep, processProgress, toggleProcessStep, type ProcessStep } from "@/lib/process-steps";
import { routineCompletionWrite, toggleOccurrenceStep } from "@/lib/routine-completions";
import { MAX_RESOURCE_FILE_BYTES, MAX_RESOURCE_UPLOAD_BYTES, MAX_RESOURCE_UPLOAD_FILES, RESOURCE_STORAGE_BUCKET } from "@/lib/resource-storage";
import { getBrowserStorage, readStoredTheme, writeStoredTheme, type Theme } from "@/lib/theme";
import { ITEM_TYPES, itemType, validItemType, type ItemType } from "@/lib/item-types";
import { isTaskOverdue, matchesType, sortByMode, type FilterRow, type ScheduledMode, type SortMode } from "@/lib/item-filters";
type Section = "home" | "tasks" | "routines" | "wishlist" | "resources" | "account";
type ModalKind = "task" | "routine" | "wishlist" | "resource" | null;
type MediaKind = "image" | "video" | "document";
type MediaAttachment = {
    id: string;
    name: string;
    type: string;
    size: number;
    kind?: MediaKind;
    previewUrl?: string;
    storagePath?: string;
    resourceId?: string;
    resourceLinkId?: string;
    resourceTypeId?: string;
    operationId?: string;
    file?: File;
};
type Task = {
    id: string;
    createdAt?: string | null;
    type?: ItemType | null;
    title: string;
    description: string;
    due?: string;
    scheduledDate?: string | null;
    scheduledTime?: string | null;
    process: ProcessStep[];
    links: string[];
    media: MediaAttachment[];
    blockers: string[];
    notes: string;
    completed: boolean;
};
type RoutineCompletion = {
    scheduledDate: string;
    completed: boolean;
    completedAt: string | null;
    processSteps: Record<string, boolean>;
};
type Routine = {
    id: string;
    createdAt?: string | null;
    type?: ItemType | null;
    title: string;
    description: string;
    process: string[];
    processSteps?: ProcessStep[];
    links: string[];
    media: MediaAttachment[];
    blockers: string[];
    notes: string;
    startDate: string;
    scheduledTime?: string | null;
    frequencyConfig: RoutineFrequency | null;
    endCondition: RoutineEndCondition;
    completedDates: Record<string, boolean>;
    completedAt?: Record<string, string | null>;
    occurrenceProcess?: Record<string, Record<string, boolean>>;
    completionHistory?: RoutineCompletion[];
};
type WishlistItem = {
    id: string | number;
    createdAt?: string | null;
    title: string;
    link?: string;
    links?: string[];
    notes?: string;
    priceCents?: number;
    purchased?: boolean;
    completed?: boolean;
};
type ResourceType = {
    id: string;
    name: string;
};
type Resource = {
    id: string | number;
    createdAt?: string | null;
    title: string;
    description: string;
    resourceTypeId: string;
    resourceTypeName?: string;
    notes: string[];
    links: string[];
    media?: boolean | MediaAttachment[];
    attachments?: MediaAttachment[];
};
const AccordionContext = createContext<{
    activeSection: AccordionSection | null;
    setActiveSection: (section: AccordionSection | null) => void;
}>({ activeSection: null, setActiveSection: () => undefined });
const ResourceTypesContext = createContext<{
    types: ResourceType[];
    required: boolean;
}>({ types: [], required: false });
const AttachmentViewerContext = createContext<(attachment: MediaAttachment, contextLabel: string) => void>(() => undefined);
type ResourceDiagnosticsContextValue = {
    enabled: boolean;
    history: ResourceDiagnosticSnapshot[];
    record: (event: string, detail?: Partial<ResourceDiagnosticSnapshot>) => void;
    disable: () => void;
};
const ResourceDiagnosticsContext = createContext<ResourceDiagnosticsContextValue>({ enabled: false, history: [], record: () => undefined, disable: () => undefined });
const navItems = [
    { key: "tasks" as Section, label: "Tasks", href: "/tasks", icon: ClipboardCheck },
    { key: "routines" as Section, label: "Routines", href: "/routines", icon: Repeat2 },
    { key: "home" as Section, label: "Home", href: "/", icon: House },
    { key: "wishlist" as Section, label: "Wishlist", href: "/wishlist", icon: ShoppingBag },
    { key: "resources" as Section, label: "Resources", href: "/resources", icon: Folder },
];
function createMediaAttachments(files: File[], validator = isSupportedMedia): MediaAttachment[] { return files.filter((file) => validator(file.name, file.type)).map((file) => ({ id: `${file.name}-${file.lastModified}-${Math.random()}`, name: file.name, type: file.type || mediaExtension(file.name).toUpperCase(), size: file.size, kind: mediaKind(file.name, file.type), previewUrl: URL.createObjectURL(file), operationId: crypto.randomUUID(), file })); }
function pageTitle(section: Section) { return { home: "Home", tasks: "Tasks", routines: "Routines", wishlist: "Wishlist", resources: "Resources", account: "Account" }[section]; }
export default function CasaKeeperApp({ accountEmail, household, householdId, initialTasks, initialRoutines, initialWishlist, initialResources, initialResourceTypes, taskLoadError, routineLoadError, wishlistLoadError, resourceLoadError }: {
    accountEmail?: string;
    household?: HouseholdContext;
    householdId?: string;
    initialTasks?: Task[];
    initialRoutines?: Routine[];
    initialWishlist?: WishlistItem[];
    initialResources?: Resource[];
    initialResourceTypes?: ResourceType[];
    taskLoadError?: string;
    routineLoadError?: string;
    wishlistLoadError?: string;
    resourceLoadError?: string;
} = {}) {
    const pathname = usePathname();
    const section: Section = pathname === "/" ? "home" : (pathname?.slice(1) as Section) || "home";
    const [tasks, setTasks] = useState<Task[]>(initialTasks || []), [routines, setRoutines] = useState<Routine[]>(initialRoutines || []), [wishlist, setWishlist] = useState<WishlistItem[]>(initialWishlist || []), [resources, setResources] = useState<Resource[]>(initialResources || []), [resourceTypes, setResourceTypes] = useState<ResourceType[]>(initialResourceTypes || []);
    const [modal, setModal] = useState<ModalKind>(null), [editingId, setEditingId] = useState<string | number | null>(null), [editingValue, setEditingValue] = useState<Partial<FormValue> | undefined>(), [resourceDetailId, setResourceDetailId] = useState<string | null>(null), [newMenuOpen, setNewMenuOpen] = useState(false), [search, setSearch] = useState(""), [resourceSort, setResourceSort] = useState<SortMode>("title-asc"), [resourceTypeFilter, setResourceTypeFilter] = useState(""), [taskError, setTaskError] = useState(taskLoadError || ""), [routineError, setRoutineError] = useState(routineLoadError || ""), [wishlistError, setWishlistError] = useState(wishlistLoadError || ""), [resourceError, setResourceError] = useState(resourceLoadError || ""), [blockerTaskId, setBlockerTaskId] = useState<string | null>(null), [busyProcessSteps, setBusyProcessSteps] = useState<Record<string, boolean>>({}), [theme, setTheme] = useState<Theme>("light"), [themeReady, setThemeReady] = useState(false);
    const routinePendingRef = useRef<Record<string, boolean>>({});
    const taskPendingRef = useRef<Record<string, boolean>>({});
    const wishlistPendingRef = useRef<Record<string, boolean>>({});
    const resourcePendingRef = useRef<Record<string, boolean>>({});
    const newMenuRef = useRef<HTMLDivElement>(null);
    const [attachmentViewer, setAttachmentViewer] = useState<{
        attachment: MediaAttachment;
        contextLabel: string;
    } | null>(null);
    const [diagnosticsEnabled, setDiagnosticsEnabled] = useState(false);
    const [diagnosticHistory, setDiagnosticHistory] = useState<ResourceDiagnosticSnapshot[]>([]);
    const diagnosticStateRef = useRef({ viewInputIds: resources.map((item) => item.id), filteredIds: resources.map((item) => item.id), renderedIds: [] as Array<string | number> });
    const openAttachmentViewer = (attachment: MediaAttachment, contextLabel: string) => {
        if (attachment.previewUrl) {
            setAttachmentViewer({ attachment, contextLabel });
            recordDiagnostic("attachment-viewer-open", { viewerOpen: true });
        }
    };
    const closeAttachmentViewer = () => { recordDiagnostic("attachment-viewer-close", { viewerOpen: false }); setAttachmentViewer(null); };
    const recordDiagnostic = (event: string, detail: Partial<ResourceDiagnosticSnapshot> = {}) => {
        if (!diagnosticsEnabled)
            return;
        const current = diagnosticStateRef.current;
        const snapshot: ResourceDiagnosticSnapshot = { at: new Date().toISOString(), event, serverCount: (initialResources || []).length, stateCount: resources.length, viewInputCount: current.viewInputIds.length, filteredCount: current.filteredIds.length, renderedCount: current.renderedIds.length, knownPresence: knownResourcePresence(current.filteredIds), searchEmpty: search.trim().length === 0, searchLength: search.trim().length, typeFilterSelected: resourceTypeFilter.length > 0, sort: resourceSort, detailSelected: resourceDetailId !== null, viewerOpen: attachmentViewer !== null, pageVisibility: typeof document === "undefined" ? "unknown" : document.visibilityState, ...detail };
        setDiagnosticHistory((history) => appendResourceDiagnostic(history, snapshot));
    };
    useEffect(() => { diagnosticStateRef.current.viewInputIds = resources.map((item) => item.id); }, [resources]);
    useEffect(() => { const timer = window.setTimeout(() => setDiagnosticsEnabled(new URLSearchParams(window.location.search).get("resourceDiagnostics") === "1"), 0); return () => window.clearTimeout(timer); }, []);
    useEffect(() => { if (diagnosticsEnabled)
        recordDiagnostic("initial-load"); }, [diagnosticsEnabled]);
    useEffect(() => { if (!diagnosticsEnabled)
        return; const onVisibility = () => recordDiagnostic("visibility-change"); const onPageShow = () => recordDiagnostic("pageshow"); document.addEventListener("visibilitychange", onVisibility); window.addEventListener("pageshow", onPageShow); return () => { document.removeEventListener("visibilitychange", onVisibility); window.removeEventListener("pageshow", onPageShow); }; }, [diagnosticsEnabled, resources.length, resourceDetailId, attachmentViewer, search, resourceTypeFilter, resourceSort]);
    useEffect(() => { const timer = window.setTimeout(() => { const stored = readStoredTheme(getBrowserStorage()); setTheme(stored); document.documentElement.dataset.theme = stored; setThemeReady(true); }, 0); return () => window.clearTimeout(timer); }, []);
    useEffect(() => { if (!themeReady)
        return; document.documentElement.dataset.theme = theme; writeStoredTheme(theme, getBrowserStorage()); }, [theme, themeReady]);
    useEffect(() => { const outside = (event: MouseEvent) => { if (newMenuRef.current && !newMenuRef.current.contains(event.target as Node))
        setNewMenuOpen(false); }; const escape = (event: KeyboardEvent) => { if (event.key === "Escape") {
        setNewMenuOpen(false);
        setModal(null);
        setBlockerTaskId(null);
    } }; document.addEventListener("mousedown", outside); document.addEventListener("keydown", escape); return () => { document.removeEventListener("mousedown", outside); document.removeEventListener("keydown", escape); }; }, []);
    const filteredResources = resources;
    const openResourceDetail = (resource: Resource) => { recordDiagnostic("resource-detail-open", { detailSelected: true }); setResourceDetailId(String(resource.id)); };
    const closeResourceDetail = () => { recordDiagnostic("resource-detail-close", { detailSelected: false }); setResourceDetailId(null); };
    const openForm = (kind: ModalKind) => { setEditingId(null); setEditingValue(undefined); setWishlistError(""); setModal(kind); setNewMenuOpen(false); };
    const openEdit = (kind: Exclude<ModalKind, null>, id: string | number, value: Partial<FormValue>) => {
        const resource = kind === "resource" ? resources.find((item) => item.id === id) : undefined;
        const routine = kind === "routine" ? routines.find((item) => item.id === id) : undefined;
        const task = kind === "task" ? tasks.find((item) => item.id === String(id)) : undefined;
        setEditingId(kind === "task" ? String(id) : id);
        setWishlistError("");
        const wishlistItem = kind === "wishlist" ? wishlist.find((item) => item.id === id) : undefined;
        setEditingValue(kind === "wishlist"
            ? { ...value, price: wishlistItem?.priceCents === undefined ? "" : ((wishlistItem.priceCents || 0) / 100).toFixed(2) }
            : kind === "resource"
                ? { ...value, resourceId: String(id), resourceTypeId: resource?.resourceTypeId, links: resource?.links || [], additionalNotes: resource?.notes?.[0] || "", media: resource?.attachments || [] }
                : kind === "routine" ? { ...value, type: routine?.type || null, endCondition: routine?.endCondition || { type: "indefinite" }, scheduledTime: normalizeLocalTime(routine?.scheduledTime) } : kind === "task" ? { ...value, type: task?.type || null, scheduledDate: task?.scheduledDate || null, scheduledTime: normalizeLocalTime(task?.scheduledTime) } : value);
        setModal(kind);
        setNewMenuOpen(false);
    };
    const closeForm = () => { setModal(null); setEditingId(null); setEditingValue(undefined); };
    const persistTask = async (value: FormValue) => {
        if (!householdId)
            throw new Error("Household membership is unavailable.");
        if (!validItemType(value.type))
            throw new Error("Choose a valid task type.");
        if (!validTaskLinks(value.links))
            throw new Error("Use valid HTTP or HTTPS URLs for task links.");
        const payload = { ...taskPayload(value), type: value.type || null };
        const supabase = createSupabaseBrowserClient();
        if (typeof editingId === "string") {
            const { data, error } = await supabase.from("tasks").update(payload).eq("id", editingId).select("id, created_at, type, title, description, process_steps, links, blockers, notes, completed, scheduled_date, scheduled_time").single();
            if (error || !data)
                throw error || new Error("Unable to save the task.");
            const current = tasks.find((item) => item.id === editingId);
            const media = await persistParentMedia("task", data.id, data.title, value.media, current?.media || []);
            setTasks((items) => items.map((item) => item.id === editingId ? { ...item, createdAt: data.created_at, type: data.type, title: data.title, description: data.description, due: data.scheduled_date || undefined, scheduledDate: data.scheduled_date, scheduledTime: data.scheduled_time, process: normalizeProcessSteps(data.process_steps), links: data.links || [], media, blockers: data.blockers || [], notes: data.notes, completed: data.completed } : item));
        }
        else {
            const { data, error } = await supabase.from("tasks").insert({ household_id: householdId, ...payload }).select("id, created_at, type, title, description, process_steps, links, blockers, notes, completed, scheduled_date, scheduled_time").single();
            if (error || !data)
                throw error || new Error("Unable to create the task.");
            setTasks((items) => [{ id: data.id, createdAt: data.created_at, type: data.type, title: data.title, description: data.description, due: data.scheduled_date || undefined, scheduledDate: data.scheduled_date, scheduledTime: data.scheduled_time, process: normalizeProcessSteps(data.process_steps), links: data.links || [], media: [], blockers: data.blockers || [], notes: data.notes, completed: data.completed }, ...items]);
            setEditingId(data.id);
            const media = await persistParentMedia("task", data.id, data.title, value.media, []);
            setTasks((items) => items.map((item) => item.id === data.id ? { ...item, media } : item));
        }
    };
    const setTaskCompletion = async (id: string, completed: boolean) => {
        if (!householdId || taskPendingRef.current[id])
            return false;
        taskPendingRef.current[id] = true;
        try {
            const { data, error } = await createSupabaseBrowserClient().from("tasks").update({ completed }).eq("id", id).select("id, completed").single();
            if (error || !data) {
                setTaskError("Unable to update the task status.");
                return false;
            }
            setTasks((items) => items.map((item) => item.id === id ? { ...item, completed: data.completed } : item));
            return true;
        }
        finally {
            delete taskPendingRef.current[id];
        }
    };
    const persistRoutine = async (value: FormValue) => {
        if (!householdId)
            throw new Error("Household membership is unavailable.");
        if (!validItemType(value.type))
            throw new Error("Choose a valid routine type.");
        const existing = typeof editingId === "string" ? routines.find((routine) => routine.id === editingId) : undefined;
        const processSteps = mergeProcessSteps(value.process, existing?.processSteps || normalizeProcessSteps(existing?.process || []));
        const payload = { title: value.title.trim(), description: value.description, type: value.type || null, start_date: value.startDate, scheduled_time: normalizeLocalTime(value.scheduledTime), frequency_config: value.frequencyConfig, end_condition: value.endCondition, process_steps: processSteps, links: value.links.filter(Boolean), notes: value.additionalNotes };
        const supabase = createSupabaseBrowserClient();
        if (existing) {
            const { data, error } = await supabase.from("routines").update(payload).eq("id", existing.id).select("id, created_at, type, title, description, start_date, scheduled_time, frequency_config, end_condition, process_steps, links, notes").single();
            if (error || !data)
                throw error || new Error("Unable to save the routine.");
            const media = await persistParentMedia("routine", data.id, data.title, value.media, existing.media);
            setRoutines((items) => items.map((routine) => routine.id === existing.id ? { ...routine, createdAt: data.created_at, type: data.type, title: data.title, description: data.description, startDate: data.start_date, scheduledTime: data.scheduled_time, frequencyConfig: data.frequency_config, endCondition: data.end_condition || { type: "indefinite" }, process: normalizeProcessSteps(data.process_steps).map((step) => step.text), processSteps: normalizeProcessSteps(data.process_steps), links: data.links || [], media, blockers: [], notes: data.notes } : routine));
            return;
        }
        const { data, error } = await supabase.from("routines").insert({ household_id: householdId, ...payload }).select("id, created_at, type, title, description, start_date, scheduled_time, frequency_config, end_condition, process_steps, links, notes").single();
        if (error || !data)
            throw error || new Error("Unable to create the routine.");
        setRoutines((items) => [{ id: data.id, createdAt: data.created_at, type: data.type, title: data.title, description: data.description, startDate: data.start_date, scheduledTime: data.scheduled_time, frequencyConfig: data.frequency_config, endCondition: data.end_condition || { type: "indefinite" }, process: normalizeProcessSteps(data.process_steps).map((step) => step.text), processSteps: normalizeProcessSteps(data.process_steps), links: data.links || [], media: [], blockers: [], notes: data.notes, completedDates: {}, occurrenceProcess: {} }, ...items]);
        setEditingId(data.id);
        const media = await persistParentMedia("routine", data.id, data.title, value.media, []);
        setRoutines((items) => items.map((routine) => routine.id === data.id ? { ...routine, media } : routine));
    };
    const save = async (value: FormValue): Promise<boolean> => { if (!value.title.trim())
        return false; if (modal === "task") {
        setTaskError("");
        try {
            await persistTask(value);
            closeForm();
            return true;
        }
        catch (cause) {
            setTaskError(cause instanceof Error ? cause.message : "Unable to save the task.");
            return false;
        }
    } if (modal === "routine") {
        setRoutineError("");
        try {
            await persistRoutine(value);
            closeForm();
            return true;
        }
        catch (cause) {
            setRoutineError(cause instanceof Error ? cause.message : "Unable to save the routine.");
            return false;
        }
    } if (modal === "wishlist") {
        setWishlistError("");
        try {
            await persistWishlist(value);
            closeForm();
            return true;
        }
        catch (cause) {
            setWishlistError(cause instanceof Error ? cause.message : "Unable to save the wishlist item.");
            return false;
        }
    } if (modal === "resource") {
        setResourceError("");
        try {
            await persistResource(value);
            closeForm();
            return true;
        }
        catch (cause) {
            setResourceError(cause instanceof Error ? cause.message : "Unable to save the resource.");
            return false;
        }
    } return false; };
    const deleteTask = async (id: string): Promise<string | null> => {
        if (!householdId)
            return "Household membership is unavailable.";
        if (taskPendingRef.current[id])
            return "Task deletion is already in progress.";
        taskPendingRef.current[id] = true;
        try {
            const { error } = await createSupabaseBrowserClient().from("tasks").delete().eq("id", id).select("id").single();
            if (error)
                return "Unable to delete the task.";
            setTasks((items) => items.filter((item) => item.id !== id));
            return null;
        }
        finally {
            delete taskPendingRef.current[id];
        }
    };
    const deleteResource = async (id: string | number) => {
        const key = String(id);
        if (!householdId || resourcePendingRef.current[key])
            return false;
        resourcePendingRef.current[key] = true;
        try {
            const response = await fetch(`/api/resources/${encodeURIComponent(String(id))}`, { method: "DELETE" });
            const error = response.ok ? null : new Error("Unable to delete the resource.");
            if (error) {
                setResourceError("Unable to delete the resource.");
                return false;
            }
            setResources((items) => items.filter((item) => item.id !== id));
            return true;
        }
        finally {
            delete resourcePendingRef.current[key];
        }
    };
    const uploadResourceFiles = async (resourceId: string, files: MediaAttachment[]) => {
        const pendingFiles = files.filter((file) => file.file);
        if (!pendingFiles.length)
            return [] as MediaAttachment[];
        if (pendingFiles.length > MAX_RESOURCE_UPLOAD_FILES || pendingFiles.some((file) => (file.file as File).size > MAX_RESOURCE_FILE_BYTES) || pendingFiles.reduce((total, file) => total + (file.file as File).size, 0) > MAX_RESOURCE_UPLOAD_BYTES)
            throw new Error("Choose no more than 10 files, 50 MiB per file, and 100 MiB total.");
        const uploaded: MediaAttachment[] = [];
        const intentIds: string[] = [];
        try {
            for (const pending of pendingFiles) {
                const file = pending.file as File;
                const authorization = await fetch(`/api/resources/${encodeURIComponent(resourceId)}/attachments/upload-url`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ filename: file.name, fileSize: file.size, mimeType: file.type }) });
                const authorizationBody = await authorization.json().catch(() => ({}));
                if (!authorization.ok)
                    throw new Error(authorizationBody.error || "Unable to authorize resource media upload.");
                intentIds.push(authorizationBody.intentId);
                const upload = await createSupabaseBrowserClient().storage.from(RESOURCE_STORAGE_BUCKET).uploadToSignedUrl(authorizationBody.path, authorizationBody.token, file, { contentType: authorizationBody.mimeType, upsert: false });
                if (upload.error)
                    throw new Error("Unable to upload resource media.");
                const finalized = await fetch(`/api/resources/${encodeURIComponent(resourceId)}/attachments/finalize`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ intentId: authorizationBody.intentId }) });
                const finalizedBody = await finalized.json().catch(() => ({}));
                if (!finalized.ok || !finalizedBody.attachment)
                    throw new Error(finalizedBody.error || "Unable to finalize resource media.");
                const intentIndex = intentIds.indexOf(authorizationBody.intentId);
                if (intentIndex >= 0)
                    intentIds.splice(intentIndex, 1);
                const attachment = finalizedBody.attachment;
                uploaded.push({ id: attachment.id, name: attachment.original_filename, type: attachment.mime_type, size: attachment.file_size, storagePath: attachment.storage_path, previewUrl: attachment.signedUrl, kind: mediaKind(attachment.original_filename, attachment.mime_type) });
            }
            return uploaded;
        }
        catch (error) {
            if (intentIds.length)
                await fetch(`/api/resources/${encodeURIComponent(resourceId)}/attachments/cleanup`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ intentIds }) }).catch(() => undefined);
            throw error;
        }
    };
    const removeResourceFiles = async (resourceId: string, ids: string[]) => {
        for (const id of ids) {
            const response = await fetch(`/api/resources/${encodeURIComponent(resourceId)}/attachments/${encodeURIComponent(id)}`, { method: "DELETE" });
            if (!response.ok)
                throw new Error("Unable to remove resource media.");
        }
    };
    const persistParentMedia = async (parentType: "task" | "routine", parentId: string, parentTitle: string, files: MediaAttachment[], previousFiles: MediaAttachment[]) => {
        const pendingFiles = files.filter((file) => file.file);
        const missingTypeIds = attachmentsMissingResourceType(pendingFiles, new Set(resourceTypes.map((type) => type.id)));
        if (missingTypeIds.length) {
            const file = pendingFiles.find((candidate) => candidate.id === missingTypeIds[0]);
            throw new Error(`Choose a Resource Type for ${file?.name || "the attachment"}.`);
        }
        const removedLinks = removedResourceLinkIds(previousFiles, files);
        if (removedLinks.length) {
            const { error } = await createSupabaseBrowserClient().from("resource_links").delete().in("id", removedLinks);
            if (error)
                throw new Error("Unable to remove the attachment association.");
        }
        const linked = files.filter((file) => !file.file);
        for (const file of pendingFiles) {
            const typeId = file.resourceTypeId as string;
            const supabase = createSupabaseBrowserClient();
            const operationId = file.operationId || crypto.randomUUID();
            let { data: resource } = await supabase.from("resources").select("id, resource_type_id, attachment_pending").eq("household_id", householdId).eq("attachment_operation_id", operationId).maybeSingle();
            if (resource && resource.resource_type_id !== typeId)
                throw new Error(`The saved Resource Type for ${file.name} does not match this retry.`);
            if (!resource) {
                const inserted = await supabase.from("resources").insert({ household_id: householdId, title: `${parentTitle} — ${file.name}`, description: `Attachment from ${parentType}.`, resource_type_id: typeId, attachment_operation_id: operationId, attachment_pending: true, links: [], notes: "" }).select("id, resource_type_id, attachment_pending").single();
                if (inserted.error || !inserted.data) {
                    const recovered = await supabase.from("resources").select("id, resource_type_id, attachment_pending").eq("household_id", householdId).eq("attachment_operation_id", operationId).maybeSingle();
                    if (recovered.error || !recovered.data)
                        throw inserted.error || new Error("Unable to create the attachment Resource.");
                    resource = recovered.data;
                }
                else
                    resource = inserted.data;
            }
            const existingAttachments = await fetch(`/api/resources/${encodeURIComponent(String(resource.id))}/attachments`).then(async (response) => response.ok ? (await response.json()).attachments || [] : []).catch(() => []);
            const uploaded: MediaAttachment[] = existingAttachments.length ? existingAttachments.map((attachment: {
                id: string;
                original_filename: string;
                mime_type: string;
                file_size: number;
                storage_path: string;
                signedUrl?: string;
            }) => ({ id: attachment.id, name: attachment.original_filename, type: attachment.mime_type, size: attachment.file_size, storagePath: attachment.storage_path, previewUrl: attachment.signedUrl, resourceId: String(resource.id), operationId })) : await uploadResourceFiles(String(resource.id), [file]);
            const attachment = uploaded[0];
            if (!attachment)
                throw new Error("The attachment upload did not complete.");
            const { data: link, error: linkError } = await supabase.from("resource_links").upsert({ household_id: householdId, resource_id: resource.id, parent_type: parentType, parent_id: parentId }, { onConflict: "resource_id,parent_type,parent_id" }).select("id").single();
            if (linkError || !link) {
                throw new Error("The file was saved as a Resource, but could not be linked.");
            }
            const { error: publishError } = await supabase.from("resources").update({ attachment_pending: false }).eq("id", resource.id).eq("household_id", householdId);
            if (publishError)
                throw new Error("The attachment was linked, but the Resource could not be published yet. Retry the save.");
            setResources((items) => items.some((item) => item.id === resource.id) ? items : [{ id: resource.id, title: `${parentTitle} — ${file.name}`, description: `Attachment from ${parentType}.`, resourceTypeId: typeId, resourceTypeName: resourceTypes.find((type) => type.id === typeId)?.name, links: [], notes: [], attachments: [attachment] }, ...items]);
            linked.push({ ...attachment, resourceId: String(resource.id), resourceLinkId: link.id, operationId });
        }
        return linked;
    };
    const persistResource = async (value: FormValue) => {
        if (!householdId)
            throw new Error("Household membership is unavailable.");
        const links = value.links.map((link) => link.trim()).filter(Boolean);
        if (!validResourceLinks(links))
            throw new Error("Use valid HTTP or HTTPS URLs for resource links.");
        const notes = (value.resourceNotes || []).map((note) => note.trim()).filter(Boolean);
        const payload = { title: value.title.trim(), description: value.description.trim(), resource_type_id: value.resourceTypeId, links, notes: notes.join("\n") };
        const supabase = createSupabaseBrowserClient();
        if (editingId !== null) {
            const { data, error } = await supabase.from("resources").update(payload).eq("id", editingId).select("id, created_at, title, description, resource_type_id, links, notes").single();
            if (error || !data)
                throw error || new Error("Unable to save the resource.");
            const current = resources.find((item) => item.id === editingId);
            const retained = (current?.attachments || []).filter((attachment) => value.media.some((file) => file.id === attachment.id));
            await removeResourceFiles(String(data.id), (current?.attachments || []).filter((attachment) => !value.media.some((file) => file.id === attachment.id)).map((attachment) => attachment.id));
            const uploaded = await uploadResourceFiles(String(data.id), value.media);
            setResources((items) => items.map((item) => item.id === editingId ? { ...item, id: data.id, createdAt: data.created_at, title: data.title, description: data.description, resourceTypeId: data.resource_type_id, resourceTypeName: resourceTypes.find((type) => type.id === data.resource_type_id)?.name, links: data.links || [], notes: data.notes ? data.notes.split("\n") : [], attachments: [...retained, ...uploaded] } : item));
            return;
        }
        const { data, error } = await supabase.from("resources").insert({ household_id: householdId, ...payload }).select("id, created_at, title, description, resource_type_id, links, notes").single();
        if (error || !data)
            throw error || new Error("Unable to create the resource.");
        const createdResource = { id: data.id, createdAt: data.created_at, title: data.title, description: data.description, resourceTypeId: data.resource_type_id, resourceTypeName: resourceTypes.find((type) => type.id === data.resource_type_id)?.name, links: data.links || [], notes: data.notes ? data.notes.split("\n") : [], attachments: [] as MediaAttachment[] };
        setResources((items) => [createdResource, ...items]);
        if (value.media.length) {
            setEditingId(data.id);
            setEditingValue({ ...value, resourceId: String(data.id) });
        }
        const uploaded = await uploadResourceFiles(String(data.id), value.media);
        setResources((items) => items.map((item) => item.id === data.id ? { ...item, attachments: uploaded } : item));
    };
    const persistWishlist = async (value: FormValue) => {
        if (!householdId)
            throw new Error("Household membership is unavailable.");
        const links = wishlistLinks({ links: value.links });
        const priceCents = parseWishlistPrice(value.price || "");
        if ((value.price || "").trim() && priceCents === undefined)
            throw new Error("Enter a nonnegative amount with up to two decimals.");
        if (links.some((link) => !/^https?:\/\/\S+$/i.test(link)))
            throw new Error("Use valid HTTP or HTTPS URLs for wishlist links.");
        const payload = { title: value.title.trim(), price_cents: priceCents ?? null, links, notes: value.notes.trim() };
        const supabase = createSupabaseBrowserClient();
        if (editingId !== null) {
            const { data, error } = await supabase.from("wishlist_items").update(payload).eq("id", editingId).select("id, created_at, title, price_cents, links, notes, purchased").single();
            if (error || !data)
                throw error || new Error("Unable to save the wishlist item.");
            setWishlist((items) => items.map((item) => item.id === editingId ? { ...item, id: data.id, createdAt: data.created_at, title: data.title, link: data.links[0], links: data.links, notes: data.notes, priceCents: data.price_cents === null ? undefined : data.price_cents, purchased: data.purchased } : item));
            return;
        }
        const { data, error } = await supabase.from("wishlist_items").insert({ household_id: householdId, ...payload }).select("id, created_at, title, price_cents, links, notes, purchased").single();
        if (error || !data)
            throw error || new Error("Unable to create the wishlist item.");
        setWishlist((items) => [{ id: data.id, createdAt: data.created_at, title: data.title, link: data.links[0], links: data.links, notes: data.notes, priceCents: data.price_cents === null ? undefined : data.price_cents, purchased: data.purchased }, ...items]);
    };
    const toggleWishlistPurchase = async (id: string | number, purchased: boolean) => {
        const key = String(id);
        if (!householdId || wishlistPendingRef.current[key])
            return false;
        wishlistPendingRef.current[key] = true;
        try {
            const { data, error } = await createSupabaseBrowserClient().from("wishlist_items").update({ purchased }).eq("id", id).select("id, purchased").single();
            if (error || !data) {
                setWishlistError("Unable to update the wishlist item.");
                return false;
            }
            setWishlist((items) => items.map((item) => item.id === id ? { ...item, purchased: data.purchased } : item));
            return true;
        }
        finally {
            delete wishlistPendingRef.current[key];
        }
    };
    const deleteWishlist = async (id: string | number) => {
        const key = String(id);
        if (!householdId || wishlistPendingRef.current[key])
            return false;
        wishlistPendingRef.current[key] = true;
        try {
            const { error } = await createSupabaseBrowserClient().from("wishlist_items").delete().eq("id", id).select("id").single();
            if (error) {
                setWishlistError("Unable to delete the wishlist item.");
                return false;
            }
            setWishlist((items) => items.filter((item) => item.id !== id));
            return true;
        }
        finally {
            delete wishlistPendingRef.current[key];
        }
    };
    const addBlocker = (id: string) => { setTaskError(""); setBlockerTaskId(id); };
    const toggleTaskProcessStep = async (id: string, stepId: string) => { const busyKey = `${id}:${stepId}`; if (busyProcessSteps[busyKey])
        return; const task = tasks.find((item) => item.id === id); if (!task)
        return; const next = toggleProcessStep(task.process, stepId); setBusyProcessSteps((items) => ({ ...items, [busyKey]: true })); try {
        const { error } = await createSupabaseBrowserClient().from("tasks").update({ process_steps: next }).eq("id", id).select("id").single();
        if (error) {
            setTaskError("Unable to update the process step.");
            return;
        }
        setTasks((items) => items.map((item) => item.id === id ? { ...item, process: next } : item));
    }
    finally {
        setBusyProcessSteps((items) => ({ ...items, [busyKey]: false }));
    } };
    const completeRoutineOccurrence = async (routineId: string, scheduledDate: string, completed: boolean): Promise<boolean> => { if (!householdId)
        return false; const occurrenceKey = `${routineId}:${scheduledDate}`; if (routinePendingRef.current[occurrenceKey])
        return false; const routine = routines.find((item) => item.id === routineId); if (!routine)
        return false; const processSteps = routine.occurrenceProcess?.[scheduledDate] || routine.completionHistory?.find((item) => item.scheduledDate === scheduledDate)?.processSteps || {}; const completion = routineCompletionWrite(completed, processSteps, completed ? undefined : new Date().toISOString()); routinePendingRef.current[occurrenceKey] = true; try {
        const { error } = await createSupabaseBrowserClient().from("routine_completions").upsert({ household_id: householdId, routine_id: routineId, scheduled_date: scheduledDate, ...completion }, { onConflict: "routine_id,scheduled_date" }).select("routine_id").single();
        if (error) {
            setRoutineError("Unable to save the routine occurrence.");
            return false;
        }
        setRoutines((items) => items.map((item) => { if (item.id !== routineId)
            return item; const history = item.completionHistory || []; const record = { scheduledDate, completed, completedAt: completion.completed_at, processSteps }; return { ...item, completedDates: { ...item.completedDates, [scheduledDate]: completed }, completedAt: { ...item.completedAt, [scheduledDate]: completion.completed_at }, completionHistory: history.some((entry) => entry.scheduledDate === scheduledDate) ? history.map((entry) => entry.scheduledDate === scheduledDate ? record : entry) : [...history, record] }; }));
        return true;
    }
    finally {
        delete routinePendingRef.current[occurrenceKey];
    } };
    const toggleRoutineProcessStep = async (routineId: string, scheduledDate: string, stepId: string) => { if (!householdId)
        return; const occurrenceKey = `${routineId}:${scheduledDate}`; if (routinePendingRef.current[occurrenceKey])
        return; const routine = routines.find((item) => item.id === routineId); if (!routine)
        return; const current = routine.occurrenceProcess?.[scheduledDate] || routine.completionHistory?.find((item) => item.scheduledDate === scheduledDate)?.processSteps || {}; const progress = toggleOccurrenceStep(current, stepId); const alreadyCompleted = Boolean(routine.completedDates[scheduledDate]); const completion = routineCompletionWrite(alreadyCompleted, progress, routine.completedAt?.[scheduledDate] || undefined); routinePendingRef.current[occurrenceKey] = true; try {
        const { error } = await createSupabaseBrowserClient().from("routine_completions").upsert({ household_id: householdId, routine_id: routineId, scheduled_date: scheduledDate, ...completion }, { onConflict: "routine_id,scheduled_date" }).select("routine_id").single();
        if (error) {
            setRoutineError("Unable to save the routine step.");
            return;
        }
        setRoutines((items) => items.map((item) => { if (item.id !== routineId)
            return item; const history = item.completionHistory || []; const record = { scheduledDate, completed: alreadyCompleted, completedAt: item.completedAt?.[scheduledDate] || null, processSteps: progress }; return { ...item, occurrenceProcess: { ...item.occurrenceProcess, [scheduledDate]: progress }, completionHistory: history.some((entry) => entry.scheduledDate === scheduledDate) ? history.map((entry) => entry.scheduledDate === scheduledDate ? record : entry) : [...history, record] }; }));
    }
    finally {
        delete routinePendingRef.current[occurrenceKey];
    } };
    const deleteRoutine = async (id: string): Promise<string | null> => { const { error } = await createSupabaseBrowserClient().from("routines").delete().eq("id", id).select("id").single(); if (error)
        return "Unable to delete the routine."; setRoutines((items) => items.filter((routine) => routine.id !== id)); return null; };
    const persistBlocker = async (id: string, text: string) => { const item = tasks.find((task) => task.id === id); if (!item)
        return "This task is no longer available."; const next = [...item.blockers, text]; const { error } = await createSupabaseBrowserClient().from("tasks").update({ blockers: next }).eq("id", id).select("id").single(); if (error)
        return "Unable to save the blocker."; setTasks((items) => items.map((task) => task.id === id ? { ...task, blockers: next } : task)); setBlockerTaskId(null); return null; };
    const removeBlocker = async (id: string, index: number) => { const item = tasks.find((task) => task.id === id); if (!item)
        return; const next = item.blockers.filter((_, blockerIndex) => blockerIndex !== index); const { error } = await createSupabaseBrowserClient().from("tasks").update({ blockers: next }).eq("id", id).select("id").single(); if (error) {
        setTaskError("Unable to update the blockers.");
        return;
    } setTasks((items) => items.map((task) => task.id === id ? { ...task, blockers: next } : task)); };
    const diagnosticContextValue: ResourceDiagnosticsContextValue = { enabled: diagnosticsEnabled, history: diagnosticHistory, record: recordDiagnostic, disable: () => { setDiagnosticsEnabled(false); const url = new URL(window.location.href); url.searchParams.delete("resourceDiagnostics"); window.history.replaceState(null, "", url.pathname + url.search + url.hash); } };
    return <ResourceDiagnosticsContext.Provider value={diagnosticContextValue}><AttachmentViewerContext.Provider value={openAttachmentViewer}><div className="app-shell">
    <header className="topbar"><div className="topbar-inner"><div className="page-heading"><h1>{pageTitle(section)}</h1></div><div className="header-actions">{section !== "account" && <div className="new-menu-wrap" ref={newMenuRef}><button className="button button-primary button-new" onClick={() => setNewMenuOpen((open) => !open)} aria-expanded={newMenuOpen}><Plus size={17}/> New</button>{newMenuOpen && <div className="new-menu" role="menu"><div className="menu-label">Create something new</div>{([["task", "New task", ClipboardCheck], ["routine", "New routine", Repeat2], ["wishlist", "New wishlist item", ShoppingBag], ["resource", "New resource", Folder]] as const).map(([kind, label, Icon]) => <button key={kind} role="menuitem" onClick={() => openForm(kind)}><Icon size={17}/>{label}<ChevronRight size={15}/></button>)}</div>}</div>}<Link className="account-button" href="/account" aria-label="Open account"><CircleUserRound size={24}/></Link></div></div></header>
    <main className="main-content">{taskError && <p className="task-data-error" role="alert">{taskError}</p>}{routineError && <p className="task-data-error" role="alert">{routineError}</p>}{wishlistError && <p className="task-data-error" role="alert">{wishlistError}</p>}{resourceError && <p className="task-data-error" role="alert">{resourceError}</p>}{section === "home" && <HomeView tasks={tasks} routines={routines} wishlistCount={countOutstandingWishlistItems(wishlist)} resourceCount={resources.length} onOpen={openForm}/>}{section === "tasks" && <TasksView tasks={tasks} onComplete={setTaskCompletion} onDelete={async (id) => { if (!window.confirm("Delete this task?"))
        return; const { error } = await createSupabaseBrowserClient().from("tasks").delete().eq("id", id).select("id").single(); if (error) {
        setTaskError("Unable to delete the task.");
        return;
    } setTasks((items) => items.filter((item) => item.id !== id)); }} onToggleProcessStep={toggleTaskProcessStep} onAdd={() => openForm("task")} onAddBlocker={addBlocker} onRemoveBlocker={removeBlocker} onEdit={(task) => openEdit("task", task.id, { title: task.title, description: task.description, frequency: "Weekly", link: task.links[0] || "", notes: "", process: task.process.map((step) => step.text), processSteps: task.process, links: task.links, media: task.media, blockers: task.blockers, additionalNotes: task.notes })}/>}{section === "routines" && <RoutinesView routines={routines} onToggleProcessStep={toggleRoutineProcessStep} onAdd={() => openForm("routine")} onCompleteOccurrence={(id, scheduledDate) => completeRoutineOccurrence(id, scheduledDate, true)} onEdit={(routine) => openEdit("routine", routine.id, { title: routine.title, description: routine.description, frequency: "Weekly", link: routine.links[0] || "", notes: routine.notes, process: routine.process, links: routine.links, media: routine.media, blockers: routine.blockers, additionalNotes: routine.notes, startDate: routine.startDate, frequencyConfig: routine.frequencyConfig })} onDelete={deleteRoutine}/>}{section === "wishlist" && <WishlistView items={wishlist} onAdd={() => openForm("wishlist")} onDelete={deleteWishlist} onTogglePurchase={toggleWishlistPurchase} onEdit={(item) => openEdit("wishlist", item.id, { title: item.title, description: "", frequency: "Weekly", link: item.link || "", notes: item.notes || "", process: [], links: item.links || (item.link ? [item.link] : []), media: [], blockers: [], additionalNotes: "" })}/>}{section === "resources" && (resourceDetailId ? <ResourceDetailView resource={resources.find((item) => String(item.id) === resourceDetailId)} onBack={closeResourceDetail} onEdit={(resource) => openEdit("resource", resource.id, { title: resource.title, description: resource.description, frequency: "Weekly", link: resource.links[0] || "", notes: resource.notes[0] || "", resourceNotes: resource.notes, process: [], links: resource.links, media: Array.isArray(resource.attachments) ? resource.attachments : [], blockers: [], additionalNotes: "" })} onDelete={async (id) => { const deleted = await deleteResource(id); if (deleted)
        setResourceDetailId(null); return deleted; }}/> : <ResourcesView resources={filteredResources} resourceTypes={resourceTypes} search={search} setSearch={setSearch} sort={resourceSort} onSortChange={setResourceSort} typeFilter={resourceTypeFilter} onTypeFilterChange={setResourceTypeFilter} onAdd={() => openForm("resource")} onOpen={openResourceDetail} onDelete={deleteResource} onEdit={(resource) => openEdit("resource", resource.id, { title: resource.title, description: resource.description, frequency: "Weekly", link: resource.links[0] || "", notes: resource.notes[0] || "", resourceNotes: resource.notes, process: [], links: resource.links, media: Array.isArray(resource.attachments) ? resource.attachments : [], blockers: [], additionalNotes: "" })}/>)}{section === "account" && <AccountView theme={theme} setTheme={setTheme} accountEmail={accountEmail} household={household} resourceTypes={resourceTypes} onResourceTypesChanged={setResourceTypes}/>}</main>
    <nav className="bottom-nav" aria-label="Primary navigation"><div className="bottom-nav-inner">{navItems.map(({ key, label, href, icon: Icon }) => <Link key={key} className={"nav-item " + (section === key ? "active " : "") + (key === "home" ? "home-nav" : "")} href={href}><span className="nav-icon"><Icon size={key === "home" ? 22 : 19}/></span><span>{label}</span></Link>)}</div></nav>
    {modal && <FormModal kind={modal} initial={editingValue} editing={editingId !== null} onClose={closeForm} onSave={save} error={modal === "resource" ? resourceError : modal === "task" ? taskError : modal === "routine" ? routineError : wishlistError} resourceTypes={resourceTypes} onDelete={modal === "task" && typeof editingId === "string" ? () => deleteTask(editingId) : modal === "routine" && typeof editingId === "string" ? () => deleteRoutine(editingId) : undefined}/>}{blockerTaskId && <BlockerModal taskTitle={tasks.find((task) => task.id === blockerTaskId)?.title || "Task"} onClose={() => setBlockerTaskId(null)} onSave={(text) => persistBlocker(blockerTaskId, text)}/>}{attachmentViewer && <AttachmentViewer attachment={attachmentViewer.attachment} contextLabel={attachmentViewer.contextLabel} onClose={closeAttachmentViewer}/>}
    {diagnosticsEnabled && section === "resources" && <ResourceDiagnosticsObserver resources={resources} search={search} typeFilter={resourceTypeFilter} sort={resourceSort} detailSelected={resourceDetailId !== null} viewerOpen={attachmentViewer !== null}/>}
    {diagnosticsEnabled && section === "resources" && <ResourceDiagnosticsPanel />}
  </div></AttachmentViewerContext.Provider></ResourceDiagnosticsContext.Provider>;
}
function ItemTypeIcon({ type }: {
    type?: ItemType | null;
}) {
    const definition = itemType(type);
    if (!definition)
        return null;
    const Icon = definition.icon === "hammer" ? Hammer : definition.icon === "droplet" ? Droplet : definition.icon === "zap" ? Zap : definition.icon === "sprout" ? Sprout : definition.icon === "shield-check" ? ShieldCheck : ClipboardList;
    return <span className="item-type-icon" style={{ color: definition.color }} title={definition.label} aria-label={definition.label}><Icon size={16}/></span>;
}
function AdvancedFilters({ kind, rows, onRowsChange, sort, onSortChange }: {
    kind: "tasks" | "routines" | "wishlist";
    rows: FilterRow[];
    onRowsChange: (rows: FilterRow[]) => void;
    sort: SortMode;
    onSortChange: (sort: SortMode) => void;
}) {
    const [open, setOpen] = useState(false);
    const availableFields = kind === "tasks" ? ["type", "scheduled"] as const : kind === "routines" ? ["type"] as const : [] as const;
    const updateRow = (id: string, next: Partial<FilterRow>) => onRowsChange(rows.map((row) => row.id === id ? { ...row, ...next } : row));
    const addRow = () => { const field = availableFields.find((candidate) => !rows.some((row) => row.field === candidate)); if (!field)
        return; onRowsChange([...rows, { id: crypto.randomUUID(), field, types: [], scheduled: "scheduled" }]); setOpen(true); };
    const removeRow = (id: string) => onRowsChange(rows.filter((row) => row.id !== id));
    return <div className={"advanced-filters " + (rows.length ? "has-filters" : "")}><button type="button" className="filter-toggle" aria-expanded={open} onClick={() => setOpen((value) => !value)}><span>{"Filter" + (rows.length ? " (" + rows.length + ")" : "")}</span><ChevronRight size={15} className={open ? "schedule-chevron is-open" : "schedule-chevron"}/></button>{open && <div className="filter-panel"><div className="filter-panel-actions"><button type="button" className="button button-soft" onClick={addRow} disabled={rows.length >= availableFields.length}>Add Filter</button>{(rows.length > 0 || sort !== "title-asc") && <button type="button" className="button button-ghost" onClick={() => { onRowsChange([]); onSortChange("title-asc"); }}>Reset Filters</button>}</div><div className="filter-row filter-sort-row"><label><span>Sort</span><select value={sort} onChange={(event) => onSortChange(event.target.value as SortMode)}><option value="title-asc">Name - A-Z</option><option value="title-desc">Name - Z-A</option><option value="created-desc">Date Added - Newest first</option><option value="created-asc">Date Added - Oldest first</option></select></label><span className="filter-row-fixed">Always applied</span></div>{rows.length === 0 && <p className="filter-help">Add a filter to narrow the current list.</p>}{rows.map((row) => <div className="filter-row" key={row.id}><label><span>Field</span><select value={row.field} onChange={(event) => updateRow(row.id, { field: event.target.value as FilterRow["field"], types: [], scheduled: "scheduled" })}>{availableFields.map((field) => <option value={field} key={field} disabled={rows.some((other) => other.id !== row.id && other.field === field)}>{field === "type" ? "Type" : "Scheduled"}</option>)}</select></label>{row.field === "type" ? <fieldset className="filter-type-options"><legend>Types (any)</legend><div><label><input type="checkbox" checked={row.types?.includes("none") || false} onChange={(event) => updateRow(row.id, { types: event.target.checked ? [...(row.types || []), "none"] : (row.types || []).filter((type) => type !== "none") })}/> No Type Selected</label>{ITEM_TYPES.map((type) => <label key={type.value}><input type="checkbox" checked={row.types?.includes(type.value) || false} onChange={(event) => updateRow(row.id, { types: event.target.checked ? [...(row.types || []), type.value] : (row.types || []).filter((value) => value !== type.value) })}/> {type.label}</label>)}</div></fieldset> : <label><span>Mode</span><select value={row.scheduled || "scheduled"} onChange={(event) => updateRow(row.id, { scheduled: event.target.value as Exclude<ScheduledMode, "all"> })}><option value="scheduled">Include scheduled</option><option value="unscheduled">Exclude scheduled</option>{kind === "tasks" && <option value="overdue">Only overdue</option>}</select></label>}<button type="button" className="icon-button" onClick={() => removeRow(row.id)} aria-label="Remove filter"><X size={15}/></button></div>)}</div>}</div>;
}
function TasksView({ tasks, onComplete, onDelete, onToggleProcessStep, onAdd, onEdit, onAddBlocker, onRemoveBlocker }: {
    tasks: Task[];
    onComplete: (id: string, completed: boolean) => void;
    onDelete: (id: string) => void;
    onToggleProcessStep: (id: string, stepId: string) => void;
    onAdd: () => void;
    onEdit: (task: Task) => void;
    onAddBlocker: (id: string) => void;
    onRemoveBlocker: (id: string, index: number) => void;
}) {
    const [query, setQuery] = useState("");
    const [sort, setSort] = useState<SortMode>("title-asc");
    const [filter, setFilter] = useState<"active" | "completed">("active");
    const [filterRows, setFilterRows] = useState<FilterRow[]>([]);
    const today = dateKey();
    const filtered = filterTasksByCompletion(tasks, filter === "completed").filter((task) => filterRows.every((row) => row.field === "type" ? matchesType(task.type, row.types || []) : row.scheduled === "scheduled" ? Boolean(task.scheduledDate) : row.scheduled === "unscheduled" ? !task.scheduledDate : filter === "completed" || isTaskOverdue(task, today)));
    const visibleTasks = sortByMode(filtered.filter((task) => !query.trim() || task.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), sort);
    return <div className="searchable-page"><div className="search-row top-search"><div className="search-field"><Search size={17} aria-hidden="true"/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tasks" aria-label="Search tasks"/></div></div><TasksViewContent tasks={visibleTasks} filter={filter} sort={sort} onSortChange={setSort} filterRows={filterRows} onFilterRowsChange={setFilterRows} noMatch={Boolean(query.trim()) || filterRows.length > 0} onComplete={onComplete} onDelete={onDelete} onToggleProcessStep={onToggleProcessStep} onAdd={onAdd} onEdit={onEdit} onAddBlocker={onAddBlocker} onRemoveBlocker={onRemoveBlocker} onFilterChange={setFilter}/></div>;
}
function TasksViewContent({ tasks, filter, sort, onSortChange, filterRows, onFilterRowsChange, noMatch = false, onComplete, onDelete, onToggleProcessStep, onAdd, onEdit, onAddBlocker, onRemoveBlocker, onFilterChange }: {
    tasks: Task[];
    filter: "active" | "completed";
    noMatch?: boolean;
    onComplete: (id: string, completed: boolean) => void;
    onDelete: (id: string) => void;
    onToggleProcessStep: (id: string, stepId: string) => void;
    onAdd: () => void;
    onEdit: (task: Task) => void;
    onAddBlocker: (id: string) => void;
    onRemoveBlocker: (id: string, index: number) => void;
    onFilterChange: (filter: "active" | "completed") => void;
    sort: SortMode;
    onSortChange: (sort: SortMode) => void;
    filterRows: FilterRow[];
    onFilterRowsChange: (rows: FilterRow[]) => void;
}) {
    const [detailId, setDetailId] = useState<string | null>(() => typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("task"));
    const selected = tasks.find((task) => task.id === detailId);
    if (selected)
        return <TaskDetail task={selected} onBack={() => setDetailId(null)} onEdit={() => onEdit(selected)} onDelete={() => { onDelete(selected.id); setDetailId(null); }} onComplete={() => { onComplete(selected.id, !selected.completed); setDetailId(null); }} onToggleProcessStep={(stepId) => onToggleProcessStep(selected.id, stepId)} onAddBlocker={() => onAddBlocker(selected.id)} onRemoveBlocker={(index) => onRemoveBlocker(selected.id, index)}/>;
    return <div className="page-stack"><ListIntro kicker="Keep things moving" title="What's on your plate?" text="Capture the small things that keep your home running smoothly." action={onAdd} label="New task"/><div className="wishlist-filter task-status-tabs" role="group" aria-label="Task status"><button type="button" className={filter === "active" ? "selected" : ""} aria-pressed={filter === "active"} onClick={() => onFilterChange("active")}>Active</button><button type="button" className={filter === "completed" ? "selected" : ""} aria-pressed={filter === "completed"} onClick={() => onFilterChange("completed")}>Completed</button></div><AdvancedFilters kind="tasks" rows={filterRows} onRowsChange={onFilterRowsChange} sort={sort} onSortChange={onSortChange}/><div className="list-toolbar"><span>{tasks.length} {filter === "active" ? "active" : "completed"} {tasks.length === 1 ? "task" : "tasks"}</span></div>{tasks.length ? <div className="task-list">{tasks.map((task) => { const progress = processProgress(task.process); const next = nextProcessStep(task.process); return <article className={"item-card task-card " + (task.type ? "has-item-type " : "") + (task.completed ? "task-card-completed " : "") + (task.blockers.length ? "has-blocker" : "")} style={{ borderLeftColor: itemType(task.type)?.color }} key={task.id} onClick={() => setDetailId(task.id)}><div className="card-topline"><ItemTypeIcon type={task.type}/>{task.blockers.length ? <span className="badge badge-orange"><AlertCircle size={13}/> {task.blockers.length} active blocker{task.blockers.length === 1 ? "" : "s"}</span> : <span className="badge badge-muted">{task.completed ? "Completed" : "Open"}</span>}<button className="icon-button card-menu" aria-label={"Edit " + task.title} onClick={(event) => { event.stopPropagation(); onEdit(task); }}><Pencil size={15}/></button></div><h3>{task.title}</h3><div className="task-summary">{task.process.length > 0 && <span className="next-process-step"><small>Next step</small><strong>{next ? next.text : "All process steps completed."}</strong>{next && <em>{progress.completed} of {progress.total} steps completed</em>}</span>}{task.links.length > 0 && <span><Link2 size={14}/> {task.links.length} {task.links.length === 1 ? "link" : "links"}</span>}{task.media.length > 0 && <span><ExternalLink size={14}/> {task.media.length} media</span>}</div>{task.scheduledDate && <div className="card-meta"><CalendarDays size={14}/> {formatDate(task.scheduledDate)} · {formatLocalTime(task.scheduledTime) || "All day"}</div>}<div className="card-actions">{!task.completed && <button className="button button-soft" onClick={(event) => { event.stopPropagation(); onComplete(task.id, true); }}><Check size={16}/> Complete</button>}{task.completed && <button className="button button-ghost" onClick={(event) => { event.stopPropagation(); onComplete(task.id, false); }}><Undo2 size={16}/> Reopen</button>}</div></article>; })}</div> : <EmptyState icon={ClipboardCheck} title={noMatch ? "No tasks match your search" : filter === "active" ? "No active tasks" : "No completed tasks"} text={noMatch ? "Try a different task title." : filter === "active" ? "A clear list feels good. Add your next task when you're ready." : "Completed tasks will remain available here."} action={filter === "active" ? onAdd : undefined} actionLabel="Create a task"/>}</div>;
}
/* eslint-disable react/jsx-key -- attachment media rows carry stable keys inside the shared renderer. */
function LegacyTaskDetail({ task, onBack, onEdit, onDelete, onComplete, onToggleProcessStep, onAddBlocker, onRemoveBlocker }: {
    task: Task;
    onBack: () => void;
    onEdit: () => void;
    onDelete: () => void;
    onComplete: () => void;
    onToggleProcessStep: (stepId: string) => void;
    onAddBlocker: () => void;
    onRemoveBlocker: (index: number) => void;
}) {
    return <div className="page-stack task-detail-page"><BackButton label="Back to Tasks" onClick={onBack}/><section className={"panel task-detail " + (task.blockers.length ? "has-blocker" : "")}><div className="detail-header"><div><div className="card-topline"><span className="status-dot"/>{task.blockers.length ? <span className="badge badge-orange"><AlertCircle size={13}/> Blocked</span> : <span className="badge badge-muted">{task.completed ? "Completed" : "Open"}</span>}</div><h2>{task.title}</h2>{task.description && <p className="muted">{task.description}</p>}</div><div className="detail-actions"><button className="button button-ghost" onClick={onEdit}><Pencil size={15}/> Edit</button><button className="button button-soft" onClick={onComplete}>{task.completed ? <><Undo2 size={16}/> Reopen</> : <><Check size={16}/> Complete</>}</button><button className="button button-ghost danger-text" onClick={onDelete}><Trash2 size={15}/> Delete</button></div></div>{task.process.length > 0 && <section className="detail-section"><h3>Process</h3><ol className="process-list">{task.process.map((step, index) => <li className={step.completed ? "process-step-complete" : ""} key={step.id}><label className="process-check"><input type="checkbox" checked={step.completed} onChange={() => onToggleProcessStep(step.id)} onClick={(event) => event.stopPropagation()} aria-label={"Mark process step " + (index + 1) + " complete"}/><span>{index + 1}</span><span>{step.text}</span></label></li>)}</ol></section>}{task.links.length > 0 && <section className="detail-section"><h3>Links</h3><div className="detail-links">{task.links.map((link) => <a href={link} target="_blank" rel="noreferrer" key={link}><Link2 size={15}/>{link}<ArrowUpRight size={14}/></a>)}</div></section>}{task.media.length > 0 && <section className="detail-section"><h3>Photos and videos</h3><div className="media-grid">{task.media.map((media) => <AttachmentMediaButton attachment={media} contextLabel={task.title}/>)}</div><p className="detail-note">Attachments are stored as household Resources and remain available after this Task is completed or deleted.</p></section>}{task.blockers.length > 0 && <section className="detail-section blocker-section"><div className="detail-section-heading"><h3>Active blockers</h3><button className="button button-ghost" onClick={onAddBlocker}><Plus size={15}/> Add blocker</button></div>{task.blockers.map((blocker, index) => <div className="blocker-row" key={blocker + index}><AlertCircle size={15}/><span>{blocker}</span><button className="icon-button danger-icon" aria-label="Remove blocker" onClick={() => onRemoveBlocker(index)}><Trash2 size={15}/></button></div>)}</section>}{task.blockers.length === 0 && <section className="detail-section"><div className="detail-section-heading"><h3>Blockers</h3><button className="button button-ghost" onClick={onAddBlocker}><Plus size={15}/> Add blocker</button></div><p className="detail-note">No active blockers.</p></section>}{task.notes && <section className="detail-section"><h3>Additional notes</h3><p className="detail-note detail-note-body">{task.notes}</p></section>}</section></div>;
}
function TaskDetail(props: {
    task: Task;
    onBack: () => void;
    onEdit: () => void;
    onDelete: () => void;
    onComplete: () => void;
    onToggleProcessStep: (stepId: string) => void;
    onAddBlocker: () => void;
    onRemoveBlocker: (index: number) => void;
}) {
    return <div className="task-detail-with-date">{props.task.scheduledDate && <p className="card-meta task-detail-date"><CalendarDays size={14}/> Scheduled {formatDate(props.task.scheduledDate)} · {formatLocalTime(props.task.scheduledTime) || "All day"}</p>}{props.task.type && <p className="item-type-detail"><ItemTypeIcon type={props.task.type}/><span>{itemType(props.task.type)?.label}</span></p>}<LegacyTaskDetail {...props}/></div>;
}
function HomeView({ tasks, routines, wishlistCount, resourceCount, onOpen, onOpenTask, onOpenRoutine }: {
    tasks: Task[];
    routines: Routine[];
    wishlistCount: number;
    resourceCount: number;
    onOpen: (kind: ModalKind) => void;
    onOpenTask?: (id: string) => void;
    onOpenRoutine?: (id: string) => void;
}) {
    const [today, setToday] = useState("2026-01-01");
    useEffect(() => { const timer = window.setTimeout(() => setToday(dateKey()), 0); return () => window.clearTimeout(timer); }, []);
    const occurrenceRows = routines.flatMap((routine) => generateOccurrences({ id: routine.id, startDate: routine.startDate, frequency: routine.frequencyConfig, endCondition: routine.endCondition, completedDates: routine.completedDates }, today, 18).map((occurrence) => ({ routine, occurrence })));
    const overdue = occurrenceRows.filter(({ occurrence }) => occurrence.scheduledDate < today && !occurrence.completed);
    const upcoming = occurrenceRows.filter(({ occurrence }) => occurrence.scheduledDate >= today && !occurrence.completed).slice(0, 3);
    return <div className="page-stack home-dashboard"><section className="welcome-row"><div><p className="section-kicker">Today</p><h2>A calmer home starts here.</h2><p className="muted">A quick view of what needs your attention today.</p></div><button className="button button-secondary" onClick={() => onOpen("task")}><Plus size={17}/> Add a task</button></section><div className="stat-grid"><StatCard icon={ClipboardCheck} value={tasks.filter((task) => !task.completed).length} label="Open tasks" tone="blue"/><StatCard icon={AlertCircle} value={tasks.filter((task) => !task.completed && task.blockers.length).length} label="Active blockers" tone="orange"/><StatCard icon={Clock3} value={overdue.length} label="Overdue routines" tone="rose"/></div><section className="panel home-calendar-panel"><div className="panel-heading"><div><p className="section-kicker">Shared schedule</p><h3>Home calendar</h3></div><Sparkles size={18} className="heading-spark"/></div><SharedCalendarView tasks={tasks} routines={routines} today={today} storageKey="casakeeper-home-calendar-mode" onOpenTask={onOpenTask} onOpenRoutine={onOpenRoutine} onCompleteRoutine={async () => false}/></section><div className="dashboard-grid"><section className="panel"><div className="panel-heading"><div><p className="section-kicker">Stay on top of it</p><h3>Needs attention</h3></div><Sparkles size={18} className="heading-spark"/></div>{tasks.filter((task) => task.blockers.length).map((task) => <div className="attention-item" key={"task-" + task.id}><span className="attention-icon orange"><AlertCircle size={17}/></span><div><strong>{task.title}</strong><span>{task.blockers[0]}</span></div><ChevronRight size={17}/></div>)}{overdue.map(({ routine, occurrence }) => <div className="attention-item" key={occurrence.id}><span className="attention-icon rose"><Clock3 size={17}/></span><div><strong>{routine.title}</strong><span>Overdue - {formatDate(occurrence.scheduledDate)}</span></div><ChevronRight size={17}/></div>)}{!tasks.some((task) => !task.completed && task.blockers.length) && !overdue.length && <EmptyState icon={CheckCircle2} title="Nothing urgent" text="You're all caught up for now."/>}</section><section className="panel"><div className="panel-heading"><div><p className="section-kicker">Coming up</p><h3>Upcoming routines</h3></div><Link className="text-link" href="/routines">View all <ArrowUpRight size={14}/></Link></div>{upcoming.map(({ routine, occurrence }) => <div className="upcoming-item" key={occurrence.id}><div><strong>{routine.title}</strong><span>{formatDate(occurrence.scheduledDate)} - {summarizeFrequency(routine.frequencyConfig)}</span></div><span className="upcoming-date">{formatDate(occurrence.scheduledDate)}</span></div>)}</section></div><div className="quick-links"><Link href="/wishlist" className="quick-link"><span className="quick-link-icon blue"><ShoppingBag size={18}/></span><span><strong>Wishlist</strong><small>{wishlistCount} items to consider</small></span><ChevronRight size={17}/></Link><Link href="/resources" className="quick-link"><span className="quick-link-icon purple"><Folder size={18}/></span><span><strong>Resources</strong><small>{resourceCount} household references</small></span><ChevronRight size={17}/></Link></div></div>;
}
function StatCard({ icon: Icon, value, label, tone }: {
    icon: typeof ClipboardCheck;
    value: number;
    label: string;
    tone: string;
}) { return <div className="stat-card"><span className={"stat-icon " + tone}><Icon size={19}/></span><div><strong>{value}</strong><span>{label}</span></div><MoreHorizontal size={18} className="stat-more"/></div>; }
function RoutinesView({ routines, onToggleProcessStep, onAdd, onCompleteOccurrence, onEdit, onDelete }: {
    routines: Routine[];
    onToggleProcessStep: (id: string, scheduledDate: string, stepId: string) => void;
    onAdd: () => void;
    onCompleteOccurrence: (id: string, scheduledDate: string, completed: boolean) => Promise<boolean>;
    onEdit: (routine: Routine) => void;
    onDelete: (id: string) => Promise<string | null>;
}) {
    const [query, setQuery] = useState("");
    const [sort, setSort] = useState<SortMode>("title-asc");
    const [filterRows, setFilterRows] = useState<FilterRow[]>([]);
    const filtered = routines.filter((routine) => filterRows.every((row) => row.field !== "type" || matchesType(routine.type, row.types || [])));
    const visibleRoutines = sortByMode(filtered.filter((routine) => !query.trim() || routine.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), sort);
    return <div className="searchable-page"><div className="search-row top-search"><div className="search-field"><Search size={17} aria-hidden="true"/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search routines" aria-label="Search routines"/></div></div><RoutinesViewContent routines={visibleRoutines} sort={sort} onSortChange={setSort} filterRows={filterRows} onFilterRowsChange={setFilterRows} onToggleProcessStep={onToggleProcessStep} onAdd={onAdd} onCompleteOccurrence={onCompleteOccurrence} onEdit={onEdit} onDelete={onDelete}/></div>;
}
function RoutinesViewContent({ routines, sort, onSortChange, filterRows, onFilterRowsChange, onToggleProcessStep, onAdd, onCompleteOccurrence, onEdit, onDelete }: {
    routines: Routine[];
    onToggleProcessStep: (id: string, scheduledDate: string, stepId: string) => void;
    onAdd: () => void;
    onCompleteOccurrence: (id: string, scheduledDate: string, completed: boolean) => Promise<boolean>;
    onEdit: (routine: Routine) => void;
    onDelete: (id: string) => Promise<string | null>;
    sort: SortMode;
    onSortChange: (sort: SortMode) => void;
    filterRows: FilterRow[];
    onFilterRowsChange: (rows: FilterRow[]) => void;
}) {
    const [detailId, setDetailId] = useState<string | null>(() => typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("routine"));
    const [today, setToday] = useState("2026-01-01");
    const [view, setView] = useState<"cards" | "calendar">("cards");
    const [calendarMode, setCalendarMode] = useState<CalendarMode>("month");
    const [calendarAnchor, setCalendarAnchor] = useState("2026-01-01");
    const [calendarPreferenceLoaded, setCalendarPreferenceLoaded] = useState(false);
    useEffect(() => { const timer = window.setTimeout(() => setToday(dateKey()), 0); return () => window.clearTimeout(timer); }, []);
    useEffect(() => { const timer = window.setTimeout(() => { setCalendarAnchor(dateKey()); setCalendarMode(parseCalendarMode(window.localStorage.getItem("casakeeper-routines-calendar-mode"))); setCalendarPreferenceLoaded(true); }, 0); return () => window.clearTimeout(timer); }, []);
    useEffect(() => { if (calendarPreferenceLoaded)
        window.localStorage.setItem("casakeeper-routines-calendar-mode", calendarMode); }, [calendarMode, calendarPreferenceLoaded]);
    const selected = routines.find((routine) => routine.id === detailId);
    if (selected)
        return <RoutineDetail routine={selected} today={today} onBack={() => setDetailId(null)} onEdit={() => onEdit(selected)} onDelete={async () => { const message = await onDelete(selected.id); if (!message)
            setDetailId(null); return message; }} onComplete={(date, completed) => onCompleteOccurrence(selected.id, date, completed)} onToggleProcessStep={(date, stepId) => onToggleProcessStep(selected.id, date, stepId)}/>;
    return <div className="page-stack"><ListIntro kicker="The rhythm of home" title="Small habits, shared." text="Recurring schedules are calculated locally for this frontend prototype." action={onAdd} label="New routine"/><AdvancedFilters kind="routines" rows={filterRows} onRowsChange={onFilterRowsChange} sort={sort} onSortChange={onSortChange}/><div className="routine-view-switch" role="group" aria-label="Routine view"><button type="button" className={view === "cards" ? "selected" : ""} aria-pressed={view === "cards"} onClick={() => setView("cards")}>Cards</button><button type="button" className={view === "calendar" ? "selected" : ""} aria-pressed={view === "calendar"} onClick={() => setView("calendar")}>Calendar</button></div>{view === "calendar" ? <RoutineCalendarView routines={routines} today={today} mode={calendarMode} anchor={calendarAnchor} onModeChange={(nextMode) => setCalendarMode(nextMode)} onNavigate={setCalendarAnchor} onOpen={setDetailId} onCompleteOccurrence={onCompleteOccurrence}/> : <><div className="routine-list">{routines.map((routine) => { const occurrences = generateOccurrences({ id: routine.id, startDate: routine.startDate, frequency: routine.frequencyConfig, endCondition: routine.endCondition, completedDates: routine.completedDates }, today, 18); const overdue = occurrences.filter((item) => item.scheduledDate < today && !item.completed); const next = occurrences.find((item) => !item.completed && item.scheduledDate >= today) || overdue[0]; return <article className={"item-card routine-card " + (routine.type ? "has-item-type" : "")} style={{ borderLeftColor: itemType(routine.type)?.color }} key={routine.id} onClick={() => setDetailId(routine.id)}><div className="card-topline"><ItemTypeIcon type={routine.type}/>{overdue.length ? <span className="badge badge-rose">Overdue</span> : <span className="badge badge-muted">Active</span>}<button className="icon-button card-menu" aria-label={"Edit " + routine.title} onClick={(event) => { event.stopPropagation(); onEdit(routine); }}><Pencil size={15}/></button></div><h3>{routine.title}</h3><p className="frequency"><Repeat2 size={14}/> {summarizeFrequency(routine.frequencyConfig)}</p><div className="next-occurrence"><span>{overdue.length ? "Overdue occurrence" : "Next occurrence"}</span><strong>{next ? formatDate(next.scheduledDate) : "No upcoming date"}{next && <small> · {formatLocalTime(routine.scheduledTime) || "All day"}</small>}</strong></div>{next && <div className="card-actions"><button className="button button-soft" onClick={(event) => { event.stopPropagation(); onCompleteOccurrence(routine.id, next.scheduledDate, true); }}><Check size={16}/> Complete next</button></div>}</article>; })}</div><p className="demo-note"><Sparkles size={14}/> Routine schedules and occurrence progress are saved for this household.</p></>}</div>;
}
function LegacyRoutineCalendarView({ routines, today, mode, anchor, onModeChange, onNavigate, onOpen, onCompleteOccurrence }: {
    routines: Routine[];
    today: string;
    mode: CalendarMode;
    anchor: string;
    onModeChange: (mode: CalendarMode) => void;
    onNavigate: (date: string) => void;
    onOpen: (id: string) => void;
    onCompleteOccurrence: (id: string, scheduledDate: string, completed: boolean) => Promise<boolean>;
}) {
    const range = calendarPeriodRange(mode, anchor);
    const [selectedDate, setSelectedDate] = useState(range.start);
    const visibleSelectedDate = selectedDate >= range.start && selectedDate <= range.end ? selectedDate : range.start;
    const events = routines.flatMap((routine) => {
        const schedule = { id: routine.id, startDate: routine.startDate, frequency: routine.frequencyConfig, endCondition: routine.endCondition, completedDates: routine.completedDates };
        const byDate = new Map(generateOccurrencesInRange(schedule, range.start, range.end).map((occurrence) => [occurrence.scheduledDate, occurrence]));
        (routine.completionHistory || []).filter((record) => record.scheduledDate >= range.start && record.scheduledDate <= range.end).forEach((record) => {
            const existing = byDate.get(record.scheduledDate);
            byDate.set(record.scheduledDate, existing ? { ...existing, completed: record.completed } : { id: `${routine.id}-${record.scheduledDate}`, routineId: routine.id, scheduledDate: record.scheduledDate, completed: record.completed });
        });
        return [...byDate.values()].map((occurrence) => ({ routine, occurrence, status: occurrenceStatus(occurrence.scheduledDate, today, occurrence.completed) }));
    }).sort((a, b) => a.occurrence.scheduledDate.localeCompare(b.occurrence.scheduledDate) || a.routine.title.localeCompare(b.routine.title));
    const eventsByDate = new Map<string, typeof events>();
    events.forEach((event) => eventsByDate.set(event.occurrence.scheduledDate, [...(eventsByDate.get(event.occurrence.scheduledDate) || []), event]));
    const move = (amount: number) => { if (mode === "month") {
        const date = new Date(`${anchor}T00:00:00`);
        onNavigate(dateKey(new Date(date.getFullYear(), date.getMonth() + amount, 1)));
    }
    else
        onNavigate(shiftDateKey(anchor, mode === "week" ? amount * 7 : amount)); };
    const heading = mode === "day" ? formatDate(range.start) : `${formatDate(range.start)} – ${formatDate(range.end)}`;
    const iconFor = (status: "overdue" | "upcoming" | "completed") => status === "completed" ? <CheckCircle2 size={13}/> : status === "overdue" ? <AlertCircle size={13}/> : <Clock3 size={13}/>;
    const [quickPending, setQuickPending] = useState<Record<string, boolean>>({});
    const [quickError, setQuickError] = useState<string | null>(null);
    const quickComplete = async (event: (typeof events)[number]) => { const key = `${event.routine.id}:${event.occurrence.scheduledDate}`; if (quickPending[key] || event.occurrence.completed)
        return; setQuickPending((current) => ({ ...current, [key]: true })); setQuickError(null); try {
        const saved = await onCompleteOccurrence(event.routine.id, event.occurrence.scheduledDate, true);
        if (!saved)
            setQuickError("Unable to complete this occurrence.");
    }
    finally {
        setQuickPending((current) => ({ ...current, [key]: false }));
    } };
    const eventRow = (event: (typeof events)[number]) => { const key = `${event.routine.id}:${event.occurrence.scheduledDate}`; const pending = Boolean(quickPending[key]); return <div key={key} className={"calendar-event-row calendar-event-" + event.status}><button type="button" className="calendar-event" onClick={() => onOpen(event.routine.id)} aria-label={`${event.routine.title}, ${formatDate(event.occurrence.scheduledDate)}, ${event.status}`}>{iconFor(event.status)}<span>{event.routine.title}</span></button>{event.occurrence.completed ? <span className="calendar-completed-indicator"><CheckCircle2 size={13}/> Completed</span> : <button type="button" className="calendar-quick-complete" onClick={(clickEvent) => { clickEvent.stopPropagation(); void quickComplete(event); }} disabled={pending} aria-label={`Quick complete ${event.routine.title} on ${formatDate(event.occurrence.scheduledDate)}`}>{pending ? "Saving…" : <><Check size={13}/> Complete</>}</button>}</div>; };
    const eventBar = (event: (typeof events)[number]) => <span key={`${event.routine.id}-${event.occurrence.scheduledDate}`} className={`calendar-event-bar calendar-event-${event.status}`} role="img" aria-label={`${event.routine.title}, ${event.status}`}/>;
    const dayEvents = eventsByDate.get(visibleSelectedDate) || [];
    const monthStart = new Date(`${range.start}T00:00:00`).getDay();
    const monthDays = mode === "month" ? Number(range.end.slice(-2)) : 0;
    return <section className="routine-calendar"><div className="calendar-mode-switch" role="group" aria-label="Calendar mode"><button type="button" className={mode === "day" ? "selected" : ""} aria-pressed={mode === "day"} onClick={() => onModeChange("day")}>Day</button><button type="button" className={mode === "week" ? "selected" : ""} aria-pressed={mode === "week"} onClick={() => onModeChange("week")}>Week</button><button type="button" className={mode === "month" ? "selected" : ""} aria-pressed={mode === "month"} onClick={() => onModeChange("month")}>Month</button></div><div className="calendar-toolbar"><button type="button" className="button button-ghost" onClick={() => move(-1)} aria-label="Previous period">Previous</button><strong>{heading}</strong><div><button type="button" className="button button-soft" onClick={() => onNavigate(today)}>Today</button><button type="button" className="button button-ghost" onClick={() => move(1)} aria-label="Next period">Next</button></div></div>{mode === "month" ? <div className="calendar-month-grid" aria-label={`Month of ${heading}`}><div className="calendar-weekday-labels">{weekdays.map((day) => <span key={day}>{day}</span>)}</div><div className="calendar-month-days">{Array.from({ length: monthStart }, (_, index) => <span className="calendar-day calendar-day-empty" key={`empty-${index}`}/>)}{Array.from({ length: monthDays }, (_, index) => { const day = `${range.start.slice(0, 8)}${String(index + 1).padStart(2, "0")}`; const dayItems = eventsByDate.get(day) || []; return <div className={`calendar-day ${visibleSelectedDate === day ? "selected" : ""}`} key={day}><button type="button" className="calendar-day-select" aria-label={`Select ${formatDate(day)}${dayItems.length ? `, ${dayItems.length} occurrences` : ", no occurrences"}`} onClick={() => setSelectedDate(day)}><span className="calendar-day-number">{index + 1}</span><span className="calendar-day-bars">{dayItems.map(eventBar)}</span></button></div>; })}</div></div> : mode === "week" ? <div className="calendar-week-grid">{Array.from({ length: 7 }, (_, index) => { const day = shiftDateKey(range.start, index); const dayItems = eventsByDate.get(day) || []; return <div className="calendar-week-day" key={day}><strong>{formatDate(day)}</strong>{dayItems.length ? dayItems.map(eventRow) : <span className="calendar-empty-day">No events</span>}</div>; })}</div> : <div className="calendar-day-list">{events.map(eventRow)}</div>}{quickError && <p className="calendar-quick-error" role="alert">{quickError}</p>}{mode === "month" && <section className="calendar-day-inspector"><h3>{formatDate(visibleSelectedDate)} <span>{dayEvents.length} {dayEvents.length === 1 ? "occurrence" : "occurrences"}</span></h3>{dayEvents.length ? dayEvents.map(eventRow) : <p className="detail-note">No routine occurrences on this day.</p>}</section>}</section>;
}
function RoutineCalendarView({ routines, today, onOpen, onCompleteOccurrence }: {
    routines: Routine[];
    today: string;
    mode?: CalendarMode;
    anchor?: string;
    onModeChange?: (mode: CalendarMode) => void;
    onNavigate?: (date: string) => void;
    onOpen: (id: string) => void;
    onCompleteOccurrence: (id: string, scheduledDate: string, completed: boolean) => Promise<boolean>;
}) {
    void LegacyRoutineCalendarView;
    return <SharedCalendarView tasks={[]} routines={routines} today={today} onOpenTask={() => undefined} onOpenRoutine={onOpen} onCompleteRoutine={(id, scheduledDate) => onCompleteOccurrence(id, scheduledDate, true)}/>;
}
function RoutineDetail({ routine, today, onBack, onEdit, onDelete, onComplete, onToggleProcessStep }: {
    routine: Routine;
    today: string;
    onBack: () => void;
    onEdit: () => void;
    onDelete: () => Promise<string | null>;
    onComplete: (date: string, completed: boolean) => void;
    onToggleProcessStep: (date: string, stepId: string) => void;
}) {
    const [expandedOccurrence, setExpandedOccurrence] = useState<string | null>(null);
    const [overduePage, setOverduePage] = useState(0);
    const [pastOpen, setPastOpen] = useState(false);
    const [pastVisible, setPastVisible] = useState(6);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState("");
    const schedule = { id: routine.id, startDate: routine.startDate, frequency: routine.frequencyConfig, endCondition: routine.endCondition, completedDates: routine.completedDates };
    const upcoming = generateOccurrencesInRange(schedule, today, shiftDateKey(today, 1095), 12).filter((item) => !item.completed).slice(0, 3);
    const overdueFrom = shiftDateKey(today, -366 * (overduePage + 1));
    const overdueTo = shiftDateKey(today, -366 * overduePage - 1);
    const scheduledOverdue = generateOccurrencesInRange(schedule, overdueFrom, overdueTo).filter((item) => !item.completed);
    const historicalOpen = (routine.completionHistory || []).filter((item) => !item.completed && item.scheduledDate < today && !scheduledOverdue.some((occurrence) => occurrence.scheduledDate === item.scheduledDate)).map((item) => ({ id: `${routine.id}-${item.scheduledDate}`, routineId: routine.id, scheduledDate: item.scheduledDate, completed: false }));
    const overdue = [...historicalOpen, ...scheduledOverdue].sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate));
    const completedOccurrences = (routine.completionHistory || []).filter((item) => item.completed).sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate));
    const canLoadOlderOverdue = overdueFrom > routine.startDate;
    const processSteps = routine.processSteps || normalizeProcessSteps(routine.process);
    const renderActive = (occurrence: RoutineOccurrence) => <OccurrenceRow key={occurrence.id} occurrence={occurrence} expanded={expandedOccurrence === occurrence.id} onToggleExpanded={() => setExpandedOccurrence((current) => current === occurrence.id ? null : occurrence.id)} onComplete={onComplete} processSteps={processSteps} progress={routine.occurrenceProcess?.[occurrence.scheduledDate] || {}} onToggleProcessStep={onToggleProcessStep}/>;
    return <div className="page-stack task-detail-page"><BackButton label="Back to Routines" onClick={onBack}/><section className="panel task-detail"><div className="detail-header"><div><div className="card-topline"><span className="routine-symbol"><Repeat2 size={16}/></span><span className="badge badge-muted">Active</span></div><h2>{routine.title}</h2>{routine.description && <p className="muted">{routine.description}</p>}<p className="frequency"><Repeat2 size={14}/> Starts {formatDate(routine.startDate)} - {summarizeFrequency(routine.frequencyConfig)} · {formatLocalTime(routine.scheduledTime) || "All day"}</p></div><div className="detail-actions"><button className="button button-ghost" onClick={onEdit}><Pencil size={15}/> Edit</button><button className="button button-ghost danger-text" onClick={() => { setDeleteError(""); setDeleteConfirmOpen(true); }}><Trash2 size={15}/> Delete</button></div></div>{routine.process.length > 0 && <section className="detail-section"><h3>Process</h3><ol className="process-list">{routine.process.map((step, index) => <li key={step + index}><span>{index + 1}</span>{step}</li>)}</ol></section>}{routine.links.length > 0 && <section className="detail-section"><h3>Links</h3><div className="detail-links">{routine.links.map((link) => <a href={link} target="_blank" rel="noreferrer" key={link}><Link2 size={15}/>{link}<ArrowUpRight size={14}/></a>)}</div></section>}{routine.media.length > 0 && <section className="detail-section"><h3>Media</h3><div className="media-grid">{routine.media.map((media) => <AttachmentMediaButton attachment={media} contextLabel={routine.title}/>)}</div></section>}{routine.notes && <section className="detail-section"><h3>Additional notes</h3><p className="detail-note detail-note-body">{routine.notes}</p></section>}<section className="detail-section occurrence-section"><h3>Overdue occurrences</h3>{overdue.length ? overdue.map(renderActive) : <p className="detail-note">No overdue occurrences.</p>}{canLoadOlderOverdue && <button type="button" className="button button-ghost occurrence-load-more" onClick={() => setOverduePage((page) => page + 1)}>Load older overdue occurrences</button>}<h3>Upcoming occurrences</h3>{upcoming.length ? upcoming.map(renderActive) : <p className="detail-note">No upcoming occurrences.</p>}<div className="past-occurrences"><button type="button" className="past-occurrences-trigger" aria-expanded={pastOpen} aria-controls="past-occurrences-panel" onClick={() => setPastOpen((open) => !open)}><span>Past occurrences <small>{completedOccurrences.length}</small></span><ChevronRight size={17} className={pastOpen ? "schedule-chevron is-open" : "schedule-chevron"}/></button>{pastOpen && <div id="past-occurrences-panel" className="past-occurrences-panel">{completedOccurrences.slice(0, pastVisible).map((occurrence) => <PastOccurrenceRow key={occurrence.scheduledDate} occurrence={{ id: `${routine.id}-${occurrence.scheduledDate}`, routineId: routine.id, scheduledDate: occurrence.scheduledDate, completed: true }} completedAt={occurrence.completedAt} onUndo={onComplete}/>)}{completedOccurrences.length === 0 && <p className="detail-note">No past occurrences.</p>}{pastVisible < completedOccurrences.length && <button type="button" className="button button-ghost occurrence-load-more" onClick={() => setPastVisible((count) => count + 6)}>Load more history</button>}</div>}</div></section>{deleteConfirmOpen && <div className="modal-confirm-backdrop detail-delete-backdrop" role="presentation"><div className="modal-confirm" role="alertdialog" aria-modal="true" aria-labelledby="detail-delete-title" aria-describedby="detail-delete-description"><div className="modal-confirm-header"><Trash2 size={18}/><h3 id="detail-delete-title">Delete Routine?</h3></div><p id="detail-delete-description">Delete <strong>{routine.title}</strong> and all of its past and future occurrence history? This cannot be undone.</p>{deleteError && <p className="field-error" role="alert">{deleteError}</p>}<div className="modal-confirm-actions"><button type="button" className="button button-ghost" onClick={() => setDeleteConfirmOpen(false)} disabled={deleting}>Cancel</button><button type="button" className="button button-danger" onClick={async () => { if (deleting)
        return; setDeleting(true); setDeleteError(""); const message = await onDelete(); if (message) {
        setDeleteError(message);
        setDeleting(false);
    } }} disabled={deleting}>{deleting ? "Deleting…" : "Delete Routine"}</button></div></div></div>}</section></div>;
}
function OccurrenceRow({ occurrence, expanded, onToggleExpanded, onComplete, processSteps = [], progress = {}, onToggleProcessStep }: {
    occurrence: RoutineOccurrence;
    expanded: boolean;
    onToggleExpanded: () => void;
    onComplete: (date: string, completed: boolean) => void;
    processSteps?: ProcessStep[];
    progress?: Record<string, boolean>;
    onToggleProcessStep?: (date: string, stepId: string) => void;
}) { const panelId = `occurrence-panel-${occurrence.id}`; return <div className={"occurrence-row " + (occurrence.scheduledDate < dateKey() ? "is-overdue" : "")}><button type="button" className="occurrence-trigger" aria-expanded={expanded} aria-controls={panelId} onClick={onToggleExpanded}><span><strong>{formatDate(occurrence.scheduledDate)}</strong><small>{occurrence.scheduledDate}</small></span><ChevronRight size={17} className={expanded ? "schedule-chevron is-open" : "schedule-chevron"}/></button>{expanded && <div id={panelId} className="occurrence-panel">{processSteps.length > 0 && <div className="occurrence-process" aria-label="Process steps for this occurrence">{processSteps.map((step, index) => <label key={step.id} className={progress[step.id] ? "process-step-complete" : "process-check"}><input type="checkbox" checked={Boolean(progress[step.id])} onChange={() => onToggleProcessStep?.(occurrence.scheduledDate, step.id)} aria-label={"Complete process step " + (index + 1)}/><span>{step.text}</span></label>)}</div>}<button className="button button-soft" onClick={() => onComplete(occurrence.scheduledDate, !occurrence.completed)}><Check size={15}/> Complete</button></div>}</div>; }
function PastOccurrenceRow({ occurrence, completedAt, onUndo }: {
    occurrence: RoutineOccurrence;
    completedAt: string | null;
    onUndo: (date: string, completed: boolean) => void;
}) { return <div className="occurrence-row past-occurrence"><div><strong>{formatDate(occurrence.scheduledDate)}</strong><span>Completed {completedAt ? formatDate(completedAt.slice(0, 10)) : "date unavailable"}</span></div><button className="button button-soft" onClick={() => onUndo(occurrence.scheduledDate, false)}><Check size={15}/> Undo completion</button></div>; }
/* eslint-enable react/jsx-key */
function WishlistView({ items, onAdd, onDelete, onEdit, onTogglePurchase }: {
    items: WishlistItem[];
    onAdd: () => void;
    onDelete: (id: string | number) => Promise<boolean>;
    onEdit: (item: WishlistItem) => void;
    onTogglePurchase: (id: string | number, purchased: boolean) => Promise<boolean>;
}) {
    const [query, setQuery] = useState("");
    const [sort, setSort] = useState<SortMode>("title-asc");
    const [filterRows, setFilterRows] = useState<FilterRow[]>([]);
    const filtered = items.filter((item) => !query.trim() || item.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
    const visibleItems = sortByMode(filtered, sort);
    return <div className="searchable-page"><div className="search-row top-search"><div className="search-field"><Search size={17} aria-hidden="true"/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search wishlist" aria-label="Search wishlist"/></div></div><WishlistViewContent items={visibleItems} sort={sort} onSortChange={setSort} filterRows={filterRows} onFilterRowsChange={setFilterRows} onAdd={onAdd} onDelete={onDelete} onEdit={onEdit} onTogglePurchase={onTogglePurchase}/></div>;
}
function WishlistViewContent({ items, sort, onSortChange, filterRows, onFilterRowsChange, onAdd, onDelete, onEdit, onTogglePurchase }: {
    items: WishlistItem[];
    sort: SortMode;
    onSortChange: (sort: SortMode) => void;
    filterRows: FilterRow[];
    onFilterRowsChange: (rows: FilterRow[]) => void;
    onAdd: () => void;
    onDelete: (id: string | number) => Promise<boolean>;
    onEdit: (item: WishlistItem) => void;
    onTogglePurchase: (id: string | number, purchased: boolean) => Promise<boolean>;
}) {
    const [filter, setFilter] = useState<WishlistFilter>("outstanding");
    const [pending, setPending] = useState({} as { [key: string]: boolean });
    const visibleItems = filterWishlistItems(items, filter);
    const togglePurchase = async (item: WishlistItem) => { const key = String(item.id); if (pending[key]) return; setPending((current) => ({ ...current, [key]: true })); try { await onTogglePurchase(item.id, !isWishlistPurchased(item)); } finally { setPending((current) => ({ ...current, [key]: false })); } };
    const remove = async (item: WishlistItem) => { if (!window.confirm("Remove this wishlist item?")) return; const key = String(item.id); if (pending[key]) return; setPending((current) => ({ ...current, [key]: true })); try { await onDelete(item.id); } finally { setPending((current) => ({ ...current, [key]: false })); } };
    return <div className="page-stack narrow-page"><ListIntro kicker="For a future errand" title="Things worth bringing home." text="A shared shelf for the things you want to buy next." action={onAdd} label="Add item"/><div className="wishlist-filter" role="group" aria-label="Wishlist filter"><button type="button" className={filter === "outstanding" ? "selected" : ""} aria-pressed={filter === "outstanding"} onClick={() => setFilter("outstanding")}>Outstanding</button><button type="button" className={filter === "purchased" ? "selected" : ""} aria-pressed={filter === "purchased"} onClick={() => setFilter("purchased")}>Purchased</button></div><AdvancedFilters kind="wishlist" rows={filterRows} onRowsChange={onFilterRowsChange} sort={sort} onSortChange={onSortChange}/><section className="panel checklist-panel"><div className="panel-heading"><div><h3>{filter === "outstanding" ? "Outstanding wishlist" : "Purchased items"}</h3><span className="panel-subtitle">{visibleItems.length} {visibleItems.length === 1 ? "item" : "items"}</span></div><ShoppingBag size={18} className="heading-spark"/></div>{visibleItems.length ? visibleItems.map((item) => <div className={"checklist-row wishlist-card" + (isWishlistPurchased(item) ? " wishlist-card-purchased" : "")} key={item.id}><button className={"check-circle wishlist-check-circle" + (isWishlistPurchased(item) ? " is-purchased" : "")} aria-label={isWishlistPurchased(item) ? "Move " + item.title + " back to Outstanding" : "Mark " + item.title + " as purchased"} onClick={() => void togglePurchase(item)} disabled={Boolean(pending[String(item.id)])}>{isWishlistPurchased(item) ? <Undo2 size={14}/> : <Check size={14}/>}</button><div className="checklist-copy wishlist-card-copy"><strong>{item.title}</strong>{formatWishlistPrice(item.priceCents) && <span className="wishlist-price">{formatWishlistPrice(item.priceCents)}</span>}{item.notes && <span>{item.notes}</span>}{wishlistLinks(item).length > 0 && <div className="wishlist-links">{wishlistLinks(item).map((link) => <a className="wishlist-link-row" href={link} target="_blank" rel="noreferrer" key={link}><Link2 size={13}/><span>{link}</span></a>)}</div>}</div><button className="icon-button" aria-label={"Edit " + item.title} onClick={() => onEdit(item)} disabled={Boolean(pending[String(item.id)])}><Pencil size={15}/></button><button className="icon-button danger-icon" aria-label={"Delete " + item.title} onClick={() => void remove(item)} disabled={Boolean(pending[String(item.id)])}><Trash2 size={15}/></button></div>) : <EmptyState icon={ShoppingBag} title={filter === "outstanding" ? "No outstanding wishlist items." : "No purchased items yet."} text={filter === "outstanding" ? "Add a few ideas when you spot something useful." : "Purchased items will appear here."} action={filter === "outstanding" ? onAdd : undefined} actionLabel="Add wishlist item"/>}</section></div>;
}
function ResourceDiagnosticsObserver({ resources, search, typeFilter, sort, detailSelected, viewerOpen }: {
    resources: Resource[];
    search: string;
    typeFilter: string;
    sort: SortMode;
    detailSelected: boolean;
    viewerOpen: boolean;
}) {
    const diagnostics = useContext(ResourceDiagnosticsContext);
    useEffect(() => {
        if (!diagnostics.enabled)
            return;
        const renderedIds = Array.from(document.querySelectorAll<HTMLElement>(".resource-list-card")).map((element) => element.dataset.resourceId || "");
        diagnostics.record("resources-dom-render", { renderedCount: renderedIds.length, detailSelected, viewerOpen, searchEmpty: search.trim().length === 0, searchLength: search.trim().length, typeFilterSelected: Boolean(typeFilter), sort });
    }, [diagnostics.enabled, resources.length, search, typeFilter, sort, detailSelected, viewerOpen]);
    return null;
}
function ResourceDiagnosticsPanel() {
    const diagnostics = useContext(ResourceDiagnosticsContext);
    const [copyStatus, setCopyStatus] = useState("");
    const latest = diagnostics.history[diagnostics.history.length - 1];
    if (!diagnostics.enabled || !latest)
        return null;
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(sanitizeResourceDiagnostics(diagnostics.history));
            setCopyStatus("Copied");
        }
        catch {
            setCopyStatus("Copy unavailable");
        }
    };
    return <details className="resource-diagnostics"><summary>Resource diagnostics (temporary)</summary><div className="resource-diagnostics-body"><p>Server {latest.serverCount} · App {latest.stateCount} · View {latest.viewInputCount} · Filtered {latest.filteredCount} · Cards {latest.renderedCount}</p><p>Resource A: {latest.knownPresence["Resource A"] ? "present" : "missing"} · Resource B: {latest.knownPresence["Resource B"] ? "present" : "missing"}</p><p>Search: {latest.searchEmpty ? "empty" : `${latest.searchLength} chars`} · Type filter: {latest.typeFilterSelected ? "selected" : "all"} · Sort: {latest.sort} · Detail: {latest.detailSelected ? "open" : "closed"} · Viewer: {latest.viewerOpen ? "open" : "closed"} · Page: {latest.pageVisibility}</p><ol>{diagnostics.history.slice(-8).reverse().map((snapshot, index) => <li key={`${snapshot.at}-${snapshot.event}-${index}`}>{snapshot.event} · {snapshot.at}</li>)}</ol><div className="resource-diagnostics-actions"><button className="button button-soft" type="button" onClick={copy}>Copy Diagnostics</button><button className="button button-ghost" type="button" onClick={diagnostics.disable}>Disable</button>{copyStatus && <span role="status">{copyStatus}</span>}</div></div></details>;
}
function ResourcesView({ resources, search, setSearch, sort, onSortChange, typeFilter, onTypeFilterChange, onAdd, onOpen, resourceTypes = [] }: {
    resources: Resource[];
    search: string;
    setSearch: (value: string) => void;
    sort: SortMode;
    onSortChange: (sort: SortMode) => void;
    typeFilter: string;
    onTypeFilterChange: (value: string) => void;
    onAdd: () => void;
    onOpen: (resource: Resource) => void;
    resourceTypes?: ResourceType[];
    onDelete?: (id: string | number) => Promise<boolean>;
    onEdit?: (resource: Resource) => void;
}) {
    const visibleResources = sortByMode(resources.filter((resource) => {
        const matchesSearch = !search.trim() || resource.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
        return matchesSearch && (!typeFilter || resource.resourceTypeId === typeFilter);
    }), sort);
    const diagnostics = useContext(ResourceDiagnosticsContext);
    useEffect(() => { if (diagnostics.enabled) diagnostics.record("resources-view", { viewInputCount: resources.length, filteredCount: visibleResources.length, knownPresence: knownResourcePresence(visibleResources.map((resource) => resource.id)), searchEmpty: search.trim().length === 0, searchLength: search.trim().length, typeFilterSelected: Boolean(typeFilter), sort }); }, [diagnostics.enabled, resources, search, sort, typeFilter]);
    return <div className="searchable-page resource-searchable-page"><div className="search-row top-search"><div className="search-field"><Search size={17} aria-hidden="true"/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search resources" aria-label="Search resources"/></div></div><ResourcesViewContent resources={visibleResources} sort={sort} onSortChange={onSortChange} typeFilter={typeFilter} onTypeFilterChange={onTypeFilterChange} resourceTypes={resourceTypes} onAdd={onAdd} onOpen={onOpen}/></div>;
}
function ResourcesViewContent({ resources, sort, onSortChange, typeFilter, onTypeFilterChange, resourceTypes, onAdd, onOpen }: {
    resources: Resource[];
    sort: SortMode;
    onSortChange: (sort: SortMode) => void;
    typeFilter: string;
    onTypeFilterChange: (value: string) => void;
    resourceTypes: ResourceType[];
    onAdd: () => void;
    onOpen: (resource: Resource) => void;
}) {
    return <div className="page-stack"><ListIntro kicker="The useful stuff" title="Keep the good-to-know close." text="A shared shelf for home instructions, manuals, and details." action={onAdd} label="New resource"/><AdvancedFilters kind="wishlist" rows={[]} onRowsChange={() => undefined} sort={sort} onSortChange={onSortChange}/><label className="resource-type-filter"><span>Type</span><select value={typeFilter} onChange={(event) => onTypeFilterChange(event.target.value)}><option value="">All Types</option>{resourceTypes.map((type) => <option value={type.id} key={type.id}>{type.name}</option>)}</select></label><div className="search-row"><span className="list-count">{resources.length} resources</span></div>{resources.length ? <div className="resource-list">{resources.map((resource) => <article className="resource-list-card" data-resource-id={String(resource.id)} key={resource.id} role="button" tabIndex={0} onClick={() => onOpen(resource)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen(resource); } }} aria-label={"Open resource " + resource.title}><span>{resource.title}</span><small className="resource-type-label">{resource.resourceTypeName || "Other"}</small><ChevronRight size={18} aria-hidden="true"/></article>)}</div> : <EmptyState icon={Folder} title="No resources found" text="Try a different title or Resource Type." action={onAdd} actionLabel="Create a resource"/>}</div>;
}
function AttachmentMediaButton({ attachment, contextLabel }: {
    attachment: MediaAttachment;
    contextLabel: string;
}) {
    const openAttachment = useContext(AttachmentViewerContext);
    const kind = attachment.kind || mediaKind(attachment.name, attachment.type);
    return <button type="button" className="media-item media-item-button" onClick={() => openAttachment(attachment, contextLabel)} disabled={!attachment.previewUrl} aria-label={attachment.previewUrl ? `Preview ${attachment.name}` : `${attachment.name} preview unavailable`}>
    {attachment.previewUrl && kind === "image" ? <Image src={attachment.previewUrl} alt={attachment.name} width={320} height={180} unoptimized/> : kind === "video" ? <span className="attachment-type-icon"><ExternalLink size={19}/></span> : <span className="attachment-type-icon"><ExternalLink size={19}/></span>}
    <span>{attachment.name}</span>
  </button>;
}
function ResourceDetailViewLegacy({ resource, onBack, onEdit, onDelete }: {
    resource?: Resource;
    onBack: () => void;
    onEdit: (resource: Resource) => void;
    onDelete: (id: string | number) => Promise<boolean>;
}) {
    const [attachments, setAttachments] = useState<MediaAttachment[]>(resource?.attachments || []);
    const [loading, setLoading] = useState(Boolean(resource));
    const [error, setError] = useState("");
    useEffect(() => {
        if (!resource)
            return;
        let cancelled = false;
        fetch(`/api/resources/${encodeURIComponent(String(resource.id))}/attachments`).then(async (response) => {
            const body = await response.json().catch(() => ({}));
            if (!response.ok)
                throw new Error(body.error || "Unable to load Resource attachments.");
            if (!cancelled)
                setAttachments((body.attachments || []).map((attachment: {
                    id: string;
                    original_filename: string;
                    mime_type: string;
                    file_size: number;
                    storage_path: string;
                    signedUrl: string;
                }) => ({ id: attachment.id, name: attachment.original_filename, type: attachment.mime_type, size: attachment.file_size, storagePath: attachment.storage_path, previewUrl: attachment.signedUrl, kind: mediaKind(attachment.original_filename, attachment.mime_type) })));
        }).catch((cause) => { if (!cancelled)
            setError(cause instanceof Error ? cause.message : "Unable to load Resource attachments."); }).finally(() => { if (!cancelled)
            setLoading(false); });
        return () => { cancelled = true; };
    }, [resource]);
    if (!resource)
        return <div className="page-stack resource-detail-page"><BackButton label="Back to Resources" onClick={onBack}/><section className="panel"><p className="field-error" role="alert">This Resource is no longer available.</p></section></div>;
    const remove = async () => { if (!window.confirm("Delete this Resource and its attachment history?"))
        return; await onDelete(resource.id); };
    return <div className="page-stack resource-detail-page"><BackButton label="Back to Resources" onClick={onBack}/><section className="panel resource-detail-panel"><div className="detail-header"><div><div className="card-topline"><span className="resource-symbol"><Folder size={16}/></span><span className="badge badge-muted">Resource</span></div><h2>{resource.title}</h2></div><div className="detail-actions"><button className="button button-primary" onClick={() => onEdit(resource)}><Pencil size={15}/> Edit</button><button className="button button-ghost danger-text" onClick={() => void remove()}><Trash2 size={15}/> Delete</button></div></div>{resource.description && <section className="detail-section"><h3>Description</h3><p className="detail-note detail-note-body">{resource.description}</p></section>}{resource.notes.length > 0 && <section className="detail-section"><h3>Notes</h3><div className="resource-notes">{resource.notes.map((note, index) => <span key={note + index}>{note}</span>)}</div></section>}{resource.links.length > 0 && <section className="detail-section"><h3>Links</h3><div className="detail-links">{resource.links.map((link) => <a href={link} target="_blank" rel="noreferrer" key={link}><Link2 size={15}/><span>{link}</span><ArrowUpRight size={14}/></a>)}</div></section>}<section className="detail-section"><h3>Photos, videos, and files</h3>{loading ? <p className="detail-note">Loading attachments…</p> : error ? <p className="field-error" role="alert">{error}</p> : attachments.length ? <div className="media-grid">{attachments.map((attachment) => { const kind = attachment.kind || mediaKind(attachment.name, attachment.type); const extension = mediaExtension(attachment.name); const previewImage = kind === "image" && attachment.previewUrl && extension !== "heic" && extension !== "heif"; return <div className="media-item" key={attachment.id}>{previewImage ? <Image src={attachment.previewUrl as string} alt={attachment.name} width={320} height={180} unoptimized/> : kind === "video" && attachment.previewUrl ? <video src={attachment.previewUrl} controls preload="metadata"/> : <span className="attachment-type-icon"><ExternalLink size={19}/></span>}<span>{attachment.name}</span>{attachment.previewUrl && <a className="attachment-open" href={attachment.previewUrl} target="_blank" rel="noreferrer" download={attachment.name}>Open</a>}</div>; })}</div> : <p className="detail-note">No attachments added.</p>}</section></section></div>;
}
function AttachmentViewer({ attachment, contextLabel, onClose }: {
    attachment: MediaAttachment;
    contextLabel: string;
    onClose: () => void;
}) {
    const closeRef = useRef<HTMLButtonElement>(null);
    const [previewFailed, setPreviewFailed] = useState(false);
    const extension = mediaExtension(attachment.name);
    const previewMode = attachmentPreviewMode(attachment.name, attachment.type);
    const canPreview = !previewFailed && Boolean(attachment.previewUrl);
    useEffect(() => {
        const previousOverflow = document.body.style.overflow;
        const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape")
            onClose(); };
        document.body.style.overflow = "hidden";
        document.addEventListener("keydown", onKeyDown);
        closeRef.current?.focus();
        return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", onKeyDown); };
    }, [onClose]);
    if (typeof document === "undefined" || !attachment.previewUrl)
        return null;
    return createPortal(<div className="attachment-viewer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget)
        onClose(); }}><section className="attachment-viewer" role="dialog" aria-modal="true" aria-labelledby="attachment-viewer-title"><header className="attachment-viewer-header"><div><span className="section-kicker">{contextLabel}</span><h2 id="attachment-viewer-title">{attachment.name}</h2></div><button ref={closeRef} type="button" className="icon-button" onClick={onClose} aria-label="Close attachment viewer"><X size={19}/></button></header><div className="attachment-viewer-body">{canPreview && previewMode === "image" ? <Image src={attachment.previewUrl} alt={attachment.name} width={1200} height={900} unoptimized onError={() => setPreviewFailed(true)}/> : canPreview && previewMode === "video" ? <video src={attachment.previewUrl} controls autoPlay playsInline onError={() => setPreviewFailed(true)}/> : canPreview && previewMode === "pdf" ? <iframe src={attachment.previewUrl} title={attachment.name} onError={() => setPreviewFailed(true)}/> : <div className="attachment-viewer-fallback"><span className="resource-file-mark">{extension.toUpperCase() || "FILE"}</span><p>Preview unavailable in this browser.</p></div>}</div><footer className="attachment-viewer-footer"><span className="attachment-viewer-type">{attachment.type || extension.toUpperCase() || "File"}</span><div><a className="button button-ghost" href={attachment.previewUrl} target="_blank" rel="noreferrer">Open externally</a><a className="button button-primary" href={attachment.previewUrl} download={attachment.name}>Download</a></div></footer></section></div>, document.body);
}
function ResourceDetailView({ resource, onBack, onEdit, onDelete }: {
    resource?: Resource;
    onBack: () => void;
    onEdit: (resource: Resource) => void;
    onDelete: (id: string | number) => Promise<boolean>;
}) {
    void ResourceDetailViewLegacy;
    const openAttachment = useContext(AttachmentViewerContext);
    const [attachments, setAttachments] = useState<MediaAttachment[]>(resource?.attachments || []);
    const [loading, setLoading] = useState(Boolean(resource));
    const [error, setError] = useState("");
    useEffect(() => {
        if (!resource)
            return;
        let cancelled = false;
        fetch(`/api/resources/${encodeURIComponent(String(resource.id))}/attachments`)
            .then(async (response) => {
            const body = await response.json().catch(() => ({}));
            if (!response.ok)
                throw new Error(body.error || "Unable to load Resource attachments.");
            if (!cancelled)
                setAttachments((body.attachments || []).map((attachment: {
                    id: string;
                    original_filename: string;
                    mime_type: string;
                    file_size: number;
                    storage_path: string;
                    signedUrl: string;
                }) => ({
                    id: attachment.id,
                    name: attachment.original_filename,
                    type: attachment.mime_type,
                    size: attachment.file_size,
                    storagePath: attachment.storage_path,
                    previewUrl: attachment.signedUrl,
                    kind: mediaKind(attachment.original_filename, attachment.mime_type),
                })));
        })
            .catch((cause) => { if (!cancelled)
            setError(cause instanceof Error ? cause.message : "Unable to load Resource attachments."); })
            .finally(() => { if (!cancelled)
            setLoading(false); });
        return () => { cancelled = true; };
    }, [resource]);
    if (!resource)
        return <div className="page-stack resource-detail-page"><BackButton label="Back to Resources" onClick={onBack}/><section className="panel"><p className="field-error" role="alert">This Resource is no longer available.</p></section></div>;
    const remove = async () => {
        if (!window.confirm("Delete this Resource and its attachment history?"))
            return;
        await onDelete(resource.id);
    };
    return <div className="page-stack resource-detail-page">
    <BackButton label="Back to Resources" onClick={onBack}/>
    <section className="panel resource-detail-panel">
      <div className="resource-detail-heading">
        <div>
          <div className="card-topline"><span className="resource-symbol"><Folder size={16}/></span><span className="badge badge-muted">Resource</span></div>
          <h2>{resource.title}</h2><p className="resource-detail-type">{resource.resourceTypeName || "Other"}</p>
        </div>
      </div>
      {resource.description && <section className="detail-section"><h3>Description</h3><p className="detail-note detail-note-body">{resource.description}</p></section>}
      {resource.notes.length > 0 && <section className="detail-section"><h3>Notes</h3><div className="resource-notes">{resource.notes.map((note, index) => <span key={note + index}>{note}</span>)}</div></section>}
      {resource.links.length > 0 && <section className="detail-section"><h3>Links</h3><div className="detail-links">{resource.links.map((link) => <a href={link} target="_blank" rel="noreferrer" key={link}><Link2 size={15}/><span>{link}</span><ArrowUpRight size={14}/></a>)}</div></section>}
      {(loading || error || attachments.length > 0) && <section className="detail-section"><h3>Attachments</h3>{loading ? <p className="detail-note">Loading attachments…</p> : error ? <p className="field-error" role="alert">{error}</p> : <div className="resource-attachment-grid">{attachments.map((attachment) => {
                    const kind = attachment.kind || mediaKind(attachment.name, attachment.type);
                    const extension = mediaExtension(attachment.name);
                    const previewImage = kind === "image" && Boolean(attachment.previewUrl) && extension !== "heic" && extension !== "heif";
                    const label = attachment.previewUrl ? attachment.name : `${attachment.name} unavailable`;
                    return attachment.previewUrl ? <button type="button" className="resource-attachment-link" onClick={() => openAttachment(attachment, resource.title)} key={attachment.id} aria-label={`Preview ${attachment.name}`}>
          <span className="resource-attachment-tile">
            <span className="resource-attachment-preview">{previewImage ? <Image src={attachment.previewUrl} alt="" width={320} height={180} unoptimized/> : kind === "video" ? <><span className="resource-play-mark" aria-hidden="true">▶</span><span className="resource-file-mark">VIDEO</span></> : <span className="resource-file-mark">{extension.toUpperCase() || "FILE"}</span>}</span>
            <span className="resource-attachment-copy"><strong>{attachment.name}</strong><small>{kind === "image" ? "Image" : kind === "video" ? "Video" : extension.toUpperCase() || "File"}</small></span>
          </span>
        </button> : <div className="resource-attachment-link is-unavailable" key={attachment.id} aria-label={label}>
          <span className="resource-attachment-tile"><span className="resource-attachment-preview"><span className="resource-file-mark">FILE</span></span><span className="resource-attachment-copy"><strong>{attachment.name}</strong><small>Unavailable</small></span></span>
        </div>;
                })}</div>}</section>}
      <div className="resource-detail-actions"><button className="button button-primary" onClick={() => onEdit(resource)}><Pencil size={15}/> Edit</button><button className="button button-ghost danger-text" onClick={() => void remove()}><Trash2 size={15}/> Delete</button></div>
    </section>
  </div>;
}
function ListIntro({ kicker, title, text, action, label }: {
    kicker: string;
    title: string;
    text: string;
    action: () => void;
    label: string;
}) { return <section className="list-intro"><div><p className="section-kicker">{kicker}</p><h2>{title}</h2><p className="muted">{text}</p></div><button className="button button-primary" onClick={action}><Plus size={17}/> {label}</button></section>; }
function AccountView({ theme, setTheme, accountEmail, household, resourceTypes = [], onResourceTypesChanged }: {
    theme: "light" | "dark";
    setTheme: (theme: "light" | "dark") => void;
    accountEmail?: string;
    household?: HouseholdContext;
    resourceTypes?: ResourceType[];
    onResourceTypesChanged?: (types: ResourceType[]) => void;
}) { const [displayName, setDisplayName] = useState(household?.displayName || ""); return <div className="page-stack narrow-page"><ListIntro kicker="Your account" title="Make CasaKeeper yours." text="Manage your account and workspace preferences." action={() => undefined} label=""/>{household && <ProfilePanel email={accountEmail || ""} initialName={displayName} onSaved={setDisplayName}/>}<section className="panel settings-panel account-panel"><div className="settings-heading"><div><p className="section-kicker">Account</p><h3>Account access</h3><span className="panel-subtitle">Signed in with Supabase Auth</span></div><CircleUserRound size={18}/></div><div className="setting-row"><div><strong>Email address</strong><span>{accountEmail || "Signed-in account"}</span></div></div><div className="setting-action"><span><strong>Sign out</strong><small>End this session on this device.</small></span><SignOutButton /></div></section>{household && <HouseholdPanel initial={household} displayNameOverride={displayName}/>}{household && onResourceTypesChanged && <ResourceTypePanel initial={resourceTypes} onChanged={onResourceTypesChanged}/>}<section className="panel settings-panel"><div className="settings-heading"><div><p className="section-kicker">Appearance</p><h3>Workspace preferences</h3><span className="panel-subtitle">Choose how CasaKeeper feels.</span></div><Sparkles size={18}/></div><div className="setting-row"><div><strong>Theme</strong><span>Switch between a light and dark workspace.</span></div><div className="segmented-control"><button className={theme === "light" ? "selected" : ""} onClick={() => setTheme("light")}>Light</button><button className={theme === "dark" ? "selected" : ""} onClick={() => setTheme("dark")}>Dark</button></div></div><div className="setting-row"><div><strong>Accent color</strong><span>White is the default accent.</span></div><span className="accent-choice"><i /> White <Check size={15}/></span></div></section></div>; }
function EmptyState({ icon: Icon, title, text, action, actionLabel }: {
    icon: typeof ClipboardCheck;
    title: string;
    text: string;
    action?: () => void;
    actionLabel?: string;
}) { return <div className="empty-state"><span className="empty-icon"><Icon size={23}/></span><h3>{title}</h3><p>{text}</p>{action && <button className="button button-secondary" onClick={action}><Plus size={16}/> {actionLabel}</button>}</div>; }
function BlockerModal({ taskTitle, onClose, onSave }: {
    taskTitle: string;
    onClose: () => void;
    onSave: (text: string) => Promise<string | null>;
}) { const [text, setText] = useState(""); const [error, setError] = useState(""); const [saving, setSaving] = useState(false); useEffect(() => { const previousOverflow = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = previousOverflow; }; }, []); const submit = async (event: FormEvent) => { event.preventDefault(); const trimmed = text.trim(); if (!trimmed) {
    setError("Enter a blocker description.");
    return;
} setSaving(true); setError(""); try {
    const message = await onSave(trimmed);
    if (message)
        setError(message);
}
catch {
    setError("Unable to save the blocker.");
}
finally {
    setSaving(false);
} }; if (typeof document === "undefined")
    return null; return createPortal(<div className="modal-backdrop blocker-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving)
    onClose(); }}><div className="modal-card blocker-modal" role="dialog" aria-modal="true" aria-labelledby="blocker-modal-title"><div className="modal-header"><div><h2 id="blocker-modal-title"><span className="blocker-modal-icon"><AlertCircle size={17}/></span><span>Add blocker</span></h2><div className="blocker-task-context"><span>Task</span><strong>{taskTitle}</strong></div></div><button type="button" className="icon-button" onClick={onClose} disabled={saving} aria-label="Close add blocker dialog"><X size={18}/></button></div><form className="modal-form" onSubmit={submit}><div className="modal-body"><label htmlFor="blocker-description">Blocker description<textarea id="blocker-description" value={text} onChange={(event) => { setText(event.target.value); if (error)
    setError(""); }} placeholder="e.g. Waiting for materials to arrive" rows={3} autoFocus disabled={saving} aria-invalid={Boolean(error)}/></label>{error && <p className="field-error" role="alert">{error}</p>}</div><div className="form-footer"><button type="button" className="button button-ghost" onClick={onClose} disabled={saving}>Cancel</button><button type="submit" className="button button-primary" disabled={saving}>{saving ? "Saving…" : "Add blocker"}</button></div></form></div></div>, document.body); }
type FormValue = {
    title: string;
    description: string;
    frequency: string;
    link: string;
    notes: string;
    price?: string;
    type?: ItemType | null;
    scheduledDate?: string | null;
    scheduledTime?: string | null;
    resourceTypeId?: string;
    process: string[];
    processSteps?: ProcessStep[];
    links: string[];
    media: MediaAttachment[];
    resourceId?: string | number;
    resourceNotes?: string[];
    blockers: string[];
    additionalNotes: string;
    startDate: string;
    frequencyConfig: RoutineFrequency | null;
    endCondition?: RoutineEndCondition;
    frequencyOpen: boolean;
};
type FormModalProps = {
    kind: Exclude<ModalKind, null>;
    initial?: Partial<FormValue>;
    editing: boolean;
    onClose: () => void;
    onSave: (value: FormValue) => Promise<boolean>;
    onDelete?: () => Promise<string | null>;
    error?: string;
    resourceTypes?: ResourceType[];
};
function FormModal(props: FormModalProps) {
    const [activeSection, setActiveSection] = useState<AccordionSection | null>(() => props.kind === "task" && props.editing && Boolean(props.initial?.scheduledDate) ? "schedule" : null);
    useEffect(() => { const previousOverflow = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = previousOverflow; }; }, []);
    const content = props.kind === "resource" ? <ResourceFormModal {...props}/> : props.kind === "wishlist" ? <WishlistFormModal {...props}/> : <LegacyFormModal {...props}/>;
    return <AccordionContext.Provider value={{ activeSection, setActiveSection }}><ResourceTypesContext.Provider value={{ types: props.resourceTypes || [], required: props.kind === "task" || props.kind === "routine" }}>{content}</ResourceTypesContext.Provider></AccordionContext.Provider>;
}
function SpecialFormShell({ kind, editing, onClose, children, onSubmit }: {
    kind: "wishlist" | "resource";
    editing: boolean;
    onClose: () => void;
    children: React.ReactNode;
    onSubmit: (event: FormEvent) => void;
}) { const title = kind === "wishlist" ? "New Wishlist Item" : "New Resource"; if (typeof document === "undefined")
    return null; return createPortal(<div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget)
    onClose(); }}><div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-header"><div><p className="section-kicker">{editing ? "Edit item" : "Quick add"}</p><h2 id="modal-title">{title}</h2><p>{kind === "wishlist" ? "Save something you'd like to purchase later." : "Keep a useful home reference close by."}</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X size={18}/></button></div><form className="modal-form" onSubmit={onSubmit}><div className="modal-body">{children}</div><div className="form-footer"><button type="button" className="button button-ghost" onClick={onClose}>Cancel</button><button type="submit" className="button button-primary">{editing ? "Save changes" : "Save " + kind}</button></div></form></div></div>, document.body); }
function WishlistFormModal({ initial, editing, onClose, onSave, error }: FormModalProps) { const initialLinks = wishlistLinks(initial || {}); const [value, setValue] = useState<FormValue>({ title: "", description: "", frequency: "Weekly", link: "", notes: "", price: "", process: [], media: [], blockers: [], additionalNotes: "", startDate: "2026-01-01", frequencyConfig: null, frequencyOpen: false, ...initial, links: initialLinks }); const [saving, setSaving] = useState(false); const update = (key: keyof FormValue, next: string | string[]) => setValue((current) => ({ ...current, [key]: next })); const priceCents = parseWishlistPrice(value.price || ""); const invalidPrice = Boolean((value.price || "").trim()) && priceCents === undefined; const validLinks = value.links.every((link) => !link.trim() || /^https?:\/\/\S+$/i.test(link.trim())); return <SpecialFormShell kind="wishlist" editing={editing} onClose={onClose} onSubmit={async (event) => { event.preventDefault(); if (saving)
    return; if (invalidPrice || !value.title.trim())
    return; if (!validLinks) {
    const linksSection = document.getElementById("repeatable-links");
    if (linksSection)
        linksSection.hidden = false;
    requestAnimationFrame(() => document.querySelector<HTMLInputElement>("#repeatable-links input")?.focus());
    return;
} setSaving(true); try {
    await onSave(value);
}
finally {
    setSaving(false);
} }}><label>Title<span className="required">*</span><input required value={value.title} onChange={(event) => update("title", event.target.value)} autoFocus/></label><label>Price<span className="field-help">Optional USD</span><div className="input-with-icon"><span className="currency-prefix">$</span><input value={value.price || ""} onChange={(event) => update("price", event.target.value)} inputMode="decimal" pattern="^\d+(\.\d{1,2})?$" placeholder="0.00" aria-invalid={invalidPrice}/></div>{invalidPrice && <span className="field-error">Enter a nonnegative amount with up to two decimals.</span>}</label><RepeatableField label="Links" values={value.links} placeholder="https://" type="url" error={!validLinks} onAdd={() => update("links", [...value.links, ""])} onRemove={(index) => update("links", value.links.filter((_, rowIndex) => rowIndex !== index))} onChange={(index, next) => update("links", value.links.map((link, rowIndex) => rowIndex === index ? next : link))}/><label>Additional Notes<textarea value={value.notes} onChange={(event) => update("notes", event.target.value)} rows={3}/></label>{error && <p className="field-error" role="alert">{error}</p>}</SpecialFormShell>; }
function ResourceFormModal({ initial, editing, onClose, onSave, error, resourceTypes = [] }: FormModalProps) { const [value, setValue] = useState<FormValue>({ title: "", description: "", frequency: "Weekly", link: "", notes: "", price: "", resourceTypeId: resourceTypes[0]?.id, process: [], links: [], media: [], blockers: [], additionalNotes: "", startDate: "2026-01-01", frequencyConfig: null, frequencyOpen: false, ...initial, resourceNotes: initial?.resourceNotes || [] }); const [saving, setSaving] = useState(false); const { setActiveSection } = useContext(AccordionContext); const links = value.links.length ? value.links : value.link ? [value.link] : []; const update = (key: keyof FormValue, next: string | string[] | MediaAttachment[]) => setValue((current) => ({ ...current, [key]: next })); useEffect(() => { if (!value.resourceId)
    return; let cancelled = false; fetch(`/api/resources/${encodeURIComponent(String(value.resourceId))}/attachments`).then(async (response) => response.ok ? response.json() : null).then((body) => { if (cancelled || !body?.attachments)
    return; setValue((current) => ({ ...current, media: current.media.map((file) => { const match = body.attachments.find((attachment: {
        id: string;
        signedUrl: string;
    }) => attachment.id === file.id); return match ? { ...file, previewUrl: match.signedUrl } : file; }) })); }).catch(() => undefined); return () => { cancelled = true; }; }, [value.resourceId]); const addFiles = (files: File[]) => { update("media", [...value.media, ...createMediaAttachments(files)]); }; const validLinks = links.every((link) => !link.trim() || /^https?:\/\/\S+$/i.test(link.trim())); return <SpecialFormShell kind="resource" editing={editing} onClose={onClose} onSubmit={async (event) => { event.preventDefault(); if (saving)
    return; if (!value.title.trim())
    return; if (!validLinks) {
    setActiveSection("links");
    requestAnimationFrame(() => document.querySelector<HTMLInputElement>("#repeatable-links input")?.focus());
    return;
} setSaving(true); try {
    await onSave(value);
}
finally {
    setSaving(false);
} }}><label>Title<span className="required">*</span><input required value={value.title} onChange={(event) => update("title", event.target.value)} autoFocus/></label><label>Description<textarea value={value.description} onChange={(event) => update("description", event.target.value)} rows={3}/></label><label>Type<select required value={value.resourceTypeId || ""} onChange={(event) => update("resourceTypeId", event.target.value)}><option value="">Select a type</option>{resourceTypes.map((type) => <option value={type.id} key={type.id}>{type.name}</option>)}</select></label><RepeatableField label="Links" values={links} placeholder="https://" type="url" error={!validLinks} onAdd={() => update("links", [...links, ""])} onRemove={(index) => update("links", links.filter((_, rowIndex) => rowIndex !== index))} onChange={(index, next) => update("links", links.map((link, rowIndex) => rowIndex === index ? next : link))}/><RepeatableField label="Notes" values={value.resourceNotes || []} placeholder="Add a note" onAdd={() => update("resourceNotes", [...(value.resourceNotes || []), ""])} onRemove={(index) => update("resourceNotes", (value.resourceNotes || []).filter((_, rowIndex) => rowIndex !== index))} onChange={(index, next) => update("resourceNotes", (value.resourceNotes || []).map((note, rowIndex) => rowIndex === index ? next : note))}/><MediaField files={value.media} onAdd={addFiles} onRemove={(id) => update("media", value.media.filter((file) => file.id !== id))}/><p className="session-note">Up to 10 files per upload, 50 MiB per file, 100 MiB total.</p>{error && <p className="field-error" role="alert">{error}</p>}</SpecialFormShell>; }
function ItemTypeField({ value, onChange }: {
    value: FormValue;
    onChange: (key: keyof FormValue, value: string | null) => void;
}) {
    return <label><span className="field-label">Type (optional)</span><select value={value.type || ""} onChange={(event) => onChange("type", event.target.value || null)}><option value="">No Type Selected</option>{ITEM_TYPES.map((type) => <option value={type.value} key={type.value}>{type.label}</option>)}</select></label>;
}
function TaskScheduleField({ value, onChange }: {
    value: FormValue;
    onChange: (key: keyof FormValue, value: string | null) => void;
}) {
    const { activeSection, setActiveSection } = useContext(AccordionContext);
    const open = activeSection === "schedule";
    const summary = value.scheduledDate ? `${formatDate(value.scheduledDate)} · ${formatLocalTime(value.scheduledTime) || "All day"}` : "None scheduled";
    const setOpen = () => setActiveSection(toggleAccordion(activeSection, "schedule"));
    return <><ItemTypeField value={value} onChange={onChange}/><section className="repeatable-accordion schedule-field"><button type="button" className="schedule-accordion-trigger" aria-expanded={open} aria-controls="task-schedule-panel" onClick={setOpen}><span className="schedule-accordion-title">Schedule</span><span className="schedule-accordion-summary">{summary}<ChevronRight size={16} className={open ? "schedule-chevron is-open" : "schedule-chevron"}/></span></button><div id="task-schedule-panel" className="schedule-accordion-panel" hidden={!open}><label><span className="field-label">Date (optional)</span><input type="date" value={value.scheduledDate || ""} onChange={(event) => { const next = normalizeTaskDate(event.target.value); onChange("scheduledDate", next); if (!next)
        onChange("scheduledTime", null); }}/></label><label><span className="field-label">Time (optional)</span><input type="time" value={value.scheduledTime || ""} disabled={!value.scheduledDate} onChange={(event) => onChange("scheduledTime", normalizeLocalTime(event.target.value))}/><span className="field-help">No time means All day.</span></label></div></section></>;
}
function LegacyFormModal({ kind, initial, editing, onClose, onSave, onDelete }: FormModalProps) {
    const defaults: FormValue = { title: "", description: "", frequency: "Weekly", link: "", notes: "", price: "", type: null, scheduledDate: null, scheduledTime: null, process: [], links: [], media: [], blockers: [], additionalNotes: "", startDate: "2026-01-01", frequencyConfig: null, endCondition: { type: "indefinite" }, frequencyOpen: false };
    const [value, setValue] = useState<FormValue>({ ...defaults, ...initial });
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState("");
    useEffect(() => { if (!initial) {
        const timer = window.setTimeout(() => { const currentDate = dateKey(); setValue((current) => ({ ...current, startDate: currentDate })); }, 0);
        return () => window.clearTimeout(timer);
    } }, [initial]);
    const labels = { task: ["New Task", "Add a focused task to your household list."], routine: ["New Routine", "Set up a recurring responsibility for the household."], wishlist: ["New Wishlist Item", "Save something you'd like to purchase later."], resource: ["New Resource", "Keep a useful home reference close by."] }[kind];
    const update = (key: keyof FormValue, next: string | null | string[] | MediaAttachment[] | RoutineFrequency | RoutineEndCondition | boolean) => setValue((current) => ({ ...current, [key]: next }));
    const addRow = (key: "process" | "links" | "blockers") => update(key, [...value[key], ""]);
    const removeRow = (key: "process" | "links" | "blockers", index: number) => update(key, value[key].filter((_, rowIndex) => rowIndex !== index));
    const updateRow = (key: "process" | "links" | "blockers", index: number, next: string) => update(key, value[key].map((row, rowIndex) => rowIndex === index ? next : row));
    const addFiles = (files: File[]) => { update("media", [...value.media, ...createMediaAttachments(files)]); };
    const removeFile = (id: string) => { const attachment = value.media.find((file) => file.id === id); if (attachment?.previewUrl)
        URL.revokeObjectURL(attachment.previewUrl); update("media", value.media.filter((file) => file.id !== id)); };
    const validLinks = value.links.every((link) => !link.trim() || /^https?:\/\/\S+$/i.test(link.trim()));
    useEffect(() => { const handler = (event: Event) => { const detail = (event as CustomEvent<{
        id: string;
        resourceTypeId: string;
    }>).detail; if (!detail?.id)
        return; setValue((current) => ({ ...current, media: current.media.map((file) => file.id === detail.id ? { ...file, resourceTypeId: detail.resourceTypeId } : file) })); }; document.addEventListener("casakeeper-media-type", handler); return () => document.removeEventListener("casakeeper-media-type", handler); }, []);
    useEffect(() => { const previousOverflow = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = previousOverflow; }; }, []);
    if (typeof document === "undefined")
        return null;
    return createPortal(<div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !deleteConfirmOpen && !deleting)
        onClose(); }}><div className={"modal-card " + (kind === "task" ? "task-modal" : "")} role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-header"><div><p className="section-kicker">{editing ? "Edit item" : "Quick add"}</p><h2 id="modal-title">{labels[0]}</h2><p>{labels[1]}</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X size={18}/></button></div><form className="modal-form" onSubmit={(event: FormEvent) => { event.preventDefault(); if (kind === "task" && !validLinks)
        return; onSave(value); }}><div className="modal-body"><label>Title<span className="required">*</span><input value={value.title} onChange={(event) => update("title", event.target.value)} required autoFocus placeholder={kind === "task" ? "e.g. Book a plumber" : kind === "routine" ? "e.g. Clean the coffee machine" : kind === "wishlist" ? "e.g. New bath towels" : "e.g. Washing machine notes"}/></label>{(kind === "task" || kind === "resource") && <label>Description<textarea value={value.description} onChange={(event) => update("description", event.target.value)} placeholder="Add a little context" rows={3}/></label>}{kind === "task" && <><TaskScheduleField value={value} onChange={(key, nextValue) => update(key, nextValue)}/><RepeatableField label="Process" values={value.process} placeholder="Describe the next step" onAdd={() => addRow("process")} onRemove={(index) => removeRow("process", index)} onChange={(index, next) => updateRow("process", index, next)}/><RepeatableField label="Links" values={value.links} placeholder="https://" type="url" error={!validLinks} onAdd={() => addRow("links")} onRemove={(index) => removeRow("links", index)} onChange={(index, next) => updateRow("links", index, next)}/><MediaField files={value.media} onAdd={addFiles} onRemove={removeFile}/><RepeatableField label="Blockers" values={value.blockers} placeholder="What is preventing completion?" onAdd={() => addRow("blockers")} onRemove={(index) => removeRow("blockers", index)} onChange={(index, next) => updateRow("blockers", index, next)}/><label>Additional Notes<textarea value={value.additionalNotes} onChange={(event) => update("additionalNotes", event.target.value)} placeholder="Anything else to remember" rows={3}/></label></>}{kind === "routine" && <RoutineScheduleFields value={value} onChange={(key, next) => update(key, next)}/>}{(kind === "wishlist" || kind === "resource") && <label>{kind === "wishlist" ? "Link" : "Reference link"}<div className="input-with-icon"><Link2 size={16}/><input value={value.link} onChange={(event) => update("link", event.target.value)} type="url" placeholder="https://"/></div></label>}{(kind === "wishlist" || kind === "resource") && <label>{kind === "wishlist" ? "Notes" : "First note"}<textarea value={value.notes} onChange={(event) => update("notes", event.target.value)} placeholder="Optional details" rows={2}/></label>}{kind === "routine" && editing && onDelete && <div className="modal-danger-action"><button type="button" className="button button-danger" onClick={() => { setDeleteError(""); setDeleteConfirmOpen(true); }} disabled={deleting}><Trash2 size={16}/> Delete Routine</button></div>}</div><div className="form-footer">{kind === "task" && editing && onDelete && <button type="button" className="button button-danger" onClick={() => { setDeleteError(""); setDeleteConfirmOpen(true); }} disabled={deleting}><Trash2 size={16}/> Delete Task</button>}<button type="button" className="button button-ghost" onClick={onClose} disabled={deleting}>Cancel</button><button type="submit" className="button button-primary" disabled={deleting}>{editing ? "Save changes" : "Save " + kind}</button></div></form>{deleteConfirmOpen && <div className="modal-confirm-backdrop" role="presentation"><div className="modal-confirm" role="alertdialog" aria-modal="true" aria-labelledby="delete-item-title" aria-describedby="delete-item-description"><div className="modal-confirm-header"><Trash2 size={18}/><h3 id="delete-item-title">Delete {kind === "task" ? "Task" : "Routine"}?</h3></div><p id="delete-item-description">Delete <strong>{value.title || (kind === "task" ? "this task" : "this routine")}</strong> permanently? {kind === "task" ? "Any associated Resources will remain in your Resources library." : "Its occurrence history will also be removed. This cannot be undone."}</p>{deleteError && <p className="field-error" role="alert">{deleteError}</p>}<div className="modal-confirm-actions"><button type="button" className="button button-ghost" onClick={() => setDeleteConfirmOpen(false)} disabled={deleting}>Cancel</button><button type="button" className="button button-danger" onClick={async () => { if (!onDelete || deleting)
        return; setDeleting(true); setDeleteError(""); const message = await onDelete(); if (message) {
        setDeleteError(message);
        setDeleting(false);
    }
    else {
        onClose();
    } }} disabled={deleting}>{deleting ? "Deleting…" : "Delete " + (kind === "task" ? "Task" : "Routine")}</button></div></div></div>}</div></div>, document.body);
}
function RoutineScheduleCard(props: {
    value: FormValue;
    onChange: (key: "startDate" | "frequencyConfig" | "frequencyOpen", value: string | RoutineFrequency | boolean) => void;
}) {
    const { activeSection, setActiveSection } = useContext(AccordionContext);
    const controlledValue = { ...props.value, frequencyOpen: activeSection === "frequency" };
    const controlledOnChange = (key: "startDate" | "frequencyConfig" | "frequencyOpen", next: string | RoutineFrequency | boolean) => {
        if (key === "frequencyOpen") {
            setActiveSection(next ? "frequency" : null);
            return;
        }
        props.onChange(key, next);
    };
    return <><RoutineFrequencyValidation value={controlledValue} onOpen={() => setActiveSection("frequency")}/><LegacyRoutineScheduleCard value={controlledValue} onChange={controlledOnChange}/></>;
}
function RoutineFrequencyValidation({ value, onOpen }: {
    value: FormValue;
    onOpen: () => void;
}) { return <select className="routine-frequency-validation" aria-label="Frequency" required value={value.frequencyConfig?.type ?? ""} onChange={() => undefined} onInvalid={() => { onOpen(); window.requestAnimationFrame(() => document.querySelector<HTMLSelectElement>("#routine-frequency-panel select")?.focus()); }}><option value="">Select frequency</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select>; }
function LegacyRoutineScheduleCard({ value, onChange }: {
    value: FormValue;
    onChange: (key: "startDate" | "frequencyConfig" | "frequencyOpen", value: string | RoutineFrequency | boolean) => void;
}) {
    const config = value.frequencyConfig;
    const startDate = new Date(value.startDate + "T00:00:00");
    const startWeekday = startDate.getDay();
    const startDay = Number(value.startDate.slice(-2)) || 1;
    const startMonth = Number(value.startDate.slice(5, 7)) || 1;
    const setFrequency = (frequency: RoutineFrequency) => onChange("frequencyConfig", frequency);
    const setType = (type: RoutineFrequency["type"]) => {
        if (type === "daily")
            setFrequency({ type, mode: "interval", interval: 1 });
        if (type === "weekly")
            setFrequency({ type, interval: 1, weekdays: [startWeekday] });
        if (type === "monthly")
            setFrequency({ type, mode: "day", day: Math.min(startDay, 31), interval: 1 });
        if (type === "yearly")
            setFrequency({ type, mode: "date", month: startMonth, day: Math.min(startDay, 31) });
    };
    if (!config)
        return <section className="schedule-accordion is-required"><button type="button" className="schedule-accordion-trigger" aria-expanded={value.frequencyOpen} aria-controls="routine-frequency-panel" onClick={() => onChange("frequencyOpen", !value.frequencyOpen)}><span className="schedule-accordion-title">Frequency <span className="required">*</span></span><span className="schedule-accordion-summary">Selection required<ChevronRight size={16} className={value.frequencyOpen ? "schedule-chevron is-open" : "schedule-chevron"}/></span></button>{value.frequencyOpen && <div id="routine-frequency-panel" className="schedule-accordion-panel"><div className="schedule-section"><label>Frequency<select required aria-describedby="routine-frequency-error" value="" onChange={(event) => setType(event.target.value as RoutineFrequency["type"])}><option value="">Select frequency</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></label><p id="routine-frequency-error" className="frequency-error" role="alert">Choose a frequency to continue.</p></div></div>}</section>;
    const setInterval = (interval: number) => {
        const next = Math.max(1, interval || 1);
        if (config.type === "daily")
            setFrequency({ ...config, interval: next });
        if (config.type === "weekly")
            setFrequency({ ...config, interval: next });
        if (config.type === "monthly")
            setFrequency({ ...config, interval: next });
    };
    const toggleWeekday = (day: number) => {
        if (config.type !== "weekly")
            return;
        const selected = config.weekdays.includes(day) ? config.weekdays.filter((item) => item !== day) : [...config.weekdays, day].sort();
        setFrequency({ ...config, weekdays: selected.length ? selected : [day] });
    };
    const ordinalControl = (ordinal: Ordinal, weekday: number, month?: number) => <div className="schedule-grid"><label>Which<select value={ordinal} onChange={(event) => setFrequency({ ...config, ordinal: event.target.value as Ordinal } as RoutineFrequency)}>{ordinalLabels.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label><label>Weekday<select value={weekday} onChange={(event) => setFrequency({ ...config, weekday: Number(event.target.value) } as RoutineFrequency)}>{weekdays.map((label, day) => <option value={day} key={label}>{label}</option>)}</select></label>{month !== undefined && <label>Month<select value={month} onChange={(event) => setFrequency({ ...config, month: Number(event.target.value) } as RoutineFrequency)}>{Array.from({ length: 12 }, (_, index) => <option value={index + 1} key={index}>{new Date(2020, index, 1).toLocaleString("en-US", { month: "long" })}</option>)}</select></label>}</div>;
    const weekdayGrid = config.type === "weekly" && <div className="weekday-picker"><span>Repeat on</span><div className="weekday-grid">{weekdays.map((label, day) => <button type="button" className={"weekday-toggle " + (config.weekdays.includes(day) ? "selected" : "")} aria-pressed={config.weekdays.includes(day)} key={label} onClick={() => toggleWeekday(day)}>{label}</button>)}</div></div>;
    return <section className="schedule-accordion"><button type="button" className="schedule-accordion-trigger" aria-expanded={value.frequencyOpen} aria-controls="routine-frequency-panel" onClick={() => onChange("frequencyOpen", !value.frequencyOpen)}><span className="schedule-accordion-title">Frequency <span className="required">*</span></span><span className="schedule-accordion-summary">{summarizeFrequency(config)}<ChevronRight size={16} className={value.frequencyOpen ? "schedule-chevron is-open" : "schedule-chevron"}/></span></button>{value.frequencyOpen && <div id="routine-frequency-panel" className="schedule-accordion-panel"><div className="schedule-section"><label>Frequency<select value={config.type} onChange={(event) => setType(event.target.value as RoutineFrequency["type"])}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></label>{config.type === "daily" && <div className="schedule-options"><label className="schedule-radio"><input type="radio" name="daily-mode" checked={config.mode === "weekday"} onChange={() => setFrequency({ type: "daily", mode: "weekday", interval: 1 })}/><span>Every weekday <small>Monday - Friday</small></span></label><label className="schedule-radio"><input type="radio" name="daily-mode" checked={config.mode === "interval"} onChange={() => setFrequency({ type: "daily", mode: "interval", interval: config.interval || 1 })}/><span className="inline-schedule-label">Every <input type="number" min={1} value={config.interval} onChange={(event) => setFrequency({ type: "daily", mode: "interval", interval: Math.max(1, Number(event.target.value) || 1) })}/> day(s)</span></label></div>}{config.type === "weekly" && <><label>Repeat every <span className="inline-schedule-label"><input type="number" min={1} value={config.interval} onChange={(event) => setInterval(Number(event.target.value))}/> week(s)</span></label>{weekdayGrid}</>}{config.type === "monthly" && <div className="schedule-options"><label className="schedule-radio"><input type="radio" name="monthly-mode" checked={config.mode === "day"} onChange={() => setFrequency({ type: "monthly", mode: "day", day: config.mode === "day" ? config.day : startDay, interval: config.interval || 1 })}/><span className="inline-schedule-label">On day <input type="number" min={1} max={31} value={config.mode === "day" ? config.day : startDay} onChange={(event) => setFrequency({ type: "monthly", mode: "day", day: Math.min(31, Math.max(1, Number(event.target.value) || 1)), interval: config.interval || 1 })}/> of every <input type="number" min={1} value={config.interval || 1} onChange={(event) => setInterval(Number(event.target.value))}/> month(s)</span></label><label className="schedule-radio"><input type="radio" name="monthly-mode" checked={config.mode === "ordinal"} onChange={() => setFrequency({ type: "monthly", mode: "ordinal", ordinal: config.mode === "ordinal" ? config.ordinal : "first", weekday: config.mode === "ordinal" ? config.weekday : startWeekday, interval: config.interval || 1 })}/><span>On the selected weekday</span></label>{config.mode === "ordinal" && <>{ordinalControl(config.ordinal, config.weekday)}<label>Every <span className="inline-schedule-label"><input type="number" min={1} value={config.interval} onChange={(event) => setInterval(Number(event.target.value))}/> month(s)</span></label></>}</div>}{config.type === "yearly" && <div className="schedule-options"><label className="schedule-radio"><input type="radio" name="yearly-mode" checked={config.mode === "date"} onChange={() => setFrequency({ type: "yearly", mode: "date", month: config.mode === "date" ? config.month : startMonth, day: config.mode === "date" ? config.day : startDay })}/><span className="inline-schedule-label">On every <select value={config.mode === "date" ? config.month : startMonth} onChange={(event) => setFrequency({ type: "yearly", mode: "date", month: Number(event.target.value), day: config.mode === "date" ? config.day : startDay })}>{Array.from({ length: 12 }, (_, index) => <option value={index + 1} key={index}>{new Date(2020, index, 1).toLocaleString("en-US", { month: "long" })}</option>)}</select><input type="number" min={1} max={31} value={config.mode === "date" ? config.day : startDay} onChange={(event) => setFrequency({ type: "yearly", mode: "date", month: config.mode === "date" ? config.month : startMonth, day: Math.min(31, Math.max(1, Number(event.target.value) || 1)) })}/></span></label><label className="schedule-radio"><input type="radio" name="yearly-mode" checked={config.mode === "ordinal"} onChange={() => setFrequency({ type: "yearly", mode: "ordinal", ordinal: config.mode === "ordinal" ? config.ordinal : "first", weekday: config.mode === "ordinal" ? config.weekday : startWeekday, month: config.mode === "ordinal" ? config.month : startMonth })}/><span>On the selected weekday</span></label>{config.mode === "ordinal" && ordinalControl(config.ordinal, config.weekday, config.month)}</div>}<p className="schedule-note">Monthly dates clamp to the last valid day. February 29 uses February 28 in non-leap years.</p></div></div>}</section>;
}
function RoutineEndConditionFields({ value, onChange }: {
    value: FormValue;
    onChange: (next: RoutineEndCondition) => void;
}) {
    const endCondition = value.endCondition || { type: "indefinite" as const };
    const schedule = value.frequencyConfig ? { id: "estimate", startDate: value.startDate, frequency: value.frequencyConfig, completedDates: {} } : null;
    const estimatedDate = endCondition.type === "count" && schedule ? scheduledOccurrenceDate(schedule, Math.max(1, endCondition.count)) : endCondition.type === "date" ? endCondition.date : null;
    const dateCount = endCondition.type === "date" && schedule ? countScheduledOccurrencesThrough(schedule, endCondition.date) : null;
    return <section className="routine-end-condition"><h3>End condition</h3><div className="schedule-options"><label className="schedule-radio"><input type="radio" name="routine-end-condition" checked={endCondition.type === "indefinite"} onChange={() => onChange({ type: "indefinite" })}/><span>Indefinite</span></label><label className="schedule-radio"><input type="radio" name="routine-end-condition" checked={endCondition.type === "count"} onChange={() => onChange({ type: "count", count: endCondition.type === "count" ? Math.max(1, endCondition.count) : 1 })}/><span className="inline-schedule-label">After <input type="number" min={1} value={endCondition.type === "count" ? endCondition.count : 1} onChange={(event) => onChange({ type: "count", count: Math.max(1, Number(event.target.value) || 1) })}/> occurrences</span></label><div className="schedule-radio schedule-radio-stacked"><label className="schedule-radio-choice"><input type="radio" name="routine-end-condition" checked={endCondition.type === "date"} onChange={() => onChange({ type: "date", date: endCondition.type === "date" ? endCondition.date : value.startDate })}/><span>On a specific date</span></label>{endCondition.type === "date" && <div className="specific-date-control"><input aria-label="Routine end date" type="date" min={value.startDate} value={endCondition.date} onChange={(event) => onChange({ type: "date", date: event.target.value })}/></div>}</div></div>{estimatedDate && <p className="schedule-note">Estimated final scheduled date: {formatDate(estimatedDate)}.</p>}{endCondition.type === "date" && dateCount === 0 && <p className="frequency-error" role="alert">This date contains no scheduled occurrences for the selected frequency.</p>}{endCondition.type === "date" && dateCount !== null && dateCount > 0 && <p className="schedule-note">This ends after {dateCount} scheduled occurrence{dateCount === 1 ? "" : "s"}.</p>}</section>;
}
function RoutineScheduleFields({ value, onChange }: {
    value: FormValue;
    onChange: (key: "startDate" | "frequencyConfig" | "frequencyOpen" | "endCondition", value: string | RoutineFrequency | RoutineEndCondition | boolean) => void;
}) {
    const update = onChange as (key: keyof FormValue, value: string | null | string[] | MediaAttachment[] | RoutineFrequency | RoutineEndCondition | boolean) => void;
    const addRow = (key: "process" | "links" | "blockers") => update(key, [...value[key], ""]);
    const removeRow = (key: "process" | "links" | "blockers", index: number) => update(key, value[key].filter((_, rowIndex) => rowIndex !== index));
    const updateRow = (key: "process" | "links" | "blockers", index: number, next: string) => update(key, value[key].map((row, rowIndex) => rowIndex === index ? next : row));
    const addFiles = (files: File[]) => { update("media", [...value.media, ...createMediaAttachments(files)]); };
    const removeFile = (id: string) => update("media", value.media.filter((file) => file.id !== id));
    const validLinks = value.links.every((link) => !link || /^https?:\/\/\S+$/i.test(link));
    return <><ItemTypeField value={value} onChange={update}/><label><span className="field-label">Description</span><textarea value={value.description} onChange={(event) => update("description", event.target.value)} placeholder="Add a little context" rows={3}/></label><label className="routine-start-date"><span className="field-label">Start date <span className="required">*</span></span><input type="date" value={value.startDate} onChange={(event) => onChange("startDate", event.target.value)} onInvalid={() => onChange("frequencyOpen", true)} required/></label><label className="routine-scheduled-time"><span className="field-label">Time (optional)</span><input type="time" value={value.scheduledTime || ""} onChange={(event) => update("scheduledTime", normalizeLocalTime(event.target.value))}/><span className="field-help">No time means All day.</span></label><RoutineScheduleCard value={value} onChange={onChange}/><RoutineEndConditionFields value={value} onChange={(next) => update("endCondition", next)}/><RepeatableField label="Process" values={value.process} placeholder="Describe the next step" onAdd={() => addRow("process")} onRemove={(index) => removeRow("process", index)} onChange={(index, next) => updateRow("process", index, next)}/><RepeatableField label="Links" values={value.links} placeholder="https://" type="url" error={!validLinks} onAdd={() => addRow("links")} onRemove={(index) => removeRow("links", index)} onChange={(index, next) => updateRow("links", index, next)}/><label><span className="field-label">Additional Notes</span><textarea value={value.additionalNotes} onChange={(event) => update("additionalNotes", event.target.value)} placeholder="Anything else to remember" rows={3}/></label><MediaField files={value.media} onAdd={addFiles} onRemove={removeFile}/></>;
}
function RepeatableField({ label, values, placeholder, type = "text", error, onAdd, onRemove, onChange }: {
    label: string;
    values: string[];
    placeholder: string;
    type?: string;
    error?: boolean;
    onAdd: () => void;
    onRemove: (index: number) => void;
    onChange: (index: number, value: string) => void;
}) {
    const { activeSection, setActiveSection } = useContext(AccordionContext);
    const sectionKey = (label === "Process" ? "process" : label === "Links" ? "links" : "blockers") as AccordionSection;
    const open = activeSection === sectionKey;
    const controlId = "repeatable-" + label.toLowerCase().replace(/[^a-z]+/g, "-");
    const summary = error ? "Check links" : values.length ? `${values.length} ${label.toLowerCase()} ${values.length === 1 ? "item" : "items"}` : "None added";
    return <section className="repeatable-accordion"><button type="button" className="schedule-accordion-trigger" aria-expanded={open} aria-controls={controlId} onClick={() => setActiveSection(toggleAccordion(activeSection, sectionKey))}><span className="schedule-accordion-title">{label}</span><span className={error ? "schedule-accordion-summary field-error" : "schedule-accordion-summary"}>{summary}<ChevronRight size={16} className={open ? "schedule-chevron is-open" : "schedule-chevron"}/></span></button><div id={controlId} className="schedule-accordion-panel" hidden={!open}><div className="field-heading"><span>{values.length ? "Rows" : "Add your first row"}</span><button type="button" className="add-row-button" onClick={() => { setActiveSection(sectionKey); onAdd(); }}><Plus size={14}/> Add row</button></div>{values.map((row, index) => <div className="repeatable-row" key={index}>{label === "Process" && <span className="process-step-number" aria-hidden="true">{index + 1}</span>}<input type={type} value={row} onChange={(event) => onChange(index, event.target.value)} onInvalid={() => setActiveSection(sectionKey)} placeholder={placeholder} aria-label={label + " row " + (index + 1)}/><button type="button" className="icon-button danger-icon" onClick={() => onRemove(index)} aria-label={"Remove " + label + " row " + (index + 1)}><Trash2 size={15}/></button></div>)}{error && <span className="field-error">Use valid HTTP or HTTPS URLs.</span>}</div></section>;
}
function MediaField({ files, onAdd, onRemove }: {
    files: MediaAttachment[];
    onAdd: (files: File[]) => void;
    onRemove: (id: string) => void;
}) {
    const { types, required } = useContext(ResourceTypesContext);
    const [dragging, setDragging] = useState(false);
    const [dropError, setDropError] = useState("");
    const dragDepth = useRef(0);
    const acceptFiles = (incoming: File[]) => {
        const partitioned = partitionSupportedMediaFiles(incoming);
        const unsupported = partitioned.unsupported;
        if (unsupported.length)
            setDropError(`${unsupported.length} file${unsupported.length === 1 ? "" : "s"} skipped because the format is not supported.`);
        else
            setDropError("");
        const supported = partitioned.supported;
        if (supported.length)
            onAdd(supported);
    };
    const onDragEnter = (event: React.DragEvent<HTMLLabelElement>) => {
        event.preventDefault();
        event.stopPropagation();
        dragDepth.current += 1;
        setDragging(true);
    };
    const onDragLeave = (event: React.DragEvent<HTMLLabelElement>) => {
        event.preventDefault();
        event.stopPropagation();
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0)
            setDragging(false);
    };
    const onDrop = (event: React.DragEvent<HTMLLabelElement>) => {
        event.preventDefault();
        event.stopPropagation();
        dragDepth.current = 0;
        setDragging(false);
        acceptFiles(Array.from(event.dataTransfer.files));
    };
    const updateType = (id: string, resourceTypeId: string) => {
        const event = new CustomEvent("casakeeper-media-type", { detail: { id, resourceTypeId } });
        document.dispatchEvent(event);
    };
    return <div className="media-field"><div className="field-heading"><span>Media</span></div><label className={"upload-zone" + (dragging ? " is-dragging" : "")} onDragEnter={onDragEnter} onDragLeave={onDragLeave} onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = "copy"; }} onDrop={onDrop}><Upload size={21}/><span className="upload-title">Drag files here or click to browse.</span><span className="upload-help">Images, videos, PDF, Office files, TXT, and CSV</span><input type="file" accept={supportedMediaAccept} multiple onChange={(event) => { acceptFiles(Array.from(event.target.files || [])); event.target.value = ""; }}/></label>{dropError && <p className="field-error" role="alert">{dropError}</p>}{files.length > 0 && <div className="selected-files">{files.map((file) => { const kind = file.kind || mediaKind(file.name, file.type); const extension = mediaExtension(file.name); const previewImage = kind === "image" && file.previewUrl && extension !== "heic" && extension !== "heif"; return <div className="selected-file" key={file.id}>{previewImage ? <Image src={file.previewUrl as string} alt="" width={64} height={64} unoptimized/> : kind === "video" && file.previewUrl ? <video src={file.previewUrl} controls preload="metadata"/> : <span className="attachment-type-icon"><ExternalLink size={16}/></span>}<span className="attachment-copy"><strong>{file.name}</strong><small>{file.type || extension.toUpperCase()}</small></span>{required && file.file && <label className="attachment-type-select">Resource Type<select required value={file.resourceTypeId || ""} onChange={(event) => updateType(file.id, event.target.value)}><option value="">Select type</option>{types.map((type) => <option value={type.id} key={type.id}>{type.name}</option>)}</select></label>}{file.previewUrl && <a className="attachment-open" href={file.previewUrl} target="_blank" rel="noreferrer" download={file.name}>Open</a>}<button type="button" className="icon-button danger-icon" onClick={() => onRemove(file.id)} aria-label={"Remove " + file.name}><X size={15}/></button></div>; })}</div>}<p className="session-note">{required ? "New Task/Routine files become independent Resources; removing them removes only this association." : "Resource attachments are stored securely and remain available to the household."}</p></div>;
}
