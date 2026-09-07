# Runs the e2e suite headlessly on Linux, under Xvfb, so the Obsidian window
# that `scripts/run-e2e.mjs` pops on a real display never appears at all — see
# `e2e/docker/README.md` for how to invoke this and why.
#
# `node:26-bookworm` (not `-slim`) rather than a from-scratch Debian install:
# CI already proves this shape works (`.github/workflows/ci.yml` runs
# `ubuntu-latest` + Node 26 + `xvfb-run`), so this mirrors a configuration
# already known to launch Obsidian, and the non-slim base carries more of the
# shared libraries Electron needs out of the box.
FROM node:26-bookworm

# The library set below is what an Electron app (Obsidian, via
# obsidian-launcher) needs to start under Xvfb on Debian — confirmed by
# actually building this image and running the suite inside it (see the
# README), not copied from an unverified list.
RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb \
    xauth \
    dbus \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    libgtk-3-0 \
    fonts-liberation \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

# Dependencies are baked into the image at build time (Linux binaries for
# esbuild, Electron, etc). The compose file mounts a volume over
# node_modules at runtime instead of the host's node_modules, which never
# has Linux binaries on a macOS/Windows host — see e2e/docker/README.md.
COPY package.json package-lock.json .npmrc ./
RUN npm ci

COPY . .

# scripts/e2e-docker.mjs runs the container as the invoking host UID/GID (not
# root) so files it writes into the bind-mounted repo — and the object
# store obsidian-launcher downloads into — stay owned by that user rather
# than root, and so git doesn't reject the bind-mounted worktree as an
# unsafe repository. That UID has no matching /etc/passwd entry and no
# ownership of what npm ci and obsidian-launcher created as root, so both
# node_modules and the .obsidian-cache mount points need to be writable by
# anyone.
RUN mkdir -p .obsidian-cache/obsidian-app .obsidian-cache/obsidian-installer .obsidian-cache/electron-chromedriver \
  && chmod -R a+rwX node_modules .obsidian-cache

CMD ["bash"]
