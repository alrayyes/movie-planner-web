// Decides whether a Dependabot `bun` pull request should cut a release (#686).
//
// Dependabot's `prefix-development` and dependency-type groups aren't
// documented for the bun ecosystem, so dependabot.yml gives every bun bump a
// `chore(deps…)` title (no release) and the dependabot-release-type workflow
// calls this to upgrade it to `fix(deps)` when the pull request's package.json
// diff changes `dependencies`. Reading the diff itself, rather than
// fetch-metadata's per-dependency output, because that action's docs don't say
// how a grouped pull request is represented.
//
// CLI: bun scripts/classify-dependency-bump.ts <base package.json> <head package.json> "<title>"
// prints the title the pull request should have (unchanged when no release is due).

export type Bump = "production" | "development" | "none";

type Deps = Record<string, string> | undefined;
// A real package.json has many more keys than the two this reads.
interface PackageJson {
  dependencies?: Deps;
  devDependencies?: Deps;
  [key: string]: unknown;
}

function sectionChanged(base: Deps, head: Deps): boolean {
  const before = base ?? {};
  const after = head ?? {};
  const names = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const name of names) {
    if (before[name] !== after[name]) return true;
  }
  return false;
}

export function classifyBump(base: PackageJson, head: PackageJson): Bump {
  if (sectionChanged(base.dependencies, head.dependencies)) return "production";
  if (sectionChanged(base.devDependencies, head.devDependencies)) return "development";
  return "none";
}

// Only a chore(deps) / chore(deps-dev) title is ever rewritten, so ci(deps)
// bumps and hand-written titles pass through untouched.
export function retitle(title: string, bump: Bump): string {
  if (bump !== "production") return title;
  return title.replace(/^chore\(deps(?:-dev)?\)/, "fix(deps)");
}

if (import.meta.main) {
  const [basePath, headPath, title] = process.argv.slice(2);
  if (!basePath || !headPath || title === undefined) {
    console.error(
      'usage: classify-dependency-bump.ts <base package.json> <head package.json> "<title>"',
    );
    process.exit(2);
  }
  const base = (await Bun.file(basePath).json()) as PackageJson;
  const head = (await Bun.file(headPath).json()) as PackageJson;
  console.log(retitle(title, classifyBump(base, head)));
}
