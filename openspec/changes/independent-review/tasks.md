## 1. The record on GitHub

- [ ] 1.1 Run a proposal review of this change by a fresh agent, briefed by hand from the design's
      template (the skill does not exist yet), and have it post its findings as a `COMMENT` review
      on this PR with inline comments. Reply to each thread with its disposition and resolve it
      with `resolve_review_thread`. Verified by the review and its resolved threads on the PR, and
      by recording in `docs/research/independent-reviews.md` whether each step worked from a
      cloud session: creating a pending review, adding inline comments, submitting, replying,
      resolving. If resolving is refused, the design's record falls back to a reply per thread,
      and the PR says so before any skill text is written.

## 2. The worktree side effects

- [ ] 2.1 Add `/.claude/worktrees/` and `/.scratch/` to `.gitignore`, with a comment saying what
      each holds. Verified by `git worktree add --detach .claude/worktrees/probe origin/main` and a
      file in `.claude/worktrees/probe/.scratch/`, after which the primary checkout's
      `git status --porcelain` prints nothing. Negative control: without the first entry it prints
      `?? .claude/worktrees/`.
- [ ] 2.2 In `vitest.config.ts`, set `exclude` to `configDefaults.exclude` plus
      `.claude/worktrees/**`, with a comment saying why. Verified with the probe worktree above
      present: `npx vitest list` in the primary checkout names no file under `.claude/worktrees/`,
      and in the probe worktree `npx vitest run .scratch/<probe>.test.ts` still runs the probe.
      Negative control: without the entry the primary checkout lists the probe worktree's 64 test
      files.

## 3. The skill

- [ ] 3.1 Write `.agents/skills/independent-review/SKILL.md`: the `name`, a `description` whose
      branches are the author's moments (a proposal ready, an implementation ready, a user asking
      for a review or a second opinion); when a review runs; the brief as a template with its
      fixed fields; the reviewer's section (workspace, scratch, the findings form, posting the
      review, removing the worktrees); the author's verification, dispositions and record; the
      rounds, the convergence rule and the step-back before a third round. Verified by the
      skill appearing in a new session's skill list, and by a reading against the design: each
      decision in design.md maps to a passage, and no passage restates what a command's
      `--help` or another skill already carries.
- [ ] 3.2 Write `proposal.md` and `implementation.md` beside it, each a list of checks that
      ends on what the reviewer reports, from the design's "What the modes check". The sweep
      recipe in `implementation.md` is the one measured in `independent-reviews`. Verified by
      running the recipe as written, from a fresh worktree pair, on #264's merge commit against
      its parent, and getting a count.
- [ ] 3.3 Add `.claude/skills/independent-review` and `.github/skills/independent-review` as
      symlinks to `../../.agents/skills/independent-review`. Verified by `ls -L` reading
      `SKILL.md` through both.

## 4. The pointer

- [ ] 4.1 In `AGENTS.md`, step 4 of "Change lifecycle" names the skill and says a round of reviews
      is done when one brings no significant finding and no significant change. Verified by
      `grep independent-review AGENTS.md` and by `CLAUDE.md` showing it through the symlink.

## 5. A real review

- [ ] 5.1 Run an implementation review with the skill, as written, on an open fix PR chosen with
      the maintainer, through to the posted review, and link it from this PR. Verified by the
      review on that PR and by the brief, quoted in this PR, holding only the template's fields.
      Anything the skill left the session to work out is fixed in the skill before this task
      closes.

## 6. Check the change as a whole

- [ ] 6.1 `npm run lint` (which checks the research index), `npm test` and
      `openspec validate independent-review --strict` pass.
