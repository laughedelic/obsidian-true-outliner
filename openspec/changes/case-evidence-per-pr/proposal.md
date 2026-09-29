# Proposal

## Why

A fix that changes what the editor does is checked by installing its beta, opening a note,
repeating the PR's drawn case by hand and comparing the result with the drawing
([#292](https://github.com/laughedelic/obsidian-true-outliner/issues/292), under
[#297](https://github.com/laughedelic/obsidian-true-outliner/issues/297)). With several PRs open
that is one beta switch each, and CI already runs the real app on every push and keeps nothing a
person could look at. #296, the decision on which changes need a manual pass at all, depends on
what the evidence for a PR would show, so this comes first.

`docs/research/case-evidence` runs the drawn manual-test cases of the three PRs waiting on a
manual pass (#264, #270, #274) through the case runner, on `main` and on each PR. Eleven of their
15 drawings run as case files. Of the 11 manual steps, 8 run against a drawing and show their
result in a painted frame on both platforms and in both themes, 1 runs without a drawing to check
it against, and 2 are drags. The run also found that three of the eight carets #274 draws are not
where the app puts them, a difference the PR's own case does not read. A frame costs about 70 ms
and 16 kB.

## What Changes

- **Frames per key.** The case runner gains an evidence mode that takes a painted frame of the
  note's view after `before` and after each key phase, in light and in dark, with the native caret
  hidden and one drawn from the DOM selection's rect, and the phase's keys in a badge. The mode
  never fails a case: it records the drawn state after each phase and its difference from
  `expected`, and presses every key even after a difference.
- **`main` and the PR side by side.** For a PR that adds or changes a case file under
  `e2e-tests/cases/`, each such file runs on the base and on the PR's merge with it, on desktop
  and under mobile emulation. The base is the merge's first parent, laid under the merge's own
  harness, so the two sides differ in the product and in nothing else.
- **Published on the beta.** Each case, platform and theme becomes one image, the base's frames
  and the PR's beside each other, one row per key. The images and a manifest are attached to the
  PR's beta prerelease, which is per push and public, and one sticky comment on the PR shows them
  with the drawn states, a verdict per side and platform, and a line on what the evidence does not
  cover.
- **Only for PRs that carry case files.** A PR with none runs none of it and gets no comment; one
  that stops carrying them has its comment reduced to a note.
- **A local command**, `node scripts/case-evidence.ts`, lists a PR's case files, runs one side on
  one platform and renders the images and the comment, so the job's steps are the ones a session
  runs.
- No clip. The three PRs' cases are one to three keys and their frames say what a clip would
  (`docs/research/case-evidence`, "What the measurements mean for the design"); draft #90's
  encoder, and ffmpeg in CI, wait for a case whose question is motion.

## Capabilities

### New Capabilities

- `case-evidence`: the evidence a PR's case files produce: the frames, the two sides, what is
  recorded per case, where it is published and what the comment says.

### Modified Capabilities

None. Both open changes to `drawn-case-files` (#307, draft #310; #308, draft #311) edit the case-file
format, and this change reads case files through the notation and the state helper as they stand,
so whatever those add is drawn and framed without work here.

## Non-goals

- **Clips and an encoder.** Named above; the manifest keeps what one would need, an ordered list
  of frames with their captions.
- **Reusing draft #90's capture spec.** It arranges the website's fixed notes and sizes the
  window, and its caret handling targets `.cm-cursorLayer`, which stays empty in Obsidian
  (`docs/research/rendered-ui-observability`), so its frames would still catch the blink. Its
  approach, a screenshot per step with the step's dwell in a manifest, is what this change follows.
- **Comparing frames.** Two frames of one state differ by bytes in 5 of 32 pairs
  (`docs/research/case-evidence`), so the drawn state decides whether a side differs and a frame
  only shows.
- **Pointer gestures.** A case file does not drive a pointer, and neither does the frame; the
  two drag steps of the waiting PRs stay manual, or become a spec.
- **The phone's own app.** Mobile emulation is the desktop app at a phone's viewport, which the
  comment says.
- **Deciding #296.** This change supplies the evidence and the statement of what it covers.
- **Permanent storage.** Betas are deleted when their PR closes, and the frames go with them.
- **Changing what any case asserts**, or the `drawn-cases` job's result: an evidence run is a
  separate set of jobs.
- **Evidence for PRs without case files**, and for a case file a PR merely moves.

## Impact

- `e2e-tests/evidence.ts` (new): the recorder and the evidence mode's loop.
  `e2e-tests/specs/98-drawn-cases.e2e.ts`: a branch into it under `TO_CASE_EVIDENCE`, and a
  spec that checks the recorder against a scratch note.
- `scripts/case-evidence.ts` (new, the command), `scripts/evidence-png.ts` (new, stitching frames
  into one sheet), `scripts/evidence-report.ts` (new, the manifest and the
  comment). `tests/` gains a test for each of the two pure modules.
- `.github/workflows/beta.yml`: jobs after `publish` that decide whether the PR carries case files,
  run each platform's two sides, and publish the images and the comment.
- `CLAUDE.md` ("E2E testing"), `DEVELOPMENT.md`, and the `presenting-examples` skill (a PR's
  manual-test section and where the evidence appears).
- `docs/research/case-evidence.md` and its index row hold the measurements.
- Overlap with open pull requests: [#310](https://github.com/laughedelic/obsidian-true-outliner/pull/310)
  and [#311](https://github.com/laughedelic/obsidian-true-outliner/pull/311) both edit
  `98-drawn-cases.e2e.ts`, `cases.ts` and `case-report.ts`. This change adds a branch to the spec
  and leaves the other two files alone; whichever lands second resolves a few adjacent lines. Neither
  is a dependency (`design.md`, D9).
- No `src/` or `styles/` change and no plugin behaviour change.
