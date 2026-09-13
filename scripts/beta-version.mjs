/**
 * Derives the version a branch's beta prerelease is published under.
 *
 * BRAT picks a beta by sorting every release's tag with `semver.coerce` and
 * taking the highest — not the most recent. So a branch build has to be a
 * semver prerelease that (a) outranks the current release, or BRAT would keep
 * serving that, and (b) stays below the next real one, or a branch build would
 * outrank the release it precedes. `0.8.3-beta-my-branch.41` against a
 * released 0.8.2 satisfies both.
 *
 * The run number is the ordering within a branch: BRAT treats "is there an
 * update" as a version comparison, so a rebuilt branch needs a strictly
 * greater version or the phone never sees it.
 *
 * Usage: node scripts/beta-version.mjs <branch> <run-number>
 * Prints `slug=` and `version=` lines for $GITHUB_OUTPUT.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * A semver prerelease identifier admits only alphanumerics and hyphens, which
 * a branch name does not: `claude/mobile-testing_2` has to become
 * `claude-mobile-testing-2`. Collapsing runs and trimming the ends keeps the
 * result a valid identifier rather than one with empty dot-separated parts.
 */
export const slugify = (name) =>
  name
    .replace(/[^0-9A-Za-z]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'branch';

/** The next patch above the released version — the ceiling a branch sits under. */
export const nextPatch = (version) => {
  const [major, minor, patch] = version.split('-')[0].split('.').map(Number);
  if ([major, minor, patch].some((part) => !Number.isInteger(part))) {
    throw new Error(`manifest.json version is not a semver core: ${version}`);
  }
  return `${major}.${minor}.${patch + 1}`;
};

/**
 * A beta tag, and only a beta tag: `0.8.3-beta-some-branch.41`. The cleanup
 * sweep decides what to delete by this shape, so the `beta-` marker is what
 * keeps a hand-cut `0.9.0-rc.1` out of its reach — a run number alone does
 * not, since a release candidate carries one too.
 */
export const BETA_TAG = /^\d+\.\d+\.\d+-beta-(?<slug>.+)\.\d+$/;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [branch, runNumber] = process.argv.slice(2);
  if (!branch || !runNumber) {
    console.error('usage: node scripts/beta-version.mjs <branch> <run-number>');
    process.exit(1);
  }
  const { version } = JSON.parse(readFileSync('manifest.json', 'utf8'));
  const slug = slugify(branch);
  console.log(`slug=${slug}`);
  console.log(`version=${nextPatch(version)}-beta-${slug}.${runNumber}`);
}
