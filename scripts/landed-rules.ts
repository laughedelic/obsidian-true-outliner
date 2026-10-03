/**
 * The rules `scripts/check-landed.ts` applies to a pull request's version and to how current its
 * branch is, as functions of what the script has already read. They live apart from the script so
 * that `tests/landed-rules.test.ts` can state each one without a repository to read.
 */

export type Kind = 'feature' | 'bug' | 'chore';
export type Version = [number, number, number];

export const parseVersion = (v: string): Version | null => {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};

/** The plugin ships `src/` bundled into `main.js` and `styles/` joined into `styles.css`. */
export const shipsPath = (file: string): boolean => /^(src|styles)\//.test(file);

/**
 * Whether the pull request has something to land: an OpenSpec change or main spec to settle, a
 * manifest it already edits, or behaviour it ships under a feature or a fix. A dependency update, a
 * chore and a change to tooling have none, and are not held to the rules that follow from it.
 */
export const landsSomething = (kind: Kind | undefined, paths: readonly string[]): boolean =>
  paths.some((f) => f === 'manifest.json' || f.startsWith('openspec/changes/') || f.startsWith('openspec/specs/')) ||
  (paths.some(shipsPath) && (kind === 'feature' || kind === 'bug'));

export interface VersionReading {
  kind: Kind | undefined;
  ships: boolean;
  editsManifest: boolean;
  /** The version on the tip of `main` the check read. */
  before: string;
  /** The version the merge produces: the head's when it edits the manifest, `main`'s otherwise. */
  after: string;
}

/** What is wrong with the version, naming the base it is judged against. */
export const versionProblems = ({ kind, ships, editsManifest, before, after }: VersionReading): string[] => {
  const [was, now] = [parseVersion(before), parseVersion(after)];
  if (!was || !now) return [`a version is not major.minor.patch: ${before} -> ${after}`];

  const delta = now[0] - was[0] || now[1] - was[1] || now[2] - was[2];
  const bumped = delta > 0;
  const minor = now[0] > was[0] || (now[0] === was[0] && now[1] > was[1]);

  if (editsManifest && !bumped) {
    return [`manifest.json moves from ${before} to ${after}, which is not above main's ${before}`];
  }
  if (ships && kind === 'feature' && !minor) {
    return [`a feature that ships takes a minor bump: main is ${before}, the merge would be ${after}`];
  }
  if (ships && kind === 'bug' && !bumped) {
    return [`a fix that ships takes at least a patch bump: main is ${before}, the merge would be ${after}`];
  }
  return [];
};

/** A pull request that lands has to contain the tip of `main` it was checked against. */
export const freshnessProblem = (lands: boolean, containsTip: boolean, tip: string): string | undefined =>
  lands && !containsTip
    ? `the branch does not contain main (${tip.slice(0, 7)}): rebase onto it before landing`
    : undefined;
