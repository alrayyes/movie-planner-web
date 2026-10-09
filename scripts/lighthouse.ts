// Run Lighthouse against a running server and assert the delivery audits.
// usage: bun scripts/lighthouse.ts [--out <dir>] [url...]
// Defaults to the home page and the docs on http://localhost:4321. With
// --out, each page's HTML and JSON report is kept in <dir> with an index.html
// linking them, for publishing; without it, they're read and thrown away.
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AuditReport, checkAudits } from "./lighthouse-assertions";
import { indexHtml, slugFor } from "./lighthouse-pages";

const args = process.argv.slice(2);
const outFlag = args.indexOf("--out");
const out = outFlag === -1 ? undefined : args.splice(outFlag, 2)[1];
const urls = args.length > 0 ? args : ["http://localhost:4321/", "http://localhost:4321/docs/"];

const scratch = await mkdtemp(join(tmpdir(), "lighthouse-"));
const dir = out ?? scratch;
await mkdir(dir, { recursive: true });

let failed = false;
try {
  for (const url of urls) {
    const slug = slugFor(url);
    const run = Bun.spawnSync(
      [
        "bunx",
        "lighthouse@13.0.1",
        url,
        "--output=json",
        "--output=html",
        `--output-path=${join(dir, slug)}`,
        "--only-categories=performance",
        "--chrome-flags=--headless --no-sandbox",
        "--quiet",
      ],
      { stdout: "inherit", stderr: "inherit" },
    );
    if (run.exitCode !== 0) process.exit(run.exitCode ?? 1);

    const report = await readFile(join(dir, `${slug}.report.json`), "utf8");
    const { audits } = JSON.parse(report) as { audits: AuditReport };
    for (const { id, level, score } of checkAudits(audits)) {
      console.log(`${level}: ${slug} ${id} scored ${score}`);
      if (level === "error") failed = true;
    }
  }

  if (out) {
    const pages = urls.map((url) => ({ slug: slugFor(url), label: new URL(url).pathname }));
    const commit = process.env.GITHUB_SHA ?? "local";
    await writeFile(
      join(out, "index.html"),
      indexHtml(pages, commit, new Date().toISOString().slice(0, 10)),
    );
  }
} finally {
  await rm(scratch, { recursive: true, force: true });
}

if (failed) process.exit(1);
console.log("Lighthouse delivery audits pass.");
