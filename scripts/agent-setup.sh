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
cloud=false
if [ "${CLAUDE_CODE_REMOTE:-}" = "true" ]; then
  install=true
  cloud=true
fi
if [ "${1:-}" = "--install" ]; then
  install=true
fi

notes=()

# The tooling scripts are TypeScript that Node runs by stripping the types, which
# it does by default from 22.18; an older Node fails every `node scripts/*.ts`,
# this session's own hooks included.
if ! node -e 'process.exit(process.features.typescript ? 0 : 1)' >/dev/null 2>&1; then
  notes+=("node $(node --version 2>/dev/null || echo missing) cannot run the TypeScript scripts; put Node 22.18+ first on PATH")
fi

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

# The GitHub CLI before its extension: with `gh` absent, the extension check
# used to report gh-stack missing and hide the real gap. Ubuntu's own package is
# enough — cli.github.com's repository is unreachable from a cloud session, and
# every call a session makes to GitHub is REST.
if ! command -v gh >/dev/null 2>&1; then
  if $install && command -v apt-get >/dev/null 2>&1; then
    apt-get install -y -q gh >/dev/null 2>&1 && notes+=("installed gh") ||
      notes+=("gh missing; \`apt-get install gh\` failed")
  else
    notes+=("gh missing; install the GitHub CLI (https://cli.github.com)")
  fi
fi

if command -v gh >/dev/null 2>&1; then
  # A REST call rather than `gh auth status`, which reports the cloud session's
  # GH_TOKEN as invalid while every REST request with it succeeds.
  if ! gh api user --jq .login >/dev/null 2>&1; then
    notes+=("gh unauthenticated; set GH_TOKEN or run \`gh auth login\`")
  fi

  # Not in the cloud: every gh-stack command opens with a GraphQL query the
  # session's GitHub proxy refuses, so the extension would only ever fail there.
  if ! $cloud && ! gh extension list 2>/dev/null | grep -q 'github/gh-stack'; then
    if $install; then
      gh extension install github/gh-stack && notes+=("installed gh-stack") ||
        notes+=("gh-stack missing; \`gh extension install github/gh-stack\` failed")
    else
      notes+=("gh-stack missing; run \`gh extension install github/gh-stack\`")
    fi
  fi

  # The cloud session's proxy refuses GraphQL, which `gh pr` and `gh repo` need
  # for their first request (docs/research/cloud-session-github-access.md).
  # Saying so up front spares the session a round of failed commands.
  if $cloud && ! gh api graphql -f query='{viewer{login}}' >/dev/null 2>&1; then
    notes+=("GraphQL is refused by this session's proxy: no \`gh stack\` here, and \`gh pr\` / \`gh repo\` fail; use \`gh api repos/...\` (REST) or the GitHub MCP tools")
  fi
fi

# Silence is the healthy case — nothing to say, nothing added to the context.
if [ ${#notes[@]} -gt 0 ]; then
  printf 'agent-setup: %s\n' "${notes[@]}"
fi

# A non-zero exit fails a cloud session's startup, and nothing here is worth that.
exit 0
