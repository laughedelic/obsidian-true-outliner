## Why

A review by a fresh agent found a real defect in nearly every change that ran one, and every
session that ran one wrote its own brief, with the same mistakes: a brief that carried the
author's diagnosis, a diff against a stale local `main`, probes left in the tracked tree, a
sweep against the wrong baseline, and reviews that reversed each other from one stage to the
next (#337, with the evidence from about 20 sessions; the review sections of the merged PRs are
tabulated in
[`docs/research/independent-reviews.md`](../../../docs/research/independent-reviews.md)). The
maintainer asked for a review by hand in at least eight sessions. CLAUDE.md's lifecycle says
"Review at each ready point" and names no procedure. #337 is a sub-issue of #334, and the Bugfix
routine's next revision (#348) depends on it.

## What Changes

- **A skill**, `.agents/skills/independent-review/`, with symlinks in `.claude/skills/` and
  `.github/skills/`. `SKILL.md` carries what every review shares: when one runs, the brief, the
  reviewer's workspace, the form of a finding, how the author verifies and records findings, and
  the rounds. Two files behind pointers carry the modes, since a review runs one of them:
  - `proposal.md`: what a reviewer of a plan, a design or an OpenSpec change checks.
  - `implementation.md`: what a reviewer of a partial or complete implementation checks, with
    the recipe for a differential sweep against `main`.

  The reviewer is an agent definition inside the skill,
  `agents/independent-reviewer.md`, linked as `.claude/agents/independent-reviewer.md` and
  `.github/agents/independent-reviewer.agent.md`: it carries the reviewer's model and effort and
  preloads the skill, which holds the rules.

  The reviewer posts its findings as a GitHub review on the PR, with inline comments where a
  finding belongs to a line, and the author answers each thread with its disposition and resolves
  it. Each round is then its own review on the PR's timeline.
- **A pointer** in `AGENTS.md` (`CLAUDE.md` is a symlink to it): step 4 of "Change lifecycle"
  names the skill, and says when the reviews are done.
- **The reviewer's worktree stays out of the author's way.** `.gitignore` gains
  `/.claude/worktrees/` and `/.scratch/`, and `vitest.config.ts` excludes `.claude/worktrees/**`.
  A worktree there shows as untracked in the primary checkout, and while one exists the
  primary checkout's `npm test` collects every unit test twice, plus whatever probe the
  reviewer wrote (`independent-reviews`, "The reviewer's worktree").
- **A research note**, `docs/research/independent-reviews.md`, and its row in the index: the
  survey of the review sections in the PRs, and the worktree and sweep measurements above.

## The name

`independent-review`. The property that distinguishes this review from the built-in
`code-review` skill a session also lists is independence: a reviewer that holds none of the
author's reasoning and checks the author's claims by running them. "Independent" is also the
maintainer's word for it in the sessions #337 quotes, so a request phrased that way reaches the
skill. Alternatives considered:

- `reviewing-changes`, the gerund form of `presenting-examples` and `driving-obsidian`. "Change"
  names an OpenSpec change here, which fits both modes, but the name does not say what makes the
  review different from `code-review`, and a description is the only thing that would.
- `fresh-review`. Accurate about the reviewer's context, less clear about why that matters.
- `review`. Collides in reach with the built-in `/review` and `code-review`.

## Non-goals

- **Running the review automatically** from a hook or CI. The skill is followed by the session
  that reaches a ready point; the routine that wires it in is #348.
- **Replacing the maintainer's review or manual testing.** A review round is evidence for the
  maintainer, not an approval, and agents never merge.
- **A fixed number of rounds.** The loop ends when a round brings no significant finding and
  no significant change (#337, "Iteration").
- **Copilot's review.** It stopped reviewing after #251, and nothing here depends on it. Its
  form, a review with inline comments, is the one this skill's reviewer posts.
- **A brief generator script.** The brief is a short template filled from the PR; what makes it
  good is what it leaves out, which a script cannot judge.
- **Reviews of research notes and docs-only PRs.** The modes are written for changes to the
  plugin and its tooling; a docs PR may follow them but nothing requires it.
- **Defining the fix types in a spec.** The skill states drift, gap and conflict as PRs have used
  them; moving that into `openspec/config.yaml` or a spec is a separate decision.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The change touches how agents work in this repository and no behaviour of the plugin, and
declares `skip_specs: true`.

## Impact

- `.agents/skills/independent-review/` (`SKILL.md`, `proposal.md`, `implementation.md`,
  `agents/independent-reviewer.md`) and four symlinks (`.claude/skills/`, `.github/skills/`,
  `.claude/agents/`, `.github/agents/`).
- `AGENTS.md`: step 4 of "Change lifecycle".
- `.gitignore`, `vitest.config.ts`: one entry each.
- `docs/research/independent-reviews.md` and its row in `docs/research/index.md`.
- No `src/` or `styles/` change, so no version bump.
