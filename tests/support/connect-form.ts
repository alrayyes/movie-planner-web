import type { Page } from "@playwright/test";

// #678: the connect/settings form keeps its optional fields (OMDb, TMDb,
// pause OMDb, WebMCP) in a collapsed "Optional integrations" group, and
// Playwright can't fill a field inside a closed <details>. Opens it if it
// isn't already, so a helper can call this before touching any of them.
export async function openOptionalIntegrations(page: Page) {
  const group = page.locator("details", { has: page.locator("#omdb-api-key") });
  if (!(await group.evaluate((el: HTMLDetailsElement) => el.open))) {
    await group.locator("summary").click();
  }
}
