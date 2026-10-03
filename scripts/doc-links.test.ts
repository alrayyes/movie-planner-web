import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

// #723: README.md, CLAUDE.md and CONTRIBUTING.md name paths in this repo, and a
// path that has moved reads as true until someone clicks it. Every relative
// link and every backticked repo path in them has to exist.
const root = new URL("..", import.meta.url).pathname;
const FILES = ["README.md", "CLAUDE.md", "CONTRIBUTING.md"];
// Paths the docs mention only to say they are gone.
const GONE = ["src/pages/api/"];
const REPO_DIRS = ["openspec", "docs", "src", "scripts", "test", "tests", ".github", "styles"];

function targets(text: string): string[] {
  const found = new Set<string>();
  // [text](relative/path) and [text](relative/path#anchor), not URLs or anchors.
  for (const match of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    const target = (match[1] ?? "").split("#")[0] ?? "";
    if (target && !/^[a-z][a-z0-9+.-]*:/i.test(target) && !target.startsWith("/")) {
      found.add(target);
    }
  }
  // `openspec/changes/...` style inline code naming a repo directory. Globs and
  // placeholders (`src/**`, `docs/<name>`) don't name one path, so they're skipped.
  for (const match of text.matchAll(/`((?:[\w.-]+\/)+[\w.-]*\/?)`/g)) {
    const path = match[1] ?? "";
    const top = path.split("/")[0] ?? "";
    if (REPO_DIRS.includes(top) && !/[*<>{}]/.test(path) && !GONE.includes(path)) found.add(path);
  }
  return [...found];
}

describe("paths named in the top-level docs exist", () => {
  for (const file of FILES) {
    const text = readFileSync(`${root}${file}`, "utf8");
    for (const target of targets(text)) {
      test(`${file} -> ${target}`, () => {
        expect(existsSync(`${root}${target}`)).toBe(true);
      });
    }
  }
});
