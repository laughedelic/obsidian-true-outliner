/**
 * Frees a stack's branches from the worktrees holding them, so `gh stack`
 * can restack, and puts them back afterwards.
 *
 * Git allows a branch to be checked out in one worktree at a time, so every
 * `gh stack` command that moves HEAD — rebase, sync, switch, up, down,
 * checkout — fails outright while a session sits on that layer:
 *
 *     fatal: 'feat/x' is already used by worktree at '.claude/worktrees/x'
 *
 * Detaching those worktrees lifts the claim without disturbing what is in
 * them; re-attaching afterwards lands each one on its branch's rewritten tip.
 * The current worktree is never parked: git is happy to move the branch you
 * are standing on, and `gh stack` needs somewhere to work.
 *
 * A worktree with modified tracked files is not parked at all. Those changes
 * would ride the detach across the rebase and come back down onto a base they
 * were never written against, so this refuses the whole operation and names
 * them. Untracked files are left alone — a rebase cannot touch them.
 *
 *     node scripts/stack-park.mjs park
 *     gh stack sync
 *     node scripts/stack-park.mjs unpark
 */

import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';

const git = (args, opts = {}) =>
  execFileSync('git', args, { encoding: 'utf8', ...opts }).trim();

/** For calls whose failure this file reports itself, so git's own does not print. */
const gitQuiet = (args) => git(args, { stdio: ['ignore', 'pipe', 'pipe'] });

const commonDir = path.resolve(git(['rev-parse', '--path-format=absolute', '--git-common-dir']));
const STACK_FILE = path.join(commonDir, 'gh-stack');
const PARK_FILE = path.join(commonDir, 'stack-park.json');

const die = (message) => {
  console.error(message);
  process.exit(1);
};

/** Every branch named by any stack `gh stack` is tracking. */
function stackBranches() {
  if (!existsSync(STACK_FILE)) die(`No stack recorded (${STACK_FILE} does not exist).`);
  const state = JSON.parse(readFileSync(STACK_FILE, 'utf8'));
  const names = new Set();
  for (const stack of state.stacks ?? []) {
    if (stack.trunk?.branch) names.add(stack.trunk.branch);
    for (const layer of stack.branches ?? []) names.add(layer.branch);
  }
  return names;
}

/** `{ dir, branch }` for every worktree with a branch checked out. */
function worktrees() {
  const found = [];
  let dir = null;
  for (const line of git(['worktree', 'list', '--porcelain']).split('\n')) {
    if (line.startsWith('worktree ')) dir = line.slice('worktree '.length);
    else if (line.startsWith('branch ')) {
      found.push({ dir, branch: line.slice('branch refs/heads/'.length) });
    }
  }
  return found;
}

function park() {
  if (existsSync(PARK_FILE)) die('Already parked. Run `unpark` before parking again.');

  const branches = stackBranches();
  const here = path.resolve(git(['rev-parse', '--show-toplevel']));
  const holding = worktrees().filter(
    (w) => branches.has(w.branch) && path.resolve(w.dir) !== here,
  );

  if (holding.length === 0) {
    console.log('No other worktree holds a stack branch. Nothing to park.');
    return;
  }

  const dirty = holding.filter(
    (w) => git(['-C', w.dir, 'status', '--porcelain', '--untracked-files=no']) !== '',
  );
  if (dirty.length > 0) {
    die(
      `Uncommitted changes in ${dirty.length} worktree(s):\n` +
        dirty.map((w) => `  ${w.branch}  ${w.dir}`).join('\n') +
        '\n\nCommit or set them aside first — a rebase underneath them would land\n' +
        'these changes on a base they were not written against.',
    );
  }

  for (const w of holding) {
    git(['-C', w.dir, 'checkout', '--detach', '--quiet']);
    console.log(`parked   ${w.branch}`);
  }
  // Where the driver stood, so `unpark` can put it back: a restack walks the
  // stack by checking each layer out here and leaves this worktree on the last
  // one it touched, which is otherwise a layer some parked worktree wants back.
  const driver = worktrees().find((w) => path.resolve(w.dir) === here) ?? { dir: here };
  writeFileSync(PARK_FILE, JSON.stringify({ parked: holding, driver }, null, 2));
  console.log(`\n${holding.length} branch(es) free. Restack, then run \`unpark\`.`);
}

function unpark() {
  if (!existsSync(PARK_FILE)) die('Nothing parked.');
  const { parked, driver } = JSON.parse(readFileSync(PARK_FILE, 'utf8'));

  // The restack left the driver holding one of these; let go before restoring.
  const held = worktrees().find(
    (w) => path.resolve(w.dir) === path.resolve(driver.dir) && parked.some((p) => p.branch === w.branch),
  );
  if (held) git(['-C', driver.dir, 'checkout', '--detach', '--quiet']);

  const missing = [];
  for (const w of parked) {
    try {
      gitQuiet(['-C', w.dir, 'checkout', w.branch, '--quiet']);
      console.log(`restored ${w.branch}`);
    } catch {
      missing.push(w);
    }
  }

  if (driver.branch) {
    try {
      gitQuiet(['-C', driver.dir, 'checkout', driver.branch, '--quiet']);
      console.log(`restored ${driver.branch} (here)`);
    } catch {
      console.log(`left detached here — ${driver.branch} is gone or claimed elsewhere`);
    }
  }
  rmSync(PARK_FILE);

  if (missing.length > 0) {
    die(
      `\nLeft detached — the branch is gone or the checkout was refused:\n` +
        missing.map((w) => `  ${w.branch}  ${w.dir}`).join('\n'),
    );
  }
}

const command = process.argv[2];
if (command === 'park') park();
else if (command === 'unpark') unpark();
else die('Usage: node scripts/stack-park.mjs park|unpark');
