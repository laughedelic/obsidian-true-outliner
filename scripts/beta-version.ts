/**
 * Derives the version a pull request's beta prerelease is published under.
 *
 * A beta is installed by picking its version in BRAT, so the version's job is
 * to say which build it is: `0.13.5-12.g7b57965.fix-some-branch` is the 12th
 * commit since the 0.13.4 release, at `7b57965`, on `fix/some-branch`. The
 * middle part is `git describe`'s own, and each part is a separate
 * dot-separated identifier: semver compares a numeric identifier as a number,
 * while `12-g7b57965-...` would be one identifier compared as text. The `g`
 * keeps a hash of digits alone from being a numeric identifier, which may not
 * start with a zero.
 *
 * The core is the next patch above the release `git describe` finds, not above
 * the branch's `manifest.json`: a branch that has already bumped its manifest
 * for landing would otherwise publish betas that outrank the release they
 * become.
 *
 * Usage: node scripts/beta-version.ts <branch>, run in a full-history checkout
 * of the commit being built. Prints a `version=` line for $GITHUB_OUTPUT.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * A semver prerelease identifier admits only alphanumerics and hyphens, which
 * a branch name does not: `claude/mobile-testing_2` has to become
 * `claude-mobile-testing-2`. Collapsing runs and trimming the ends keeps the
 * result a valid identifier rather than one with empty dot-separated parts.
 */
export const slugify = (name: string): string =>
  name
    .replace(/[^0-9A-Za-z]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'branch';

/** The next patch above a released version — the ceiling a branch sits under. */
export const nextPatch = (version: string): string => {
  const [major, minor, patch] = (version.split('-')[0] ?? '').split('.').map(Number);
  if (patch === undefined || [major, minor, patch].some((part) => !Number.isInteger(part))) {
    throw new Error(`release version is not a semver core: ${version}`);
  }
  return `${major}.${minor}.${patch + 1}`;
};

/**
 * Beta tags, and the branch slug in each. The first shape is the current one;
 * the second is what betas were published under before it, kept so the sweep
 * still reaches them.
 */
export const BETA_TAGS = [
  /^\d+\.\d+\.\d+-\d+\.g[0-9a-f]+\.(?<slug>.+)$/,
  /^\d+\.\d+\.\d+-beta-(?<slug>.+)\.\d+$/,
];

export const betaSlug = (tag: string): string | undefined =>
  BETA_TAGS.map((shape) => shape.exec(tag)?.groups?.slug).find((slug) => slug !== undefined);

/**
 * `git describe` against the nearest release tag: `0.13.4-12-g7b57965`, parsed
 * into the release, the commit count and the abbreviated hash. Betas are tags too, and all
 * of them carry a hyphen, which releases never do.
 */
const describe = (): { release: string; commits: string; hash: string } => {
  const out = execFileSync(
    'git',
    ['describe', '--tags', '--long', '--match', '[0-9]*.[0-9]*.[0-9]*', '--exclude', '*-*'],
    { encoding: 'utf8' },
  ).trim();
  const parts = /^(?<release>.+)-(?<commits>\d+)-g(?<hash>[0-9a-f]+)$/.exec(out)?.groups;
  if (!parts?.release || !parts.commits || !parts.hash) throw new Error(`unexpected git describe output: ${out}`);
  return { release: parts.release, commits: parts.commits, hash: parts.hash };
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [branch] = process.argv.slice(2);
  if (!branch) {
    console.error('usage: node scripts/beta-version.ts <branch>');
    process.exit(1);
  }
  const { release, commits, hash } = describe();
  console.log(`version=${nextPatch(release)}-${commits}.g${hash}.${slugify(branch)}`);
}
