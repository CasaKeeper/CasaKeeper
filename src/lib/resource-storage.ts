export const RESOURCE_STORAGE_BUCKET = "casakeeper-private";
export const RESOURCE_STORAGE_MAX_BYTES = 50 * 1024 * 1024;
export const RESOURCE_SIGNED_URL_SECONDS = 10 * 60;
export const RESOURCE_UPLOAD_INTENT_SECONDS = 15 * 60;
export const MAX_RESOURCE_UPLOAD_FILES = 10;
export const MAX_RESOURCE_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_RESOURCE_UPLOAD_BYTES = 100 * 1024 * 1024;

const extensionMimeTypes: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", heic: "image/heic", heif: "image/heif", mov: "video/quicktime", mp4: "video/mp4", pdf: "application/pdf" };
const allowedMimeTypes = new Set(Object.values(extensionMimeTypes));

export function resourceFileExtension(name: string) {
  return name.split(".").pop()?.toLowerCase() || "";
}

export function isSupportedResourceFile(name: string, mimeType: string) {
  return canonicalResourceMime(name, mimeType) !== null;
}

export function canonicalResourceMime(name: string, browserMime: string) {
  const extensionMime = extensionMimeTypes[resourceFileExtension(name)];
  if (!extensionMime) return null;
  const normalized = browserMime.trim().toLowerCase();
  if (!normalized || normalized === "application/octet-stream" || normalized === "binary/octet-stream") return extensionMime;
  if (!allowedMimeTypes.has(normalized)) return null;
  return normalized === extensionMime ? extensionMime : null;
}

export function normalizeStoredMime(mime: unknown) {
  return typeof mime === "string" ? mime.trim().toLowerCase() : "";
}

export function storageInfoMime(info: unknown) {
  if (!info || typeof info !== "object") return "";
  const value = info as { contentType?: unknown; mimetype?: unknown };
  return normalizeStoredMime(value.contentType ?? value.mimetype);
}

export function matchesAuthorizedStoredMime(storedMime: unknown, authorizedMime: string) {
  const normalizedStoredMime = normalizeStoredMime(storedMime);
  return normalizedStoredMime !== "" && normalizedStoredMime === authorizedMime.trim().toLowerCase();
}

export function chunkStoragePaths(paths: string[], chunkSize: number) {
  const chunks: string[][] = [];
  for (let index = 0; index < paths.length; index += chunkSize) chunks.push(paths.slice(index, index + chunkSize));
  return chunks;
}

export function safeResourceFilename(name: string): string | null {
  const normalized = name.normalize("NFKC").trim();
  if (!normalized || normalized === "." || normalized === ".." || /[\\/\u0000-\u001f\u007f]/.test(normalized)) return null;
  const safe = normalized.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "").slice(0, 128);
  return safe || null;
}

export function resourceStoragePath(householdId: string, resourceId: string, attachmentId: string, filename: string) {
  return `${householdId}/resources/${resourceId}/${attachmentId}/${filename}`;
}
