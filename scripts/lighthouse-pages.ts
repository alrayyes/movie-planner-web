export type AuditedPage = { slug: string; label: string };

// "http://host/docs/connecting/" -> "docs-connecting"; the home page is "home".
export function slugFor(url: string): string {
  const { pathname } = new URL(url);
  return pathname.split("/").filter(Boolean).join("-") || "home";
}

// The page the published reports directory opens on: one row per audited
// page, with its HTML report (for reading) and JSON report (for tooling).
export function indexHtml(pages: AuditedPage[], commit: string, date: string): string {
  const rows = pages
    .map(
      ({ slug, label }) =>
        `<li>${Bun.escapeHTML(label)}: <a href="${slug}.report.html">report</a> (<a href="${slug}.report.json">JSON</a>)</li>`,
    )
    .join("\n");
  return `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>movie-planner-web Lighthouse reports</title>
<h1>Lighthouse reports</h1>
<p>Commit ${Bun.escapeHTML(commit)} on ${Bun.escapeHTML(date)}.</p>
<ul>
${rows}
</ul>
`;
}
