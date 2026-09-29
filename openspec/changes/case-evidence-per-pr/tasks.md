## 1. Measure what the waiting PRs' cases show

- [x] 1.1 Convert the drawn manual-test cases of #264, #270 and #274 to case files, run them on the
      PR's merge with `main` and on `main`, on both platforms, with `npm run case` (check and
      `--record`), and compare each recorded result with its drawing. Verified by
      `node docs/research/prototypes/case-evidence/analyze.mjs <root>`: 11 of 15 drawings run,
      the text matches on the PR for all 11, and 3 of 8 drawn carets differ, each after ↑ or ↓;
      the driver's readings of the caret's x show the pixel column.
- [x] 1.2 Take a frame per key in both themes for the same cases on both sides, and measure its
      cost, the caret's source and its stability. Verified by
      `node docs/research/prototypes/case-evidence/frame-stats.mjs <root>` over
      `frames.e2e.ts.txt`'s output: 336 frames, and eight frames of a static screen are one image
      with the drawn caret and two with the native one, in 12 of 12 runs.
- [x] 1.3 Write the figures and the statement of which manual steps the evidence covers in
      `docs/research/case-evidence.md`, with its row in `docs/research/index.md`. Verified by
      `npm run lint`, whose research-index check passes.

## 2. The recorder and the evidence mode

- [ ] 2.1 `e2e-tests/evidence.ts`: the recorder (the page-side install of the caret-hiding style,
      the drawn caret and the badge, the crop, the capture through `cdp.ts`, the wait per phase) and
      the evidence case's loop, which takes `arrange` from the spec and writes a record and its
      frames per case, platform and side. Verified by `npm run typecheck:e2e` and a narrow run of
      the prototype cases with `TO_CASE_EVIDENCE` set, whose frames are opened and read: the
      caret is drawn where the text ends, the badge names the side and the keys, and dark differs
      from light.
- [ ] 2.2 `e2e-tests/specs/98-drawn-cases.e2e.ts`: the branch into evidence mode under
      `TO_CASE_EVIDENCE` and `TO_EVIDENCE_SIDE`, calling `runPhases` with the case's
      `known-failing` marker taken off and `record` set, and a press and a read that take the
      frame. A difference is recorded and never thrown, every phase after it is pressed, an
      unheld `before` and an error while arranging are recorded, the records name the differing
      parts, and a marked case's record names its issue and whether each side still fails as
      recorded. Verified by the narrow run over the prototype cases on
      both platforms, whose records give the counts of task 1.1 (`main` differs in text on 11 of
      11, the PR in caret on 3 of 8 drawn carets). Negative control: making the loop throw on a
      difference must stop #274's first case after its first phase and leave no record of the second.
- [ ] 2.3 The spec's second `describe` checks the recorder against a scratch note: eight frames of a
      static screen are one image, the drawn caret lies within half a pixel of the selection's
      rect, no caret is drawn for a non-empty selection or a block selection, the wait before a
      phase's first frame is at least 300 ms, and a case that differs records `caret` alone.
      Negative controls: leaving the native caret visible must make the static-screen check fail;
      moving the drawn caret by 2 px must fail the rect check; a 0 ms wait must fail the wait check.
- [ ] 2.4 One drawn case file that passes on `main` lands under
      `e2e-tests/cases/outline-keyboard-grammar/`, recorded with `npm run case -- <file> --record`
      on both platforms, so this change's own PR carries a case file and exercises the jobs of
      group 4. Verified by `npm run case -- <file>` and `--mobile`, and by the unit suite's check
      of every case file.
- [ ] 2.5 `CLAUDE.md` ("E2E testing") says how to run a PR's cases as evidence
      (`node scripts/case-evidence.ts run`) and where the records and frames land. Verified by
      `npm run lint`.

## 3. The sheet, the report and the command

- [ ] 3.1 `scripts/evidence-png.ts`: read a non-interlaced 8-bit PNG (the five row filters), write
      one, and stitch frames into a sheet of two columns and a row per phase, with the base's column
      absent when it could not run. Verified by `tests/evidence-png.test.ts`: a round trip of
      synthetic images through each filter type, the geometry of a two-column and a one-column
      sheet, and the decoding of two of the prototype's frames. Negative control: reading the Paeth
      filter as Sub must fail the round trip.
- [ ] 3.2 `scripts/evidence-report.ts`: the record's type, the verdict for each side and platform,
      and the comment's Markdown (the marker, the header line with the commits and versions, the
      verdicts, the drawn states in block form, the `<picture>`, the fixed line on what is not
      covered, and the size budget that turns the cases that do not fit into a row each). Verified
      by `tests/evidence-report.test.ts` over the records the prototype produced for #264, #270 and
      #274: each side's wording, a base that could not run, the reader's-theme markup, and a
      comment that stays under 65,536 characters when 40 cases are given. Negative control:
      dropping the budget must fail the size case.
- [ ] 3.3 `scripts/case-evidence.ts`: `files`, `run` (both sides on one platform, the base in a
      worktree of the merge's first parent with the merge's `e2e-tests/`, `scripts/` and
      `test-vault/` laid over it, removed afterwards), `render` and `comment`. Verified by
      `npm run typecheck:scripts`, and by `run --platform desktop` and `render` in the merged
      worktree of #264, whose comment is read: four cases differ on the base only, one of them the
      reproduction.
- [ ] 3.4 `DEVELOPMENT.md` describes the evidence beside the beta, and the `presenting-examples`
      skill says a PR's manual-test section hands over case files and that the evidence is on the
      PR (the symlinked copies follow). Verified by `npm run lint`.

## 4. The jobs

- [ ] 4.1 `.github/workflows/beta.yml`: the scope job, the two-leg evidence job and the
      publish-evidence job of the design's D10, with the beta's version as `publish`'s output.
      Verified by parsing the workflow (`node -e` over its YAML) and by a read against
      `ci.yml` and `.github/actions/e2e` for the cache key and the Xvfb wrapper.
- [ ] 4.2 The first pushed checkpoint of this branch runs the jobs on 2.4's case file. Verified by
      the run: both legs pass, the beta release holds the sheets and `evidence.json` next to
      `main.js`, and the PR carries one comment whose images render and whose second push updates
      it in place. The comment's drawn states and verdicts are read once against
      `node scripts/case-evidence.ts render`'s local output.
- [ ] 4.3 A PR with no case file runs none of it. Verified on a docs-only push to the branch: the
      scope job reports no files, the later jobs are skipped, and the comment becomes the note of
      the spec's third scenario.
- [ ] 4.4 The beta installed once through BRAT with the evidence attached, to confirm BRAT ignores
      the extra assets. Verified by the maintainer's install; the result is recorded in the PR.

## 5. Close

- [ ] 5.1 Take stock of what the change found and left. The caret after ↑ or ↓ needs no issue:
      it is a pixel column, and #274's branch reads it after `Home`. The two drag steps stay in the
      note, and any motion candidate the maintainers choose for a later capture (#330, #148) is
      an issue or a change of its own. Each claim is re-measured against `main` first.
- [ ] 5.2 `npm test`, `npm run build`, `npm run typecheck`, `npm run typecheck:e2e`,
      `npm run typecheck:scripts` and `npm run lint` all pass, and the pushed checkpoint's matrix
      is green.
- [ ] 5.3 `openspec validate case-evidence-per-pr --strict`
