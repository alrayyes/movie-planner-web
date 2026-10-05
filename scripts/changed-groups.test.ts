import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { allGroups, classify, GROUPS, type Group } from "./changed-groups";

// #727: which ci.yml jobs a pull request's files wake up. One case per path, so
// a filter that quietly stops covering a file fails here and not on a PR that
// merged past a job it should have run.
//
// The test group is wider than its name suggests on purpose: the unit tests
// open README.md, CHANGELOG.md, the workflows and most config files, and the
// e2e suite reads docs/, so a docs-only change can still fail it.
const cases: [path: string, groups: Group[]][] = [
  ["src/lib/caldav/client.ts", ["lint", "test", "security", "integration"]],
  ["src/components/Foo.svelte", ["lint", "test", "security"]],
  ["src/pages/index.astro", ["lint", "test", "security", "prose"]],
  ["tests/venues.spec.ts", ["lint", "test", "security"]],
  ["test/integration/compose.yaml", ["test", "security", "integration", "prose"]],
  ["scripts/lint-prose.sh", ["test", "security"]],
  ["scripts/changed-groups.ts", ["lint", "test", "security"]],
  ["public/schemas/movie-viewings.schema.json", ["lint", "test", "security", "integration"]],
  ["package.json", ["lint", "test", "security", "integration", "prose"]],
  ["bun.lock", ["lint", "test", "integration", "prose"]],
  ["tsconfig.json", ["lint", "test", "security", "integration"]],
  ["biome.json", ["lint", "test", "security"]],
  ["CLAUDE.md", ["lint", "test", "prose"]],
  [".claude/settings.json", ["lint", "security"]],
  ["README.md", ["test", "prose"]],
  ["docs/getting-started.md", ["test", "prose"]],
  ["lefthook.yml", ["test", "security", "prose"]],
  [".github/workflows/ci.yml", ["lint", "test", "security", "integration", "prose"]],
  [".github/workflows/prose.yml", ["test", "security", "prose"]],
  [".prettierrc.json", ["lint", "test", "security", "prose"]],
  [".markdownlint-cli2.yaml", ["security", "prose"]],
  ["openspec/changes/x/proposal.md", ["prose"]],
  ["styles/House/accept.txt", []],
  ["LICENSE", []],
];

describe("classify", () => {
  for (const [path, expected] of cases) {
    test(`${path} runs ${expected.length ? expected.join(", ") : "no gated job"}`, () => {
      const result = classify([path]);
      const got = (Object.keys(GROUPS) as Group[]).filter((g) => result[g]);
      expect(got.sort()).toEqual([...expected].sort());
    });
  }

  test("a mixed change wakes the union of its files' groups", () => {
    const result = classify(["README.md", "src/lib/caldav/client.ts"]);
    expect(result).toEqual({
      lint: true,
      test: true,
      security: true,
      integration: true,
      prose: true,
    });
  });

  test("no changed files wakes nothing", () => {
    expect(Object.values(classify([])).some(Boolean)).toBe(false);
  });

  test("allGroups wakes every group, for a push to main", () => {
    expect(Object.values(allGroups()).every(Boolean)).toBe(true);
  });
});

// The hooks and the pipeline must agree on what a job covers (ci.md, "Hooks use
// the same globs"), so a pre-push job's glob is its group's patterns exactly.
// Parsed rather than grepped, so a YAML anchor shared between jobs still counts.
type Job = { name?: string; glob?: string | string[]; group?: { jobs: Job[] } };
const flatten = (jobs: Job[]): Job[] =>
  jobs.flatMap((j) => (j.group ? flatten(j.group.jobs) : [j]));
const hook = Bun.YAML.parse(readFileSync(join(import.meta.dir, "..", "lefthook.yml"), "utf8")) as {
  "pre-push": { jobs: Job[] };
};
const prePush = flatten(hook["pre-push"].jobs);

describe("lefthook globs", () => {
  const jobs: Record<string, Group> = {
    check: "lint",
    test: "test",
    biome: "lint",
    tailwind: "lint",
    claude: "lint",
    "sort-package-json": "lint",
    prettier: "prose",
    markdownlint: "prose",
  };

  for (const [name, group] of Object.entries(jobs)) {
    test(`pre-push ${name} uses the ${group} group's patterns`, () => {
      const job = prePush.find((j) => j.name === name);
      expect(job).toBeDefined();
      expect([job?.glob ?? []].flat()).toEqual([...GROUPS[group]]);
    });
  }
});
