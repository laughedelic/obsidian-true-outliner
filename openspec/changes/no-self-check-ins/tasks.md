## 1. The hook rule

- [ ] 1.1 In `scripts/agent-conventions.ts`, deny `mcp__claude-code-remote__send_later` unless
      `tool_input.initiation` is `human_request`, with a message naming the rule and what to do
      instead, and add the tool to the file's header comment; add it to the `PreToolUse` matcher in
      `.claude/settings.json`. Verified by piping `PreToolUse` payloads into the script: `own_followup`,
      `own_initiative`, `human_schedule` and an absent `initiation` each print a deny naming the rule,
      `human_request` prints nothing, and the existing branch-name payloads still deny as before.
      Negative control: changing the comparison to `=== "own_followup"` must let `own_initiative`
      through and fail that row.
- [ ] 1.2 Record in the PR that the rule applies to a session started after the change: from a new
      session, call `send_later` with `initiation: "own_followup"` and see it refused; the reminder
      the maintainer asks for passes on the piped payload only, since a real one would arm a routine.
      Verified by the refusal text in the session and the result added to
      `docs/research/pr-watching-wakes.md`, "Not measured" moved to a measured row.

## 2. The steward skill

- [ ] 2.1 Write `.agents/skills/steward/SKILL.md`, with `name` and a `description` that says when to
      use it, the five rules from the design, and the footer rule once the maintainer has decided
      it; add `.claude/skills/steward` and `.github/skills/steward` as symlinks to
      `../../.agents/skills/steward`. Verified by `ls -l` on both links resolving to the file and by
      the skill appearing in the session's skill list.
- [ ] 2.2 Add the one line to `AGENTS.md`: on PR events, follow the `steward` skill. Verified by
      `grep steward AGENTS.md` and by `CLAUDE.md` showing it through the symlink.

## 3. Integration

- [ ] 3.1 Run `npm run typecheck:scripts` and `npm run lint`, and
      `openspec validate no-self-check-ins --strict`. Verified by all three exiting 0.
