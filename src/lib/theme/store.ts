// Client-side only, like every other piece of visitor state in this app
// (credentials/types.ts) — no server to hold a preference in, so
// localStorage is the whole store. "system" isn't persisted as its own
// value; the absence of a stored key means "follow the OS", same as the
// inline head script's own check.
export type Theme = "light" | "dark";

const STORAGE_KEY = "movie-planner-web-theme";

export function getStoredTheme(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

export function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function currentTheme(): Theme {
  return getStoredTheme() ?? (systemPrefersDark() ? "dark" : "light");
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function setTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Falls back to applying it for this page view only; nothing to do
    // beyond that if storage is unavailable (private browsing, quota).
  }
  applyTheme(theme);
}
