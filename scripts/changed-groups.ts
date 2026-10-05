// Which ci.yml jobs a pull request's files wake up (#727).
//
// The `changes` job runs this on the PR's diff and each gated job reads one
// output, so the file lists live here once and a test pins them. lefthook.yml's
// pre-push jobs carry the same lists as their `glob:`, so a hook and the
// pipeline can't disagree about what a job covers.
//
// A group is every file its job opens, not just the files its name suggests:
// the unit tests read README.md, CHANGELOG.md, the workflows and most config
// files, and the e2e suite reads docs/, so those belong to `test`.
//
// CLI: bun scripts/changed-groups.ts <base sha> <head sha>   (the PR's diff)
//      bun scripts/changed-groups.ts --all                   (a push to main)
// prints `group=true|false` lines, ready to append to $GITHUB_OUTPUT.

const SOURCE = "**/*.{ts,tsx,js,mjs,cjs,jsx,json,jsonc,css,astro,svelte}";

export const GROUPS = {
  // biome, oxlint, cclint, sort-package-json and astro check.
  lint: [SOURCE, "bun.lock", "bunfig.toml", "CLAUDE.md", ".claude/**", ".github/workflows/ci.yml"],
  // Unit tests and the Playwright suite.
  test: [
    "src/**",
    "tests/**",
    "scripts/**",
    "test/**",
    "public/**",
    "docs/**",
    "*.md",
    ".github/**",
    "package.json",
    "bun.lock",
    "bunfig.toml",
    "tsconfig.json",
    "astro.config.mjs",
    "playwright.config.ts",
    "wrangler.jsonc",
    "biome.json",
    ".oxlintrc.json",
    ".prettierrc.json",
    ".commitlintrc.json",
    ".gitleaks.toml",
    ".ltex.json",
    "codecov.yml",
    "lefthook.yml",
    "release-please-config.json",
  ],
  // Semgrep scans every language it has rules for.
  security: [
    "**/*.{ts,tsx,js,mjs,cjs,jsx,json,jsonc,yml,yaml,sh,html,astro,svelte}",
    "Dockerfile*",
    ".github/workflows/ci.yml",
  ],
  // The Baikal-in-containers suite imports the CalDAV client and nothing else.
  integration: [
    "src/lib/**",
    "test/integration/**",
    "package.json",
    "bun.lock",
    "bunfig.toml",
    "tsconfig.json",
    ".github/workflows/ci.yml",
  ],
  // prettier --check and markdownlint.
  prose: [
    "**/*.{md,yml,yaml,astro}",
    ".prettierrc.json",
    ".prettierignore",
    ".markdownlint*",
    "package.json",
    "bun.lock",
  ],
} as const;

export type Group = keyof typeof GROUPS;

const globs = Object.fromEntries(
  Object.entries(GROUPS).map(([group, patterns]) => [
    group,
    patterns.map((pattern) => new Bun.Glob(pattern)),
  ]),
) as Record<Group, Bun.Glob[]>;

export function classify(files: string[]): Record<Group, boolean> {
  const result = {} as Record<Group, boolean>;
  for (const group of Object.keys(GROUPS) as Group[]) {
    result[group] = files.some((file) => globs[group].some((glob) => glob.match(file)));
  }
  return result;
}

export function allGroups(): Record<Group, boolean> {
  const result = {} as Record<Group, boolean>;
  for (const group of Object.keys(GROUPS) as Group[]) result[group] = true;
  return result;
}

if (import.meta.main) {
  const [base, head] = process.argv.slice(2);
  let result: Record<Group, boolean>;
  if (base === "--all") {
    result = allGroups();
  } else if (base && head) {
    const diff = await Bun.$`git diff --name-only ${base}...${head}`.text();
    result = classify(diff.split("\n").filter(Boolean));
  } else {
    console.error("usage: changed-groups.ts <base sha> <head sha> | --all");
    process.exit(2);
  }
  for (const [group, wake] of Object.entries(result)) console.log(`${group}=${wake}`);
}
