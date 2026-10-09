import { expect, test } from "bun:test";
import { checkAudits } from "./lighthouse-assertions";

const passing = {
  "cache-insight": { score: 1 },
  "document-latency-insight": { score: 1 },
  "render-blocking-insight": { score: 1 },
  "network-dependency-tree-insight": { score: 1 },
};

test("passes when every asserted audit scores 1", () => {
  expect(checkAudits(passing)).toEqual([]);
});

test("reports an audit that scores under 1 with its level", () => {
  const results = checkAudits({ ...passing, "render-blocking-insight": { score: 0 } });
  expect(results).toEqual([{ id: "render-blocking-insight", level: "error", score: 0 }]);
});

test("reports an audit missing from the report", () => {
  const { "cache-insight": _, ...rest } = passing;
  expect(checkAudits(rest)).toEqual([{ id: "cache-insight", level: "error", score: null }]);
});

test("a warn-level audit is reported as a warning", () => {
  const results = checkAudits({ ...passing, "network-dependency-tree-insight": { score: 0 } });
  expect(results).toEqual([{ id: "network-dependency-tree-insight", level: "warn", score: 0 }]);
});
