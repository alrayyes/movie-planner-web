import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { Glob } from "bun";

// #725: docs.md says anything under docs/ gets a link from the README, a static
// site's README opens with an environment badge linked at the live deployment,
// and the build and test commands belong to CONTRIBUTING.md, not the README.
const root = new URL("..", import.meta.url).pathname;
const readme = readFileSync(`${root}README.md`, "utf8");

describe("README.md", () => {
  const pages = [...new Glob("docs/**/*.md").scanSync({ cwd: root })].sort();

  test("there are docs pages to link", () => {
    expect(pages.length).toBeGreaterThan(0);
  });

  for (const page of pages) {
    test(`links ${page}`, () => {
      expect(readme).toContain(`](${page})`);
    });
  }

  test("opens with an environment badge linked at the live site", () => {
    const badges = readme.split("\n").slice(0, 12).join("\n");
    expect(badges).toMatch(/\[!\[[^\]]*\]\([^)]*\)\]\(https:\/\/movie-planner\.ryankes\.eu\/?\)/);
  });

  test("Usage points to CONTRIBUTING.md instead of repeating its commands", () => {
    const usage = readme.split(/^## Usage$/m)[1]?.split(/^## /m)[0] ?? "";
    expect(usage).toContain("](CONTRIBUTING.md)");
    expect(usage).not.toMatch(/^bun run (dev|build|preview|check|test)\b/m);
  });
});
