import { expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { basename } from "node:path";
import { FOOTER_ROUTES, PAGES, pagePath } from "./page-gallery";

const routeOf = (path: string) => path.split("?")[0]?.replace(/^\//, "") || "index";

test("every page under src/pages is either in the gallery or a footer page", () => {
  const routes = readdirSync("src/pages")
    .filter((file) => file.endsWith(".astro"))
    .map((file) => basename(file, ".astro"));
  const covered = new Set([...PAGES.map((page) => page.route), ...FOOTER_ROUTES]);

  const missing = routes.filter((route) => !covered.has(route));

  expect(missing).toEqual([]);
});

test("the gallery names no page that doesn't exist", () => {
  const routes = new Set(
    readdirSync("src/pages")
      .filter((file) => file.endsWith(".astro"))
      .map((file) => basename(file, ".astro")),
  );

  const unknown = PAGES.map((page) => page.route).filter((route) => !routes.has(route));

  expect(unknown).toEqual([]);
});

test("the footer's pages are left out of the gallery", () => {
  const routes = PAGES.map((page) => page.route);

  for (const footer of FOOTER_ROUTES) expect(routes).not.toContain(footer);
});

test("slugs are unique and safe as file names", () => {
  const slugs = PAGES.map((page) => page.slug);

  expect(new Set(slugs).size).toBe(slugs.length);
  for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9-]+$/);
});

test("each page's path leads to its own route", async () => {
  const viewings = [
    {
      uid: "u1",
      title: "Dune",
      start: "2026-01-01T19:00:00.000Z",
      end: "2026-01-01T21:00:00.000Z",
      medium: "cinema",
      venue: "Grand Vista Cinema",
      director: "Denis Villeneuve",
      actors: "Zendaya",
      genre: "Drama",
      rated: "PG-13",
      keywords: "desert",
      movieLanguage: "English",
      movieCountry: "United States",
      released: "01 Mar 2024",
    },
  ];

  for (const page of PAGES) {
    expect(routeOf(await pagePath(page, viewings))).toBe(
      page.route === "index" ? "index" : page.route,
    );
  }
});

test("a detail page carries a value from the data", async () => {
  const viewings = [
    {
      uid: "u1",
      title: "Dune",
      start: "2026-01-01T19:00:00.000Z",
      end: "2026-01-01T21:00:00.000Z",
      medium: "cinema",
      director: "Denis Villeneuve",
    },
  ];
  const director = PAGES.find((page) => page.slug === "director");

  expect(await pagePath(director as (typeof PAGES)[number], viewings)).toBe(
    "/director?director=Denis%20Villeneuve",
  );
});
