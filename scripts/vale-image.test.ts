import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

// #719: Vale runs from the official image in CI (prose.yml) and, where the hook
// has no `vale` on PATH, from the same image via scripts/lint-prose.sh. The
// two pins have to be one pin, or the hook and the pipeline check against
// different Vale versions.
const IMAGE = /jdkato\/vale:v\d+\.\d+\.\d+@sha256:[0-9a-f]{64}/;

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("Vale image pin", () => {
  const workflow = read(".github/workflows/prose.yml");
  const script = read("scripts/lint-prose.sh");

  test("the workflow pins the official image by tag and digest", () => {
    expect(workflow.match(IMAGE)).not.toBeNull();
  });

  test("the lint script pins the same image", () => {
    expect(script.match(IMAGE)).not.toBeNull();
    expect(script.match(IMAGE)?.[0]).toBe(workflow.match(IMAGE)?.[0]);
  });

  test("the workflow no longer builds Vale from source", () => {
    expect(workflow).not.toContain("go install");
    expect(workflow).not.toContain("setup-go");
    expect(workflow).not.toContain("VALE_VERSION");
  });

  test("the job overrides the image's entrypoint and installs bash and git first", () => {
    expect(workflow).toContain('options: --entrypoint ""');
    expect(workflow).toContain("apk add --no-cache bash git");
  });

  test("contributors are not told to go install Vale", () => {
    expect(read("CONTRIBUTING.md")).not.toContain("go install");
  });
});
