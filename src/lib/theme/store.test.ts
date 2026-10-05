import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { applyTheme, currentTheme, getStoredTheme, setTheme, systemPrefersDark } from "./store";

// #749: the visitor's theme choice. Bun has no DOM, so each test installs the
// few globals the store touches and puts the originals back afterwards.
type G = Record<string, unknown>;
const g = globalThis as unknown as G;
const KEYS = ["localStorage", "window", "document"];
let saved: G;
let storage: Map<string, string>;
let failStorage: boolean;
let dark: boolean;
let classes: Map<string, boolean>;
let dataset: Record<string, string>;
let win: Record<string, unknown>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, g[k]]));
  storage = new Map();
  failStorage = false;
  dark = false;
  classes = new Map();
  dataset = {};
  win = {
    matchMedia: (query: string) => ({ matches: query === "(prefers-color-scheme: dark)" && dark }),
  };
  g.localStorage = {
    getItem: (key: string) => {
      if (failStorage) throw new Error("denied");
      return storage.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      if (failStorage) throw new Error("denied");
      storage.set(key, value);
    },
  };
  g.window = win;
  g.document = {
    documentElement: {
      dataset,
      classList: { toggle: (name: string, force: boolean) => classes.set(name, force) },
    },
  };
});
afterEach(() => {
  for (const k of KEYS) g[k] = saved[k];
});

describe("getStoredTheme", () => {
  test("returns a stored light or dark", () => {
    storage.set("movie-planner-web-theme", "light");
    expect(getStoredTheme()).toBe("light");
    storage.set("movie-planner-web-theme", "dark");
    expect(getStoredTheme()).toBe("dark");
  });

  test("returns null when nothing is stored", () => {
    expect(getStoredTheme()).toBeNull();
  });

  test("ignores a stored value that isn't a theme", () => {
    storage.set("movie-planner-web-theme", "sepia");
    expect(getStoredTheme()).toBeNull();
  });

  test("returns null when storage throws", () => {
    failStorage = true;
    expect(getStoredTheme()).toBeNull();
  });
});

describe("systemPrefersDark / currentTheme", () => {
  test("reads the OS colour scheme", () => {
    dark = true;
    expect(systemPrefersDark()).toBe(true);
    dark = false;
    expect(systemPrefersDark()).toBe(false);
  });

  test("follows the OS when nothing is stored", () => {
    dark = true;
    expect(currentTheme()).toBe("dark");
    dark = false;
    expect(currentTheme()).toBe("light");
  });

  test("a stored choice beats the OS", () => {
    dark = true;
    storage.set("movie-planner-web-theme", "light");
    expect(currentTheme()).toBe("light");
  });
});

describe("applyTheme", () => {
  test("toggles the dark class to match", () => {
    applyTheme("dark");
    expect(classes.get("dark")).toBe(true);
    applyTheme("light");
    expect(classes.get("dark")).toBe(false);
  });
});

describe("setTheme", () => {
  test("stores the choice and applies it", () => {
    setTheme("dark");
    expect(storage.get("movie-planner-web-theme")).toBe("dark");
    expect(classes.get("dark")).toBe(true);
  });

  test("still applies it for this page view when storage is unavailable", () => {
    failStorage = true;
    setTheme("dark");
    expect(classes.get("dark")).toBe(true);
  });

  test("leaves Starlight alone on a page without its theme provider", () => {
    setTheme("dark");
    expect(storage.has("starlight-theme")).toBe(false);
    expect(dataset.theme).toBeUndefined();
  });

  test("keeps Starlight's own theme in step on a docs page", () => {
    win.StarlightThemeProvider = {};
    setTheme("light");
    expect(storage.get("starlight-theme")).toBe("light");
    expect(dataset.theme).toBe("light");
  });

  test("still sets Starlight's data-theme when its storage write fails", () => {
    win.StarlightThemeProvider = {};
    failStorage = true;
    setTheme("dark");
    expect(dataset.theme).toBe("dark");
  });
});
