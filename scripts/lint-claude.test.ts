import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// #720: CLAUDE.md and .claude/settings*.json are linted by cclint, per file,
// and only cclint's own error-severity findings fail the run.
const root = new URL("..", import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), "lint-claude-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function run(...files: string[]) {
  const result = Bun.spawnSync(["bash", join(root, "scripts/lint-claude.sh"), ...files], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  return { code: result.exitCode, out: result.stdout.toString() + result.stderr.toString() };
}

describe("lint-claude.sh", () => {
  test("fails on an error-severity finding (an @import that doesn't resolve)", () => {
    const bad = join(dir, "CLAUDE.md");
    writeFileSync(bad, "# Bad\n\nSee @./does-not-exist.md\n");
    const result = run(bad);
    expect(result.code).not.toBe(0);
    expect(result.out).toContain("import-resolution");
  });

  test("passes a file with only warnings and notes", () => {
    const fine = join(dir, "FINE.md");
    writeFileSync(fine, "# Fine\n\n- one short bullet\n");
    expect(run(fine).code).toBe(0);
  });

  test("with no arguments, lints this repo's own CLAUDE.md and passes", () => {
    expect(run().code).toBe(0);
  });
});

describe("wiring", () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

  test("cclint is a devDependency pinned to an exact version", () => {
    expect(pkg.devDependencies["@felixgeelhaar/cclint"]).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test("lint:claude runs the script", () => {
    expect(pkg.scripts["lint:claude"]).toContain("lint-claude.sh");
  });

  test("the pre-push hook and CI both run it", () => {
    expect(readFileSync(join(root, "lefthook.yml"), "utf8")).toContain("lint:claude");
    expect(readFileSync(join(root, ".github/workflows/ci.yml"), "utf8")).toContain("lint:claude");
  });
});
