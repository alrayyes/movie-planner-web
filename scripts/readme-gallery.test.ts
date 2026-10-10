import { expect, test } from "bun:test";
import { applyGallery, galleryMarkdown } from "./readme-gallery";

const PAGES = [
  { slug: "overview", name: "Overview" },
  { slug: "venues", name: "Venues" },
];

test("shows each page once, as a picture that follows the reader's colour scheme", () => {
  const markdown = galleryMarkdown(PAGES);

  expect(markdown).toContain('media="(prefers-color-scheme: dark)"');
  expect(markdown).toContain('srcset="docs/screenshots/pages/venues-dark.png"');
  expect(markdown).toContain('src="docs/screenshots/pages/venues-light.png"');
  expect(markdown).toContain('alt="Venues"');
  expect(markdown.match(/<picture>/g)).toHaveLength(2);
});

test("gives each page a heading", () => {
  expect(galleryMarkdown(PAGES)).toContain("### Overview");
});

test("escapes a page name used as alt text", () => {
  const markdown = galleryMarkdown([{ slug: "x", name: 'A "quoted" <name>' }]);

  expect(markdown).toContain('alt="A &quot;quoted&quot; &lt;name&gt;"');
});

test("replaces what's between the markers and keeps the rest", () => {
  const readme = "before\n<!-- screenshots:start -->\nold\n<!-- screenshots:end -->\nafter\n";

  const result = applyGallery(readme, "new");

  expect(result).toBe(
    "before\n<!-- screenshots:start -->\n\nnew\n\n<!-- screenshots:end -->\nafter\n",
  );
});

test("is idempotent", () => {
  const readme = "a\n<!-- screenshots:start -->\n<!-- screenshots:end -->\nb\n";
  const once = applyGallery(readme, "x");

  expect(applyGallery(once, "x")).toBe(once);
});

test("fails loudly when the markers are missing", () => {
  expect(() => applyGallery("no markers", "x")).toThrow("screenshots:start");
});
