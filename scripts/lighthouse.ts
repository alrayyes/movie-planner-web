// Run Lighthouse against a running server and assert the delivery audits.
// usage: bun scripts/lighthouse.ts [url]   (default http://localhost:4321/)
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AuditReport, checkAudits } from "./lighthouse-assertions";

const url = process.argv[2] ?? "http://localhost:4321/";
const dir = await mkdtemp(join(tmpdir(), "lighthouse-"));
const output = join(dir, "report.json");

try {
  const run = Bun.spawnSync(
    [
      "bunx",
      "lighthouse@13.0.1",
      url,
      "--output=json",
      `--output-path=${output}`,
      "--only-categories=performance",
      "--chrome-flags=--headless --no-sandbox",
      "--quiet",
    ],
    { stdout: "inherit", stderr: "inherit" },
  );
  if (run.exitCode !== 0) process.exit(run.exitCode ?? 1);

  const { audits } = JSON.parse(await readFile(output, "utf8")) as { audits: AuditReport };
  const findings = checkAudits(audits);
  for (const { id, level, score } of findings) console.log(`${level}: ${id} scored ${score}`);
  if (findings.some((finding) => finding.level === "error")) process.exit(1);
  console.log("Lighthouse delivery audits pass.");
} finally {
  await rm(dir, { recursive: true, force: true });
}
