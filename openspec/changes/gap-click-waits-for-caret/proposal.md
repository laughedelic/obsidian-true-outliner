## Why

Two real-click cases fail intermittently under mobile emulation on the newest installer
([#304](https://github.com/laughedelic/obsidian-true-outliner/issues/304)): the click lands, and
the case reads the caret before it has. The plugin records the click's selection in every failing
run, and the selection arrives about as late as the WebDriver call returns, which on Chrome 150
returns early enough to lose the race
([`docs/research/gap-click-timing.md`](../../../docs/research/gap-click-timing.md)). The weekly run
on the newest installer is where this shows, and a red weekly run files its own issue.

## What Changes

- `e2e-tests/helpers.ts`: `waitForCursor(line, ch)`, which polls the caret until it is at the
  position and throws with the last position read when it never is.
- `65-content-space-caret` D1 and `66-content-space-caret-manual-pass` D8 read the caret after
  their gap click through `waitForCursor` instead of `getCursor()` once.
- `e2e-verification` gains a requirement that a caret placed by a real click is read once it has
  landed.

## Non-goals

- **The other thirteen `clickAt` call sites.** The note does not measure them, and none is observed
  failing. They keep their reads until a failure or a measurement names one.
- **`clickAt` itself.** It cannot know what the click should have done, and a fixed pause would
  trade a race for a slower suite ([design](design.md)).
- **What the roughly 360 ms is made of, and why `perform()` returns sooner on Chrome 150.** Both are
  recorded as unsettled in the note; neither changes what a case has to do.
- **Any change under `src/` or `styles/`.** The plugin behaves the same.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `e2e-verification`: a caret placed by a real click is read once it has landed, and a wait that
  gives up says where the caret was.

## Impact

- `e2e-tests/helpers.ts`, `e2e-tests/specs/65-content-space-caret.e2e.ts` and
  `e2e-tests/specs/66-content-space-caret-manual-pass.e2e.ts`.
- `docs/research/gap-click-timing.md` and its row in `docs/research/index.md`.
- No `src/` or `styles/` change and no plugin behaviour change, so no version bump: the `Landed`
  check asks for one only of a `feat` or `fix` that ships. The change is a `chore`.
- The weekly newest-installer run (`.github/workflows/newest-installer.yml`) is the check: its
  first scheduled result, Monday 2026-10-05, shows these two cases, and green weekly runs close
  #304.
