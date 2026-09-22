# Why `test:e2e:docker` grew the host's disk by half a gigabyte per run

`npm run test:e2e:docker` passes `--build` on every invocation, by design:
`docker compose run` alone does not notice a `Dockerfile` or `package.json` change, so a
rebuild is how the container stays honest (`e2e/docker/README.md`, "Invoke"). The README's
claim about the cost of that is where this note starts — *"Docker's own per-layer cache makes
an unchanged build sub-second"*. It does. But almost no build was unchanged, and a changed one
was not cheap.

## The symptom

Reported from a local dev loop on macOS + OrbStack, repo at v0.12.0:

| Observation | Figure |
| --- | --- |
| One `npm run test:e2e:docker -- 52-heading-level-markers` run | host free space 9.3 GB → 215 MB |
| An earlier pair of runs | ≈ 18 GB consumed |
| `docker system df`, images | 23.14 GB (21.38 GB reclaimable) |
| `docker system df`, build cache | up to 15.1 GB |
| `docker system df`, local volumes | 1.09 GB (838 MB reclaimable) |
| `docker builder prune -af` | reclaimed ≈ 9 GB, host free space followed within seconds |

That last row is the important one: the space was live Docker data, not something the host
never released. Whatever the mechanism, it was storing new bytes per invocation rather than
leaking them.

## The mechanism

`docker history` on the image the old `Dockerfile` produced, with the layers it added on top
of `node:26-bookworm`:

| Layer | Size |
| --- | --- |
| `RUN apt-get install …` (Xvfb, Electron's shared libraries) | not re-measured; cached throughout |
| `COPY package.json package-lock.json .npmrc ./` | 471 kB |
| `RUN npm ci` | 443 MB |
| `COPY . .` | 14 MB |
| `RUN mkdir -p .obsidian-cache/… && chmod -R a+rwX node_modules .obsidian-cache` | **368 MB** |

The `chmod` layer is 368 MB because a recursive mode change rewrites the metadata of every
file it touches, and a layer stores a whole file for any change to it. `chmod -R` over
`node_modules` therefore copies `node_modules` up in full — the 443 MB `npm ci` layer, stored
a second time, minus what the modes already allowed.

A 368 MB layer is not itself a problem if it is built once. This one was built every time,
because it sat directly below `COPY . .`, and `COPY . .` was invalidated on every invocation
by the previous run's own output: the old `.dockerignore` excluded only `.git`,
`node_modules`, `dist` and `.obsidian-cache`, while a run rewrites `main.js`, `styles.css`,
the three installed files under `test-vault/.obsidian/plugins/true-outliner/`, and
`test-vault/.obsidian/workspace.json` — all inside the build context. A source edit did the
same. So each invocation re-ran `COPY . .` and the `chmod` below it, and stored both results
twice over: once in the image (the previous image going dangling, its unique layers retained)
and once in the BuildKit cache.

Two things this is *not*, both checked: the build context of a checkout with nothing nested
under it is 14 MB ("On the reported host" covers the one that has), so `.obsidian-cache`
(≈ 565 MB: the Obsidian installer, the app, per-spec screenshots) was already excluded and
never reached the image; and the container runs `--rm`, with the three Obsidian downloads on
named volumes that persist rather than accumulate.

## Measurements

### In a cloud sandbox

Taken in a Claude cloud sandbox (Ubuntu 24.04, Docker Engine 29.3.1, containerd/overlayfs
snapshotter, BuildKit via buildx v0.31.1) — **not** on the macOS + OrbStack host the symptom
was reported from. One deviation from `e2e/docker/Dockerfile`: the `apt-get` layer is dropped,
because that sandbox's egress proxy refuses `deb.debian.org`. That layer is cached in every
rebuild measured on either side, so it contributes nothing to a per-rebuild delta. Everything
else — base image digest, `npm ci` against the committed `package-lock.json`, layer order,
build context — is the real thing.

Each cycle writes the four files a run regenerates, then rebuilds; the delta is
`du -s /var/lib/docker` across the rebuild.

| Cycle | Layer order as committed at v0.12.0 | `chmod` folded into `npm ci`, above `COPY . .` | Both, plus the widened `.dockerignore` |
| --- | --- | --- | --- |
| 1 | 440 MB | 17.3 MB | 0.08 MB |
| 2 | 616 MB | 17.3 MB | 1.20 MB |
| 3 | 440 MB | 18.2 MB | — |

A rebuild with nothing at all changed was already free before the fix (336 kB), which is what
the README's "sub-second" claim describes — it just never happened, because a run always left
output in the context.

After both changes, against the patched `e2e/docker/Dockerfile` itself:

| Rebuild | Delta |
| --- | --- |
| After a run, no source edit | 0.09 MB, 1.44 MB, 1.51 MB |
| After a real source edit | 18.8 MB |

So ≈ 440 MB per run becomes ≈ 0 for a repeat run and ≈ 19 MB — one copy of the source tree —
for a run that follows an edit. The 19 MB is inherent to `COPY . .` and is where this stops
being worth chasing.

### On the reported host

Re-measured on the Mac the symptom came from: macOS 26.3.1, OrbStack 2.2.3, Docker Engine
29.4.0, storage driver `overlay2` on a btrfs backing filesystem, buildx v0.33.0. The `apt-get`
layer is present here (280 MB, cached throughout). Each figure is the change across one
`npm run test:e2e:docker -- 52-heading-level-markers` invocation, read three ways: `df -k /` on
the host, the allocated size of OrbStack's sparse `data.img.raw`, and `docker system df`.

Run from a worktree with nothing nested under it (context transfer 1.5 MB on `main`, 0.1 MB
with the fix):

| Run | Host free space | OrbStack disk image | `docker system df`, images / build cache |
| --- | --- | --- | --- |
| `main`, first (image removed beforehand; `npm ci` still cached) | −458 MB | +467 MB | +2.08 GB / +357 MB |
| `main`, second | −98 MB | +69 MB | +313 MB / +313 MB |
| `main`, third | −44 MB | +50 MB | +313 MB / +313 MB |
| fix, first (the changed `RUN` re-runs `npm ci` once) | −796 MB | +791 MB | +373 MB / +373 MB |
| fix, second | −3 MB | +1 MB | 0 / 0 |
| fix, third | 0 MB | −1 MB | 0 / 0 |

The fix holds here: a repeat run rebuilds nothing — every step `CACHED` — and stores nothing.
`docker history` shows the 269 MB `chmod` layer gone and `npm ci`'s layer unchanged at 330 MB
with the `chmod` inside it.

What differs from the sandbox is how much the old layout really cost. Docker's accounting grew
by 313 MB per run on `main` — the 269 MB `chmod` layer plus the 44 MB `COPY . .` — but the disk
grew by 50–100 MB. On btrfs, overlayfs copies a file up by cloning its extents, so a copy-up
for a mode change stores metadata and no data: `chmod -R` over `node_modules` in a throwaway
container was reported by Docker as 269 MB and moved the filesystem's used space by 20 MB. The
sandbox's 440–616 MB is what the same layer costs on a backing filesystem without reflinks.

So the `chmod` layer explains the 23 GB of *reported* images, and almost none of the 9 GB that
left the host.

### Where the 9 GB went

The image the report left behind had a **6.75 GB `COPY . .` layer**. Runs from the primary
checkout send `.claude/worktrees/` as part of the build context: nine worktrees, 6.0 GB, of
which 2.24 GB is their `node_modules` and 3.53 GB their `.obsidian-cache`. The `.dockerignore`
patterns `node_modules` and `.obsidian-cache` are unanchored but not recursive — they match at
the context root only — and neither the old nor the widened file excludes the worktrees.

Measured by building the fixed `Dockerfile` with the widened `.dockerignore` against the
primary checkout as context, without touching it:

| Build | Context transferred | Host free space | OrbStack disk image |
| --- | --- | --- | --- |
| First (`npm ci` layer cached) | 6.79 GB | −11.3 GB | +7.3 GB |
| After one new file in one nested worktree | 6.79 GB | −11.1 GB | +14.5 GB |

A one-file change anywhere under the primary checkout re-sends the whole context and stores
`COPY . .` again, in the image and in the BuildKit cache. That is the reported figure — 9.3 GB
to 215 MB in one invocation, ≈ 18 GB for a pair — and with several sessions working in nested
worktrees the context is never unchanged. The layer reorder does nothing for it; from a
worktree, which has no worktrees of its own, it never appears.

`.dockerignore` now excludes `.claude/worktrees`, makes the `node_modules` and
`.obsidian-cache` patterns recursive, and excludes the per-machine tool state that was the
next-largest thing in the primary checkout's context (`.entire`, 137 MB of session logs, and
`.delta`, 14 MB of further nested checkouts — both ignored by git globally, so no tracked file
names them). The same two builds against the primary checkout, as each group went in:

| `.dockerignore` | Context transferred | `COPY . .` layer | Rebuild after one new file in a nested worktree |
| --- | --- | --- | --- |
| Widened for run output only | 6.79 GB | 6.75 GB | re-sends 6.79 GB; host −11.1 GB |
| Plus the nested worktrees | 166 MB | 165 MB | every step `CACHED`; host +6 MB |
| Plus the tool state | 107 kB incremental | 10.7 MB | every step `CACHED`; host +3 MB |

The other candidates, settled:

- **The anonymous `node_modules` volume does not accumulate.** `docker volume ls` counted 4
  volumes before every run, 5 during (the extra one 268.7 MB) and 4 after, across all six runs.
  Compose's `--rm` removes it.
- **The single-run figure needs no second build to explain it.** One invalidated `COPY . .` of
  the primary checkout is ≈ 11 GB on its own. The named volumes were already populated
  (1.09 GB, unchanged throughout).
- **OrbStack returns freed space promptly, for every kind of deletion.** Removing the 8.79 GB
  image gave the host 7.3 GB back within 35 s; `docker image prune` 8.9 GB and
  `docker builder prune -af` 14.5 GB, each within 45 s; a 1 GiB volume written and removed moved
  host free space by −1026 MB and +1024 MB.

## Fix

`e2e/docker/Dockerfile` folds the `chmod` into `npm ci`'s own `RUN` and puts the pair above
`COPY . .`, so the copy-up is merged into a layer already paid for and is cached with it. The
reorder is behaviour-preserving: `.dockerignore` keeps `node_modules` and `.obsidian-cache`
out of the build context, so nothing `COPY . .` brings in can land under either path.

`.dockerignore` additionally excludes the build output, the installed vault files, Obsidian's
workspace state, the generated backlink hub, `coverage/` and `design/` — everything a run or a
build regenerates. That is what takes a repeat run from 19 MB to nothing.

It also excludes what nests whole checkouts or machine-local state under the repo root —
`.claude/worktrees`, `node_modules` and `.obsidian-cache` at any depth, `.entire`, `.delta` —
which is what takes a run from the primary checkout from ≈ 11 GB to the same nothing.

## Ongoing cost

A run still adds ≈ 19 MB when source changed, and dangling images accumulate one per rebuild.
`docker image prune -f` clears those; `docker builder prune -af` clears the build cache, at the
price of the next build re-running `npm ci`. Neither is needed on a schedule at this rate,
which now holds from the primary checkout as well as from a worktree.

What keeps it that way is that nothing large or churning sits in the build context. A new
directory of generated or per-machine state at the repo root needs a `.dockerignore` line the
day it appears; "transferring context" in the build output is the figure to watch.
