#!/bin/bash
# Prepares a fresh remote container: commit identity, then dependencies.
#
# A remote session clones the repo without a git identity, so its commits are
# authored by the agent rather than by us. The name is not cosmetic — it is
# what "no agent attribution" in AGENTS.md asks for, and a remote session has
# no other place to set it, since the container is discarded after the session.
#
# Local checkouts are left alone: there the global identity is already right,
# and overwriting it with the repository owner's would be wrong for anyone else
# working on a clone.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

git config user.name "Alexey Alekhin"
git config user.email "laughedelic@gmail.com"

# `ci` rather than `install`: the container ships an older npm than the one
# that wrote package-lock.json, and `install` rewrites the parts it does not
# understand — a lockfile diff nobody asked for, in whatever commit comes next.
npm ci --no-audit --no-fund
