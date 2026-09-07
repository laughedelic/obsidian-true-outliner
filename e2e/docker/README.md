# Headless e2e (Docker + Xvfb)

`scripts/run-e2e.mjs` and `scripts/e2e-narrow.mjs` both launch a real Obsidian window on
macOS/Windows. CI runs the same suite headlessly on Linux under Xvfb instead
(`.github/workflows/ci.yml`, `ubuntu-latest`) — this reproduces that locally in a container, so a
run — narrow, grouped, or full — never has to pop a window on the host, whatever OS it runs.

## Invoke

```bash
npm run test:e2e:docker                    # whole suite, desktop
npm run test:e2e:docker -- --group smoke   # one CI-style group
npm run test:e2e:docker:mobile             # mobile-emulation config
```

Both wrap `scripts/e2e-docker.mjs`, which drives `docker compose` (`docker-compose.yml` in this
directory) — don't invoke `docker compose` directly, the script also validates `--group` against
`scripts/spec-groups.mjs` and works out the worktree git-dir handling described below.

The image builds automatically on first run (and on any later `Dockerfile`/`package.json`
change, via Docker's own layer cache) — pass `--build` to force a rebuild.

## What's actually verified, not assumed

Built from `node:26-bookworm` (matching CI's Node version) plus the Debian packages an Electron
app needs to start under Xvfb — arrived at by building this image and running the suite inside
it, not copied from an unverified list. `obsidian-launcher` (the package `wdio-obsidian-service`
uses to fetch Obsidian) does support a Linux target — confirmed by watching it fetch and launch
one inside the container, the same way CI already does on `ubuntu-latest`.

## Design choices

**One container per invocation**, covering however many specs are in scope — the whole suite by
default, or one group with `--group`. Never one container per spec file: `scripts/run-e2e.mjs`
inside the container already dispatches every spec in scope through a single wdio run,
parallelised across `E2E_MAX_INSTANCES` workers, so batching multiple files per container
invocation is inherited from the existing script rather than reimplemented here. This
deliberately does not fan out multiple containers to run several groups in parallel the way CI's
matrix does — CI already gives full-suite, parallel-across-groups coverage (see AGENTS.md's "E2E
testing" section), so this path's job is a headless run, not a faster one.

`E2E_MAX_INSTANCES` defaults to **2** for the container (`scripts/e2e-docker.mjs`), lower than
CI's `max-instances: 4`: a CI runner is dedicated to the job, while this container shares the
Docker Desktop/OrbStack Linux VM's CPU allocation with everything else on the host. Override with
`E2E_MAX_INSTANCES=N npm run test:e2e:docker`; `docker info` reports what the VM currently has to
give.

**No `xvfb-run`.** `e2e/docker/start-xvfb-and-run.sh` starts `Xvfb` itself and polls for its
socket file before exporting `DISPLAY` and launching the suite — see that script's header. The
obvious choice, wrapping the whole invocation in `xvfb-run --auto-servernum`, hung indefinitely in
this container: `Xvfb` came up but the wrapped `node` process never started, because the
`wait`/`SIGUSR1` handshake `xvfb-run`'s own shell script uses for readiness never completed.

**Dependencies are installed at image build time**, not on every run: `npm ci` happens inside the
`Dockerfile`, baking Linux binaries (esbuild, etc.) into the image. At runtime,
`docker-compose.yml` mounts a *named volume* over `/workspace/node_modules`, shadowing the
bind-mounted repo's `node_modules` — otherwise a macOS/Windows host's `node_modules`
(wrong-platform native binaries) would sit in front of the image's. Docker seeds a fresh named
volume from what's already visible at that path the first time it's used, so this needs no extra
setup step.

Three more named volumes persist what `obsidian-launcher` downloads (Obsidian itself, its
installer, and the Electron/Chromedriver build — ~490MB together, measured) across container
runs — scoped to exactly those subdirectories under `.obsidian-cache`, deliberately NOT the whole
directory: `e2e-summary.json` and `e2e-reports/` (see AGENTS.md's "E2E testing" section) land
under `.obsidian-cache` too, on every run, and need to stay on the bind-mounted host filesystem —
`cat .obsidian-cache/e2e-summary.json` right after the container exits is the whole point of that
file. An earlier version of this compose file shadowed the whole directory with one volume, which
worked but made the summary invisible outside the container; this is why it doesn't.

**Rebuild the image or drop a volume** after a dependency or Obsidian-version change that isn't
reflected some other way: `docker volume ls` to see the actual names (`docker compose` prefixes
them, e.g. `docker_e2e-node-modules`), `docker volume rm <name>` to drop one.

## Worktree caveat

A git **worktree**'s `.git` is a file pointing at an absolute host path
(`<main checkout>/.git/worktrees/<name>`) — bind-mounting the worktree alone gives the container
that pointer with nothing at the far end, and anything that shells out to git (the build stamp in
`esbuild.config.mjs`, `git status`/`checkout` in `scripts/check-vault-drift.mjs`) fails with "not
a git repository".

`scripts/e2e-docker.mjs` handles this automatically: it mounts the real git-common-dir at an
arbitrary container path and points `GIT_COMMON_DIR`/`GIT_DIR`/`GIT_WORK_TREE` at it directly,
bypassing `.git`-file resolution. (Bind-mounting the git dir at the *same* absolute path — the
more obvious fix — silently fails on this host: OrbStack drops a bind mount whose source and
target path are identical, confirmed with a plain `docker run -v $P:$P alpine ls $P` before
reaching for the env-var approach instead.) A plain, non-worktree checkout needs none of this —
`git rev-parse --git-common-dir` is already `.git` under the mounted root.
