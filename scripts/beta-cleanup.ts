/**
 * Deletes beta prereleases that no longer serve anyone, with their tags.
 *
 * Three occasions, one rule each:
 *   --pr <n> --keep <v>  every beta of that pull request except the one just built
 *   --pr <n>             every beta of that pull request, once it closes
 *   --orphans            every beta of a pull request that is no longer open
 *
 * `--orphans` is what reclaims betas the other two missed: a pull request
 * closed while this workflow could not run, or builds from before betas were
 * published for pull requests only, when every pushed branch got one. Those
 * carry no pull request number and are matched by the branch slug in their
 * tag. Dependabot's pull requests never get a beta, so theirs count as closed.
 */
import { execFileSync } from 'node:child_process';
import { betaOwner, slugify } from './beta-version.ts';

const run = (file: string, args: string[]): string => execFileSync(file, args, { encoding: 'utf8' });

const flag = (name: string): string | undefined => {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? undefined : process.argv[at + 1];
};

type Beta = { tag: string; owner: { pr: number } | { slug: string } };

/** Every prerelease tag of a beta shape, with whose beta it is. */
const betaReleases = (): Beta[] =>
  (JSON.parse(run('gh', ['release', 'list', '--limit', '500', '--json', 'tagName,isPrerelease'])) as {
    tagName: string;
    isPrerelease: boolean;
  }[])
    .filter((release) => release.isPrerelease)
    .flatMap((release) => {
      const owner = betaOwner(release.tagName);
      return owner === undefined ? [] : [{ tag: release.tagName, owner }];
    });

const openPullRequests = () => {
  const open = run('gh', [
    'api',
    '--paginate',
    'repos/{owner}/{repo}/pulls?state=open&per_page=100',
    '--jq',
    '.[] | "\\(.number) \\(.head.ref)"',
  ])
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [number, ref = ''] = line.split(' ');
      return { number: Number(number), head: { ref } };
    })
    .filter((pull) => !pull.head.ref.startsWith('dependabot/'));
  return {
    numbers: new Set(open.map((pull) => pull.number)),
    slugs: new Set(open.map((pull) => slugify(pull.head.ref))),
  };
};

const doomed = process.argv.includes('--orphans')
  ? (() => {
      const open = openPullRequests();
      return betaReleases().filter(({ owner }) =>
        'pr' in owner ? !open.numbers.has(owner.pr) : !open.slugs.has(owner.slug),
      );
    })()
  : (() => {
      const pr = Number(flag('pr'));
      if (!Number.isInteger(pr) || pr <= 0) {
        console.error('usage: beta-cleanup.ts --orphans | --pr <number> [--keep <version>]');
        process.exit(1);
      }
      const keep = flag('keep');
      return betaReleases().filter(({ tag, owner }) => 'pr' in owner && owner.pr === pr && tag !== keep);
    })();

for (const release of doomed) {
  console.log(`deleting ${release.tag}`);
  run('gh', ['release', 'delete', release.tag, '--yes', '--cleanup-tag']);
}
console.log(`${doomed.length} beta release(s) deleted`);
