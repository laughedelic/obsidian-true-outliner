/**
 * Checks that a pull request has been landed on its branch before review: its
 * OpenSpec change archived with the delta specs synced, and the version bumped
 * when it ships behaviour. CLAUDE.md, "Change lifecycle", step 5.
 *
 *   node scripts/check-landed.mjs <base> "<pull request title>"
 *
 * `<base>` is the tip of the branch the pull request merges into; the pull
 * request is HEAD. What the pull request changes is read against their merge
 * base, and the version against the base's tip, since that is the version the
 * merge has to move past.
 *
 * Whether a release is owed is read from two things the pull request already
 * carries. The kind, from the title's conventional-commit prefix: a feature or a
 * fix promises behaviour, a chore promises none (`.github/labels.yml`). And the
 * paths: the plugin ships `src/` bundled into `main.js` and `styles/` joined into
 * `styles.css`, so a fix to the e2e harness is a fix that ships nothing. A
 * feature takes a minor bump; a fix takes at least a patch.
 */

import { execFileSync } from 'node:child_process';

const [base, title] = process.argv.slice(2);
if (!base || title === undefined) {
  console.error('usage: node scripts/check-landed.mjs <base> "<pull request title>"');
  process.exit(2);
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });
const lines = (out) => out.split('\n').filter(Boolean);

/** Paths the pull request leaves in place — added or modified, never deleted. */
const kept = lines(git('diff', '--name-only', '--no-renames', '--diff-filter=d', `${base}...HEAD`));
/** Every path the pull request touches, deletions included. */
const touched = new Set(lines(git('diff', '--name-only', '--no-renames', `${base}...HEAD`)));
const added = lines(git('diff', '--name-only', '--no-renames', '--diff-filter=A', `${base}...HEAD`));

const problems = [];

// The same reading of the title as `.github/workflows/labeler.yml`, which
// derives the `kind/` label from it; the two change together.
const KINDS = {
  feat: 'feature',
  fix: 'bug',
  chore: 'chore', docs: 'chore', refactor: 'chore', test: 'chore', ci: 'chore',
  perf: 'chore', style: 'chore', build: 'chore', deps: 'chore', revert: 'chore',
};
const prefix = /^([a-z]+)(\([^)]*\))?!?:\s/.exec(title)?.[1];
const kind = prefix === undefined ? undefined : KINDS[prefix];
if (kind === undefined) {
  problems.push(`the title has no conventional-commit prefix naming a kind: ${JSON.stringify(title)}`);
}

// An OpenSpec change outside `archive/` is one still in flight. Only a change
// this pull request opens is its to archive: one already on the base belongs to
// whichever pull request opened it, even when this one edits its text.
const onBase = (p) => {
  try {
    execFileSync('git', ['cat-file', '-e', `${base}:${p}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};
const active = new Set(
  kept.map((f) => /^openspec\/changes\/([^/]+)\//.exec(f)?.[1]).filter((c) => c && c !== 'archive'),
);
for (const change of active) {
  if (!onBase(`openspec/changes/${change}`)) problems.push(`openspec/changes/${change} is not archived`);
}

// An archived delta spec whose capability's main spec the pull request leaves
// alone was archived without being synced.
for (const f of added) {
  const m = /^openspec\/changes\/archive\/([^/]+)\/specs\/([^/]+)\/spec\.md$/.exec(f);
  if (m && !touched.has(`openspec/specs/${m[2]}/spec.md`)) {
    problems.push(`${m[1]} carries a delta for ${m[2]}, but openspec/specs/${m[2]}/spec.md is unchanged`);
  }
}

const read = (rev, file) => JSON.parse(git('show', `${rev}:${file}`));
const parse = (v) => {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
  return m && m.slice(1).map(Number);
};

// The version the merge produces: the pull request's own when it edits the
// manifest, the base's otherwise, however far behind the branch has fallen.
const editsManifest = touched.has('manifest.json');
const at = editsManifest ? 'HEAD' : base;
const before = read(base, 'manifest.json').version;
const manifest = read(at, 'manifest.json');
const after = manifest.version;
const [was, now] = [parse(before), parse(after)];
if (!was || !now) problems.push(`a version is not major.minor.patch: ${before} -> ${after}`);

const ships = kept.filter((f) => /^(src|styles)\//.test(f));
const bumped = was && now && (now[0] - was[0] || now[1] - was[1] || now[2] - was[2]) > 0;
const minor = was && now && (now[0] > was[0] || (now[0] === was[0] && now[1] > was[1]));
if (editsManifest && !bumped) {
  problems.push(`manifest.json moves from ${before} to ${after}, which is not forward`);
} else if (ships.length > 0 && kind === 'feature' && !minor) {
  problems.push(`a feature that ships takes a minor bump: the base is ${before}, the merge would be ${after}`);
} else if (ships.length > 0 && kind === 'bug' && !bumped) {
  problems.push(`a fix that ships takes at least a patch bump: the base is ${before}, the merge would be ${after}`);
}

// `npm version` writes all four; a hand edit usually misses one.
if (editsManifest) {
  const pkg = read('HEAD', 'package.json');
  const lock = read('HEAD', 'package-lock.json');
  const versions = read('HEAD', 'versions.json');
  if (pkg.version !== after) problems.push(`package.json is ${pkg.version}, manifest.json is ${after}`);
  if (lock.version !== after) problems.push(`package-lock.json is ${lock.version}, manifest.json is ${after}`);
  if (versions[after] !== manifest.minAppVersion) {
    problems.push(`versions.json does not map ${after} to minAppVersion ${manifest.minAppVersion}`);
  }
}

console.log(`kind: ${kind ?? 'none'}`);
console.log(`ships: ${ships.length > 0 ? `${ships.length} file(s) under src/ or styles/` : 'nothing'}`);
console.log(`version: ${before} -> ${after}`);

if (problems.length > 0) {
  const annotate = process.env.GITHUB_ACTIONS === 'true';
  for (const p of problems) console.log(annotate ? `::error::${p}` : `✗ ${p}`);
  console.log('\nLand the change on its branch before review: CLAUDE.md, "Change lifecycle", step 5.');
  process.exit(1);
}
console.log('landed');
