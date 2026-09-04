import { expect, test } from "@playwright/test";

// caldav-proxy spec, "Fixed set of CalDAV operations": the browser can only
// ever reach the seven routes under /api/caldav/**. There's no dispatcher
// accepting an arbitrary operation string to relay, so "unsupported
// operation" is enforced by there being no matching route at all.
test.describe("fixed operation set", () => {
  test("a path outside the fixed operation set doesn't exist", async ({ request }) => {
    const response = await request.post("/api/caldav/events/wipe-everything", { data: {} });
    expect(response.status()).toBe(404);
  });

  test("a method outside POST isn't accepted on a real route", async ({ request }) => {
    const response = await request.get("/api/caldav/events/list");
    expect(response.ok()).toBe(false);
  });
});

test.describe("HTTPS-only validation", () => {
  test("rejects a plain http:// base URL without attempting to contact it", async ({ request }) => {
    const response = await request.post("/api/caldav/events/list", {
      data: {
        config: { baseUrl: "http://caldav.example.com/", username: "me", password: "x" },
        range: { from: "2026-01-01T00:00:00.000Z", to: "2026-02-01T00:00:00.000Z" },
      },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("https://");
  });
});
