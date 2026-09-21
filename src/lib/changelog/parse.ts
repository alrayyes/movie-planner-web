// #369: release-please already maintains CHANGELOG.md with accurate
// versions, dates, and Conventional Commit scopes — parsing it beats
// hand-maintaining a second, parallel list that would drift and require
// guessing a future version number at PR time. The one gap is that a
// scope like `deps-dev`/`ci` isn't end-user relevant even though
// release-please files it under "Bug Fixes"/"Features" same as a real
// product scope — this filters those out, and drops a release entirely
// once nothing user-relevant is left in it.
const INTERNAL_SCOPES = new Set([
  "build",
  "ci",
  "deps",
  "deps-dev",
  "integration",
  "lint",
  "mechanics",
  "release",
  "test",
  "tests",
]);

const VERSION_HEADING = /^## \[([^\]]+)\]\([^)]+\) \((\d{4}-\d{2}-\d{2})\)/;
const SECTION_HEADING = /^### (Features|Bug Fixes)/;
// The shape release-please produces for a squash-merged PR: the PR's own
// number right after the description, then the squashed commit's link.
const ENTRY_LINE = /^\* \*\*([a-z0-9-]+):\*\* (.+?) \(\[#(\d+)\]\((https:\/\/[^)]+)\)\)/;
// #648: a PR merged via "Create a merge commit" instead produces a bare
// commit-SHA link with no PR number directly after the description, and
// — only when the commit message itself carried a "Closes #NNN" trailer
// — a separate "closes [#NNN](url)" clause release-please appends. The
// same PR's merge commit (its body also carries the PR's own
// Conventional-Commits-formatted title, since this repo's
// `merge_commit_message` setting is PR_TITLE) produces a second,
// near-duplicate line for the same change — but that synthesized
// "Merge pull request #NNN..." message has no "closes" trailer of its
// own, so it matches neither this regex nor ENTRY_LINE above and drops
// out on its own; no separate dedup pass needed.
const ENTRY_LINE_MERGE_COMMIT =
  /^\* \*\*([a-z0-9-]+):\*\* (.+?) \(\[[0-9a-f]{7,40}\]\(https:\/\/[^)]+\)\), closes \[#(\d+)\]\((https:\/\/[^)]+)\)/;

export interface ChangelogEntry {
  type: "feature" | "fix";
  scope: string;
  description: string;
  prNumber: number;
  prUrl: string;
}

export interface ChangelogRelease {
  version: string;
  date: string;
  entries: ChangelogEntry[];
}

export function parseChangelog(markdown: string): ChangelogRelease[] {
  const releases: ChangelogRelease[] = [];
  let current: ChangelogRelease | null = null;
  let currentType: "feature" | "fix" | null = null;

  for (const line of markdown.split("\n")) {
    const versionMatch = line.match(VERSION_HEADING);
    if (versionMatch?.[1] && versionMatch[2]) {
      if (current && current.entries.length > 0) releases.push(current);
      current = { version: versionMatch[1], date: versionMatch[2], entries: [] };
      currentType = null;
      continue;
    }

    const sectionMatch = line.match(SECTION_HEADING);
    if (sectionMatch) {
      currentType = sectionMatch[1] === "Features" ? "feature" : "fix";
      continue;
    }

    const entryMatch = line.match(ENTRY_LINE) ?? line.match(ENTRY_LINE_MERGE_COMMIT);
    if (entryMatch && current && currentType) {
      const [, scope, description, prNumber, prUrl] = entryMatch;
      if (!scope || !description || !prNumber || !prUrl) continue;
      if (INTERNAL_SCOPES.has(scope)) continue;
      current.entries.push({
        type: currentType,
        scope,
        description,
        prNumber: Number(prNumber),
        prUrl,
      });
    }
  }
  if (current && current.entries.length > 0) releases.push(current);

  return releases;
}

// #369: a Content Layer collection doesn't promise to preserve the
// loader's own insertion order (confirmed live: getCollection() came
// back sorted by version *string*, "0.79.1" before "0.79.2" before
// "0.79.3", which reads right in isolation but wrongly interleaves once
// several same-day releases and a much older release are all in the
// list together) — so the page sorts explicitly, and a plain date
// comparison isn't enough on its own since more than one release can
// land on the same calendar date. Comparing the version numerically
// breaks that tie unambiguously; the date is only a secondary check for
// the (currently impossible, given release-please's own numbering) case
// of two equal versions.
export function compareReleasesNewestFirst(a: ChangelogRelease, b: ChangelogRelease): number {
  const aParts = a.version.split(".").map(Number);
  const bParts = b.version.split(".").map(Number);
  for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
    const diff = (bParts[i] ?? 0) - (aParts[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return b.date.localeCompare(a.date);
}
