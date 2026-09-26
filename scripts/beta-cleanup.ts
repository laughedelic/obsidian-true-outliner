/**
 * Deletes beta prereleases that no longer serve anyone, with their tags.
 *
 * Three occasions, one rule each:
 *   --branch <b> --keep <v>  every beta of that branch except the one just built
 *   --branch <b>             every beta of that branch, once its pull request closes
 *   --orphans                every beta whose branch heads no open pull request
 *
 * `--orphans` is what reclaims betas the other two missed: a pull request
 * closed while this workflow could not run, or builds from before betas were
 * published for pull requests only, when every pushed branch got one.
 * Dependabot's pull requests never get a beta, so theirs count as closed.
 */
import { execFileSync } from 'node:child_process';
import { betaSlug, slugify } from './beta-version.ts';

const run = (file: string, args: string[]): string => execFileSync(file, args, { encoding: 'utf8' });

const flag = (name: string): string | undefined => {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? undefined : process.argv[at + 1];
};

/** Every prerelease tag of a beta shape, paired with the branch slug in it. */
const betaReleases = (): { tag: string; slug: string }[] =>
  (
    JSON.parse(run('gh', ['release', 'list', '--limit', '500', '--json', 'tagName,isPrerelease'])) as {
      tagName: string;
      isPrerelease: boolean;
    }[]
  )
    .filter((release) => release.isPrerelease)
    .flatMap((release) => {
      const slug = betaSlug(release.tagName);
      return slug === undefined ? [] : [{ tag: release.tagName, slug }];
    });

const openPullRequestSlugs = () =>
  new Set(
    run('gh', ['api', '--paginate', 'repos/{owner}/{repo}/pulls?state=open&per_page=100', '--jq', '.[].head.ref'])
      .split('\n')
      .filter((ref) => ref && !ref.startsWith('dependabot/'))
      .map(slugify),
  );

const doomed = process.argv.includes('--orphans')
  ? (() => {
      const open = openPullRequestSlugs();
      return betaReleases().filter((release) => !open.has(release.slug));
    })()
  : (() => {
      const branch = flag('branch');
      if (!branch) {
        console.error('usage: beta-cleanup.ts --orphans | --branch <name> [--keep <version>]');
        process.exit(1);
      }
      const slug = slugify(branch);
      const keep = flag('keep');
      return betaReleases().filter((release) => release.slug === slug && release.tag !== keep);
    })();

for (const release of doomed) {
  console.log(`deleting ${release.tag}`);
  run('gh', ['release', 'delete', release.tag, '--yes', '--cleanup-tag']);
}
console.log(`${doomed.length} beta release(s) deleted`);
