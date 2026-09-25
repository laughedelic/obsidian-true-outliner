/**
 * Checks that a pull request has been landed on its branch before review: its
 * OpenSpec change archived, finished and synced, and the version bumped
 * when it ships behaviour. CLAUDE.md, "Change lifecycle", step 5.
 *
 *   node scripts/check-landed.mjs <base> "<pull request title>"
 *
 * It needs the OpenSpec CLI on the path, which reads the change and the specs.
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

/** The paths the pull request changes, all of them or only those of one status. */
const diff = (filter) => lines(git('diff', '--name-only', '--no-renames', ...(filter ? [`--diff-filter=${filter}`] : []), `${base}...HEAD`));
const touched = new Set(diff());
const added = diff('A');

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

/**
 * The OpenSpec CLI's own reading of the tree. `validate` exits non-zero when
 * anything fails, which here is data rather than an error.
 */
const openspec = (...args) => {
  const env = { ...process.env, OPENSPEC_TELEMETRY: '0' };
  let out;
  try {
    out = execFileSync('openspec', [...args, '--json'], { encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'inherit'] });
  } catch (e) {
    if (typeof e.stdout !== 'string' || e.stdout === '') throw e;
    out = e.stdout;
  }
  return JSON.parse(out);
};
const onBase = (p) => {
  try {
    execFileSync('git', ['cat-file', '-e', `${base}:${p}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

const inFlight = new Set(openspec('list').changes.map((c) => c.name));

// A change `openspec list` still reports is one in flight. Only a change this
// pull request opens is its to archive: one already on the base belongs to
// whichever pull request opened it, even when this one edits its text.
for (const name of inFlight) {
  if (!onBase(`openspec/changes/${name}`)) problems.push(`openspec/changes/${name} is not archived`);
}

const archived = new Set(added.map((f) => /^openspec\/changes\/archive\/([^/]+)\//.exec(f)?.[1]).filter(Boolean));

// A change on the base that this pull request takes away has to reappear in
// the archive under its own name, the way `openspec archive` files it: one
// deleted instead never reaches the main specs.
const removed = new Set(
  diff('D')
    .map((f) => /^openspec\/changes\/([^/]+)\//.exec(f)?.[1])
    .filter((c) => c && c !== 'archive'),
);
for (const name of removed) {
  const filed = [...archived].some((a) => /^\d{4}-\d{2}-\d{2}-(.+)$/.exec(a)?.[1] === name);
  if (!inFlight.has(name) && !filed) problems.push(`openspec/changes/${name} is removed without being archived`);
}

// `openspec validate --archived` holds every archived change to a finished
// task list, and earlier ones are not this pull request's to finish.
for (const item of openspec('validate', '--archived').items) {
  if (archived.has(item.id) && !item.valid) {
    for (const issue of item.issues) problems.push(`${item.id}: ${issue.path}: ${issue.message}`);
  }
}

// `openspec archive` syncs each delta into its capability's main spec, and has
// a flag to skip that; the CLI keeps no record of which it did. A delta whose
// main spec the pull request leaves alone was archived without being synced.
for (const f of added) {
  const m = /^openspec\/changes\/archive\/([^/]+)\/specs\/([^/]+)\/spec\.md$/.exec(f);
  if (m && !touched.has(`openspec/specs/${m[2]}/spec.md`)) {
    problems.push(`${m[1]} carries a delta for ${m[2]}, but openspec/specs/${m[2]}/spec.md is unchanged`);
  }
}

// A sync writes the main specs, so they are checked as they will merge.
for (const item of openspec('validate', '--specs', '--strict').items) {
  if (!item.valid) {
    for (const issue of item.issues.filter((i) => i.level !== 'INFO')) {
      problems.push(`openspec/specs/${item.id}: ${issue.path}: ${issue.message}`);
    }
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

const ships = [...touched].filter((f) => /^(src|styles)\//.test(f));
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
