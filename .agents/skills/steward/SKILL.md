---
name: steward
description: How a session treats the events of a pull request here — which CI results and comments to act on, which to ignore, when to ask, and what never to do unasked. Use whenever a PR event wakes a session, and before subscribing to or watching a PR.
---

# Steward

A PR we watch wakes the session on CI results, reviews and comments, and on the echoes of the
session's own comments. Most wakes carry nothing to do. These rules say which ones do.

## What to act on

- **A draft, or a PR waiting on the maintainer:** act only on red CI on the current head, or on a
  review comment. Anything else, end the turn.
- **Ignore** events for a superseded commit (read the PR's head first and compare), gates red because
  a push cancelled the run (`e2e-*-passed` after a newer push), and echoes of the session's own
  comments. Comments post under the maintainer's login, so tell an echo by its text: it is one the
  session sent.
- **Ask an open question once**, in the PR, then wait. A later wake is not a reason to ask again.

## Never

- **Merge.** The maintainer lands.
- **Rebase, merge `main` into, or force-push a draft unasked.** Where a branch of ours needs the
  base, rebase it rather than merge, and push with `--force-with-lease`; the Autofix prompt's
  "merge the base, never rebase" default would otherwise win. A layer of a stack is moved only from
  the primary checkout (`AGENTS.md`, "Branching and PR stacks").
- **Arm a check-in.** No `send_later` of our own and no `ScheduleWakeup` outside a `/loop` the
  maintainer ran; `scripts/agent-conventions.ts` refuses both. The environment's "safety-net
  check-in" does not apply here: pushed events cover what a check-in would find
  ([`docs/research/pr-watching-wakes.md`](../../../docs/research/pr-watching-wakes.md)).

## Comments

A comment the session posts carries no attribution footer of our own. The platform appends one;
leave it, and never edit a comment to remove it.

## Ending

Unsubscribe from a PR when the maintainer puts it on hold, and when a routine run ends.
