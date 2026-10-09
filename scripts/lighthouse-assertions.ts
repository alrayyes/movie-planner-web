// The Lighthouse 13 insight audits behind #799. Lighthouse CI 0.15 bundles
// Lighthouse 12, which has none of these IDs, so scripts/lighthouse.ts runs
// `lighthouse@13.0.1` through bunx, not as a devDependency (its tree carries
// ten advisories `bun audit` fails on), and checks them here.
//
// network-dependency-tree-insight stays at warn: on a static page whose app
// is a chain of ES modules it scores 0 with a 126 ms longest chain and no LCP
// saving, and there's no cheaper chain to build without bundling the app into
// one file.
export const ASSERTIONS: Record<string, "warn" | "error"> = {
  "cache-insight": "error",
  "document-latency-insight": "error",
  "render-blocking-insight": "error",
  "network-dependency-tree-insight": "warn",
};

export type AuditReport = Record<string, { score: number | null } | undefined>;
export type Finding = { id: string; level: "warn" | "error"; score: number | null };

export function checkAudits(audits: AuditReport): Finding[] {
  const findings: Finding[] = [];
  for (const [id, level] of Object.entries(ASSERTIONS)) {
    const score = audits[id]?.score ?? null;
    if (score === null || score < 1) findings.push({ id, level, score });
  }
  return findings;
}
