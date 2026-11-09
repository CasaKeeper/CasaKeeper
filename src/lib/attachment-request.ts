export const ATTACHMENT_REQUEST_TIMEOUT_MS = 60_000;
export const ATTACHMENT_CLEANUP_TIMEOUT_MS = 10_000;

export async function withAttachmentTimeout<T>(promise: Promise<T>, timeoutMs = ATTACHMENT_REQUEST_TIMEOUT_MS): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            promise,
            new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new Error("Attachment operation timed out. Please retry.")), timeoutMs);
            }),
        ]);
    }
    finally {
        if (timer !== undefined)
            clearTimeout(timer);
    }
}
