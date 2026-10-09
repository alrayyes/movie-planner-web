import { expect, test } from "bun:test";
import { indexHtml, slugFor } from "./lighthouse-pages";

test("names the home page 'home'", () => {
  expect(slugFor("http://localhost:4321/")).toBe("home");
});

test("names a page after its path", () => {
  expect(slugFor("http://localhost:4321/docs/")).toBe("docs");
  expect(slugFor("http://localhost:4321/docs/connecting/")).toBe("docs-connecting");
});

test("ignores the query string and the host", () => {
  expect(slugFor("https://example.com/venues/?q=1")).toBe("venues");
});

test("links each page's HTML and JSON report from the index", () => {
  const html = indexHtml([{ slug: "home", label: "/" }], "abc1234", "2026-10-09");

  expect(html).toContain('<a href="home.report.html">');
  expect(html).toContain('<a href="home.report.json">');
  expect(html).toContain("abc1234");
  expect(html).toContain("2026-10-09");
});

test("escapes a page URL in the index", () => {
  const html = indexHtml([{ slug: "x", label: "/?a=1&b=<2>" }], "sha", "date");

  expect(html).toContain("a=1&amp;b=&lt;2&gt;");
  expect(html).not.toContain("<2>");
});
