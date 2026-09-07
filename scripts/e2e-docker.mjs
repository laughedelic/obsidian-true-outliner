/**
 * Runs the e2e suite inside a Linux container under Xvfb — see
 * `e2e/docker/README.md` for what this buys over running locally (nothing
 * pops up on the host, whatever OS the host is) and its limits.
 *
 *   node scripts/e2e-docker.mjs [desktop|mobile] [--group <name>]
 *   node scripts/e2e-docker.mjs [desktop|mobile] <spec> [test-name-grep]
 *
 * One container per invocation, however many spec files that covers — every
 * spec (the default), one CI-style group with `--group`, or one spec (and
 * optionally one test) via `scripts/e2e-narrow.mjs` when a bare positional
 * argument follows the platform. Not one container per spec file:
 * `scripts/run-e2e.mjs`/`scripts/e2e-narrow.mjs` inside the container
 * already dispatch every spec in scope through a single wdio invocation, so
 * batching is inherited, not reimplemented here.
 *
 * This deliberately does not fan out multiple containers to run groups in
 * parallel, the way CI's matrix does: CI already gives full-suite,
 * parallel-across-groups coverage (see AGENTS.md's "E2E testing" section —
 * it's the source of truth for that), so this script's job is narrower:
 * let a local run happen without a window, not out-race the matrix.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as os from 'node:os';
import * as path from 'node:path';
import { specGroups } from './spec-groups.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const composeFile = path.join(root, 'e2e', 'docker', 'docker-compose.yml');

/**
 * A git WORKTREE's `.git` is a file pointing at an absolute host path
 * (`<main checkout>/.git/worktrees/<name>`) — bind-mounting the worktree
 * alone gives the container that pointer with nothing at the far end, so
 * every git-invoking step (the build stamp in esbuild.config.mjs, and
 * `git status`/`checkout` in scripts/check-vault-drift.mjs) fails with "not
 * a git repository".
 *
 * Bind-mounting the real git dir at the SAME absolute path — the more
 * obvious fix — is not reliable: some Docker file-sharing backends no-op a
 * bind mount whose source and target path are identical, mounting nothing.
 * So instead the git dir is mounted at an arbitrary container path and
 * `GIT_COMMON_DIR`/`GIT_DIR`/`GIT_WORK_TREE` point git at it directly,
 * bypassing `.git`-file resolution entirely.
 *
 * The common dir is mounted read-only — it's the shared object store, no
 * reason a container run should write there — but the worktree's OWN gitdir
 * under it is mounted again, read-write, nested on top: `git checkout`
 * during vault-drift cleanup needs to create `index.lock` inside that
 * worktree-specific directory, which a blanket read-only mount would block.
 *
 * A plain (non-worktree) checkout's `--git-common-dir` is just `.git` under
 * the already-mounted root, so this is a no-op there.
 */
function gitVolumeAndEnvArgs() {
  const commonDir = path.resolve(
    root,
    execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: root, encoding: 'utf-8' }).trim(),
  );
  if (commonDir === path.join(root, '.git')) return [];

  const gitDir = path.resolve(
    root,
    execFileSync('git', ['rev-parse', '--absolute-git-dir'], { cwd: root, encoding: 'utf-8' }).trim(),
  );
  // POSIX separators regardless of host OS: this becomes part of a Linux
  // container path (GIT_DIR), and path.relative on Windows returns
  // backslashes.
  const relativeGitDir = path.relative(commonDir, gitDir).split(path.sep).join('/');
  return [
    '-v',
    `${commonDir}:/git-common:ro`,
    '-v',
    `${gitDir}:/git-common/${relativeGitDir}:rw`,
    '-e',
    'GIT_COMMON_DIR=/git-common',
    '-e',
    `GIT_DIR=/git-common/${relativeGitDir}`,
    '-e',
    'GIT_WORK_TREE=/workspace',
  ];
}

/**
 * Runs the container as the invoking user instead of the image's default
 * root, so files it writes into the bind-mounted repo (build output, the
 * generated backlink fixture, e2e-summary.json) and into the Obsidian
 * download volumes stay owned by that user — not root — on the host. On a
 * native Linux host (unlike Docker Desktop/OrbStack's VM) root-owned output
 * from a bind mount is a real, sticky problem: it breaks the next host-side
 * build and can make git refuse the checkout as an "unsafe repository"
 * owned by someone else.
 *
 * `os.userInfo().uid/gid` are `-1` on Windows (no POSIX UID/GID there), so
 * this is a no-op on that platform — Docker Desktop for Windows containers
 * don't have the same host-ownership concern.
 */
function userArgs() {
  const { uid, gid } = os.userInfo();
  if (uid < 0 || gid < 0) return [];
  // HOME=/tmp: this UID has no /etc/passwd entry in the image, and npm/node
  // otherwise warn or fail trying to resolve a home directory for it.
  return ['-u', `${uid}:${gid}`, '-e', 'HOME=/tmp'];
}

const argv = process.argv.slice(2);
const platform = argv[0] === 'mobile' ? 'mobile' : 'desktop';
const rest = argv[0] === 'desktop' || argv[0] === 'mobile' ? argv.slice(1) : argv;

const groupIndex = rest.indexOf('--group');
let group;
if (groupIndex !== -1) {
  group = rest[groupIndex + 1];
  // Missing entirely, or the next token is itself a flag: --group with no
  // value must fail loudly, not silently fall back to running everything.
  if (group === undefined || group.startsWith('--')) {
    console.error('[e2e:docker] --group requires a value.');
    process.exit(1);
  }
  const groups = specGroups();
  if (!groups[group]) {
    console.error(
      `[e2e:docker] unknown group ${JSON.stringify(group)}. Known groups: ${Object.keys(groups).join(', ')}`,
    );
    process.exit(1);
  }
}
// A bare positional (not --group's own value) selects narrow mode — one
// spec, optionally one test — mirroring scripts/e2e-narrow.mjs's own CLI.
const positional = rest.filter((a, i) => {
  if (a.startsWith('--')) return false;
  if (groupIndex !== -1 && i === groupIndex + 1) return false; // --group's own value
  return true;
});
const [narrowSpec, narrowGrep] = group === undefined ? positional : [];

// A conservative default: unlike a bare-metal CI runner, this shares the
// Docker Desktop/OrbStack Linux VM's CPU allocation with everything else on
// the host, so CI's `max-instances: 4` (a dedicated runner) is not a safe
// default here. Override with `E2E_MAX_INSTANCES=N` for a VM given more
// cores; `docker info` reports what the VM currently has.
const maxInstances = process.env.E2E_MAX_INSTANCES ?? '2';

const run = (cmd, args) => spawnSync(cmd, args, { cwd: root, stdio: 'inherit' }).status ?? 1;

const innerCommand = narrowSpec
  ? [
      'node',
      'scripts/e2e-narrow.mjs',
      narrowSpec,
      ...(narrowGrep ? [narrowGrep] : []),
      ...(platform === 'mobile' ? ['--mobile'] : []),
    ]
  : ['node', 'scripts/run-e2e.mjs', platform, ...(group !== undefined ? ['--group', group] : [])];

const status = run('docker', [
  'compose',
  '-f',
  composeFile,
  'run',
  // Not optional: `docker compose run` reuses whatever image already exists
  // and does not check the Dockerfile or package.json for changes on its
  // own. With --build every run pays only Docker's own per-layer cache cost.
  '--build',
  '--rm',
  '-e',
  `E2E_MAX_INSTANCES=${maxInstances}`,
  ...userArgs(),
  ...gitVolumeAndEnvArgs(),
  'e2e',
  'e2e/docker/start-xvfb-and-run.sh',
  ...innerCommand,
]);
process.exit(status);
