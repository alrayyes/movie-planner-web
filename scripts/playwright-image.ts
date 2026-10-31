// The browser jobs run in ghcr.io/alrayyes/ci-playwright, whose browsers only
// work with the @playwright/test release the image was built for. A container
// image can't read package.json, so its tag is written out in each workflow
// and this finds the places where it disagrees with the library (#952).

const IMAGE = /^\s*image:\s*(ghcr\.io\/alrayyes\/ci-playwright:\S+)\s*$/gm;
const PINNED = /^ghcr\.io\/alrayyes\/ci-playwright:(\d+\.\d+\.\d+)@sha256:[0-9a-f]{64}$/;

export type Sources = {
  packageJson: string;
  lockfile: string;
  workflows: Record<string, string>;
};

export function playwrightImageProblems({ packageJson, lockfile, workflows }: Sources): string[] {
  const problems: string[] = [];

  const lib = /"@playwright\/test":\s*"(\d+\.\d+\.\d+)"/.exec(packageJson)?.[1];
  if (!lib) problems.push("package.json pins no exact @playwright/test version");

  const locked = /"@playwright\/test@(\d+\.\d+\.\d+)"/.exec(lockfile)?.[1];
  if (lib && locked !== lib) {
    problems.push(
      `package.json pins @playwright/test ${lib} but bun.lock locks ${locked ?? "nothing"}`,
    );
  }

  const found = Object.entries(workflows).flatMap(([file, text]) =>
    [...text.matchAll(IMAGE)].map((match) => ({ file, image: match[1] as string })),
  );
  if (found.length === 0) problems.push("no workflow job runs in the Playwright image");

  for (const { file, image } of found) {
    const version = PINNED.exec(image)?.[1];
    if (!version) {
      problems.push(`${file}: ${image} is not pinned as <version>@sha256:<digest>`);
    } else if (lib && version !== lib) {
      problems.push(`${file}: image is for Playwright ${version} but @playwright/test is ${lib}`);
    }
  }

  // #963: the image carries a bun of its own, which drifts from `packageManager`.
  // Each job in it installs the pinned one, the way every job outside it does,
  // and does so before any step that runs bun.
  for (const [file, text] of Object.entries(workflows)) {
    for (const job of jobsInImage(text)) {
      if (!installsPinnedBunFirst(job)) {
        problems.push(
          `${file}: the job in the Playwright image doesn't run setup-bun with bun-version-file: package.json before it uses bun`,
        );
      }
    }
  }

  const digests = new Set(found.map(({ image }) => image));
  if (digests.size > 1) problems.push(`the jobs use different images: ${[...digests].join(", ")}`);

  for (const [file, text] of Object.entries(workflows)) {
    if (/playwright install/.test(text)) {
      problems.push(`${file} still runs 'playwright install'; the image already has the browsers`);
    }
  }

  return problems;
}

// The jobs whose container is the image. Quoted job keys and comments are
// stripped first so neither can fake or hide a match.
function jobsInImage(workflow: string): string[] {
  const text = workflow.replace(/^\s*#.*$/gm, "");
  return text.split(/^(?= {2}["']?[\w-]+["']?:\s*$)/m).filter((job) => new RegExp(IMAGE).test(job));
}

function installsPinnedBunFirst(job: string): boolean {
  const afterSteps = job.split(/^[ \t]+steps:[ \t]*$/m)[1] ?? "";
  const indent = /^([ \t]+)- /m.exec(afterSteps)?.[1];
  if (indent === undefined) return false;
  const steps: string[] = [];
  for (const line of afterSteps.split("\n")) {
    if (line.startsWith(`${indent}- `)) steps.push(line);
    else if (steps.length > 0) steps[steps.length - 1] += `\n${line}`;
  }
  const isPinnedSetup = (step: string) =>
    /uses:\s*oven-sh\/setup-bun@/.test(step) && /bun-version-file:\s*package\.json/.test(step);
  const at = steps.findIndex(isPinnedSetup);
  if (at === -1) return false;
  return !steps.slice(0, at).some((step) => /\bbun(x)?\s/.test(step));
}

export async function readSources(root: string): Promise<Sources> {
  const dir = `${root}/.github/workflows`;
  const files = [...new Bun.Glob("*.yml").scanSync(dir)].sort();
  const workflows: Record<string, string> = {};
  for (const file of files) workflows[file] = await Bun.file(`${dir}/${file}`).text();
  return {
    packageJson: await Bun.file(`${root}/package.json`).text(),
    lockfile: await Bun.file(`${root}/bun.lock`).text(),
    workflows,
  };
}
