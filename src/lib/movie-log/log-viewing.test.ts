import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { NewViewing } from "../caldav/types";
import type { Credentials } from "../credentials/types";
import {
  logManualViewing,
  OPEN_LOG_VIEWING_WIZARD_EVENT,
  reloadOnViewingSaved,
  VIEWING_SAVED_EVENT,
} from "./log-viewing";

const VIEWING: NewViewing = {
  title: "Dune",
  start: "2026-01-01T19:00:00.000Z",
  end: "2026-01-01T21:30:00.000Z",
  medium: "cinema",
};

const BASE: Credentials = {
  caldavUrl: "https://caldav.example.com/calendars/me/movies/",
  caldavUsername: "me",
  caldavPassword: "secret",
};

let originalFetch: typeof fetch;
let requests: URL[];

// Routes OMDb, TMDb and CalDAV by host, so a test only says what each one answers.
function route(answers: { omdb?: (url: URL) => unknown; tmdb?: (url: URL) => unknown }) {
  globalThis.fetch = (async (input: URL | string) => {
    const url = new URL(input.toString());
    requests.push(url);
    if (url.host === "www.omdbapi.com") {
      if (!answers.omdb) throw new Error("unexpected OMDb call");
      return new Response(JSON.stringify(answers.omdb(url)));
    }
    if (url.host === "api.themoviedb.org") {
      if (!answers.tmdb) throw new Error("unexpected TMDb call");
      return new Response(JSON.stringify(answers.tmdb(url)));
    }
    return new Response("", { status: 201 });
  }) as unknown as typeof fetch;
}

const OMDB_MATCH = { Response: "True", imdbID: "tt1160419", Director: "Denis Villeneuve" };
const TMDB_FIND = { movie_results: [{ id: 438631 }] };
const TMDB_MOVIE = { homepage: "https://example.com", budget: 0, popularity: 0 };

beforeEach(() => {
  originalFetch = globalThis.fetch;
  requests = [];
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("the wizard event name is namespaced to this app", () => {
  expect(OPEN_LOG_VIEWING_WIZARD_EVENT).toBe("movie-planner-web:open-log-viewing-wizard");
});

describe("logManualViewing", () => {
  test("logs the viewing as typed, with no OMDb call, when there's no OMDb key", async () => {
    route({});

    const result = await logManualViewing(BASE, VIEWING);

    expect(result.viewing.title).toBe("Dune");
    expect(result.omdbCandidates).toBeUndefined();
    expect(requests.every((u) => u.host === "caldav.example.com")).toBe(true);
  });

  test("makes no OMDb call while lookups are paused", async () => {
    route({});

    const result = await logManualViewing({ ...BASE, omdbApiKey: "k", omdbPaused: true }, VIEWING);

    expect(result.viewing.director).toBeUndefined();
    expect(requests.some((u) => u.host === "www.omdbapi.com")).toBe(false);
  });

  test("looks the title up with the watched year and attaches a confident match", async () => {
    route({ omdb: () => OMDB_MATCH });

    const result = await logManualViewing({ ...BASE, omdbApiKey: "k" }, VIEWING);

    const lookup = requests.find((u) => u.host === "www.omdbapi.com");
    expect(lookup?.searchParams.get("t")).toBe("Dune");
    expect(lookup?.searchParams.get("y")).toBe("2026");
    expect(result.viewing.director).toBe("Denis Villeneuve");
    expect(result.viewing.imdbId).toBe("tt1160419");
    expect(result.omdbCandidates).toBeUndefined();
  });

  test("adds TMDb's fields on top of a confident OMDb match", async () => {
    route({
      omdb: () => OMDB_MATCH,
      tmdb: (url) => (url.pathname.includes("/find/") ? TMDB_FIND : TMDB_MOVIE),
    });

    const result = await logManualViewing({ ...BASE, omdbApiKey: "k", tmdbApiKey: "t" }, VIEWING);

    expect(result.viewing.director).toBe("Denis Villeneuve");
    expect(result.viewing.website).toBe("https://example.com");
  });

  test("offers OMDb's candidates when there's no confident match", async () => {
    route({
      omdb: (url) =>
        url.searchParams.has("s")
          ? { Response: "True", Search: [{ imdbID: "tt1", Title: "Dune", Year: "1984" }] }
          : { Response: "False" },
    });

    const result = await logManualViewing({ ...BASE, omdbApiKey: "k" }, VIEWING);

    expect(result.omdbCandidates).toEqual([
      { title: "Dune", year: "1984", imdbId: "tt1", posterUrl: undefined },
    ]);
    expect(result.viewing.imdbId).toBeUndefined();
  });

  test("leaves the entry without metadata when OMDb finds nothing at all", async () => {
    route({ omdb: () => ({ Response: "False" }) });

    const result = await logManualViewing({ ...BASE, omdbApiKey: "k" }, VIEWING);

    expect(result.omdbCandidates).toBeUndefined();
    expect(result.viewing.title).toBe("Dune");
  });

  test("still logs the viewing when OMDb itself fails", async () => {
    globalThis.fetch = (async (input: URL | string) => {
      if (new URL(input.toString()).host === "www.omdbapi.com") throw new Error("offline");
      return new Response("", { status: 201 });
    }) as unknown as typeof fetch;

    const result = await logManualViewing({ ...BASE, omdbApiKey: "k" }, VIEWING);

    expect(result.viewing.title).toBe("Dune");
    expect(result.omdbCandidates).toBeUndefined();
  });

  // #893: logging must not depend on OMDb, but the visitor should be told why no
  // metadata was added when OMDb refused, not left to think the title had none.
  test.each([
    [429, "OMDb isn't answering (HTTP 429). Try again in a moment."],
    [401, "OMDb isn't answering (HTTP 401). Try again in a moment."],
  ])("says why metadata was skipped when OMDb answers HTTP %d", async (status, message) => {
    globalThis.fetch = (async (input: URL | string) =>
      new URL(input.toString()).host === "www.omdbapi.com"
        ? new Response("", { status })
        : new Response("", { status: 201 })) as unknown as typeof fetch;

    const result = await logManualViewing({ ...BASE, omdbApiKey: "k" }, VIEWING);

    expect(result.viewing.title).toBe("Dune");
    expect(result.omdbSkippedBecause).toBe(message);
  });

  test("says why when OMDb answers a quota refusal in a 200", async () => {
    route({ omdb: () => ({ Response: "False", Error: "Request limit reached!" }) });

    const result = await logManualViewing({ ...BASE, omdbApiKey: "k" }, VIEWING);

    expect(result.omdbSkippedBecause).toBe("OMDb refused the request: Request limit reached!");
  });

  test("says why when OMDb can't be reached at all", async () => {
    globalThis.fetch = (async (input: URL | string) => {
      if (new URL(input.toString()).host === "www.omdbapi.com") throw new Error("offline");
      return new Response("", { status: 201 });
    }) as unknown as typeof fetch;

    const result = await logManualViewing({ ...BASE, omdbApiKey: "k" }, VIEWING);

    expect(result.omdbSkippedBecause).toBe("OMDb isn't answering. Try again in a moment.");
  });

  test("says nothing when OMDb simply has no match, has a match, or isn't in use", async () => {
    route({ omdb: () => ({ Response: "False", Error: "Movie not found!" }) });
    expect(
      (await logManualViewing({ ...BASE, omdbApiKey: "k" }, VIEWING)).omdbSkippedBecause,
    ).toBeUndefined();

    route({ omdb: () => OMDB_MATCH });
    expect(
      (await logManualViewing({ ...BASE, omdbApiKey: "k" }, VIEWING)).omdbSkippedBecause,
    ).toBeUndefined();

    route({});
    expect((await logManualViewing(BASE, VIEWING)).omdbSkippedBecause).toBeUndefined();
    expect(
      (await logManualViewing({ ...BASE, omdbApiKey: "k", omdbPaused: true }, VIEWING))
        .omdbSkippedBecause,
    ).toBeUndefined();
  });

  test("attaches a preselected OMDb match without searching again, plus TMDb's fields", async () => {
    route({ tmdb: (url) => (url.pathname.includes("/find/") ? TMDB_FIND : TMDB_MOVIE) });

    const result = await logManualViewing({ ...BASE, omdbApiKey: "k", tmdbApiKey: "t" }, VIEWING, {
      imdbId: "tt1160419",
      director: "Denis Villeneuve",
    });

    expect(requests.some((u) => u.host === "www.omdbapi.com")).toBe(false);
    expect(result.viewing.director).toBe("Denis Villeneuve");
    expect(result.viewing.website).toBe("https://example.com");
  });

  test("attaches a preselected OMDb match as is when there's no TMDb key", async () => {
    route({});

    const result = await logManualViewing({ ...BASE, omdbApiKey: "k" }, VIEWING, {
      imdbId: "tt1160419",
      director: "Denis Villeneuve",
    });

    expect(result.viewing.director).toBe("Denis Villeneuve");
    expect(requests.some((u) => u.host === "api.themoviedb.org")).toBe(false);
  });
});

describe("reloadOnViewingSaved", () => {
  const originalWindow = (globalThis as { window?: unknown }).window;
  const originalDocument = (globalThis as { document?: unknown }).document;
  let target: EventTarget;

  beforeEach(() => {
    target = new EventTarget();
    (globalThis as { window?: unknown }).window = target;
    (globalThis as { document?: unknown }).document = target;
  });
  afterEach(() => {
    (globalThis as { window?: unknown }).window = originalWindow;
    (globalThis as { document?: unknown }).document = originalDocument;
  });

  test("reloads each time a viewing is saved", () => {
    let reloads = 0;
    reloadOnViewingSaved(() => reloads++);
    target.dispatchEvent(new Event(VIEWING_SAVED_EVENT));
    target.dispatchEvent(new Event(VIEWING_SAVED_EVENT));
    expect(reloads).toBe(2);
  });

  test("stops once the page is swapped out", () => {
    let reloads = 0;
    reloadOnViewingSaved(() => reloads++);
    target.dispatchEvent(new Event("astro:before-swap"));
    target.dispatchEvent(new Event(VIEWING_SAVED_EVENT));
    expect(reloads).toBe(0);
  });
});

describe("VIEWING_SAVED_EVENT", () => {
  test("names the event the wizard dispatches and the overview listens for", () => {
    expect(VIEWING_SAVED_EVENT).toBe("movie-planner-web:viewing-saved");
  });
});
