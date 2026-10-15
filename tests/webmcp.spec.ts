import { expect, type Page, test } from "@playwright/test";
import type { LoggedViewing } from "../src/lib/caldav/types";
import { openOptionalIntegrations } from "./support/connect-form";
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
  if (options.webMcpEnabled) {
    await openOptionalIntegrations(page);
    await page.locator("#webmcp-enabled").check();
  }
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByRole("button", { name: "Log a viewing" })).toBeVisible();
  return server;
}

interface WebMcpToolResult {
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

// registerWebMcpTools() is fire-and-forget from Layout.astro's own
// <script> (an unawaited async call, matching registerServiceWorker()'s
// own pattern) — it does a real IndexedDB read before it registers
// anything, so a page's 'load' event (what page.reload() itself waits
// for) can fire before registration actually finishes. Waiting for the
// tool to actually appear, rather than assuming reload() already implies
// it has, is what keeps this reliable under load instead of merely
// reliable when the machine happens to be fast.
async function waitForTool(page: Page, name: string): Promise<void> {
  await page.waitForFunction(
    (toolName) =>
      toolName in
      ((window as unknown as { __registeredTools?: Record<string, unknown> }).__registeredTools ??
        {}),
    name,
  );
}

async function callTool(page: Page, name: string, input: unknown): Promise<WebMcpToolResult> {
  await waitForTool(page, name);
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
});
