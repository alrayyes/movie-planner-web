import { describe, expect, test } from "bun:test";
import { digestFrom, repinImage, repinWorkflows } from "./pin-playwright-image";
import { playwrightImageProblems } from "./playwright-image";

// #985: Dependabot moves @playwright/test but can't edit the workflows' image
// pin, so a workflow repins them. These cover the rewrite and the digest read;
// the last test proves the rewrite satisfies the guard in playwright-image.ts.
const DIGEST = `sha256:${"c".repeat(64)}`;
const OLD = `ghcr.io/alrayyes/ci-playwright:1.64.1@sha256:${"a".repeat(64)}`;
const NEW = `ghcr.io/alrayyes/ci-playwright:1.65.1@${DIGEST}`;
const wf = (image: string) =>
  `jobs:\n  test:\n    container:\n      image: ${image}\n      options: --ipc=host\n`;

describe("repinImage", () => {
  test("moves the tag and digest, leaving the rest of the file alone", () => {
    expect(repinImage(wf(OLD), "1.65.1", DIGEST)).toBe(wf(NEW));
  });

  test("moves every image line in a file", () => {
    const two = `${wf(OLD)}${wf(OLD)}`;
    expect(repinImage(two, "1.65.1", DIGEST)).toBe(`${wf(NEW)}${wf(NEW)}`);
  });

  test("is a no-op when already pinned", () => {
    expect(repinImage(wf(NEW), "1.65.1", DIGEST)).toBe(wf(NEW));
  });

  test("leaves a file with no image line untouched", () => {
    expect(repinImage("jobs: {}\n", "1.65.1", DIGEST)).toBe("jobs: {}\n");
  });
});

describe("digestFrom", () => {
  test("reads the index digest from imagetools output", () => {
    const out = `Name:      ghcr.io/alrayyes/ci-playwright:1.65.1\nMediaType: application/vnd.oci.image.index.v1+json\nDigest:    ${DIGEST}\n\nManifests:\n  Digest: sha256:${"d".repeat(64)}\n`;
    expect(digestFrom(out)).toBe(DIGEST);
  });

  test("throws when there is no digest", () => {
    expect(() => digestFrom("nope")).toThrow("no digest");
  });
});

describe("repinWorkflows", () => {
  const packageJson = '{ "devDependencies": { "@playwright/test": "1.65.1" } }';

  test("asks for the package.json version's tag and rewrites each workflow", async () => {
    const asked: string[] = [];
    const out = await repinWorkflows({
      packageJson,
      workflows: { "ci.yml": wf(OLD), "lint.yml": "jobs: {}\n" },
      resolve: async (version) => {
        asked.push(version);
        return DIGEST;
      },
    });
    expect(asked).toEqual(["1.65.1"]);
    expect(out).toEqual({ "ci.yml": wf(NEW) });
  });

  test("fails clearly when package.json pins no Playwright version", async () => {
    await expect(
      repinWorkflows({ packageJson: "{}", workflows: {}, resolve: async () => DIGEST }),
    ).rejects.toThrow("pins no exact @playwright/test version");
  });

  test("passes on the resolver's failure, so a missing tag stops the job", async () => {
    await expect(
      repinWorkflows({
        packageJson,
        workflows: { "ci.yml": wf(OLD) },
        resolve: async (v) => {
          throw new Error(`ci-playwright:${v} does not exist yet`);
        },
      }),
    ).rejects.toThrow("ci-playwright:1.65.1 does not exist yet");
  });

  test("what it writes satisfies the image guard", async () => {
    const workflows = await repinWorkflows({
      packageJson,
      workflows: { "ci.yml": wf(OLD) },
      resolve: async () => DIGEST,
    });
    const problems = playwrightImageProblems({
      packageJson,
      lockfile: '"@playwright/test@1.65.1"',
      workflows: { "ci.yml": workflows["ci.yml"] as string },
    });
    // only the setup-bun check, which this fixture doesn't carry, may remain
    expect(problems.filter((p) => !p.includes("setup-bun"))).toEqual([]);
  });
});
