## Why

Two real-click cases fail intermittently under mobile emulation on the newest installer
([#304](https://github.com/laughedelic/obsidian-true-outliner/issues/304)), and a double-click case
fails there in CI every time: the click lands, and the case reads the caret or the selection before
it has. The plugin's own record of the failing runs shows the
click's selection change arriving about 360 ms after the click began, and separately stamped runs
put that at the moment the WebDriver call that sent the click returns
([`docs/research/gap-click-timing.md`](../../../../docs/research/gap-click-timing.md)). The
weekly run on the newest installer is where this shows, and a red weekly run files its own issue.

## What Changes

- `e2e-tests/helpers.ts`: `waitForCursor(line, ch)`, which polls the caret until it is at the
  position and rejects naming both positions when it never is.
- `65-content-space-caret` D1 and `66-content-space-caret-manual-pass`'s code-fence D8 ("a gap click
  before it lands on the previous node") read the caret after their gap click through
  `waitForCursor` instead of `getCursor()` once.
- `61-selection-enforcement`'s double-click case ("double-click word selection is untouched")
  waits until the selection is a word before reading it. It failed in each of the three
  newest-installer CI runs before this change, `main`'s included, and the note's timing of a
  double click fits the same lateness.
- `00-smoke`: one case that the wait resolves on a caret that arrives after it began and on one
  already there, and rejects naming the position it waited for and the last one it read.
- `e2e-verification` gains a requirement for the wait, for the two gap-click cases that use it and
  for the double-click case.

## Non-goals

- **Every other read after a click.** The note lists the other thirteen `clickAt` call sites, among
  them spec 65 D2, and the `clickAtPoint` ones, and none is observed failing. D2's click is on a
  list marker, which the note found taking another path. They keep their reads until a failure or
  a timing names one.
- **`clickAt` itself.** It cannot know what the click should have done, and a fixed pause would
  spend that time on every click ([design](design.md)).
- **What the click's delay is made of, and why `perform()` returns sooner on Chrome 150.** Both
  are recorded as unsettled in the note; neither changes what a case has to do.
- **The other failures the newest installer shows.** The runs dispatched on `main` and on this
  branch also failed a drag case in `63-selection-visual-treatment` and a table-row case in
  `66-content-space-caret-manual-pass`, on desktop, intermittently; neither is touched here.
- **Any change under `src/` or `styles/`.** The plugin behaves the same.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `e2e-verification`: the harness offers a wait for the caret, the two gap-click cases read the
  caret through it, and the double-click case waits for its selection.

## Impact

- `e2e-tests/helpers.ts`, `e2e-tests/specs/00-smoke.e2e.ts`,
  `e2e-tests/specs/61-selection-enforcement.e2e.ts`,
  `e2e-tests/specs/65-content-space-caret.e2e.ts` and
  `e2e-tests/specs/66-content-space-caret-manual-pass.e2e.ts`; `e2e-verification`'s spec.
- `docs/research/gap-click-timing.md` and its row in `docs/research/index.md`.
- No `src/` or `styles/` change and no plugin behaviour change, so no version bump: the `Landed`
  check asks for one only of a `feat` or `fix` that ships. The change is a `chore`.
- The weekly newest-installer run (`.github/workflows/newest-installer.yml`) is the standing
  check: its first scheduled result, Monday 2026-10-05, shows these two cases, and #304 closes once
  neither appears among the weekly run's failures. The change works around the lateness in the
  specs; what the delay is made of stays open in the note.
