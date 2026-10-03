import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// #721: tooling.md's baseline. bun pins exact versions by default, no workflow
// lets the repo's own git hooks fire inside CI, and the tracked CHANGELOG.md
// isn't also on the ignore list.
const root = new URL("..", import.meta.url).pathname;
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("bunfig.toml", () => {
  test("installs exact versions by default", () => {
    const config = Bun.TOML.parse(read("bunfig.toml")) as { install?: { exact?: boolean } };
    expect(config.install?.exact).toBe(true);
  });

  // Adding an [install] section made Semgrep's bun-missing-minimum-release-age
  // rule apply to this file. Seven days matches Dependabot's cooldown.
  test("waits seven days before resolving a newly published version", () => {
    const config = Bun.TOML.parse(read("bunfig.toml")) as {
      install?: { minimumReleaseAge?: number };
    };
    expect(config.install?.minimumReleaseAge).toBeGreaterThanOrEqual(604800);
  });
});

describe("workflows", () => {
  const workflows = readdirSync(join(root, ".github/workflows")).filter((f) => f.endsWith(".yml"));

  test("there are workflows to check", () => {
    expect(workflows.length).toBeGreaterThan(0);
  });

  for (const file of workflows) {
    test(`${file} sets LEFTHOOK=0`, () => {
      const doc = Bun.YAML.parse(read(`.github/workflows/${file}`)) as {
        env?: Record<string, unknown>;
      };
      expect(String(doc.env?.LEFTHOOK)).toBe("0");
    });
  }
});

describe(".gitignore", () => {
  test("doesn't ignore the tracked CHANGELOG.md", () => {
    const lines = read(".gitignore")
      .split("\n")
      .map((l) => l.trim());
    expect(lines).not.toContain("CHANGELOG.md");
  });
});
