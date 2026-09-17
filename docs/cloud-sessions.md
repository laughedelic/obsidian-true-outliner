# Cloud sessions

A Claude cloud session runs on a fresh VM that clones the repository, so everything committed
here applies. Everything else comes from the environment, configured in the environment dialog
at claude.ai/code — it provisions a VM shared across repositories and reused as a filesystem
snapshot, so it never sees a clone and cannot live in this repository.

The split follows what each side can see. The environment's **setup script** provisions the VM:
tools and system packages, installed once per cache rebuild and carried by the snapshot
thereafter. `scripts/agent-setup.sh`, run from the `SessionStart` hook, covers project setup and
fills in whatever the snapshot is missing — so the two cannot drift into a broken session, and a
tool added to the repository script reaches the cloud without touching the dialog.

## Setup script

```bash
#!/bin/bash
# Tools that do not depend on a clone. scripts/agent-setup.sh fills any gap at
# session start, so this is a head start rather than a dependency.

gh extension install github/gh-stack || true

# OpenSpec needs Node 20.19+; sessions default to Node 22 on PATH.
npm install -g @fission-ai/openspec || true

# e2e: Obsidian is an Electron app, so it needs an X server and Chromium's shared
# libraries. The t64 names are Ubuntu 24.04's — the unsuffixed ones are virtual
# packages there with no installation candidate.
apt-get update || true
apt-get install -y --no-install-recommends \
  xvfb xauth dbus fonts-liberation \
  libnss3 libdrm2 libgbm1 libcairo2 libpango-1.0-0 \
  libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
  libgtk-3-0t64 libasound2t64 libatk1.0-0t64 libatk-bridge2.0-0t64 libcups2t64 || true

# Bakes the Obsidian app and installer into the snapshot, outside any clone.
npm install -g obsidian-launcher || true
obsidian-launcher download desktop -c /opt/obsidian-cache || true
# The harness writes into this cache at run time, as whatever user the session is.
chmod -R a+rwX /opt/obsidian-cache || true
```

A setup script that exits non-zero fails the session, hence the `|| true` throughout, and one
that runs past roughly five minutes stops the snapshot building — at which point every session
re-runs the whole thing. The Obsidian download is the first thing to drop if that budget ever
gets tight: the harness fetches on demand anyway, and pre-fetching only moves the bytes into the
snapshot the way CI's week-rolled cache key does.

## Environment variables

```
GIT_AUTHOR_NAME=<name>
GIT_AUTHOR_EMAIL=<email>
GIT_COMMITTER_NAME=<name>
GIT_COMMITTER_EMAIL=<email>
OBSIDIAN_CACHE=/opt/obsidian-cache
E2E_MAX_INSTANCES=2
```

Git reads the identity variables natively and they override config, which keeps a personal name
out of a shared repository while still making a cloud session's commits ours.

## Running the suites

`@wdio/local-runner` does bring up a display of its own when `DISPLAY` is unset, but it does so by
shelling out to `xvfb-run --auto-servernum` — the wrapper whose readiness handshake hung
indefinitely in our Linux container, with Xvfb up and the wrapped command never launched
(`e2e/docker/start-xvfb-and-run.sh`). Rather than re-litigate that on a cloud VM, reuse the
starter that already avoids it: plain POSIX sh, assuming nothing about a container.

```bash
sh e2e/docker/start-xvfb-and-run.sh npm run test:e2e:narrow -- <spec>
```

It polls for the X socket, exports `DISPLAY`, then hands over — which also makes the launcher's
own auto-management a no-op, since that only acts when `DISPLAY` is unset. It installs nothing,
which is what the packages above are for.

Two limits shape what a cloud run is good for. `E2E_MAX_INSTANCES` belongs at 2 against the VM's
4 vCPUs, and it is not only a speed knob — `waitBudget` in `e2e/helpers.ts` widens the harness
timeouts off that value. And cloud sessions top out at Node 22 where CI and the e2e container use
26; nothing here declares a floor above 22, but the combination has not been proven. CI stays the
source of truth for the full sweep, so what a cloud session gains is the narrow loop.
