import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { ATTRIBUTE_KINDS, ATTRIBUTES } from "./attributes";

// #914: the per-kind e2e loops existed to catch a page passing the wrong
// `kind` to the shared AttributeOverview/AttributeDetail component. That
// wiring is a string in each page file, so it's checked here, in milliseconds,
// and one e2e journey per component covers the rendering.
const pageSource = (path: string) => readFileSync(`src/pages${path}.astro`, "utf8");

for (const kind of ATTRIBUTE_KINDS) {
  const { listingPath, detailPath } = ATTRIBUTES[kind];

  test(`${listingPath} renders the overview for the ${kind} kind`, () => {
    expect(pageSource(listingPath)).toMatch(new RegExp(`<AttributeOverview[^>]*\\bkind="${kind}"`));
  });

  test(`${detailPath} renders the detail page for the ${kind} kind`, () => {
    expect(pageSource(detailPath)).toMatch(new RegExp(`<AttributeDetail[^>]*\\bkind="${kind}"`));
  });
}
