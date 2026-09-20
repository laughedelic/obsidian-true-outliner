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

Two things this is *not*, both checked: the build context is 14 MB, so `.obsidian-cache`
(≈ 565 MB: the Obsidian installer, the app, per-spec screenshots) was already excluded and
never reached the image; and the container runs `--rm`, with the three Obsidian downloads on
named volumes that persist rather than accumulate.

## Measurements

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

## What is not explained

The sandbox figure is ≈ 0.44 GB per run; the report is several GB. The mechanism above is
linear in the size of `node_modules` and does not obviously scale to 9 GB in one invocation,
and OrbStack's storage differs from this sandbox's (its own VM disk image, a different
snapshotter). Candidates not measured: whether the reported single-run figure spans more than
one build, and whether the anonymous `node_modules` volume — re-seeded from the image on every
`docker compose run` — costs more there than it reclaims. **The fix's effect on the reported
host has not been measured.** Re-running the protocol above on that Mac, with `df -h /` and
`docker system df -v` on either side of one invocation, is what would close this.

## Fix

`e2e/docker/Dockerfile` folds the `chmod` into `npm ci`'s own `RUN` and puts the pair above
`COPY . .`, so the copy-up is merged into a layer already paid for and is cached with it. The
reorder is behaviour-preserving: `.dockerignore` keeps `node_modules` and `.obsidian-cache`
out of the build context, so nothing `COPY . .` brings in can land under either path.

`.dockerignore` additionally excludes the build output, the installed vault files, Obsidian's
workspace state, the generated backlink hub, `coverage/` and `design/` — everything a run or a
build regenerates. That is what takes a repeat run from 19 MB to nothing.

## Ongoing cost

A run still adds ≈ 19 MB when source changed, and dangling images accumulate one per rebuild.
`docker image prune -f` clears those; `docker builder prune -af` clears the build cache, at the
price of the next build re-running `npm ci`. Neither is needed on a schedule at this rate.
