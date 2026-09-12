/**
 * Deletes beta prereleases that no longer serve anyone, with their tags.
 *
 * Two occasions, one rule each:
 *   --slug <s> --keep <v>  every beta of that branch except the one just built
 *   --orphans              every beta whose branch is gone from the remote
 *
 * `--orphans` is what reclaims a merged branch's builds, and it reads the
 * remote's branch list rather than taking a branch name, so it also clears
 * betas left behind by a branch deleted while this workflow was not yet on the
 * default branch.
 *
 * Only tags of the beta shape are ever considered, so a real release and a
 * hand-cut release candidate are both out of reach.
 */
import { execFileSync } from 'node:child_process';
import { BETA_TAG, slugify } from './beta-version.mjs';

const run = (file, args) => execFileSync(file, args, { encoding: 'utf8' });

const flag = (name) => {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? undefined : process.argv[at + 1];
};

/** Every prerelease tag of the beta shape, paired with the branch slug in it. */
const betaReleases = () =>
  JSON.parse(run('gh', ['release', 'list', '--limit', '200', '--json', 'tagName,isPrerelease']))
    .filter((release) => release.isPrerelease)
    .map((release) => ({ tag: release.tagName, slug: BETA_TAG.exec(release.tagName)?.groups.slug }))
    .filter((release) => release.slug !== undefined);

const liveSlugs = () =>
  new Set(
    run('git', ['ls-remote', '--heads', 'origin'])
      .split('\n')
      .filter(Boolean)
      .map((line) => slugify(line.split('refs/heads/')[1])),
  );

const doomed = process.argv.includes('--orphans')
  ? (() => {
      const live = liveSlugs();
      return betaReleases().filter((release) => !live.has(release.slug));
    })()
  : (() => {
      const slug = flag('slug');
      const keep = flag('keep');
      if (!slug || !keep) {
        console.error('usage: beta-cleanup.mjs --orphans | --slug <slug> --keep <version>');
        process.exit(1);
      }
      return betaReleases().filter((release) => release.slug === slug && release.tag !== keep);
    })();

for (const release of doomed) {
  console.log(`deleting ${release.tag}`);
  run('gh', ['release', 'delete', release.tag, '--yes', '--cleanup-tag']);
}
console.log(`${doomed.length} beta release(s) deleted`);
