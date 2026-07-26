/**
 * Reports and reverts the drift an e2e run leaves in the fixture vault —
 * and ONLY that drift.
 *
 * A full suite reliably mutates `test-vault/`: Obsidian's own table
 * auto-alignment reformats fixture tables, `.obsidian/` config picks up keys,
 * the plugin's data.json accumulates outlinePaths, and a Journal note has
 * gained hard line breaks from a keypress meant for a scratch note reached
 * through restored workspace state. That last class is the dangerous one — it
 * changes a fixture's PARSE SHAPE, so a later test measures something different
 * with nothing failing. It also, once, got swept into a commit by a broad
 * `git add -A` and became the baseline.
 *
 * Usage (see the `test:e2e` scripts):
 *
 *     node scripts/check-vault-drift.mjs --snapshot   # before the suite
 *     node scripts/check-vault-drift.mjs              # after
 *
 * The snapshot records each pre-existing dirty path's CONTENT, not just its name.
 * Names alone could not honor the safety claim: if the suite then edited such a
 * path — or `resetVault()` deleted an untracked draft — the post-run pass either
 * left the suite's version in place or saw no path at all, and the original was
 * gone either way. With the bytes, it can be put back.
 *
 * Snapshot-based rather than "restore everything dirty", because the blunt
 * version destroys uncommitted work: editing a fixture by hand and then running
 * the suite would silently revert the edit. Only paths that were CLEAN before
 * the run are restored; anything already modified is reported and left alone.
 * With no snapshot (a direct invocation) it reports and reverts nothing, since
 * it cannot tell the two apart.
 *
 * The snapshot is CONSUMED — deleted as soon as it is read — so it can only
 * ever describe the run it was taken for. Leaving it behind meant a later
 * direct invocation would treat a stale file as a valid baseline and revert
 * fixture edits made since, which is exactly the data loss the snapshot exists
 * to prevent, arriving by a different route.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SNAPSHOT = path.join(root, 'node_modules/.cache/vault-drift-baseline.json');

const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf-8' });

/**
 * Paths under test-vault that differ from HEAD right now, each tagged with
 * whether git tracks it.
 *
 * The distinction is load-bearing: `git checkout` cannot restore an UNTRACKED
 * path — it exits non-zero with "pathspec did not match any file known to git"
 * — and the suite creates `Scratch/*.md` notes that are untracked and not
 * ignored. Passing one to checkout would fail the cleanup and, with the exit-code
 * handling in the `test:e2e` scripts, fail an otherwise-passing run while leaving
 * the vault dirty.
 *
 * `--untracked-files=all` matters just as much. Git COLLAPSES untracked
 * directories by default, so one hand-written `Scratch/draft.md` makes both
 * snapshots report only `Scratch/`, and every note the suite then creates in that
 * directory is mistaken for pre-existing work and left behind. Listing files
 * individually is what lets the baseline tell a draft from run output.
 */
function dirtyEntries() {
  // `-z` is not optional. Without it git C-QUOTES any non-ASCII path, and this
  // vault has tracked fixtures that trigger it — `Notes/Reading – …`, `People/
  // Tomás Rivera.md`. Stripping the surrounding quotes leaves the escapes
  // (`Reading \342\200\223 …`), so a later `git checkout` gets a path that does
  // not exist, cleanup fails, and — since a failed cleanup now fails the run —
  // the suite reports failure with the fixture still dirty. `-z` returns path
  // bytes verbatim, NUL-delimited.
  const out = git('status', '--porcelain', '-z', '--untracked-files=all', '--', 'test-vault');
  const fields = out.split('\0');
  const entries = [];
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    if (field.length < 4) continue; // trailing empty field
    const code = field.slice(0, 2);
    entries.push({ path: field.slice(3), code, untracked: code === '??' });
    // A rename or copy emits its ORIGINAL path as a separate following field.
    if (code.startsWith('R') || code.startsWith('C')) i += 1;
  }
  return entries;
}

function dirtyPaths() {
  return dirtyEntries().map((e) => e.path);
}

if (process.argv.includes('--snapshot')) {
  mkdirSync(path.dirname(SNAPSHOT), { recursive: true });
  const baseline = dirtyEntries().map((e) => {
    let content = null;
    try {
      content = readFileSync(path.join(root, e.path), 'utf-8');
    } catch {
      /* a directory, or deleted before the run */
    }
    // `deleted` is kept separately from `content === null`: a path the developer
    // DELETED before the run is restored from git by `resetVault()`, at which
    // point it is clean and no longer appears in the post-run diff at all — so
    // without recording the intent, cleanup silently resurrects it.
    return { path: e.path, content, deleted: e.code.includes('D') };
  });
  writeFileSync(SNAPSHOT, JSON.stringify(baseline));
  if (baseline.length > 0) {
    console.log(
      `[vault-drift] ${baseline.length} file(s) already modified before the run — these will be left alone:`,
    );
    for (const e of baseline) console.log(`  ${e.path}`);
  }
  process.exit(0);
}

if (!existsSync(SNAPSHOT)) {
  console.log('[vault-drift] no pre-run snapshot; reporting only, restoring nothing');
  for (const f of dirtyPaths()) console.log(`  dirty: ${f}`);
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(SNAPSHOT, 'utf-8'));
const before = new Set(baseline.map((e) => e.path));
rmSync(SNAPSHOT, { force: true }); // consumed: never valid for a later run

// Put back anything the run changed UNDER a path that was already dirty. Without
// this the safety claim was only about paths the run created.
let rescued = 0;
for (const entry of baseline) {
  const abs = path.join(root, entry.path);
  if (entry.deleted) {
    // Re-delete: the run (or resetVault) put it back.
    if (existsSync(abs)) {
      rmSync(abs, { force: true });
      rescued += 1;
    }
    continue;
  }
  if (entry.content === null) continue;
  let current = null;
  try {
    current = readFileSync(abs, 'utf-8');
  } catch {
    /* the run deleted it */
  }
  if (current === entry.content) continue;
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, entry.content);
  rescued += 1;
}
if (rescued > 0) console.log(`[vault-drift] restored ${rescued} of your pre-existing edit(s) that the run changed`);
const now = dirtyEntries();
const introduced = now.filter((e) => !before.has(e.path));
const preexisting = now.filter((e) => before.has(e.path));

if (introduced.length === 0) {
  console.log('[vault-drift] clean');
} else {
  console.log(`[vault-drift] the e2e run touched ${introduced.length} path(s) in test-vault:`);
  for (const e of introduced) console.log(`  ${e.untracked ? 'new ' : 'mod '}${e.path}`);

  const modified = introduced.filter((e) => !e.untracked).map((e) => e.path);
  const created = introduced.filter((e) => e.untracked).map((e) => e.path);
  if (modified.length > 0) git('checkout', '--', ...modified);
  // Only paths this run created, and only ones absent from the baseline, so a
  // fixture you were drafting by hand is never deleted.
  for (const f of created) rmSync(path.join(root, f), { force: true, recursive: true });
  console.log(`[vault-drift] restored ${modified.length} modified, removed ${created.length} created`);
}
if (preexisting.length > 0) {
  console.log(`[vault-drift] left your ${preexisting.length} pre-existing change(s) untouched`);
}
