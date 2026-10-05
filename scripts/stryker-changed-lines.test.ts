import { describe, expect, test } from "bun:test";
import { changedRanges } from "./stryker-changed-lines";

// #728: the CI job mutates only the lines a pull request changed, so a surviving
// mutant blocks the merge for new code and not for the inherited survivors in
// code nobody touched. Stryker takes `file:start-end` for that.
//
// These are `git diff -U0` hunks: `@@ -old,count +new,count @@`, where a missing
// count means 1 and a count of 0 means lines were only removed.
const diff = (...parts: string[]) => parts.join("\n");

describe("changedRanges", () => {
  test("a hunk becomes a file:start-end range over the new lines", () => {
    const out = diff(
      "diff --git a/src/lib/ui/heatmap.ts b/src/lib/ui/heatmap.ts",
      "--- a/src/lib/ui/heatmap.ts",
      "+++ b/src/lib/ui/heatmap.ts",
      "@@ -70,2 +70,3 @@ export function x() {",
    );
    expect(changedRanges(out)).toEqual(["src/lib/ui/heatmap.ts:70-72"]);
  });

  test("a single changed line has no count and is one line", () => {
    const out = diff("+++ b/src/lib/ui/heatmap.ts", "@@ -9 +9 @@");
    expect(changedRanges(out)).toEqual(["src/lib/ui/heatmap.ts:9-9"]);
  });

  test("several hunks and files each give a range", () => {
    const out = diff(
      "+++ b/src/lib/ui/heatmap.ts",
      "@@ -1,0 +2,2 @@",
      "@@ -20 +22,4 @@",
      "+++ b/src/lib/omdb/client.ts",
      "@@ -5,1 +5,1 @@",
    );
    expect(changedRanges(out)).toEqual([
      "src/lib/ui/heatmap.ts:2-3",
      "src/lib/ui/heatmap.ts:22-25",
      "src/lib/omdb/client.ts:5-5",
    ]);
  });

  test("a hunk that only removes lines has nothing to mutate", () => {
    const out = diff("+++ b/src/lib/ui/heatmap.ts", "@@ -10,3 +9,0 @@");
    expect(changedRanges(out)).toEqual([]);
  });

  test("only non-test source under src/lib is mutated", () => {
    const out = diff(
      "+++ b/src/lib/ui/heatmap.test.ts",
      "@@ -1 +1 @@",
      "+++ b/src/components/MovieDetails.svelte",
      "@@ -1 +1 @@",
      "+++ b/scripts/changed-groups.ts",
      "@@ -1 +1 @@",
      "+++ b/src/lib/types.d.ts",
      "@@ -1 +1 @@",
      "+++ b/src/lib/ui/classes.ts",
      "@@ -3 +3 @@",
    );
    expect(changedRanges(out)).toEqual(["src/lib/ui/classes.ts:3-3"]);
  });

  test("a deleted file has no new lines", () => {
    const out = diff("--- a/src/lib/ui/old.ts", "+++ /dev/null", "@@ -1,4 +0,0 @@");
    expect(changedRanges(out)).toEqual([]);
  });

  test("no diff means no ranges", () => {
    expect(changedRanges("")).toEqual([]);
  });
});
