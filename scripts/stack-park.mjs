/**
 * Frees one stack's branches from the worktrees holding them, so `gh stack`
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
 * A worktree with modified tracked files is not parked at all, and one that
 * acquires them while parked is not restored. Those changes would come down
 * onto a base they were never written against, so either state refuses the
 * whole operation and names the worktrees. Untracked files are left alone — a
 * rebase cannot touch them.
 *
 *     node scripts/stack-park.mjs park [stack-number]
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

/**
 * The one stack to park. `gh stack` tracks each stack separately and its
 * commands act on the current one, so parking every branch it knows about
 * would detach sessions working on an unrelated stack — and let an unrelated
 * dirty worktree block this restack. The current branch names its stack; from
 * the trunk it does not, which is the usual place to drive a restack from, so
 * a lone stack is taken as meant and anything else asks for a number.
 */
function chooseStack(wanted) {
  if (!existsSync(STACK_FILE)) die(`No stack recorded (${STACK_FILE} does not exist).`);
  const stacks = JSON.parse(readFileSync(STACK_FILE, 'utf8')).stacks ?? [];
  const numbers = stacks.map((s) => s.number).join(', ');

  if (stacks.length === 0) die('No stack recorded.');
  if (wanted !== undefined) {
    const picked = stacks.find((s) => String(s.number) === wanted);
    return picked ?? die(`No stack numbered ${wanted}. Recorded: ${numbers}`);
  }

  const current = git(['branch', '--show-current']);
  const owning = stacks.filter((s) => (s.branches ?? []).some((b) => b.branch === current));
  if (owning.length === 1) return owning[0];
  if (stacks.length === 1) return stacks[0];
  return die(
    `On ${current || 'a detached HEAD'}, which does not name one of the ${stacks.length} ` +
      `recorded stacks.\nPass the one to park: ${numbers}`,
  );
}

/** Trunk and layers alike — the trunk is held hostage the same way. */
function branchesOf(stack) {
  const names = new Set((stack.branches ?? []).map((b) => b.branch));
  if (stack.trunk?.branch) names.add(stack.trunk.branch);
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

const isDirty = (dir) =>
  git(['-C', dir, 'status', '--porcelain', '--untracked-files=no']) !== '';

const refuseDirty = (dirty, when) =>
  die(
    `Uncommitted changes in ${dirty.length} worktree(s) ${when}:\n` +
      dirty.map((w) => `  ${w.branch}  ${w.dir}`).join('\n') +
      '\n\nCommit or set them aside first — these changes would land on a base\n' +
      'they were not written against.',
  );

function park(wanted) {
  if (existsSync(PARK_FILE)) die('Already parked. Run `unpark` before parking again.');

  const stack = chooseStack(wanted);
  const branches = branchesOf(stack);
  const here = path.resolve(git(['rev-parse', '--show-toplevel']));
  const holding = worktrees().filter(
    (w) => branches.has(w.branch) && path.resolve(w.dir) !== here,
  );

  if (holding.length === 0) {
    console.log(`No other worktree holds a branch of stack ${stack.number}. Nothing to park.`);
    return;
  }

  const dirty = holding.filter((w) => isDirty(w.dir));
  if (dirty.length > 0) refuseDirty(dirty, 'to park');

  // Written before the first detach, not after the last: a detach that fails
  // partway would otherwise leave worktrees detached with nothing recording
  // where they belong. Restoring a worktree that never moved is a no-op, so an
  // entry that did not get detached costs nothing.
  //
  // The driver's own branch is part of that record because a restack walks the
  // stack by checking each layer out here and leaves this worktree on the last
  // one it touched — which is otherwise a layer some parked worktree wants back.
  const driver = worktrees().find((w) => path.resolve(w.dir) === here) ?? { dir: here };
  const record = holding.map((w) => ({ ...w, head: git(['-C', w.dir, 'rev-parse', 'HEAD']) }));
  writeFileSync(PARK_FILE, JSON.stringify({ stack: stack.number, parked: record, driver }, null, 2));

  for (const w of holding) {
    try {
      git(['-C', w.dir, 'checkout', '--detach', '--quiet']);
    } catch {
      die(`\nFailed to detach ${w.branch} (${w.dir}).\nRun \`unpark\` to put back what did move.`);
    }
    console.log(`parked   ${w.branch}`);
  }
  console.log(`\n${holding.length} branch(es) of stack ${stack.number} free. Restack, then \`unpark\`.`);
}

function unpark() {
  if (!existsSync(PARK_FILE)) die('Nothing parked.');
  const { parked, driver } = JSON.parse(readFileSync(PARK_FILE, 'utf8'));

  const gone = parked.filter((w) => !existsSync(w.dir));
  const live = parked.filter((w) => existsSync(w.dir));

  // The restack left the driver holding one of these; it has to let go before
  // they can be restored, which moves whatever is in it the same way a parked
  // worktree moves — so it faces the same check.
  const now = worktrees();
  const driverHolds = now.some(
    (w) =>
      path.resolve(w.dir) === path.resolve(driver.dir) && parked.some((p) => p.branch === w.branch),
  );

  // Re-checked here, not trusted from park time: a session can edit a parked
  // worktree while the restack runs, and a checkout carries changes that still
  // apply — the silent version of exactly what the pre-park check refuses.
  const dirty = live.filter((w) => isDirty(w.dir));
  if (driverHolds && isDirty(driver.dir)) dirty.push({ branch: '(here)', dir: driver.dir });
  if (dirty.length > 0) refuseDirty(dirty, 'to restore');

  // A parked worktree sits on a detached HEAD, so a commit made there belongs
  // to no branch: moving it back would orphan that commit with nothing to say
  // it existed. Its HEAD should read exactly as it did when parked — the
  // branch is what the restack moves, never the detached worktree.
  const moved = live.filter((w) => w.head && git(['-C', w.dir, 'rev-parse', 'HEAD']) !== w.head);
  if (moved.length > 0) {
    die(
      `New commits on ${moved.length} parked worktree(s):\n` +
        moved.map((w) => `  ${w.branch}  ${w.dir}`).join('\n') +
        '\n\nThey sit on a detached HEAD and belong to no branch. Move them onto\n' +
        '`<branch>` yourself before restoring, or this would strand them.',
    );
  }

  if (driverHolds) git(['-C', driver.dir, 'checkout', '--detach', '--quiet']);

  const missing = [];
  for (const w of live) {
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

  const stranded = [...missing, ...gone];
  if (stranded.length > 0) {
    die(
      '\nNot restored — the branch is gone, the checkout was refused, or the\nworktree no longer exists:\n' +
        stranded.map((w) => `  ${w.branch}  ${w.dir}`).join('\n'),
    );
  }
}

const [command, argument] = process.argv.slice(2);
if (command === 'park') park(argument);
else if (command === 'unpark') unpark();
else die('Usage: node scripts/stack-park.mjs park [stack-number] | unpark');
