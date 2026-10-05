import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// #730: ci.md's baseline for every workflow, and release-publishing.md's retry
// around the release step.
const dir = join(new URL("..", import.meta.url).pathname, ".github/workflows");

type Workflow = {
  on: string | string[] | Record<string, unknown>;
  concurrency?: { group?: string; "cancel-in-progress"?: boolean };
  permissions?: Record<string, string>;
  jobs: Record<
    string,
    {
      permissions?: Record<string, string>;
      steps?: { uses?: string; with?: unknown; run?: string }[];
    }
  >;
};

const workflows = readdirSync(dir)
  .filter((file) => file.endsWith(".yml"))
  .map((file) => ({
    file,
    text: readFileSync(join(dir, file), "utf8"),
    doc: Bun.YAML.parse(readFileSync(join(dir, file), "utf8")) as Workflow,
  }));

const triggers = (doc: Workflow): string[] =>
  typeof doc.on === "string" ? [doc.on] : Array.isArray(doc.on) ? doc.on : Object.keys(doc.on);

const isPullRequestTriggered = (doc: Workflow) =>
  triggers(doc).some((t) => t === "pull_request" || t === "pull_request_target");

describe("pull-request workflows", () => {
  for (const { file, doc } of workflows.filter((w) => isPullRequestTriggered(w.doc))) {
    test(`${file} cancels a superseded run`, () => {
      expect(doc.concurrency?.group).toBeTruthy();
      expect(doc.concurrency?.["cancel-in-progress"]).toBe(true);
    });
  }
});

describe("permissions", () => {
  for (const { file, doc } of workflows) {
    test(`${file} grants no write permission at workflow level`, () => {
      const writes = Object.entries(doc.permissions ?? {}).filter(([, v]) => v === "write");
      expect(writes).toEqual([]);
    });
  }
});

describe("release.yml", () => {
  const release = workflows.find((w) => w.file === "release.yml");
  const steps = release?.doc.jobs["release-please"]?.steps ?? [];

  test("runs release-please through Wandalen/wretry.action, pinned by full SHA", () => {
    const wrapper = steps.find((s) => s.uses?.startsWith("Wandalen/wretry.action@"));
    expect(wrapper?.uses).toMatch(/^Wandalen\/wretry\.action@[0-9a-f]{40}$/);
    expect(release?.text).toMatch(/wretry\.action@[0-9a-f]{40} # v\d+\.\d+\.\d+/);
  });

  test("no bare release-please step is left", () => {
    expect(steps.some((s) => s.uses?.startsWith("googleapis/release-please-action@"))).toBe(false);
  });

  test("the wrapped action is release-please, pinned by full SHA", () => {
    const wrapper = steps.find((s) => s.uses?.startsWith("Wandalen/wretry.action@"));
    const inputs = wrapper?.with as { action?: string; attempt_limit?: number | string };
    expect(inputs.action).toMatch(/^googleapis\/release-please-action@[0-9a-f]{40}$/);
    expect(Number(inputs.attempt_limit)).toBeGreaterThanOrEqual(2);
  });
});

// #767: Stryker's TypeScript checker compiles the whole project, and
// src/content.config.ts imports `astro:content`, whose types Astro generates
// into .astro/types.d.ts. A clean checkout has none, so the job died at start-up
// on every pull request that touched src/lib until it generated them first.
describe("ci.yml's mutation job", () => {
  const ci = workflows.find((w) => w.file === "ci.yml");
  const steps = ci?.doc.jobs.mutation?.steps ?? [];
  const at = (needle: string) => steps.findIndex((step) => step.run?.includes(needle));

  test("has a mutation job with steps", () => {
    expect(steps.length).toBeGreaterThan(0);
  });

  test("generates Astro's types before it runs Stryker", () => {
    expect(at("astro sync")).toBeGreaterThan(-1);
    expect(at("stryker run")).toBeGreaterThan(-1);
    expect(at("astro sync")).toBeLessThan(at("stryker run"));
  });

  test("installs dependencies before it generates them", () => {
    expect(at("bun install")).toBeGreaterThan(-1);
    expect(at("bun install")).toBeLessThan(at("astro sync"));
  });
});
