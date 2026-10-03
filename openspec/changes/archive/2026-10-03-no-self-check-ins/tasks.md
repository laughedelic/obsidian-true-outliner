## 1. The hook rule

- [x] 1.1 In `scripts/agent-conventions.ts`, deny `mcp__claude-code-remote__send_later` unless
      `tool_input.initiation` is `human_request`, with a message naming the rule and what to do
      instead, and add the tool to the file's header comment; add it to the `PreToolUse` matcher in
      `.claude/settings.json`. Verified by piping `PreToolUse` payloads into the script: `own_followup`,
      `own_initiative`, `human_schedule` and an absent `initiation` each print a deny naming the rule,
      `human_request` prints nothing, and the existing branch-name payloads still deny as before.
      Negative control: comparing `initiation` to `own_followup` instead must refuse the
      `human_request` payload and fail that row.
- [x] 1.2 In the same script, deny `ScheduleWakeup` unless a user message in the session's
      `transcript_path` holds a typed `/loop`; add the tool to the matcher. Verified by piping
      payloads with a synthetic transcript: one with a typed `/loop` in a user message passes, one
      whose only `/loop` is in a tool result or an attachment is denied, one whose marker lacks the
      slash is denied, an unreadable path is denied. Negative controls: matching the marker in any
      entry type must let the tool-result transcript through, and making the slash optional must let
      the slash-less one through, each failing its row.
- [x] 1.3 Check the rules in the session that made the edit: call `send_later` with
      `initiation: "own_followup"` and `ScheduleWakeup` and see both refused; the reminder
      the maintainer asks for passes on the piped payload only, since a real one would arm a routine
      (agreed in the PR). Verified by the refusal text in the session and the result in
      `docs/research/pr-watching-wakes.md`, "The rule in a running session".

## 2. The steward skill

- [x] 2.1 Write `.agents/skills/steward/SKILL.md`, with `name` and a `description` that says when to
      use it, the five rules from the design, the no-check-in rule and the footer rule; add
      `.claude/skills/steward` and `.github/skills/steward` as symlinks to
      `../../.agents/skills/steward`. Verified by `ls -l` on both links and `cat` of the file
      through each.
- [x] 2.2 Add the one line to `AGENTS.md`: on PR events, follow the `steward` skill. Verified by
      `grep steward AGENTS.md` and by `CLAUDE.md` showing it through the symlink.

## 3. Integration

- [x] 3.1 Run `npm run typecheck:scripts` and `npm run lint`, and
      `openspec validate no-self-check-ins --strict`. Verified by all three exiting 0.
