import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

// #726: claude-md.md asks for bullets under headings rather than paragraphs, no
// restating of what CONTRIBUTING.md already says, and a file small enough that
// every session can afford to load it.
const text = readFileSync(new URL("../CLAUDE.md", import.meta.url), "utf8");
const lines = text.split("\n");

describe("CLAUDE.md", () => {
  test("stays well under 200 lines", () => {
    expect(lines.length).toBeLessThan(120);
  });

  test("the opening is bullets, not a paragraph", () => {
    const firstHeading = lines.findIndex((l, i) => i > 0 && l.startsWith("## "));
    const opening = lines.slice(1, firstHeading).filter((l) => l.trim() !== "");
    expect(opening.length).toBeGreaterThan(0);
    // Every opening line is a bullet or is indented under one.
    expect(opening.every((l) => l.startsWith("- ") || l.startsWith("  "))).toBe(true);
  });

  test("no single bullet runs past nine lines", () => {
    // A bullet is a line starting with "- " (nested or not) plus its continuation.
    let longest = 0;
    let current = 0;
    let fenced = false;
    for (const line of lines) {
      if (line.startsWith("```")) fenced = !fenced;
      if (fenced) continue;
      if (/^\s*- /.test(line)) current = 1;
      else if (line.trim() === "" || line.startsWith("#")) current = 0;
      else if (current > 0) current += 1;
      longest = Math.max(longest, current);
    }
    expect(longest).toBeLessThanOrEqual(9);
  });

  test("the commands block lists six commands at most and links CONTRIBUTING.md", () => {
    const block = text.match(/## Commands\n+```sh\n([\s\S]*?)```/)?.[1] ?? "";
    expect(block.split("\n").filter((l) => l.trim() !== "").length).toBeLessThanOrEqual(6);
    expect(text).toContain("](CONTRIBUTING.md)");
  });

  test("the two lessons that cost a CI round trip are written down", () => {
    expect(text).toContain("semgrep");
    expect(text).toContain("ERR_NETWORK_CHANGED");
  });
});
