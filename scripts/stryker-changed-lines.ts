// The lines a pull request changed, as Stryker's `file:start-end` ranges (#728).
//
// The mutation job mutates only those lines, so a surviving mutant blocks the
// merge for code the PR wrote and not for the inherited survivors in code
// nobody touched (rules/testing.md: scope the run, don't lower the threshold).
//
// CLI: bun scripts/stryker-changed-lines.ts <base sha> <head sha>
// prints the ranges comma-separated, ready for `stryker run --mutate`, and
// nothing when no line of src/lib source changed.

const MUTATED = /^src\/lib\/.+\.ts$/;
const NOT_MUTATED = /\.(test|d)\.ts$/;

export function changedRanges(diff: string): string[] {
  const ranges: string[] = [];
  let file: string | undefined;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ ")) {
      const path = line.slice(4).replace(/^b\//, "");
      file = MUTATED.test(path) && !NOT_MUTATED.test(path) ? path : undefined;
      continue;
    }
    const hunk = line.match(/^@@ -\S+ \+(\d+)(?:,(\d+))? @@/);
    if (!file || !hunk) continue;
    const start = Number(hunk[1]);
    const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
    // A count of 0 means lines were only removed: nothing new to mutate.
    if (count > 0) ranges.push(`${file}:${start}-${start + count - 1}`);
  }
  return ranges;
}

if (import.meta.main) {
  const [base, head] = process.argv.slice(2);
  if (!base || !head) {
    console.error("usage: stryker-changed-lines.ts <base sha> <head sha>");
    process.exit(2);
  }
  const diff = await Bun.$`git diff -U0 ${base}...${head} -- src/lib`.text();
  console.log(changedRanges(diff).join(","));
}
