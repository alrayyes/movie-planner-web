import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

// #731: releases.md says only logic code cuts a release, and release-bots.md says
// each Dependabot ecosystem groups major bumps on their own.
const root = new URL("..", import.meta.url).pathname;
const read = (path: string) => readFileSync(`${root}${path}`, "utf8");

// For scaffold-astro-site, the logic paths are src/, public/, astro.config.mjs,
// wrangler.jsonc, package.json and bun.lock. Everything else at the root is
// tooling, prose or CI, and a fix: that touches only those releases nothing.
const LOGIC = ["src", "public", "astro.config.mjs", "wrangler.jsonc", "package.json", "bun.lock"];
const TOOLING_AT_ROOT = [
  "lefthook.yml",
  "biome.json",
  "playwright.config.ts",
  "codecov.yml",
  "bunfig.toml",
  "README.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "CLAUDE.md",
  ".commitlintrc.json",
  ".editorconfig",
  ".gitattributes",
  ".gitignore",
  ".gitleaks.toml",
  ".ltex.json",
  ".markdownlint-cli2.yaml",
  ".oxlintrc.json",
  ".prettierignore",
  ".prettierrc.json",
  ".vale.ini",
];

describe("release-please-config.json exclude-paths", () => {
  const config = JSON.parse(read("release-please-config.json")) as {
    packages: Record<string, { "exclude-paths": string[] }>;
  };
  const excluded = config.packages["."]?.["exclude-paths"] ?? [];

  for (const file of TOOLING_AT_ROOT.filter((f) => existsSync(`${root}${f}`))) {
    test(`excludes ${file}`, () => {
      expect(excluded).toContain(file);
    });
  }

  test("never excludes a logic path", () => {
    expect(excluded.filter((p) => LOGIC.includes(p))).toEqual([]);
  });
});

describe("dependabot.yml", () => {
  const config = Bun.YAML.parse(read(".github/dependabot.yml")) as {
    updates: {
      "package-ecosystem": string;
      groups?: Record<string, { "update-types"?: string[] }>;
    }[];
  };

  for (const update of config.updates) {
    const name = update["package-ecosystem"];
    const groups = Object.values(update.groups ?? {});

    test(`${name} has a group of its own for major updates`, () => {
      expect(groups.some((g) => g["update-types"]?.join() === "major")).toBe(true);
    });

    test(`${name}'s minor and patch group doesn't take majors`, () => {
      const others = groups.filter((g) => g["update-types"]?.join() !== "major");
      expect(others.length).toBeGreaterThan(0);
      expect(others.every((g) => !g["update-types"]?.includes("major"))).toBe(true);
    });
  }
});
