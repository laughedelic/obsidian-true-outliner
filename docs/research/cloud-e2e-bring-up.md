# Cloud e2e bring-up: a stale `node_modules`, and a wrapper that holds a piped run open

Two defects that every cloud session pays for before its first narrow run (#336). Both are measured
here on `main` at `5b41621`, in a cloud session on a 4-vCPU VM with Node 22.22.0 and npm 10.9.4,
`OBSIDIAN_CACHE=/opt/obsidian-cache`, `E2E_MAX_INSTANCES=2`. The fix is the change
`cloud-e2e-bring-up`; its "after" readings are added to this note when it lands.

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
- **A leftover server on `:99` makes the next start's own server exit** with "already active", while
  the readiness poll passes on the old socket. The next run works, on the old server. Not measured
  here; read from how Xvfb treats a held display and how the poll is written.

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

## Not measured

- **The Docker path.** `scripts/e2e-docker.ts` passes the wrapper to `docker compose run` as the
  container's command, so without `exec` the shell is PID 1 where the test runner was, and an
  interrupt reaches the shell, which holds its trap until the foreground command ends. This VM
  has the Docker client and no daemon (`docker ps` cannot reach the socket). Whether a Ctrl-C of
  `npm run test:e2e:docker` still stops the container promptly is for a machine with a daemon, and the change does not land before it is read.
- **A failed Xvfb start under the proposed wrapper.** The log-on-failure path is written from the
  design and gets its reading when the change is applied.
- **The cost of the drift check itself.** Recorded at the apply step against the 8.8 s above.
