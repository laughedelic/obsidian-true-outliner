---
type: "research"
title: "Cloud e2e bring-up: a stale `node_modules`, and a wrapper that holds a piped run open"
description: "Two defects in a cloud session's e2e bring-up, measured on `main`: a snapshot `node_modules` four non-optional packages short of the lockfile while setup's `[ ! -d node_modules ]` guard passes (and why modification time cannot detect it, since a clone stamps the lockfile with its own time), and the Xvfb starter whose `exec` skips its `EXIT` trap so a run piped into `tail` stays open 377 s after a 43 s run ended, reproduced with a one-word command and with the proposed shape tried outside the repository; what the Docker path leaves unmeasured"
---

# Cloud e2e bring-up: a stale `node_modules`, and a wrapper that holds a piped run open

Two defects that every cloud session pays for before its first narrow run (#336). Both are measured
here on `main` at `5b41621`, in a cloud session on a 4-vCPU VM with Node 22.22.0 and npm 10.9.4,
`OBSIDIAN_CACHE=/opt/obsidian-cache`, `E2E_MAX_INSTANCES=2`. The fix is the change
`cloud-e2e-bring-up`; "After the change" below holds its readings, taken in the same session.

## A stale `node_modules`

`scripts/agent-setup.sh` reinstalls only when `node_modules` is absent. The snapshot a cloud session
starts from carries a `node_modules` of its own date.

| Reading | Value |
| --- | --- |
| `node_modules/.package-lock.json` | modified 2026-10-01 17:08 |
| `package-lock.json`, `package.json` | modified 2026-10-03 00:42, the time of the clone (`.git/config`: 00:43) |
| Lockfile entries other than the root | 932 |
| Entries in the hidden lockfile | 879 |
| Lockfile entries missing from `node_modules` | 53, of which 49 optional |
| Non-optional entries missing | 4: `commonmark`, `@types/commonmark`, `commonmark/node_modules/entities`, `mdurl` (all dev) |
| Entries whose version differs | 0 |
| Entries only in `node_modules` | 0 |
| The same comparison after a fresh `npm ci` of the same lockfile in a scratch directory | 883 installed; 49 missing, all optional; 0 non-optional missing |
| That `npm ci`, cold, with the repository's `.npmrc` | 8.8 s |

- **The setup guard passes on this snapshot.** `[ ! -d node_modules ]` is false, so `agent-setup.sh`
  installs nothing and the session starts four packages short. The smoke spec still passes on it
  (below); a spec that imports `commonmark` would not.
- **Modification time cannot tell stale from current.** A clone stamps the lockfile with the clone
  time, 31 hours after `node_modules` here. A comparison on time would reinstall in every session
  whose snapshot is older than its clone, which is every session, including one whose
  `node_modules` matches the lockfile exactly.
- **The hidden lockfile is enough to compare against.** It lists each installed package with its
  version, and npm rewrites it on every install. The 49 optional entries absent after a fresh
  install are platform-specific binaries (`@esbuild/*` and the like) that are not installed on this
  platform, so an absent optional entry is not drift.
- **A reinstall is cheap against what it prevents.** 8.8 s cold, against the twenty-odd minutes
  that #336 records for the sessions that hit a missing package. A `SessionStart` command hook that
  stays inside its default budget is not a concern at that figure.
- **The `.npmrc` matters.** `legacy-peer-deps=true` is what lets `npm ci` resolve `eslint@10` against
  `eslint-plugin-obsidianmd`'s peer ranges; a scratch copy without it fails with `ERESOLVE` in 1.1 s.
  A check that runs `npm ci` must run in the repository root.

## The wrapper and a piped run

`e2e-tests/docker/start-xvfb-and-run.sh` starts Xvfb in the background with its stdout and stderr
inherited, sets an `EXIT` trap that kills it, polls for the X socket, and ends in `exec "$@"`. The
`exec` replaces the shell, so the trap never runs, and Xvfb keeps whatever stdout the wrapper was
given.

| Reading | Value |
| --- | --- |
| `echo hello` through the wrapper, piped to `tail -5`, bounded by `timeout 15` | no `hello`; killed at 15.0 s, exit 124 |
| `node scripts/e2e-narrow.ts 00-smoke` through the wrapper, piped to `tail -5`, bounded by `timeout 420` | the run printed its results to a file and exited 0 after 43 s (build, then 23 s in the spec) |
| The same pipeline, 377 s after the run ended | `tail` still running and printing nothing; Xvfb `:99` still up |
| The same pipeline, at the bound | killed at 420 s, exit 124; `tail` printed nothing |
| Xvfb afterwards | still running until the bound's kill, then a defunct process |

- **The hang is the wrapper's, not the run's.** A one-word command reproduces it, so no spec and no
  Obsidian is needed to test the fix.
- **The reports match.** #336 records a run piped through `tail` that showed nothing until its
  600 s timeout, and a `pgrep -f "e2e-narrow"` wait that matched its own command line; the
  bounded `pgrep -af "Xvfb :98"` used while measuring this note matched its own shell the same way,
  and `pgrep -x -a Xvfb` does not.
- **Xvfb's output is mostly noise.** A start prints about twenty lines of `xkbcomp`
  warnings (`Could not resolve keysym XF86…`) on stderr and says that they are not fatal. Hiding them is
  what the redirect does; what the redirect must not hide is a start that fails.
- **A leftover server on `:99` does not stop the next run.** With one holding the display, the
  wrapper's readiness poll passed at once on the existing socket, the command ran with `DISPLAY=:99`
  and exited 0, and the leftover stayed up. What became of the wrapper's own second server was not
  observed: its log was still empty when read, and whether the display answered was not checked.

### The proposed shape, tried outside the repository

A copy of the wrapper in the scratch directory with Xvfb's output sent to a `mktemp` file, the
file removed by the `EXIT` trap and printed when the socket does not appear, and `"$@"` run in the
foreground, on display `:98` so as not to disturb the run above.

| Reading | Value |
| --- | --- |
| `sh -c 'echo ran on $DISPLAY'` through it, piped to `tail -5` | printed `ran on :98`; returned in 0.2 s, exit 0 |
| `sh -c 'echo failing; exit 7'` through it, piped to `tail -5`, under `pipefail` | printed `failing`; returned in 0.2 s, exit 7 |
| Xvfb on `:98` afterwards | gone, its socket removed |

The exit status passes through because `set -e` ends the script with the failed command's status
and the `EXIT` trap does not change it. The full narrow run through the real change is the "after"
reading, taken once the change is applied.

## After the change

The wrapper and `scripts/lockfile-drift.ts` as committed on `fix/cloud-e2e-bring-up`, on the same
VM, the stale snapshot from the first section still in place when the drift check first ran.

| Reading | Value |
| --- | --- |
| `node scripts/e2e-narrow.ts 00-smoke` through the wrapper, piped to `tail -5`, under `pipefail`, bounded by `timeout 180` | `tail` printed the spec's summary; the pipeline returned after 15.2 s, exit 0 (11 s in the spec), where the same pipeline stayed open past 377 s before |
| `sh -c 'echo failing; exit 7'` through the wrapper, piped to `tail -5`, under `pipefail` | printed `failing`; returned in 0.2 s, exit 7 |
| `sh -c 'echo ok; exit 3'` through it, not piped | exit 3; Xvfb gone, no X socket, no temporary log 3 s later |
| Control: the committed `exec` wrapper, `echo hello` piped to `tail -5`, bounded by `timeout 15` | killed at 15.0 s, exit 124, as before |
| A stub `Xvfb` that prints one line and exits 1, with the wrapper running `echo` | after 9.9 s printed "Xvfb did not come up in time; its output:" and the stub's line; exit 1; no temporary log left |
| `node scripts/lockfile-drift.ts` on the stale snapshot | exit 1: 4 places, naming `@types/commonmark@0.27.10` first, the same four packages as the first section |
| `scripts/agent-setup.sh` on that snapshot, without `CLAUDE_CODE_REMOTE` | reports `npm dependencies out of date (… 4 place(s): …); run `npm ci``, installs nothing |
| The same script from `main`'s `HEAD`, on that snapshot | no npm note: the old guard passes |
| `scripts/agent-setup.sh` with `CLAUDE_CODE_REMOTE=true` on that snapshot | ran `npm ci` and reported `installed npm dependencies (…)`; 9.6 s for the whole script |
| `node scripts/lockfile-drift.ts` after that install, and the script's npm note | exit 0; no note |
| The drift check on the in-sync tree, five runs | 88 to 100 ms each, against 8.8 s for the `npm ci` it guards |

- **A failed start found a defect in the first draft of the wrapper.** The trap read
  `kill $XVFB_PID 2>/dev/null; rm -f "$XVFB_LOG"`. Under `set -e` a `kill` of a process that had
  already exited ended the trap before the `rm`, leaving the temporary log behind. The stub run
  showed it; the trap now reads `kill … || true; rm -f …`. The original trap, with only the `kill`,
  could not show this.
- **Xvfb is defunct for about a second after the wrapper exits.** `pgrep -x Xvfb` counted one
  process directly after a run and none 3 s later: the wrapper has gone, so init reaps it. The
  server itself is stopped, and its socket is gone at once.
- **The two guards differ on this snapshot only in content.** Both see `node_modules` present;
  only the content check sees four packages short.

## Docker interruption

On `main`, with the `exec` wrapper, the maintainer interrupted `npm run test:e2e:docker` with
Ctrl-C: the prompt came back after about 1 s, and the run printed "Goodbye". On this change's
branch, with the wrapper no longer `exec`ing, the maintainer ran the same two steps (a run to
completion, then an interrupt) and saw no difference. The reading is by hand and records no
timing beyond that, so a difference smaller than a second would not show in it.
