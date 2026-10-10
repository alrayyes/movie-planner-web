// Rewrites the README's page gallery from the list in page-gallery.ts, so the
// pictures and the README can't disagree about which pages exist.
// usage: bun scripts/readme-gallery.ts
import { readFile, writeFile } from "node:fs/promises";
import { PAGES } from "./page-gallery";

const START = "<!-- screenshots:start -->";
const END = "<!-- screenshots:end -->";
const DIR = "docs/screenshots/pages";

export function galleryMarkdown(pages: { slug: string; name: string }[]): string {
  return pages
    .map(
      ({ slug, name }) => `### ${name}

<picture>
  <source
    media="(prefers-color-scheme: dark)"
    srcset="${DIR}/${slug}-dark.png">
  <img
    src="${DIR}/${slug}-light.png"
    alt="${Bun.escapeHTML(name)}"
    width="640">
</picture>`,
    )
    .join("\n\n");
}

export function applyGallery(readme: string, gallery: string): string {
  const start = readme.indexOf(START);
  const end = readme.indexOf(END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`README.md needs ${START} and ${END} around the gallery`);
  }
  return `${readme.slice(0, start + START.length)}\n\n${gallery}\n\n${readme.slice(end)}`;
}

if (import.meta.main) {
  const readme = await readFile("README.md", "utf8");
  await writeFile("README.md", applyGallery(readme, galleryMarkdown(PAGES)));
}
