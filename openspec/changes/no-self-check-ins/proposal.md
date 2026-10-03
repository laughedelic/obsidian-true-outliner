## Why

A session that watches a PR is told by the cloud environment to arm a reminder for itself with
`send_later`, and does, hour after hour, on PRs that were waiting for the maintainer. Most of those
reminders fire past the prompt cache's lifetime and find nothing, and the maintainer stopped them by
hand in at least nine sessions (#335;
[`docs/research/pr-watching-wakes.md`](../../../docs/research/pr-watching-wakes.md), "Reminders on
the account"). The same sessions also re-diagnosed non-events at every PR notification: gates red
because a push cancelled the run, and the echoes of their own comments. Instructions alone did not
hold the first, and the second has no written policy. #335 is a sub-issue of #334.

## What Changes

- **A hook rule.** `scripts/agent-conventions.ts` refuses `mcp__claude-code-remote__send_later`
  unless its `initiation` input is `human_request`, and `ScheduleWakeup` unless the user typed
  `/loop` in the session, and says which rule refused each. The `PreToolUse` matcher in
  `.claude/settings.json` gains both tool names.
- **A `steward` skill**, `.agents/skills/steward/SKILL.md`, with symlinks from `.claude/skills/` and
  `.github/skills/`: how a session treats a PR's events here. Five rules, listed in the design.
- **A pointer** in `AGENTS.md` (`CLAUDE.md` is a symlink to it): on PR events, follow the `steward`
  skill.
- **A research note**, `docs/research/pr-watching-wakes.md`, with its index row: the measurements the
  rule rests on and what is still unmeasured.

## Non-goals

- **A `permissions.deny` on the tool.** It would also block a reminder the maintainer asks for.
- **Other self-arming tools** (`create_trigger`, `CronCreate`). Whether a session turns to them once
  `send_later` and `ScheduleWakeup` are refused is unobserved
  ([`pr-watching-wakes`](../../../docs/research/pr-watching-wakes.md), "Not measured"); if it does,
  that is a follow-up issue with the evidence.
- **Changing the environment's own PR rules**, which live outside the repository.
- **Stripping the platform's footer from a comment.** The maintainer's answer is that agent comments
  carry none of our own and an appended one is left alone, not edited out.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The change touches how agents work in this repository and no behaviour of the plugin, and
declares `skip_specs: true`.

## Impact

- `scripts/agent-conventions.ts`, `.claude/settings.json`: the rule and its matcher.
- `.agents/skills/steward/SKILL.md` and two symlinks.
- `AGENTS.md`: one line.
- `docs/research/pr-watching-wakes.md` and its row in `docs/research/index.md`.
- No `src/` or `styles/` change, so no version bump.
