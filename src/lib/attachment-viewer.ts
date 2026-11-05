import { mediaExtension, mediaKind } from "./media.ts";

export type AttachmentPreviewMode = "image" | "video" | "pdf" | "fallback";

export function attachmentPreviewMode(name: string, mimeType: string): AttachmentPreviewMode {
  const kind = mediaKind(name, mimeType);
  if (kind === "image") return "image";
  if (kind === "video") return "video";
  if (mediaExtension(name) === "pdf" || mimeType.toLowerCase() === "application/pdf") return "pdf";
  return "fallback";
}
