import { expect, type Page, test } from "@playwright/test";
import type { LoggedViewing } from "../src/lib/caldav/types";
import { mockCaldavServer } from "./support/mock-caldav";

// #667: this suite talks to the WebMCP tools this app registers, not the
// UI — it never renders anything a real page visitor sees beyond what
// other specs already cover (the Settings checkbox itself), so there's
// no new surface for an axe-core scan here.

const BASE_URL = "https://caldav.example.com/calendars/me/movies/";

const CREDENTIALS = {
  "caldav-url": BASE_URL,
  "caldav-username": "me",
  "caldav-password": "secret",
};

const EXISTING_VIEWING: LoggedViewing = {
  uid: "existing-1",
  title: "Paddington",
  start: "2026-01-15T18:00:00.000Z",
  end: "2026-01-15T19:40:00.000Z",
  medium: "cinema",
  venue: "Pathé Tuschinski",
};

// Stubs the WebMCP registration surface the way a WebMCP-capable browser
// would provide it — `document.modelContext.registerTool` capturing each
// tool so the test can call its `execute()` directly, exactly as a real
// in-browser agent would. Runs before every navigation on this page
// (including a `page.reload()`), which is what lets a test connect, then
// reload to pick up a credentials change, and still find the stub intact.
async function stubModelContext(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __registeredTools: Record<string, unknown> }).__registeredTools = {};
    (document as unknown as { modelContext: unknown }).modelContext = {
      registerTool: (tool: { name: string }) => {
        (window as unknown as { __registeredTools: Record<string, unknown> }).__registeredTools[
          tool.name
        ] = tool;
      },
      provideContext: () => {},
    };
  });
}

async function connect(
  page: Page,
  options: { webMcpEnabled?: boolean; initialViewings?: LoggedViewing[] } = {},
) {
  const server = mockCaldavServer(page, BASE_URL, options.initialViewings ?? []);
  await page.goto("/");
  await page.locator("#caldav-url").fill(CREDENTIALS["caldav-url"]);
  await page.locator("#caldav-username").fill(CREDENTIALS["caldav-username"]);
  await page.locator("#caldav-password").fill(CREDENTIALS["caldav-password"]);
  if (options.webMcpEnabled) await page.locator("#webmcp-enabled").check();
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
  return server;
}

interface WebMcpToolResult {
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

async function callTool(page: Page, name: string, input: unknown): Promise<WebMcpToolResult> {
  return page.evaluate(
    async ({ name, input }) => {
      // biome-ignore lint/suspicious/noExplicitAny: the test's own stubbed registry, not app code
      const tools = (window as any).__registeredTools;
      return tools[name].execute(input);
    },
    { name, input },
  );
}

async function registeredToolNames(page: Page): Promise<string[]> {
  return page.evaluate(
    // biome-ignore lint/suspicious/noExplicitAny: the test's own stubbed registry, not app code
    () => Object.keys((window as any).__registeredTools),
  );
}

test.describe("WebMCP tools (#667)", () => {
  test("the app still loads with no WebMCP support at all (no stub, no flag)", async ({ page }) => {
    mockCaldavServer(page, BASE_URL, []);
    await page.goto("/");
    await expect(page.locator("#caldav-url")).toBeVisible();
  });

  test("no tools register while WebMCP is left off (the default)", async ({ page }) => {
    await stubModelContext(page);
    await connect(page, { webMcpEnabled: false });
    await page.reload();
    expect(await registeredToolNames(page)).toEqual([]);
  });

  test("log_viewing creates the resulting CalDAV event", async ({ page }) => {
    await stubModelContext(page);
    const server = await connect(page, { webMcpEnabled: true });
    await page.reload();

    const result = await callTool(page, "log_viewing", {
      title: "Dune: Part Two",
      start: "2026-02-01T18:00:00.000Z",
      end: "2026-02-01T20:40:00.000Z",
      medium: "cinema",
      venue: "Kriterion",
    });

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain("Dune: Part Two");
    expect(server.creates).toHaveLength(1);
    expect(server.creates[0]).toMatchObject({ title: "Dune: Part Two", venue: "Kriterion" });
  });

  test("edit_viewing merges supplied fields onto the existing viewing", async ({ page }) => {
    await stubModelContext(page);
    const server = await connect(page, {
      webMcpEnabled: true,
      initialViewings: [EXISTING_VIEWING],
    });
    await page.reload();

    const result = await callTool(page, "edit_viewing", {
      uid: EXISTING_VIEWING.uid,
      notes: "Rewatched with a friend.",
    });

    expect(result.isError).toBeFalsy();
    expect(server.updates).toHaveLength(1);
    expect(server.updates[0]).toMatchObject({
      uid: EXISTING_VIEWING.uid,
      title: EXISTING_VIEWING.title,
      notes: "Rewatched with a friend.",
    });
  });

  test("edit_viewing reports a uid that doesn't exist", async ({ page }) => {
    await stubModelContext(page);
    await connect(page, { webMcpEnabled: true });
    await page.reload();

    const result = await callTool(page, "edit_viewing", { uid: "does-not-exist", title: "x" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("No viewing found");
  });

  test("delete_viewing removes the viewing", async ({ page }) => {
    await stubModelContext(page);
    const server = await connect(page, {
      webMcpEnabled: true,
      initialViewings: [EXISTING_VIEWING],
    });
    await page.reload();

    const result = await callTool(page, "delete_viewing", { uid: EXISTING_VIEWING.uid });

    expect(result.isError).toBeFalsy();
    expect(server.deletes).toEqual([EXISTING_VIEWING.uid]);
  });

  test("search_viewings filters the same way the overview does", async ({ page }) => {
    await stubModelContext(page);
    await connect(page, {
      webMcpEnabled: true,
      initialViewings: [
        EXISTING_VIEWING,
        { ...EXISTING_VIEWING, uid: "existing-2", title: "Paddington 2", venue: "Kriterion" },
      ],
    });
    await page.reload();

    const result = await callTool(page, "search_viewings", { venue: "Pathé Tuschinski" });

    expect(result.isError).toBeFalsy();
    const matches = JSON.parse(result.content[0].text) as LoggedViewing[];
    expect(matches).toHaveLength(1);
    expect(matches[0].uid).toBe(EXISTING_VIEWING.uid);
  });

  test("a tool already registered honors being turned off again without a reload", async ({
    page,
  }) => {
    await stubModelContext(page);
    await connect(page, { webMcpEnabled: true, initialViewings: [EXISTING_VIEWING] });
    await page.reload();
    expect(await registeredToolNames(page)).toContain("delete_viewing");

    // A full navigation to Settings — re-registers the tools fresh (the
    // flag is still on at this point), then the visitor turns it back
    // off and saves, with no reload afterward.
    await page.goto("/settings");
    await expect(page.locator("#webmcp-enabled")).toBeChecked();
    await page.locator("#webmcp-enabled").uncheck();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status")).toHaveText("Saved.");

    const result = await callTool(page, "delete_viewing", { uid: EXISTING_VIEWING.uid });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("turned off");
  });
});
