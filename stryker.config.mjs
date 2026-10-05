// Mutation testing for src/lib (#728). The unit tests there are fast and pure,
// which is what makes mutating them worth it; components and pages aren't covered.
//
// A run that mutates only changed lines is `scripts/stryker-changed-lines.ts`
// feeding `--mutate`; this file is what a full run (`bun run mutation`) uses.
import { readdirSync } from "node:fs";
import { join } from "node:path";

// The bun runner takes an explicit list, not a glob, and with none it would
// discover every test in the repo, including the Baikal integration tests.
const testFiles = readdirSync("src/lib", { recursive: true })
  .filter((file) => String(file).endsWith(".test.ts"))
  .map((file) => join("src/lib", String(file)))
  .sort();

/** @type {import("@stryker-mutator/api/core").PartialStrykerOptions} */
export default {
  testRunner: "bun",
  plugins: ["@hughescr/stryker-bun-runner", "@stryker-mutator/typescript-checker"],
  checkers: ["typescript"],
  tsconfigFile: "tsconfig.json",
  coverageAnalysis: "perTest",
  // ui/classes.ts is Tailwind class strings. A mutant there changes how a
  // button looks, and no unit test can tell; Playwright and the Tailwind lint
  // are what watch it (#749).
  mutate: ["src/lib/**/*.ts", "!src/lib/**/*.test.ts", "!src/lib/ui/classes.ts"],
  // A cold runner can take longer than the default 5s to print bun's inspector URL.
  bun: { testFiles, inspectorTimeout: 20000 },
  reporters: ["clear-text", "json"],
  jsonReporter: { fileName: "reports/mutation/mutation.json" },
  // A surviving mutant blocks the merge (rules/testing.md). The CI job only
  // mutates the lines a pull request changed, so inherited survivors in code
  // nobody touched don't (#728).
  thresholds: { high: 100, low: 90, break: 100 },
  incremental: false,
};
