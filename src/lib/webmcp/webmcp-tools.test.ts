import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { serializeViewingToVEvent } from "../caldav/ical";
import type { NewViewing } from "../caldav/types";
import { getCredentialsStore } from "../credentials/store";
import { registerWebMcpTools } from "./register-tools";
import type { WebMcpToolDefinition, WebMcpToolResult } from "./types";

// #749: the WebMCP tools end to end. They are registered into a fake
// `document.modelContext`, the credentials are real (on fake-indexeddb), and
// the CalDAV server is a map behind a fake `fetch`, so each tool's own
// decisions (what it validates, what it writes, what it says back) are what
// the assertions read.
const BASE_URL = "https://cal.example/dav/";

type Tool = WebMcpToolDefinition<Record<string, unknown>>;
let tools: Record<string, Tool>;
let events: Map<string, string>;
let puts: { uid: string; body: string }[];
let failWith: number | undefined;

const g = globalThis as unknown as Record<string, unknown>;
let savedDocument: unknown;
let savedFetch: unknown;

const uidFromUrl = (url: string) =>
  decodeURIComponent(url.split("/").pop()?.replace(".ics", "") ?? "");

function installServer() {
  g.fetch = async (url: string, init: RequestInit) => {
    if (failWith) return new Response("", { status: failWith, statusText: "Boom" });
    const method = init.method ?? "GET";
    if (method === "REPORT") {
      const data = [...events.values()]
        .map(
          (ics) =>
            `<C:calendar-data>${ics.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</C:calendar-data>`,
        )
        .join("");
      return new Response(`<D:multistatus xmlns:D="DAV:" xmlns:C="c">${data}</D:multistatus>`, {
        status: 207,
      });
    }
    const uid = uidFromUrl(url);
    if (method === "PUT") {
      events.set(uid, String(init.body));
      puts.push({ uid, body: String(init.body) });
      return new Response("", { status: 201 });
    }
    if (method === "DELETE") {
      events.delete(uid);
      return new Response("", { status: 204 });
    }
    const ics = events.get(uid);
    return ics ? new Response(ics, { status: 200 }) : new Response("", { status: 404 });
  };
}

const viewing = (uid: string, fields: Partial<NewViewing> = {}) => {
  const v: NewViewing = {
    title: uid,
    start: new Date(2026, 0, 2, 19, 0).toISOString(),
    end: new Date(2026, 0, 2, 21, 0).toISOString(),
    medium: "cinema",
    ...fields,
  };
  events.set(uid, serializeViewingToVEvent(uid, v));
};

async function deleteAllDatabases() {
  for (const db of await indexedDB.databases()) {
    if (!db.name) continue;
    await new Promise<void>((resolve) => {
      const r = indexedDB.deleteDatabase(db.name as string);
      r.onsuccess = () => resolve();
      r.onerror = () => resolve();
    });
  }
}

async function enable(webMcpEnabled = true) {
  await getCredentialsStore().save({
    caldavUrl: BASE_URL,
    caldavUsername: "me",
    caldavPassword: "secret",
    webMcpEnabled,
  });
}

beforeEach(async () => {
  await deleteAllDatabases();
  tools = {};
  events = new Map();
  puts = [];
  failWith = undefined;
  savedDocument = g.document;
  savedFetch = g.fetch;
  g.document = {
    modelContext: {
      registerTool: (tool: Tool) => {
        tools[tool.name] = tool;
      },
    },
  };
  installServer();
  await enable();
  await registerWebMcpTools();
});
afterEach(() => {
  g.document = savedDocument;
  g.fetch = savedFetch;
});

const call = (name: string, input: Record<string, unknown> = {}): Promise<WebMcpToolResult> =>
  (tools[name] as Tool).execute(input);
const text = (result: WebMcpToolResult) => result.content[0]?.text ?? "";

describe("registerWebMcpTools", () => {
  test("registers the six tools, in order, once the visitor opted in", () => {
    expect(Object.keys(tools)).toEqual([
      "log_viewing",
      "edit_viewing",
      "delete_viewing",
      "search_viewings",
      "export_viewings",
      "import_viewings",
    ]);
  });

  test("registers nothing where the browser has no modelContext", async () => {
    tools = {};
    g.document = {};
    await registerWebMcpTools();
    expect(tools).toEqual({});
  });

  test("doesn't even open the credentials database there", async () => {
    g.document = {};
    const realOpen = indexedDB.open.bind(indexedDB);
    let opened = 0;
    indexedDB.open = ((...args: Parameters<typeof realOpen>) => {
      opened++;
      return realOpen(...args);
    }) as typeof indexedDB.open;
    try {
      await registerWebMcpTools();
    } finally {
      indexedDB.open = realOpen;
    }
    expect(opened).toBe(0);
  });

  test("registers nothing until WebMCP is turned on in Settings", async () => {
    tools = {};
    await enable(false);
    await registerWebMcpTools();
    expect(tools).toEqual({});
  });

  test("registers nothing without saved credentials", async () => {
    tools = {};
    await deleteAllDatabases();
    await registerWebMcpTools();
    expect(tools).toEqual({});
  });

  test("each tool's name, description, schema and warning flag are what an agent reads", () => {
    const definitions = Object.values(tools).map(({ execute: _execute, ...rest }) => rest);
    expect(definitions).toMatchSnapshot();
  });
});

describe("every tool checks the opt-in on each call", () => {
  const inputs: Record<string, Record<string, unknown>> = {
    log_viewing: {
      title: "x",
      start: "2026-01-01T19:00:00Z",
      end: "2026-01-01T20:00:00Z",
      medium: "cinema",
    },
    edit_viewing: { uid: "u" },
    delete_viewing: { uid: "u" },
    search_viewings: {},
    export_viewings: {},
    import_viewings: { format: "json", data: "[]" },
  };

  for (const name of Object.keys(inputs)) {
    test(`${name} refuses once Settings turns it off`, async () => {
      await enable(false);
      const result = await call(name, inputs[name]);
      expect(result.isError).toBe(true);
      expect(text(result)).toBe("WebMCP tools are turned off. Enable them in Settings first.");
      expect(puts).toEqual([]);
    });
  }
});

describe("log_viewing", () => {
  const input = {
    title: "Dune",
    start: new Date(2026, 0, 2, 19, 0).toISOString(),
    end: new Date(2026, 0, 2, 21, 0).toISOString(),
    medium: "cinema",
    venue: "Odeon",
    notes: "with friends",
    director: "Denis Villeneuve",
    actors: "Zendaya",
    genre: "Sci-Fi",
    year: "2021",
    synopsis: "never forwarded",
  };

  test("writes the viewing and says what it logged", async () => {
    const result = await call("log_viewing", input);
    expect(result.isError).toBe(false);
    expect(text(result)).toMatch(/^Logged "Dune" \(uid [0-9a-f-]{36}\)\.$/);
    const body = puts[0]?.body ?? "";
    for (const expected of [
      "SUMMARY:Dune",
      "LOCATION:Odeon",
      "X-MEDIUM:cinema",
      "X-NOTES:with friends",
      "X-DIRECTOR:Denis Villeneuve",
      "X-ACTORS:Zendaya",
      "X-GENRE:Sci-Fi",
      "X-YEAR:2021",
    ]) {
      expect(body).toContain(expected);
    }
    expect(body).not.toContain("never forwarded");
  });

  test("reports a failure to write", async () => {
    failWith = 500;
    const result = await call("log_viewing", input);
    expect(result.isError).toBe(true);
    expect(text(result)).toStartWith("Could not log the viewing: ");
  });
});

describe("a call with no input at all", () => {
  for (const name of ["edit_viewing", "delete_viewing"]) {
    test(`${name} asks for a uid`, async () => {
      const result = await (tools[name] as Tool).execute(undefined as never);
      expect(text(result)).toBe("uid is required.");
    });
  }

  test("import_viewings asks for a format", async () => {
    const result = await (tools.import_viewings as Tool).execute(undefined as never);
    expect(text(result)).toBe('format must be "json" or "csv".');
  });
});

describe("edit_viewing", () => {
  test("asks for a uid", async () => {
    const result = await call("edit_viewing", {});
    expect(result.isError).toBe(true);
    expect(text(result)).toBe("uid is required.");
  });

  test("says when there is no such viewing", async () => {
    const result = await call("edit_viewing", { uid: "ghost" });
    expect(result.isError).toBe(true);
    expect(text(result)).toBe("No viewing found with uid ghost.");
  });

  test("changes only what was supplied and keeps the rest", async () => {
    viewing("u1", { title: "Old", venue: "Odeon", notes: "keep me" });
    const result = await call("edit_viewing", { uid: "u1", title: "New", director: "D" });
    expect(result.isError).toBe(false);
    expect(text(result)).toBe('Updated "New" (uid u1).');
    const body = puts[0]?.body ?? "";
    expect(body).toContain("UID:u1");
    expect(body).toContain("SUMMARY:New");
    expect(body).toContain("X-DIRECTOR:D");
    expect(body).toContain("LOCATION:Odeon");
    expect(body).toContain("X-NOTES:keep me");
  });

  test("an empty string is a supplied value and clears nothing silently", async () => {
    viewing("u1", { venue: "Odeon" });
    await call("edit_viewing", { uid: "u1", venue: "Imax" });
    expect(puts[0]?.body).toContain("LOCATION:Imax");
  });

  test("reports a failure to read or write", async () => {
    failWith = 503;
    const result = await call("edit_viewing", { uid: "u1" });
    expect(result.isError).toBe(true);
    expect(text(result)).toStartWith("Could not update the viewing: ");
  });
});

describe("delete_viewing", () => {
  test("asks for a uid", async () => {
    const result = await call("delete_viewing", {});
    expect(result.isError).toBe(true);
    expect(text(result)).toBe("uid is required.");
  });

  test("removes the viewing", async () => {
    viewing("u1");
    viewing("u2");
    const result = await call("delete_viewing", { uid: "u1" });
    expect(result.isError).toBe(false);
    expect(text(result)).toBe("Deleted viewing u1.");
    expect([...events.keys()]).toEqual(["u2"]);
  });

  test("reports a failure", async () => {
    failWith = 500;
    const result = await call("delete_viewing", { uid: "u1" });
    expect(result.isError).toBe(true);
    expect(text(result)).toStartWith("Could not delete the viewing: ");
  });
});

describe("search_viewings", () => {
  const titles = (result: WebMcpToolResult) =>
    (JSON.parse(text(result)) as { title: string }[]).map((v) => v.title);

  test("returns the viewings that match the filters", async () => {
    viewing("a", { title: "Dune" });
    viewing("b", { title: "Anora" });
    viewing("c", { title: "Dune: Part Two", venue: "Odeon" });
    expect(titles(await call("search_viewings", { title: "dune" })).sort()).toEqual([
      "Dune",
      "Dune: Part Two",
    ]);
    expect(titles(await call("search_viewings", { venue: "odeon" }))).toEqual(["Dune: Part Two"]);
  });

  test("with no filters returns everything, up to 50 by default", async () => {
    for (let i = 0; i < 60; i++) viewing(`v${i}`, { title: `T${i}` });
    expect(titles(await call("search_viewings", {}))).toHaveLength(50);
  });

  test("a limit caps the matches", async () => {
    for (let i = 0; i < 5; i++) viewing(`v${i}`);
    expect(titles(await call("search_viewings", { limit: 2 }))).toHaveLength(2);
  });

  test("a zero or negative limit falls back to the default", async () => {
    for (let i = 0; i < 3; i++) viewing(`v${i}`);
    expect(titles(await call("search_viewings", { limit: 0 }))).toHaveLength(3);
    expect(titles(await call("search_viewings", { limit: -1 }))).toHaveLength(3);
  });

  test("a limit above the default is honoured", async () => {
    for (let i = 0; i < 55; i++) viewing(`v${i}`);
    expect(titles(await call("search_viewings", { limit: 55 }))).toHaveLength(55);
  });

  test("reports a failure", async () => {
    failWith = 500;
    const result = await call("search_viewings", {});
    expect(result.isError).toBe(true);
    expect(text(result)).toStartWith("Could not search viewings: ");
  });
});

describe("export_viewings", () => {
  test("exports the matching viewings as the JSON the import reads back", async () => {
    viewing("a", { title: "Dune" });
    viewing("b", { title: "Anora" });
    const rows = JSON.parse(text(await call("export_viewings", { title: "dune" }))) as {
      uid: string;
      title: string;
    }[];
    expect(rows.map((r) => [r.uid, r.title])).toEqual([["a", "Dune"]]);
  });

  test("with no input at all exports everything", async () => {
    viewing("a");
    viewing("b");
    const result = await tools.export_viewings?.execute(undefined as never);
    expect(JSON.parse(text(result as WebMcpToolResult))).toHaveLength(2);
  });

  test("reports a failure", async () => {
    failWith = 500;
    const result = await call("export_viewings", {});
    expect(result.isError).toBe(true);
    expect(text(result)).toStartWith("Could not export viewings: ");
  });
});

describe("import_viewings", () => {
  const json = (rows: unknown[]) => JSON.stringify(rows);

  test("needs a format of json or csv", async () => {
    for (const format of [undefined, "xml", ""]) {
      const result = await call("import_viewings", { format, data: "x" });
      expect(result.isError).toBe(true);
      expect(text(result)).toBe('format must be "json" or "csv".');
    }
  });

  test("needs data", async () => {
    for (const format of ["json", "csv"]) {
      const result = await call("import_viewings", { format, data: "" });
      expect(result.isError).toBe(true);
      expect(text(result)).toBe("data is required.");
    }
  });

  test("creates new viewings from JSON", async () => {
    const data = json([
      { title: "Dune", date: "2026-01-02", medium: "cinema", start_time: "19:00" },
      { title: "Anora", date: "2026-01-03", medium: "cinema", start_time: "20:00" },
    ]);
    const result = await call("import_viewings", { format: "json", data });
    expect(result.isError).toBe(false);
    expect(text(result)).toBe("Imported: created 2, updated 0, skipped 0.");
    expect(puts.map((p) => p.body.match(/SUMMARY:(.*)\r/)?.[1])).toEqual(["Dune", "Anora"]);
  });

  test("creates new viewings from CSV", async () => {
    const data = "title,date,medium,start_time\nDune,2026-01-02,cinema,19:00\n";
    const result = await call("import_viewings", { format: "csv", data });
    expect(text(result)).toBe("Imported: created 1, updated 0, skipped 0.");
    expect(puts).toHaveLength(1);
  });

  test("skips a likely duplicate and says which", async () => {
    viewing("existing", { title: "Dune" });
    const data = json([{ title: "Dune", date: "2026-01-02", medium: "cinema" }]);
    const result = await call("import_viewings", { format: "json", data });
    expect(text(result)).toBe(
      'Imported: created 0, updated 0, skipped 1.\nrow 1: looks like a duplicate of "Dune", skipped',
    );
    expect(puts).toEqual([]);
  });

  test("skips a row that failed to parse and says why", async () => {
    const data = json([{ title: "", date: "nope", medium: "cinema" }]);
    const result = await call("import_viewings", { format: "json", data });
    expect(text(result)).toStartWith("Imported: created 0, updated 0, skipped 1.\nrow 1: ");
    expect(puts).toEqual([]);
  });

  test("reports input that isn't the format it claims", async () => {
    const result = await call("import_viewings", { format: "json", data: "not json" });
    expect(text(result)).toBe("Imported: created 0, updated 0, skipped 1.\nrow 1: not valid JSON");
  });

  describe("a row matching an existing viewing by uid", () => {
    const changed = (extra: Record<string, unknown> = {}) =>
      json([
        {
          uid: "u1",
          title: "Dune",
          date: "2026-01-02",
          medium: "cinema",
          director: "Denis Villeneuve",
          ...extra,
        },
      ]);

    test("is left alone by default and says what it would change", async () => {
      viewing("u1", { title: "Dune" });
      const result = await call("import_viewings", { format: "json", data: changed() });
      expect(text(result)).toBe(
        'Imported: created 0, updated 0, skipped 1.\nrow 1: matches an existing viewing (uid u1) with 1 field(s) changed — not applied (mode isn\'t "apply-updates")',
      );
      expect(puts).toEqual([]);
    });

    test("create-only says the same", async () => {
      viewing("u1", { title: "Dune" });
      await call("import_viewings", { format: "json", data: changed(), mode: "create-only" });
      expect(puts).toEqual([]);
    });

    test("is updated in apply-updates mode, keeping its other fields", async () => {
      viewing("u1", { title: "Dune", venue: "Odeon" });
      const result = await call("import_viewings", {
        format: "json",
        data: changed(),
        mode: "apply-updates",
      });
      expect(text(result)).toBe("Imported: created 0, updated 1, skipped 0.");
      const body = puts[0]?.body ?? "";
      expect(body).toContain("X-DIRECTOR:Denis Villeneuve");
      expect(body).toContain("LOCATION:Odeon");
    });

    test("with nothing to change is neither updated nor reported", async () => {
      viewing("u1", { title: "Dune" });
      const data = json([{ uid: "u1", title: "Dune", date: "2026-01-02", medium: "cinema" }]);
      const result = await call("import_viewings", { format: "json", data, mode: "apply-updates" });
      expect(text(result)).toBe("Imported: created 0, updated 0, skipped 0.");
    });
  });

  test("lists up to ten details and counts the rest", async () => {
    const rows = Array.from({ length: 12 }, () => ({ title: "", date: "nope", medium: "cinema" }));
    const result = await call("import_viewings", { format: "json", data: json(rows) });
    const lines = text(result).split("\n");
    expect(lines[0]).toBe("Imported: created 0, updated 0, skipped 12.");
    expect(lines).toHaveLength(1 + 10 + 1);
    expect(lines.at(-1)).toBe("…and 2 more.");
  });

  test("exactly ten details are all listed, with no remainder line", async () => {
    const rows = Array.from({ length: 10 }, () => ({ title: "", date: "nope", medium: "cinema" }));
    const result = await call("import_viewings", { format: "json", data: json(rows) });
    const lines = text(result).split("\n");
    expect(lines).toHaveLength(1 + 10);
    expect(text(result)).not.toContain("more.");
  });

  test("reports a failure to read the calendar", async () => {
    failWith = 500;
    const data = json([{ title: "Dune", date: "2026-01-02", medium: "cinema" }]);
    const result = await call("import_viewings", { format: "json", data });
    expect(result.isError).toBe(true);
    expect(text(result)).toStartWith("Could not import: ");
  });
});
