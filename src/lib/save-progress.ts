export const SAVE_PROGRESS_STAGES = [
    "Validating files",
    "Uploading attachments",
    "Saving details",
    "Finalizing",
] as const;

export function uploadProgressMessage(fileCount: number): string {
    const count = Math.max(0, Math.floor(fileCount));
    return `Uploading attachments (${count} ${count === 1 ? "file" : "files"})`;
}
