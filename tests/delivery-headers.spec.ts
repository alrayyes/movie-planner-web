import { expect, test } from "@playwright/test";

// Lighthouse's cache and compression audits grade the server that ships the
// files, so check the headers it sends, here served by the same workerd that
// Cloudflare runs. Cloudflare adds brotli on top of what wrangler does; this
// catches the Worker config or _headers file losing it.
const ACCEPT = { "accept-encoding": "br, gzip" };

test("a fingerprinted script is cached for a year and compressed", async ({ request }) => {
  const html = await (await request.get("/")).text();
  const script = html.match(/(?:src|href)="(\/_astro\/[^"]+\.js)"/)?.[1];
  expect(script, "the home page references a fingerprinted script").toBeTruthy();

  const response = await request.get(script as string, { headers: ACCEPT });

  expect(response.headers()["cache-control"]).toBe("public, max-age=31536000, immutable");
  expect(response.headers()["content-encoding"]).toMatch(/^(br|gzip)$/);
});

test("a page is compressed and revalidated on every visit", async ({ request }) => {
  const response = await request.get("/", { headers: ACCEPT });

  expect(response.headers()["content-encoding"]).toMatch(/^(br|gzip)$/);
  expect(response.headers()["cache-control"]).toContain("must-revalidate");
});
