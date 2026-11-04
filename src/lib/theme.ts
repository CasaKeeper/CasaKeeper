export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "casakeeper-theme";

export function getBrowserStorage(): Storage | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function parseTheme(value: string | null | undefined): Theme {
  return value === "dark" ? "dark" : "light";
}

export function readStoredTheme(storage?: Pick<Storage, "getItem">): Theme {
  try {
    return parseTheme(storage?.getItem(THEME_STORAGE_KEY));
  } catch {
    return "light";
  }
}

export function writeStoredTheme(theme: Theme, storage?: Pick<Storage, "setItem">): void {
  try {
    storage?.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Local storage may be unavailable; the in-memory theme still applies.
  }
}
