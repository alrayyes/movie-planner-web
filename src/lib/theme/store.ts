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
  syncStarlightTheme(theme);
}

// #451: astro.config.mjs's `head` script keeps Starlight's own,
// independent theme ("starlight-theme" in localStorage, a `data-theme`
// attribute on <html> — see astro.config.mjs's own comment) in sync with
// this one on a docs page's first load. That only runs once, before
// paint — a later in-page toggle (this function) needs to keep pushing
// the same update itself, or the two would drift the moment a visitor
// actually uses the toggle on a docs page. `window.StarlightThemeProvider`
// is only ever defined by Starlight's own ThemeProvider.astro, so this
// is a no-op on every non-docs page.
function syncStarlightTheme(theme: Theme): void {
  if (typeof document === "undefined" || !("StarlightThemeProvider" in window)) return;
  try {
    localStorage.setItem("starlight-theme", theme);
  } catch {
    // Same fallback as setTheme's own localStorage write above.
  }
  document.documentElement.dataset.theme = theme;
}
