export const supportedMediaExtensions = new Set(["jpg", "jpeg", "png", "heic", "heif", "webp", "gif", "mov", "mp4", "webm", "pdf", "doc", "docx", "txt", "xls", "xlsx", "csv"]);
export const supportedMediaAccept = ".jpg,.jpeg,.png,.heic,.heif,.webp,.gif,.mov,.mp4,.webm,.pdf,.doc,.docx,.txt,.xls,.xlsx,.csv,image/*,video/*,application/pdf,text/plain";

export function mediaExtension(name: string): string { return name.split(".").pop()?.toLowerCase() || ""; }
export function mediaKind(name: string, type: string): "image" | "video" | "document" {
  return type.startsWith("image/") || ["jpg", "jpeg", "png", "heic", "heif", "webp", "gif"].includes(mediaExtension(name)) ? "image" : type.startsWith("video/") || ["mov", "mp4", "webm"].includes(mediaExtension(name)) ? "video" : "document";
}
export function isSupportedMedia(name: string, type: string): boolean {
  return supportedMediaExtensions.has(mediaExtension(name)) || type.startsWith("image/") || type.startsWith("video/") || ["application/pdf", "text/plain"].includes(type);
}

export function partitionSupportedMediaFiles<T extends { name: string; type: string }>(files: readonly T[]) {
  return files.reduce<{ supported: T[]; unsupported: T[] }>((result, file) => {
    (isSupportedMedia(file.name, file.type) ? result.supported : result.unsupported).push(file);
    return result;
  }, { supported: [], unsupported: [] });
}
