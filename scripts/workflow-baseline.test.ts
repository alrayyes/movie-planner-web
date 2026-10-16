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

  // Wandalen/wretry.action reports success with no output and never runs the
  // action it wraps under GitHub's forced Node 20 to 24 runtime
  // (Wandalen/wretry.action#193), so no release was cut while it was in place.
  test("runs release-please directly, pinned by full SHA", () => {
    const step = steps.find((s) => s.uses?.startsWith("googleapis/release-please-action@"));
    expect(step?.uses).toMatch(/^googleapis\/release-please-action@[0-9a-f]{40}$/);
    expect(release?.text).toMatch(/release-please-action@[0-9a-f]{40} # v\d+\.\d+\.\d+/);
  });

  test("no wretry.action wrapper is left in the workflow", () => {
    expect(release?.text).not.toMatch(/uses:\s*Wandalen\/wretry\.action/);
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

// #931: rules/dependencies.md. A dependency audit blocks only the pull request
// that introduces an advisory, and a scan on the default branch keeps one
// ticket for the rest. No pipeline carries an ignore.
const ADVISORY_SCAN = "alrayyes/advisory-scan@425418a63e80eb10142fbd2e82127b7ef3a51d68";

describe("dependency audit", () => {
  test("no workflow or package script carries an --ignore", () => {
    const scripts = Object.values(
      (JSON.parse(readFileSync("package.json", "utf8")) as { scripts?: Record<string, string> })
        .scripts ?? {},
    );

    for (const { file, text } of workflows) expect(text, file).not.toContain("--ignore");
    for (const script of scripts) expect(script).not.toContain("--ignore");
  });

  test("ci.yml's audit job is the shared action in gate mode, on pull requests", () => {
    const job = workflows.find((w) => w.file === "ci.yml")?.doc.jobs.audit as unknown as {
      if?: string;
      steps: { uses?: string; with?: Record<string, string>; run?: string }[];
    };
    const gate = job.steps.find((step) => step.uses?.startsWith("alrayyes/advisory-scan@"));

    expect(gate?.uses).toStartWith(ADVISORY_SCAN);
    expect(gate?.with).toMatchObject({ mode: "gate", command: "bun audit" });
    expect(job.if).toContain("pull_request");
    expect(job.steps.some((step) => step.run?.includes("bun audit"))).toBe(false);
  });

  describe("advisory-scan.yml", () => {
    const scan = workflows.find((w) => w.file === "advisory-scan.yml");

    test("exists, and scans daily, on lockfile pushes to main and on demand", () => {
      const on = scan?.doc.on as Record<string, { branches?: string[]; paths?: string[] }>;

      expect(scan).toBeDefined();
      expect(Object.keys(on).sort()).toEqual(["push", "schedule", "workflow_dispatch"]);
      expect(on.push?.branches).toEqual(["main"]);
      expect(on.push?.paths).toEqual(["package.json", "bun.lock"]);
    });

    test("runs the shared action in scan mode and may write issues, nothing more", () => {
      const job = Object.values(scan?.doc.jobs ?? {})[0] as unknown as {
        permissions?: Record<string, string>;
        steps: { uses?: string; with?: Record<string, string> }[];
      };
      const step = job.steps.find((s) => s.uses?.startsWith("alrayyes/advisory-scan@"));

      expect(step?.uses).toStartWith(ADVISORY_SCAN);
      expect(step?.with).toMatchObject({ mode: "scan", command: "bun audit" });
      expect(job.permissions).toEqual({ contents: "read", issues: "write" });
    });
  });
});

// #937: release-please opens its pull request and adds `autorelease: pending` a
// second later. The opened run's payload predates the label, so only a
// `labeled` run can see it and arm auto-merge.
describe("release-auto-merge.yml", () => {
  const doc = workflows.find((w) => w.file === "release-auto-merge.yml")?.doc;

  test("runs when a label is added, as well as on the default events", () => {
    const on = doc?.on as Record<string, { types?: string[] }>;

    expect(on.pull_request?.types).toEqual(["opened", "synchronize", "reopened", "labeled"]);
  });
});
