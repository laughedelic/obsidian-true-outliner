/**
 * Runs the e2e suite inside a Linux container under Xvfb — see
 * `e2e/docker/README.md` for what this buys over running locally (nothing
 * pops up on the host, whatever OS the host is) and its limits.
 *
 *   node scripts/e2e-docker.mjs [desktop|mobile] [--group <name>] [--build]
 *
 * One container per invocation, however many spec files that covers — every
 * spec (the default) or one CI-style group with `--group`. Not one
 * container per spec file: `docker compose run` already dispatches to
 * `scripts/run-e2e.mjs`, which runs every spec in scope through a single
 * wdio invocation, parallelised across `E2E_MAX_INSTANCES` workers inside
 * that one container — so batching is inherited, not reimplemented here.
 *
 * This deliberately does not fan out multiple containers to run groups in
 * parallel, the way CI's matrix does: CI already gives full-suite,
 * parallel-across-groups coverage (see CLAUDE.md's "E2E testing" section —
 * it's the source of truth for that), so this script's job is narrower:
 * let a local run happen without a window, not out-race the matrix.
 *
 * `--build` forces a rebuild even if Docker thinks the image is current
 * (e.g. after bumping the Node base image) — ordinarily `docker compose run`
 * already rebuilds on a Dockerfile/package.json change via its own layer
 * cache, so this is rarely needed.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
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
 * obvious fix — does not work here: this host (OrbStack) silently fails a
 * bind mount whose source and target path are identical, confirmed with a
 * plain `docker run -v $P:$P alpine ls $P` before reaching for this. So
 * instead the git dir is mounted at an arbitrary container path and
 * `GIT_COMMON_DIR`/`GIT_DIR`/`GIT_WORK_TREE` point git at it directly,
 * bypassing `.git`-file resolution entirely — verified against `git status`
 * and `git rev-parse` inside the container, not just rev-parse alone, since
 * check-vault-drift.mjs needs the former.
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
  const relativeGitDir = path.relative(commonDir, gitDir); // e.g. worktrees/<name>
  return [
    '-v',
    `${commonDir}:/git-common:ro`,
    '-e',
    'GIT_COMMON_DIR=/git-common',
    '-e',
    `GIT_DIR=/git-common/${relativeGitDir}`,
    '-e',
    'GIT_WORK_TREE=/workspace',
  ];
}

const argv = process.argv.slice(2);
const platform = argv[0]?.startsWith('--') ? 'desktop' : (argv[0] ?? 'desktop');
if (platform !== 'desktop' && platform !== 'mobile') {
  console.error(`[e2e:docker] unknown platform ${JSON.stringify(platform)}. Expected 'desktop' or 'mobile'.`);
  process.exit(1);
}

const group = argv[argv.indexOf('--group') + 1];
if (argv.includes('--group')) {
  const groups = specGroups();
  if (!groups[group]) {
    console.error(
      `[e2e:docker] unknown group ${JSON.stringify(group)}. Known groups: ${Object.keys(groups).join(', ')}`,
    );
    process.exit(1);
  }
}
const groupArgs = argv.includes('--group') ? ['--group', group] : [];

// A conservative default: unlike a bare-metal CI runner, this shares the
// Docker Desktop/OrbStack Linux VM's CPU allocation with everything else on
// the host, so CI's `max-instances: 4` (a dedicated runner) is not a safe
// default here. Override with `E2E_MAX_INSTANCES=N` for a VM given more
// cores; `docker info` reports what the VM currently has.
const maxInstances = process.env.E2E_MAX_INSTANCES ?? '2';

const run = (cmd, args) => spawnSync(cmd, args, { cwd: root, stdio: 'inherit' }).status ?? 1;

if (argv.includes('--build')) {
  const build = run('docker', ['compose', '-f', composeFile, 'build']);
  if (build !== 0) process.exit(build);
}

// scripts/run-e2e.mjs itself sets OBSIDIAN_E2E_MOBILE on the wdio subprocess
// when `platform` is 'mobile' — no need to also set it at the container level.
//
// e2e/docker/start-xvfb-and-run.sh, not a plain `xvfb-run` wrapper — see
// that script's own header for why (its signal-based readiness wait hung
// indefinitely in this container).
const command = ['e2e/docker/start-xvfb-and-run.sh', platform, ...groupArgs];
const status = run('docker', [
  'compose',
  '-f',
  composeFile,
  'run',
  '--rm',
  '-e',
  `E2E_MAX_INSTANCES=${maxInstances}`,
  ...gitVolumeAndEnvArgs(),
  'e2e',
  ...command,
]);
process.exit(status);
