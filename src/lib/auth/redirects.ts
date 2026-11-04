export function safeNextPath(value: string | null | undefined, fallback = "/") {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("://")) return fallback;
  return value;
}

export function authCallbackUrl(origin: string, nextPath?: string | null) {
  const next = safeNextPath(nextPath);
  return `${origin}/auth/callback?next=${encodeURIComponent(next)}`;
}
