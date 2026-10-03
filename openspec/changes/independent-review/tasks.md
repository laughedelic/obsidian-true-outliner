## 1. The record on GitHub

- [x] 1.1 Run a proposal review of this change by a fresh agent, briefed by hand from the design's
      template (the skill does not exist yet), and have it post its findings as a `COMMENT` review
      on this PR with inline comments. Reply to each thread with its disposition and resolve it
      with `resolve_review_thread`. Verified by the review and its resolved threads on the PR, and
      by recording in `docs/research/independent-reviews.md` whether each step worked from a
      cloud session: creating a pending review, adding inline comments, submitting, replying,
      resolving. If resolving is refused, the design's record falls back to a reply per thread,
      and the PR says so before any skill text is written.

## 2. The worktree side effects

- [ ] 2.1 Add `/.claude/worktrees/` and `/.scratch/` to `.gitignore`, with a comment saying what
      each holds, and remove the `/.claude/worktrees/` line this session added to
      `.git/info/exclude`. Verified by `git worktree add --detach .claude/worktrees/probe` at the
      branch head and a file in its `.scratch/`, after which `git check-ignore -v
      .claude/worktrees/probe` and, inside the probe, `git check-ignore -v .scratch/x` each name a
      line of `.gitignore`, and the primary checkout's `git status --porcelain` prints nothing.
      Negative control: without the first entry `git check-ignore` exits 1 and `git status` prints
      `?? .claude/worktrees/`. The check names its source, so a local exclude file cannot pass
      it.
- [ ] 2.2 In `vitest.config.ts`, set `exclude` to `configDefaults.exclude` plus
      `.claude/worktrees/**`, with a comment saying why. Verified with the probe worktree above,
      at the branch head so it carries the exclude itself: `npx vitest list --filesOnly` in the
      primary checkout names no file under `.claude/worktrees/`; in the probe,
      `npx vitest run .scratch/<probe>.test.ts` runs the probe and `npx vitest list --filesOnly
      tests/` lists the 64 test files and not the probe. Negative control: without the entry the
      primary checkout lists the probe worktree's 64 test files and the probe.

## 3. The skill

- [ ] 3.1 Write `.agents/skills/independent-review/SKILL.md`: the `name`, a `description` whose
      branches are the author's moments (a proposal ready, an implementation ready, a user asking
      for a review or a second opinion); when a review runs; the brief as a template with its
      fixed fields; the reviewer's section (workspace, scratch, the findings form, posting the
      review, removing the worktrees); the author's verification, dispositions and record; the
      rounds, counted across both modes, the convergence rule and the question about the rule
      before every round from the third. Verified by the
      skill appearing in a new session's skill list, and by a reading against the design: each
      decision in design.md maps to a passage, and no passage restates what a command's
      `--help` or another skill already carries.
- [ ] 3.2 Write `proposal.md` and `implementation.md` beside it, each a list of checks that
      ends on what the reviewer reports, from the design's "What the modes check". The sweep
      recipe in `implementation.md` is the one measured in `independent-reviews`. Verified by
      running the recipe as written, from a fresh worktree pair, on #264's merge commit against
      its parent, through an entry point that reaches #264's change (an operation that calls
      `finalize`), and getting a nonzero count of differences that the run sorts into intended,
      regression and neutral, with one example of each kind it finds. Negative control: the same
      sweep through `parse` alone gives 0, as the note records, and the recipe's own check (a
      deliberate change on one side) turns that 0 into a failure to report rather than a
      result.
- [ ] 3.3 Add `.claude/skills/independent-review` and `.github/skills/independent-review` as
      symlinks to `../../.agents/skills/independent-review`. Verified by `ls -L` reading
      `SKILL.md` through both.
- [ ] 3.4 Write `.agents/skills/independent-review/agents/independent-reviewer.md` (frontmatter:
      `name`, `description`, `skills: [independent-review]`; `model` and `effort` left to inherit
      until 5.2) and link it as `.claude/agents/independent-reviewer.md` and
      `.github/agents/independent-reviewer.agent.md`. Verified by a fresh `claude -p` in the
      checkout listing `independent-reviewer` among its agent types, as the probe in
      `independent-reviews` did, and by 5.1's reviewer being started with that
      `subagent_type`. Negative control: with the `.claude/agents/` link removed, the type is
      not listed. Whether Copilot reads the `.github/agents/` link is recorded as unmeasured
      unless a Copilot session is available to check.

## 4. The pointer

- [ ] 4.1 In `AGENTS.md`, step 4 of "Change lifecycle" names the skill and says the reviews are
      done when the response to a round makes no significant change. Verified by
      `grep independent-review AGENTS.md` and by `CLAUDE.md` showing it through the symlink.

## 5. A real review

- [ ] 5.1 Run an implementation review with the skill, as written, on #280 (the maintainer's
      choice), through to the posted review, and link it from this PR. Before posting,
      say on that PR that the review is coming and from where, so the session that owns it reads
      the events as a review to answer. Verified by the brief, quoted in this PR, holding only the
      template's fields, and by the review reaching a finding an earlier review on that PR
      recorded, or saying why it did not. Anything the skill left the session to work out is
      fixed in the skill before this task closes.
- [ ] 5.2 Run a proposal review with the skill, as written, on this change's own plan as round 1
      read it (`bf4f72b`, the proposal with no implementation, the maintainer's suggestion), and
      post it on this PR labelled as a test of the skill. Verified by the brief holding only the
      template's fields, and by setting what the review reaches beside round 1's 16 findings:
      each one reached, missed, or reached in another form, with the top three (the convergence
      rule, the step-back, the stacked base) named. The same brief runs twice, through the
      `independent-reviewer` type with `model` set per call to Opus and to Sonnet, the second run
      returning only (no second review on the PR), and the two are compared on findings reached,
      wrong findings, time and tokens in `docs/research/independent-reviews.md`. The
      definition's `model` and `effort` are set from that comparison, and the PR says why.

## 6. Check the change as a whole

- [ ] 6.1 `npm run lint` (which checks the research index), `npm test` and
      `openspec validate independent-review --strict` pass.
