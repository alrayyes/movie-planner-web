import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { changelogLoader } from "./loader";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "changelog-loader-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const CHANGELOG = `## [1.0.0](https://example.test/compare/a...b) (2026-01-01)

### Features

* **movie-details:** embed the trailer ([#9](https://example.test/issues/9)) ([abc1234](https://example.test/commit/abc1234))
`;

describe("changelogLoader", () => {
  test("is named and loads each user-relevant release into the store", async () => {
    writeFileSync(join(dir, "CHANGELOG.md"), CHANGELOG);
    const calls: string[] = [];
    const stored: { id: string; data: unknown }[] = [];
    const infos: string[] = [];
    const loader = changelogLoader();

    await (loader.load as (ctx: unknown) => Promise<void>)({
      config: { root: pathToFileURL(`${dir}/`) },
      store: {
        clear: () => calls.push("clear"),
        set: (item: { id: string; data: unknown }) => {
          calls.push("set");
          stored.push(item);
        },
      },
      parseData: async ({ id, data }: { id: string; data: unknown }) => {
        calls.push("parse");
        return { id, ...(data as object) };
      },
      logger: { info: (message: string) => infos.push(message) },
    });

    expect(loader.name).toBe("changelog-loader");
    expect(calls).toEqual(["clear", "parse", "set"]);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.id).toBe("1.0.0");
    expect(stored[0]?.data).toMatchObject({ version: "1.0.0", date: "2026-01-01" });
    expect(infos).toEqual(["Loaded 1 user-relevant release(s) from CHANGELOG.md"]);
  });
});
