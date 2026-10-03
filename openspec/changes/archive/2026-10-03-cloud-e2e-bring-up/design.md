## Context

`agent-setup.sh` runs from the `SessionStart` hook in every environment that starts an agent
session, and installs only in a throwaway one (a cloud session, or `--install`). Its `npm ci` guard
asks whether `node_modules` exists. The wrapper is the one starter for a virtual display: cloud
sessions run it by hand, and `scripts/e2e-docker.ts` passes it to `docker compose run` as the
container's command. Measurements for every figure below are in
[`cloud-e2e-bring-up`](../../../../docs/research/cloud-e2e-bring-up.md).

## Goals / Non-Goals

**Goals:**

- A session whose `node_modules` does not match the lockfile reinstalls at start, and one whose
  `node_modules` matches pays no install.
- `node scripts/e2e-narrow.ts <spec> | tail -5` inside the wrapper returns when the run ends, with
  the command's exit status.

**Non-Goals:** as in the proposal.

## Decisions

**Content, not modification time.** The hidden lockfile lists every installed package with its
version. The check reads both lockfiles and reports a lockfile entry that is missing from it or
differs in version, and an installed entry the lockfile no longer has. Modification time fails
here because a clone stamps the lockfile with the clone time, which is later than any snapshot, so
the check would fire in every session; the content check fires on drift only.

**The root entry is skipped.** The lockfile's `""` key is the project itself and has no counterpart
in the hidden lockfile, so it is excluded from both directions; an implementation that compared it
would report drift in every session.

**Optional entries are skipped when absent.** Platform-specific optional packages (49 of the
lockfile's 932 entries are optional and absent from a fresh install on this VM) are legitimately
absent on a platform they do not target.
The check ignores an optional entry that is missing and still compares one that is installed.
Drift that touches only an optional package the platform needs is not caught; such a package's
version moves with a non-optional parent (`@esbuild/linux-x64` with `esbuild`), so a bump shows up
on the parent.

**A TypeScript script, not an inline `node -e`.** The repository's tooling is TypeScript under
`scripts/`, checked by `npm run typecheck:scripts`, and the comparison is a function a unit test
can feed two lockfiles. `agent-setup.sh` already requires Node able to run `scripts/*.ts` and says
so when it cannot. The script exits 0 in sync, 1 on drift with the reason on stdout, and the shell
treats any non-zero exit, a crash included, as a reason to reinstall: `npm ci` is the safe
direction.

**The install guard keeps its two modes.** In a throwaway environment drift runs `npm ci` and
notes it; elsewhere it adds a note naming what differs. A missing `node_modules` is drift, as
before.

**The wrapper writes Xvfb's output to a file, not `/dev/null`.** Redirecting is what releases the
pipe. A file keeps the failure readable: when the socket does not appear, the wrapper prints the
log before exiting 1. Today that case prints nothing but its own line. The log is removed by the
`EXIT` trap.

**The command runs in the foreground, without `exec`.** With `set -e` a failing command ends the
script with its own status and the `EXIT` trap still runs, so Xvfb is killed and the wrapper's
status is the command's. A run piped into `tail` returns because nothing else holds the pipe.

## Risks / Trade-offs

- **The wrapper becomes PID 1 in the Docker container**, where the test runner was. A Ctrl-C or
  `docker stop` reaches the shell, which holds the trap until the foreground command finishes.
  This VM has no Docker daemon, so the change is unmeasured here → a task has the maintainer run
  `npm run test:e2e:docker` and interrupt it, and landing waits on that result; if interruption regressed, the fix is to run the
  command in the background and forward `INT` and `TERM` to it, a follow-up with that measurement.
- **A leftover Xvfb on `:99`** from an earlier hung run makes the next wrapper's own server exit
  ("already active"), while the readiness poll passes on the old socket. The run works, on the
  old server. Sessions that predate the fix can leave one; the log from the failed start now says
  so.
- **The check reads two large JSON files at every session start.** Measured at the apply step and
  recorded in the research note; the cold `npm ci` it guards costs 8.8 s here, so the check is
  worth it only if it is a small fraction of that.
