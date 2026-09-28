# Tasks

## 1. The notation module

- [x] 1.1 Move the reading of columns, the drawing of a line and the layout out of
      `.agents/skills/presenting-examples/layout.mjs` into `notation.mjs`, add `notation.d.mts`, and
      leave `layout.mjs` as the command line over it (D1). Verify with `tests/notation.test.ts`: the
      skill's own example, and the five tracker blocks below, laid out from their column input, equal
      the blocks `layout.mjs` printed at `main`, stored in the test as strings; negative control:
      changing the column gap in the module fails it.
- [x] 1.2 Add `readDocument` and `drawDocument` with D2's rules, including a selection across lines
      and the `∅` cases, and the underline that continues across lines in the layout. Verify with a
      fast-check property in `tests/notation.test.ts` — drawing a random text with a random range
      and reading it back returns both — and with the spec's scenarios spelled out; negative
      control: dropping the rule that a touching `┃` names the head fails the backward-selection
      case.
- [x] 1.3 Add `undraw` and `layout.mjs --read` (D1). Verify with five drawn blocks copied verbatim
      from the tracker (one with a tab, one with `▒`, one with `∅`, one with a `clipboard` column,
      one hand-aligned) that read into columns and lay out again to the same rows; negative
      control: reading `⏵` and its padding as one space fails the tab block.
- [x] 1.4 Extend `SKILL.md`: the multi-line selection in the glyph table, `--read`, and a pointer to
      case files (section 5 fills it in). Verify by running the SKILL.md `layout.mjs` example and
      comparing its output with the block printed beside it.

## 2. The case file

- [x] 2.1 Add `parseCase` and `parseKeys` to `notation.mjs` with the grammar of D3 and every refusal
      in the spec. Verify with `tests/notation.test.ts` cases for each refusal (`tabs: yes`, a step
      `⇥⇥⇥`, `⌘V` without a clipboard column, a wrong count of result columns, a stray line in the
      preamble) asserting the line number in the message; negative control: accepting an unknown
      preamble name fails the first.
- [ ] 2.2 Add `e2e-tests/cases.ts`: a parsed step to the keys `browser.keys` takes, ⌘ as
      `PRIMARY_MOD`, `×N` as repeats, quoted text as characters, ⌘V as `pasteText`. Verify by
      `npm run typecheck:e2e` and by section 4's run pressing every step kind the shipped case
      files use; negative control: mapping ⇧ to Control makes `⇧⇥` case fail.
- [ ] 2.3 Add `tests/case-files.test.ts` over every file under `e2e-tests/cases/` (parse; directory is
      a capability under `openspec/specs/`; `before` and each `expected` read back as themselves
      after drawing), and an `.editorconfig` that keeps trailing spaces in `*.case`. Verify by
      running it with the shipped case files of 5.1; negative control: a case file moved under a
      directory that names no capability fails it, naming the file.

## 3. The state helper

- [ ] 3.1 Add `e2e-tests/drawing.ts`: `readEditorState` as one self-contained function of
      `{ app, obsidian }` (D7), `drawStates` and `drawEditor`, with the multi-range and unfocused
      notes. Verify in `98-drawn-cases.e2e.ts` (a `describe` of its own): a caret reads as `┃`, ⌘A
      pressed twice in a nested item reads as `▒` with no caret, a stock backward selection across
      lines reads as one range, three ranges draw the main one and say three; negative control:
      reading `blockLines` as empty fails the ⌘A case.
- [ ] 3.2 Add `drawOnFailure` to `wdio.shared.mts` and chain it after `screenshotOnFailure` in
      `wdio.conf.mts` and `wdio.mobile-emulation.conf.mts`. Verify by a narrow run of a spec with a
      temporary failing case, showing the editor's drawing in its output on desktop and mobile, and
      by the same run with no markdown view open showing only the case's own error; negative
      control: removing the hook from one config drops the drawing from that config's output.

## 4. The runner

- [ ] 4.1 Add `e2e-tests/specs/98-drawn-cases.e2e.ts`: one case per file (or per `TO_CASE_FILES`
      path), a fresh note, the two settings applied and restored, one call to arrange and read
      back, the precondition, the phases, the comparison of D5, `platform` skips. Register the group
      in `scripts/spec-groups.ts` as exclusive, with the reason beside `clipboard`. Verify with
      `npm run test:e2e:narrow -- drawn-cases` and `--mobile` against the files of 5.1; negative
      control: moving one `expected` caret by a character fails that case with a `caret` verdict on
      both platforms.
- [ ] 4.2 Add `e2e-tests/case-report.ts`, a pure function from the parsed case and the states read to
      the verdict line and drawing of D6, `--record`'s case file included. Verify with
      `tests/case-report.test.ts`: a text mismatch, a caret mismatch, a block-selection mismatch, an
      unreachable `before`, a second-phase mismatch drawing no third phase, and a result that
      asserts no caret; negative control: comparing `anchor` and not `head` fails the caret case.
- [ ] 4.3 Add `scripts/run-case.ts` and the `case` script: set `TO_CASE_FILES` from the arguments,
      pass `--mobile` and `--record`, call the narrow runner. Verify by running a case file from the
      scratchpad directory and seeing only it run, and `npm run typecheck:scripts`; negative
      control: a path that does not exist exits non-zero before building.

## 5. Shipped case files and documentation

- [ ] 5.1 Write five repros that ran unchanged in the research note's prototype — #269's `⌫ ⌫` and `⌫`,
      #153's `⇧⏎ ⌫`, #216's paste and #197's paste — as case files under the capability each belongs
      to, with the issue in the `case:` line. Verify: all pass on
      desktop and mobile; negative control: the run of 4.1's mutation.
- [ ] 5.2 Extend `SKILL.md` with the case-file format, `npm run case`, `--record`, and the rule that
      `before` is the start and not the state after the first key; add to `AGENTS.md`'s e2e section
      that a bug's repro is a case file first and how to run one. Verify: an issue's drawn block from
      the tracker, put through `layout.mjs --read`, given a `keys` line, runs with `npm run case`.
- [ ] 5.3 Add `Covered by` lines to the change's delta spec naming `tests/notation.test.ts`,
      `tests/case-files.test.ts`, `tests/case-report.test.ts` and
      `e2e-tests/specs/98-drawn-cases.e2e.ts`. Verify: every named file exists (`ls`) and
      `docs/research/drawn-case-files.md` is listed once (`npm run lint`).

## 6. Validation

- [ ] 6.1 `npm run lint`, `npm run typecheck`, `npm run typecheck:e2e`, `npm run typecheck:scripts`
      and `npm test` pass.
- [ ] 6.2 `npm run test:e2e:narrow -- drawn-cases` and with `--mobile` pass, and a narrow run of
      `00-smoke` on each config shows the failure hook did not change a passing run.
- [ ] 6.3 `openspec validate drawn-case-files --strict`.
