#!/bin/bash
# The tools an agent session needs, in one place for every environment that starts
# one: the SessionStart hook (local and cloud), and Copilot's setup workflow.
#
# A Claude cloud environment's own setup script cannot live here — it provisions a
# VM that is shared across repositories and reused as a filesystem snapshot, so it
# never sees a clone. It installs the same tools ahead of time; this script is what
# makes that an optimisation rather than a dependency.
#
# Every check is idempotent. An environment that already has a tool pays one
# `command -v` and falls through, so a warm cloud image and a local checkout both
# cost nothing.
#
# Installing is opt-in — `--install`, or a cloud session, which sets
# CLAUDE_CODE_REMOTE. Both installs reach outside the working tree: `npm ci` deletes
# `node_modules`, and `npm install -g` writes to the machine. A throwaway container
# wants that; a laptop does not. Without it the script only reports, and the report
# lands where it is useful: SessionStart stdout becomes the agent's context, so a
# half-provisioned session says so before a command fails mid-task.
set -uo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 0

install=false
if [ "${1:-}" = "--install" ] || [ "${CLAUDE_CODE_REMOTE:-}" = "true" ]; then
  install=true
fi

notes=()

if [ ! -d node_modules ]; then
  if $install; then
    # `ci` rather than `install`: the container ships an older npm than the one
    # that wrote package-lock.json, and `install` rewrites the parts it does not
    # understand — a lockfile diff nobody asked for, in whatever commit comes next.
    npm ci --no-audit --no-fund && notes+=("installed npm dependencies") ||
      notes+=("npm dependencies missing; \`npm ci\` failed")
  else
    notes+=("npm dependencies missing; run \`npm ci\`")
  fi
fi

if ! command -v openspec >/dev/null 2>&1; then
  if $install; then
    npm install -g @fission-ai/openspec && notes+=("installed the OpenSpec CLI") ||
      notes+=("OpenSpec CLI missing; \`npm install -g @fission-ai/openspec\` failed")
  else
    notes+=("OpenSpec CLI missing; run \`npm install -g @fission-ai/openspec\`")
  fi
fi

if ! gh extension list 2>/dev/null | grep -q 'github/gh-stack'; then
  if $install; then
    gh extension install github/gh-stack && notes+=("installed gh-stack") ||
      notes+=("gh-stack missing; \`gh extension install github/gh-stack\` failed")
  else
    notes+=("gh-stack missing; run \`gh extension install github/gh-stack\`")
  fi
fi

# Silence is the healthy case — nothing to say, nothing added to the context.
if [ ${#notes[@]} -gt 0 ]; then
  printf 'agent-setup: %s\n' "${notes[@]}"
fi

# A non-zero exit fails a cloud session's startup, and nothing here is worth that.
exit 0
