# Headless e2e (Docker + Xvfb)

`scripts/run-e2e.mjs` and `scripts/e2e-narrow.mjs` both launch a real Obsidian window on
macOS/Windows. CI runs the same suite headlessly on Linux under Xvfb instead
(`.github/workflows/ci.yml`, `ubuntu-latest`) — this reproduces that locally in a container, so a
run — narrow, grouped, or full — never has to pop a window on the host, whatever OS it runs.

## Invoke

```bash
npm run test:e2e:docker                                        # whole suite, desktop
npm run test:e2e:docker -- --group smoke                       # one CI-style group
npm run test:e2e:docker -- 77-footer-controls "renders it"     # one spec, one test (narrow mode)
npm run test:e2e:docker:mobile -- --group smoke                # mobile-emulation config
```

A bare positional argument (not `--group`'s own value) runs `scripts/e2e-narrow.mjs` inside the
container instead of `scripts/run-e2e.mjs`, the same way it would locally.

Both npm scripts wrap `scripts/e2e-docker.mjs`, which drives `docker compose`
(`docker-compose.yml` in this directory) — don't invoke `docker compose` directly, the script also
validates `--group` against `scripts/spec-groups.mjs` and works out the worktree git-dir and
host-UID handling described below.

The image is rebuilt on every invocation (`docker compose run --build`) — Docker's own per-layer
cache makes an unchanged build sub-second, so this doesn't need a separate `--build` flag or a
"did you remember to rebuild" step; `docker compose run` alone, without `--build`, would silently
keep using a stale image instead of picking up a `Dockerfile`/`package.json` change.

## What's actually verified, not assumed

Built from `node:26-bookworm` (matching CI's Node version) plus the Debian packages an Electron
app needs to start under Xvfb — arrived at by building this image and running the suite inside
it, not copied from an unverified list. `obsidian-launcher` (the package `wdio-obsidian-service`
uses to fetch Obsidian) does support a Linux target — confirmed by watching it fetch and launch
one inside the container, the same way CI already does on `ubuntu-latest`.

## Design choices

**One container per invocation**, covering however many specs are in scope — the whole suite by
default, one group with `--group`, or one spec (optionally one test) in narrow mode. Never one
container per spec file: `scripts/run-e2e.mjs`/`scripts/e2e-narrow.mjs` inside the container
already dispatch every spec in scope through a single wdio run, so batching multiple files per
container invocation is inherited from those scripts rather than reimplemented here. This
deliberately does not fan out multiple containers to run several groups in parallel the way CI's
matrix does — CI already gives full-suite, parallel-across-groups coverage (see AGENTS.md's "E2E
testing" section), so this path's job is a headless run, not a faster one.

`E2E_MAX_INSTANCES` defaults to **2** for the container (`scripts/e2e-docker.mjs`), lower than
CI's `max-instances: 4`: a CI runner is dedicated to the job, while this container shares the
Docker Desktop/OrbStack Linux VM's CPU allocation with everything else on the host. Override with
`E2E_MAX_INSTANCES=N npm run test:e2e:docker`; `docker info` reports what the VM currently has to
give.

**No `xvfb-run`.** `e2e/docker/start-xvfb-and-run.sh` starts `Xvfb` itself and polls for its
socket file before exporting `DISPLAY` and `exec`ing whatever command it's given — see that
script's header. The obvious choice, wrapping the whole invocation in `xvfb-run --auto-servernum`,
hung indefinitely in this container: `Xvfb` came up but the wrapped `node` process never started,
because the `wait`/`SIGUSR1` handshake `xvfb-run`'s own shell script uses for readiness never
completed.

**Runs as the invoking host UID/GID**, not the image's default root — `scripts/e2e-docker.mjs`
passes `-u $(uid):$(gid)` (a no-op on Windows, which has no POSIX UID/GID). On Docker
Desktop/OrbStack's VM this mostly doesn't matter, but on a native Linux host, root-owned output
from a root-run container writing into a bind-mounted, user-owned repo is a real, sticky problem:
it breaks the next host-side build, and can make git refuse the checkout as owned by someone else.
`node_modules` and the `.obsidian-cache` mount points are made world-writable in the `Dockerfile`
so an arbitrary host UID (which has no matching user in the image) can still write to them.

**Dependencies are installed at image build time**, not on every run: `npm ci` happens inside the
`Dockerfile`, baking Linux binaries (esbuild, etc.) into the image. At runtime,
`docker-compose.yml` mounts an *anonymous* volume over `/workspace/node_modules`, shadowing the
bind-mounted repo's `node_modules` — otherwise a macOS/Windows host's `node_modules`
(wrong-platform native binaries) would sit in front of the image's. Anonymous, not named: it's
re-seeded from the image on every `run`, so a `package-lock.json` change always takes effect on
the very next run. A *named* volume there — persistent across runs by design — would instead keep
serving whatever `node_modules` existed the first time it was created, no matter how many times
the image was rebuilt after.

Three *named* volumes persist what `obsidian-launcher` downloads (Obsidian itself, its installer,
and the Electron/Chromedriver build) across container runs — scoped to exactly those subdirectories
under `.obsidian-cache`, deliberately not the whole directory: `e2e-summary.json` and
`e2e-reports/` (see AGENTS.md's "E2E testing" section) land under `.obsidian-cache` too, on every
run, and need to stay on the bind-mounted host filesystem — `cat .obsidian-cache/e2e-summary.json`
right after the container exits is the whole point of that file. Shadowing the whole directory
with one volume (an earlier version of this compose file did) would make the summary invisible
outside the container.

**Drop a volume** after an Obsidian-version change that isn't reflected some other way:
`docker volume ls` to see the actual names (`docker compose` prefixes them, e.g.
`docker_e2e-obsidian-app`), `docker volume rm <name>` to drop one. `node_modules` needs no such
step — see above.

## Worktree caveat

A git **worktree**'s `.git` is a file pointing at an absolute host path
(`<main checkout>/.git/worktrees/<name>`) — bind-mounting the worktree alone gives the container
that pointer with nothing at the far end, and anything that shells out to git (the build stamp in
`esbuild.config.mjs`, `git status`/`checkout` in `scripts/check-vault-drift.mjs`) fails with "not
a git repository".

`scripts/e2e-docker.mjs` handles this automatically: it mounts the real git-common-dir read-only at
an arbitrary container path, mounts the worktree's own gitdir (nested under it) read-write on top —
cleanup's `git checkout` needs to write `index.lock` there — and points
`GIT_COMMON_DIR`/`GIT_DIR`/`GIT_WORK_TREE` at them directly, bypassing `.git`-file resolution.
(Bind-mounting the git dir at the *same* absolute path — the more obvious fix — is not reliable:
some Docker file-sharing backends no-op a bind mount whose source and target path are identical.)
A plain, non-worktree checkout needs none of this — `git rev-parse --git-common-dir` is already
`.git` under the mounted root.
