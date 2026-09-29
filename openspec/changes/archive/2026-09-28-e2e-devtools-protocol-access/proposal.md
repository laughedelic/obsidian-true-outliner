## Why

A spec drives Obsidian through WebDriver alone, so everything below WebDriver's reach stays manual
or unmeasured: IME composition, touch through Chromium's own input path, every painted frame, CPU
profiles, clipped screenshots at a chosen scale. #287 asks for the way in, and #297 orders it
first because the IME cases (#284) and the flicker and latency monitors build on it. The way in
was measured in a cloud session and it works from inside a spec, on desktop and under mobile
emulation, with no new dependency: see
[`docs/research/rendered-ui-observability.md`](../../../docs/research/rendered-ui-observability.md),
"From inside a spec".

## What Changes

- `e2e-tests/cdp.ts`: a helper module that connects to the page WebDriver is driving, sends a
  command and returns its result, subscribes to an event, and disconnects. It comes in two forms:
  a scoped one that always disconnects, and a two-call one for a case that holds a connection
  across hooks.
- `e2e-tests/specs/01-devtools-protocol.e2e.ts`: one smoke case that proves the connection on
  both runs. It evaluates a script, sends a key, takes a screenshot, receives an event, and checks
  the connection's failure modes and its behaviour across an Obsidian reload.
- `e2e-verification` gains a requirement that a spec can reach the DevTools protocol.
- `docs/cloud-sessions.md` says to redirect a narrow run's output to a file rather than pipe it,
  after the measurement in the note showed the starter holding the pipe open.

## Non-goals

- **The IME cases.** #284 builds on this module in its own change.
- **The monitors** for flicker and latency, and the ambient invariants of #288. Those edit the
  shared wdio hooks; this change edits neither `wdio.conf.mts`, `wdio.mobile-emulation.conf.mts`
  nor `wdio.shared.mts`, which is why the helper has its own file.
- **Touch through `Input.dispatchTouchEvent`.** The cases that return early under
  `IS_MOBILE_RUN`, which #287 counts, and `e2e-tests/dragging.ts` stay as they are. Moving them is its own change
  once this one is in.
- **Wrappers for particular commands.** The module carries `send` and `on`. A key, an evaluation
  and a screenshot are payloads the smoke case writes out; a helper for a command arrives with the
  first change that needs it twice.
- **Protocol typings.** No `devtools-protocol` dependency; `send` is generic over its result.
- **A second installer or the real mobile app.** The run is the installer `wdio.conf.mts` pins;
  the newest one is #291's.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `e2e-verification`: a spec can reach the DevTools protocol of the page under test, on the
  desktop run and the mobile-emulation run.

## Impact

- `e2e-tests/cdp.ts` and `e2e-tests/specs/01-devtools-protocol.e2e.ts`: new. The spec's `01`
  prefix puts it in the `smoke` CI group, so `scripts/spec-groups.ts` and the workflow do not
  change.
- `docs/research/rendered-ui-observability.md`, `docs/research/index.md` and
  `docs/research/prototypes/cdp-in-a-spec/`: the measurements and the probes behind them.
- `docs/cloud-sessions.md`: one sentence.
- No dependency added, no `src/` or `styles/` change and no plugin behaviour change, so no
  version bump: the `Landed` check asks for one only of a `feat` or `fix` that ships.
