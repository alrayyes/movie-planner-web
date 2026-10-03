import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { Glob } from "bun";

// #724: architecture-docs.md keeps the decision log in docs/adr/, one numbered
// record per decision in the Nygard shape, with a single ARCHITECTURE.md at the
// root linking to it.
const root = new URL("..", import.meta.url).pathname;
const read = (path: string) => readFileSync(`${root}${path}`, "utf8");
const adrs = [...new Glob("docs/adr/*.md").scanSync({ cwd: root })].sort();

describe("docs/adr", () => {
  test("holds records", () => {
    expect(adrs.length).toBeGreaterThanOrEqual(4);
  });

  test("numbers them 0001, 0002, ... with no gaps", () => {
    const numbers = adrs.map((p) => p.match(/docs\/adr\/(\d{4})-[a-z0-9-]+\.md$/)?.[1]);
    expect(numbers).toEqual(adrs.map((_, i) => String(i + 1).padStart(4, "0")));
  });

  for (const adr of adrs) {
    const text = read(adr);

    test(`${adr} has a title, a status, context, a decision and consequences`, () => {
      expect(text).toMatch(/^# \d+\. \S/m);
      expect(text).toMatch(/^Status: (proposed|accepted|superseded by \d{4})\b/m);
      for (const heading of ["Context", "Decision", "Consequences"]) {
        expect(text).toContain(`## ${heading}`);
      }
    });
  }
});

describe("ARCHITECTURE.md", () => {
  const text = read("ARCHITECTURE.md");

  test("is short", () => {
    expect(text.split("\n").length).toBeLessThanOrEqual(70);
  });

  for (const adr of adrs) {
    test(`links ${adr}`, () => {
      expect(text).toContain(`](${adr})`);
    });
  }

  test("every repo path it names exists", () => {
    const paths = [...text.matchAll(/`((?:src|docs|test|tests|openspec|scripts)\/[\w./-]*)`/g)]
      .map((m) => m[1] ?? "")
      .filter((p) => !/[*<>{}]/.test(p));
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.filter((p) => !existsSync(`${root}${p}`))).toEqual([]);
  });

  test("CONTRIBUTING.md links it", () => {
    expect(read("CONTRIBUTING.md")).toContain("](ARCHITECTURE.md)");
  });
});
