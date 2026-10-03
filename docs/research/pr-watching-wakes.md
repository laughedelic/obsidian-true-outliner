# What PR watching costs, and what the hook can see

A session that opens or watches a PR is woken by CI results, review comments and the echoes of its
own comments, and the cloud environment's PR rules also tell it to arm a "safety-net" reminder for
itself. This note records what we could read of that in a cloud session on 2026-10-03, so the
rule in `scripts/agent-conventions.ts` and the `steward` skill rest on figures. Issue #335 carries
the case; the cost figures it quotes come from the maintainer's retrospective of about 175
sessions, which is private, and are not reproduced here.

## The built-in rule

The environment's PR instructions, as this session received them, say to cover the gaps in
GitHub's pushed events with "one safety-net self check-in" through `send_later`: the first about
50 minutes after the last activity, later ones about 4 hours apart, and stop after three in a row
that found nothing. The tool's `initiation` input is an enum of `human_request`,
`human_schedule`, `own_followup` and `own_initiative`, optional, and described as defaulting to
`own_followup`. So a reminder the rule arms is `own_followup` or carries no `initiation` at all,
and a reminder the maintainer asks for is `human_request`.

## Reminders on the account

`list_triggers` with `include_completed` returns the account's routines newest first, 100 to a
page. The first page held 100 one-shot reminders created between 2026-09-28 and 2026-09-30, all
through the MCP surface.

| Reading | Value |
| --- | --- |
| Minutes from creation to firing, 60 or 61 | 77 of 100 |
| Other gaps | 45, 46, 91, 120, 180 and 240 minutes, 2 or 1 each |
| Names that carry a PR number | #205 in 22, #276 in 22, #318 in 6, #285 in 2 |

A reminder 60 minutes out fires after the 1-hour prompt cache has expired, which is the mechanism
#335 describes. The counts are one page of several: they agree with the issue's per-PR figures in
direction and do not reproduce its totals (76 on #205, 43 on #276).

## The hook today

`.claude/settings.json` matches `Bash|mcp__github__.*` for `PreToolUse`. The tool name
`mcp__claude-code-remote__send_later` does not match it, and the script given a `send_later`
payload with `initiation: "own_followup"` prints nothing, which the harness reads as allow. So no
hook sees the call yet.

## `ScheduleWakeup`

The tool exists for `/loop` in dynamic mode, where the user gave no interval and the session paces
itself. Its inputs are `delaySeconds`, `prompt`, `reason`, `noop` and `stop`: nothing says who
wanted the wake, so the `initiation` test cannot apply. What separates a wake the user asked for from
one the session armed is a `/loop` command the user typed earlier in the session. A hook's input
carries `transcript_path`, and a user-typed skill or command appears in the transcript inside a
`<command-name>` block. No transcript on this machine holds a typed `/loop`, so what one looks like
is unread.

## Not measured

- **The input a hook receives for `send_later`.** The script reads `tool_input` as the call's own
  arguments. Whether an omitted `initiation` arrives absent or as its default is unread; a rule that
  allows only `human_request` refuses both.
- **Whether a settings edit applies to a running session.** Hooks may be read once at session
  start. The change's last task checks the refusal in a session that began with the new settings.
- **What a typed `/loop` leaves in the transcript.** The `ScheduleWakeup` rule looks for it, and a
  wrong guess refuses the maintainer's own `/loop`.
- **Whether the platform appends its footer to a comment** as it does to a PR body written through
  the MCP tool. The maintainer's answer is to leave an appended footer alone, so nothing here
  depends on it.
- **Other tools that arm a self-wake.** `create_trigger` takes the same `initiation` enum and can
  bind a routine to the session that creates it, and `CronCreate` is available in this session. Whether
  a session that `send_later` refuses reaches for one of them is unobserved; the maintainer left them
  out until it is.
