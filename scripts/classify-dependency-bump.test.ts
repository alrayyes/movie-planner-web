import { describe, expect, test } from "bun:test";
import { classifyBump, retitle } from "./classify-dependency-bump";

const pkg = (deps: Record<string, string>, devDeps: Record<string, string> = {}) => ({
  name: "movie-planner-web",
  dependencies: deps,
  devDependencies: devDeps,
});

describe("classifyBump", () => {
  test("a changed dependencies entry is production", () => {
    const base = pkg({ astro: "7.3.2" }, { vitest: "1.0.0" });
    const head = pkg({ astro: "7.3.3" }, { vitest: "1.0.0" });
    expect(classifyBump(base, head)).toBe("production");
  });

  test("a changed devDependencies entry alone is development", () => {
    const base = pkg({ astro: "7.3.3" }, { vitest: "1.0.0" });
    const head = pkg({ astro: "7.3.3" }, { vitest: "1.0.1" });
    expect(classifyBump(base, head)).toBe("development");
  });

  test("a grouped bump touching both counts as production", () => {
    const base = pkg({ svelte: "5.0.0" }, { vitest: "1.0.0" });
    const head = pkg({ svelte: "5.0.1" }, { vitest: "1.0.1" });
    expect(classifyBump(base, head)).toBe("production");
  });

  test("an added or removed dependencies entry is production", () => {
    const base = pkg({ astro: "7.3.3" });
    expect(classifyBump(base, pkg({ astro: "7.3.3", svelte: "5.0.0" }))).toBe("production");
    expect(classifyBump(pkg({ astro: "7.3.3", svelte: "5.0.0" }), base)).toBe("production");
  });

  test("no change to either section is none (a lockfile-only bump)", () => {
    const same = pkg({ astro: "7.3.3" }, { vitest: "1.0.0" });
    expect(classifyBump(same, structuredClone(same))).toBe("none");
  });

  test("a package.json with no dependencies section does not throw", () => {
    expect(classifyBump({ name: "x" }, { name: "x", devDependencies: { a: "1.0.0" } })).toBe(
      "development",
    );
  });
});

describe("retitle", () => {
  test("production turns chore(deps) into fix(deps)", () => {
    expect(
      retitle("chore(deps): bump the bun-dependencies group with 11 updates", "production"),
    ).toBe("fix(deps): bump the bun-dependencies group with 11 updates");
  });

  test("production turns chore(deps-dev) into fix(deps) too", () => {
    expect(retitle("chore(deps-dev): bump vitest", "production")).toBe("fix(deps): bump vitest");
  });

  test("development and none leave the title alone", () => {
    const title = "chore(deps-dev): bump vitest from 1.0.0 to 1.0.1";
    expect(retitle(title, "development")).toBe(title);
    expect(retitle(title, "none")).toBe(title);
  });

  test("a title that is not a chore(deps…) one is never touched", () => {
    expect(retitle("ci(deps): bump actions/checkout", "production")).toBe(
      "ci(deps): bump actions/checkout",
    );
    expect(retitle("feat: something", "production")).toBe("feat: something");
  });
});
