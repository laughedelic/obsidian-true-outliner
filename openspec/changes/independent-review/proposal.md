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

- **A skill**, `.agents/skills/independent-review/`, with a symlink in `.claude/skills/`. `SKILL.md` carries what every review shares: when one runs, the brief, the
  reviewer's workspace, the form of a finding, how the author verifies and records findings, and
  the rounds. Two files behind pointers carry the modes, since a review runs one of them:
  - `proposal.md`: what a reviewer of a plan, a design or an OpenSpec change checks.
  - `implementation.md`: what a reviewer of a partial or complete implementation checks, with
    the recipe for a differential sweep against `main`.

  The reviewer is a `general-purpose` subagent started with the brief, on Opus for a deep review
  or Sonnet for a light one, chosen per call.

  The reviewer posts its findings as a GitHub review on the PR, with inline comments where a
  finding belongs to a line, and the author answers each thread with its disposition and resolves
  it. Each round is then its own review on the PR's timeline. A return-only check, between ready
  points, returns its findings instead and is recorded in the PR description. Every comment a
  session posts carries a role marker in place of an attribution footer.
- **Copilot's review gets the checks**: `.github/skills/code-review/SKILL.md` points it at the
  two mode files and the form of a finding, and tells it to start no agent of its own.
- **`steward` reads the role markers**: one rule saying how a woken session treats a reviewer's
  comment, an author's comment and an unmarked one.
- **Pointers** in `AGENTS.md` (`CLAUDE.md` is a symlink to it): step 4 of "Change lifecycle"
  names the skill and says when the reviews are done, and "Agent files" names the Copilot pointer
  as the one skill that is not a link into `.agents/skills/`.
- **The reviewer's worktree stays out of the author's way.** `.gitignore` gains
  `/.claude/worktrees/` and `/.scratch/`, and `vitest.config.ts` excludes `.claude/worktrees/**`.
  A worktree there shows as untracked in the primary checkout, and while one exists the
  primary checkout's `npm test` collects every unit test twice, plus whatever probe the
  reviewer wrote (`docs/research/independent-reviews.md`, "The reviewer's worktree").
- **A research note**, `docs/research/independent-reviews.md`, and its row in the index: the
  survey of the review sections in the PRs, the worktree and sweep measurements above, and the
  comparison of the deep and light settings.

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
- **A fixed number of rounds.** The loop ends when a round converges (design, "Rounds")
  (#337, "Iteration").
- **Depending on Copilot's review.** It stopped reviewing after #251. The pointer gives it the
  same checks if it reviews again; nothing here waits on it.
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

- `.agents/skills/independent-review/` (`SKILL.md`, `proposal.md`, `implementation.md`) and its
  symlink in `.claude/skills/`.
- `.github/skills/code-review/SKILL.md`.
- `.agents/skills/steward/SKILL.md`: one rule on the role markers.
- `AGENTS.md`: step 4 of "Change lifecycle", and a sentence in "Agent files".
- `.gitignore`, `vitest.config.ts`: one entry each.
- `docs/research/independent-reviews.md` and its row in `docs/research/index.md`.
- No `src/` or `styles/` change, so no version bump.
