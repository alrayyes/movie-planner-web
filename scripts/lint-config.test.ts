import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

// #729: the lint config as linting.md and browser-compat.md describe it.
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("lefthook.yml", () => {
  const lefthook = Bun.YAML.parse(read("lefthook.yml")) as {
    output?: string[];
    "pre-commit"?: { jobs?: { name: string; glob?: string }[] };
  };

  test("prints only failures", () => {
    expect(lefthook.output).toEqual(["failure"]);
  });

  test("the pre-commit biome job covers CSS too", () => {
    const biome = lefthook["pre-commit"]?.jobs?.find((job) => job.name === "biome");
    expect(biome?.glob).toMatch(/\bcss\b/);
  });
});

describe("biome.json", () => {
  const biome = JSON.parse(read("biome.json")) as {
    $schema: string;
    linter: { rules: { nursery?: { useBaseline?: string } } };
  };
  const pkg = JSON.parse(read("package.json")) as { devDependencies: Record<string, string> };

  test("warns on CSS outside Baseline widely available, and never fails the build for it", () => {
    expect(biome.linter.rules.nursery?.useBaseline).toBe("warn");
  });

  // #837: a URL pinned to a version had to be edited by hand on every Biome
  // bump, which failed Dependabot's pull request. The package ships its own
  // schema, so pointing at that can't drift from what's installed.
  test("its $schema is the schema file inside the installed Biome package", () => {
    expect(biome.$schema).toBe("./node_modules/@biomejs/biome/configuration_schema.json");
    expect(existsSync(new URL(`../${biome.$schema}`, import.meta.url))).toBe(true);
  });
});

describe("CONTRIBUTING.md", () => {
  test("lists every lint script in package.json", () => {
    const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
    const contributing = read("CONTRIBUTING.md");
    for (const script of Object.keys(pkg.scripts).filter((name) => name.startsWith("lint:"))) {
      expect(contributing).toContain(`bun run ${script}`);
    }
  });
});
