## Context

The `PreToolUse` hook already runs `scripts/agent-conventions.ts` for `Bash` and `mcp__github__.*`,
and the script denies by printing a `permissionDecision: "deny"` with a reason
([`cloud-session-github-access`](../../../../docs/research/cloud-session-github-access.md)). Today the
matcher does not reach `send_later`, and the script allows it
([`pr-watching-wakes`](../../../../docs/research/pr-watching-wakes.md), "The hook today"). The tool's
`initiation` input says who wanted the reminder; the environment's own check-ins carry
`own_followup` or none.

## Goals / Non-Goals

**Goals:**

- An agent-initiated `send_later` is refused with a message that names the rule and says what to do
  instead; a `human_request` one passes.
- A session finds one short policy for PR events, in the place the repository's instructions point to.

**Non-Goals:**

- Detecting whether `initiation: "human_request"` is truthful. The hook cannot know; the refusal
  message and the skill say when it is allowed.

## Decisions

**The rule is `initiation !== "human_request"`, not a list of refused values.** An omitted
`initiation` arrives absent or as its default, which is unmeasured, and the default is the refused
`own_followup`. Allowing one value covers every spelling of "the agent wanted this", including values
the tool adds later. A refused call is the only signal that reaches the session, so the message
carries the rule's name and what to do: skip the reminder, rely on pushed events, and use
`human_request` only for a reminder the maintainer asked for in their own words.

**`ScheduleWakeup` is refused unless the user typed `/loop` in the session.** The tool has no
`initiation`, and it exists only for dynamic `/loop`, so a wake outside one is the session's own
([`pr-watching-wakes`](../../../../docs/research/pr-watching-wakes.md), "`ScheduleWakeup`"). The hook
reads the session's `transcript_path` and looks for a user-typed `/loop` in a user message, never in
a tool result or an attachment, where the text also occurs. An unreadable transcript refuses, since
allowing on a failed read would leave the rule open. What a typed `/loop` looks like in the transcript
in the running version is unmeasured: the installed 2.1.42 bundle writes `<command-name>/loop</command-name>`
for a typed command and the same tag without the slash for a skill only the model can invoke, so the
pattern requires the slash. The pass path is checked on a synthetic transcript, and the cost of a wrong
guess is a refused `/loop`; the message says so and the rule is one regex to adjust.

**A hook, not `permissions.deny`.** A deny is per tool name and would refuse the maintainer's own
requested reminders. The rule goes in the existing script, which already dispatches on the tool.

**One branch in `preToolUse`, before the branch-name checks.** The script's existing chain is
`Bash`, then `create_pull_request`, then any `mcp__github__*`. The new tool is none of them, so it
takes its own branch and returns after denying, leaving the existing ones untouched.

**The skill states what to do, and `AGENTS.md` points to it.** The environment's PR instructions read
`.claude/skills/steward/SKILL.md` from the PR's head branch and give it precedence on conventions and
proactivity, but that is undocumented
([`pr-watching-wakes`](../../../../docs/research/pr-watching-wakes.md)), so the pointer in `AGENTS.md`
is what we rely on. The skill is short and carries five rules:

1. On a draft, or a PR waiting on the maintainer, act only on red CI on the current head or on a
   review comment.
2. Ignore events for superseded commits, gates red because a push cancelled the run, and echoes of
   the session's own comments.
3. Ask an open question once, then wait.
4. Never merge. Never rebase, merge `main` into, or force-push a draft unasked. On our own branches,
   rebase rather than merge the base, which the Autofix prompt's "merge the base, never rebase"
   default would otherwise win.
5. Unsubscribe when a PR goes on hold, and when a routine run ends.

It also says that a session arms no check-ins, which the hook enforces, and that comments carry no
footer of our own and an appended one is left in place. The maintainer decided the footer: the
platform attaches it outside the session, so removing it is a fight we do not take.

**No test file for the script.** It reads stdin and acts at import, so a unit test would first need
the script restructured. The change checks it by piping payloads into it, recorded in the tasks.

## Risks / Trade-offs

- **A session sets `human_request` to get past the hook** → the message and the skill say it is for
  reminders the maintainer asked for; the hook cannot enforce more than that.
- **A session turns to `create_trigger` or `CronCreate`** → out of scope here, and a follow-up if
  observed.
- **The `/loop` marker is guessed wrong** → the maintainer's `/loop` is refused with a message that
  names the rule; the fix is one pattern.
- **The refusal does not apply to a running session** (settings read at start) → the last task
  checks it in a session started after the change.
- **The skill and the environment's rules disagree** (they tell a session to keep a check-in
  scheduled, and to never end a CI-failure wake without a push) → the pointer puts the skill's
  rules first, and the environment's precedence rule is the backstop.
