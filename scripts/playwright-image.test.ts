import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { playwrightImageProblems, readSources, type Sources } from "./playwright-image";

// #952: the Playwright jobs run in a prebuilt image whose tag has to equal the
// library version. These pin the check itself; the last test runs it on the
// real files, which is what fails a Playwright bump that forgets a workflow.
const DIGEST = `sha256:${"a".repeat(64)}`;
const image = (version: string) => `ghcr.io/alrayyes/ci-playwright:${version}@${DIGEST}`;
const SETUP_BUN =
  "      - uses: oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6\n        with:\n          bun-version-file: package.json\n";
const workflow = (version: string) =>
  `jobs:\n  test:\n    container:\n      image: ${image(version)}\n      options: --ipc=host\n    steps:\n${SETUP_BUN}`;

const good: Sources = {
  packageJson: '{ "devDependencies": { "@playwright/test": "1.64.1" } }',
  lockfile: '"@playwright/test": ["@playwright/test@1.64.1", "", {}]',
  workflows: { "ci.yml": workflow("1.64.1"), "screenshots.yml": workflow("1.64.1") },
};

describe("playwrightImageProblems", () => {
  test("is quiet when the image, package.json and bun.lock agree", () => {
    expect(playwrightImageProblems(good)).toEqual([]);
  });

  test("names the workflow whose tag differs from the library", () => {
    const problems = playwrightImageProblems({
      ...good,
      workflows: { ...good.workflows, "screenshots.yml": workflow("1.64.0") },
    });
    expect(problems).toContain(
      "screenshots.yml: image is for Playwright 1.64.0 but @playwright/test is 1.64.1",
    );
  });

  test("fails when bun.lock lags package.json", () => {
    const problems = playwrightImageProblems({
      ...good,
      lockfile: '"@playwright/test": ["@playwright/test@1.64.0", "", {}]',
    });
    expect(problems).toContain(
      "package.json pins @playwright/test 1.64.1 but bun.lock locks 1.64.0",
    );
  });

  test("rejects a tag with no digest", () => {
    const problems = playwrightImageProblems({
      ...good,
      workflows: { "ci.yml": "      image: ghcr.io/alrayyes/ci-playwright:1.64.1\n" },
    });
    expect(problems.join("\n")).toContain("is not pinned as <version>@sha256:<digest>");
  });

  test("fails when two workflows use the same version with different digests", () => {
    const other = workflow("1.64.1").replace("a".repeat(64), "b".repeat(64));
    const problems = playwrightImageProblems({
      ...good,
      workflows: { ...good.workflows, "screenshots.yml": other },
    });
    expect(problems).toEqual([expect.stringContaining("the jobs use different images")]);
  });

  test("fails when no workflow uses the image", () => {
    expect(playwrightImageProblems({ ...good, workflows: { "ci.yml": "jobs: {}\n" } })).toContain(
      "no workflow job runs in the Playwright image",
    );
  });

  test("fails when a workflow still installs the browser", () => {
    const problems = playwrightImageProblems({
      ...good,
      workflows: {
        ...good.workflows,
        "ci.yml": `${workflow("1.64.1")}run: bunx playwright install chromium\n`,
      },
    });
    expect(problems.join("\n")).toContain("ci.yml still runs 'playwright install'");
  });

  // #963: the image's own bun is whatever it was built with, so a job in it
  // has to install the one package.json pins, like every other job does.
  test("fails when a job in the image doesn't install the pinned bun", () => {
    const bare = workflow("1.64.1").replace(SETUP_BUN, "      - run: bun install\n");
    const problems = playwrightImageProblems({
      ...good,
      workflows: { ...good.workflows, "ci.yml": bare },
    });
    expect(problems).toContain(
      "ci.yml: the job in the Playwright image doesn't run setup-bun with bun-version-file: package.json before it uses bun",
    );
  });

  test("looks at the job in the image, not setup-bun in a neighbour", () => {
    const elsewhere = `jobs:\n  lint:\n    steps:\n${SETUP_BUN}${workflow("1.64.1").replace("jobs:\n", "").replace(SETUP_BUN, "")}`;
    const problems = playwrightImageProblems({
      ...good,
      workflows: { ...good.workflows, "ci.yml": elsewhere },
    });
    expect(problems.join("\n")).toContain(
      "ci.yml: the job in the Playwright image doesn't run setup-bun",
    );
  });

  test("ignores a commented-out setup-bun", () => {
    const commented = workflow("1.64.1").replace(
      SETUP_BUN,
      SETUP_BUN.replace(/^/gm, "#").replace("#      -", "      #"),
    );
    expect(
      playwrightImageProblems({ ...good, workflows: { ...good.workflows, "ci.yml": commented } }),
    ).toContain(
      "ci.yml: the job in the Playwright image doesn't run setup-bun with bun-version-file: package.json before it uses bun",
    );
  });

  test("wants bun-version-file on the setup-bun step itself, not on another step", () => {
    const split = workflow("1.64.1").replace(
      SETUP_BUN,
      "      - uses: oven-sh/setup-bun@abc\n        with:\n          bun-version: 1.0\n      - uses: other/action@abc\n        with:\n          bun-version-file: package.json\n",
    );
    expect(
      playwrightImageProblems({ ...good, workflows: { ...good.workflows, "ci.yml": split } })
        .length,
    ).toBe(1);
  });

  test("wants setup-bun before the first step that uses bun", () => {
    const late = workflow("1.64.1").replace(SETUP_BUN, `      - run: bun install\n${SETUP_BUN}`);
    expect(
      playwrightImageProblems({ ...good, workflows: { ...good.workflows, "ci.yml": late } }).length,
    ).toBe(1);
  });

  test("reads a quoted job key", () => {
    const quoted = workflow("1.64.1").replace("  test:", '  "test":');
    expect(
      playwrightImageProblems({ ...good, workflows: { ...good.workflows, "ci.yml": quoted } }),
    ).toEqual([]);
  });

  test("the repository's own files agree", async () => {
    const root = join(import.meta.dir, "..");
    expect(playwrightImageProblems(await readSources(root))).toEqual([]);
  });
});
