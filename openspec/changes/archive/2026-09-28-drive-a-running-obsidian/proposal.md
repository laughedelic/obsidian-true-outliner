## Why

An agent's only view of the real app is a spec run. A narrow run of `00-smoke` takes 40 s, 21 s of
it inside the spec, and starts a fresh Obsidian each time
([`docs/research/rendered-ui-observability.md`](../../../../docs/research/rendered-ui-observability.md),
"Measurements"). So an agent checks a fix by writing a case for what it already expects, and never
looks at the result the way the tester does. Where its expectation and the app disagreed, the
tester found out, over several rounds (`open-questions` Q27, #28, #31). #290 asks for one Obsidian
kept running and driven over the DevTools protocol, and #297 places it among the testing-loop items
that need nothing else to land first.

The costs that make it worth doing are measured in
[`docs/research/driving-a-running-obsidian.md`](../../../../docs/research/driving-a-running-obsidian.md):
a launch that is ready in 1.7 s once the first has been paid, a key or an evaluation at about
5 ms, a rebuild and reload at 0.8 to 1.2 s. The same note records what a driver has to handle
that the earlier note did not reach: half the screenshots of a still screen show no caret, and
the app leaves a user-data directory behind when it closes.

## What Changes

- **A CLI**, `scripts/drive.ts` (`npm run drive -- <command>`), that starts one Obsidian on a copy
  of `test-vault` with a debugging port and drives it:
  - `start`, `status` and `stop`. `start` builds the plugin, copies the vault, launches, and waits
    until the plugin is loaded. Under Linux with no `DISPLAY` it starts an Xvfb of its own; elsewhere
    it opens a window. `stop` closes the app, and removes the vault copy, the user-data directory
    the launcher created, and the Xvfb it started.
  - `open <note>`, which makes a note, from stdin or from the vault, the active one, in outline mode
    or not, with the caret where asked. Without it no case can be set up.
  - `key`, `type` and `eval`: key chords through `Input.dispatchKeyEvent`, text through
    `Input.insertText`, and a page expression whose value is printed.
  - `shot`: a PNG of the whole window, of a clip, of an element, or of the caret's surroundings,
    at a scale. With `--caret` it clips around the caret and retakes the shot until the caret shows.
  - `state`: the document as a drawn column, caret, selections, `∅` and block-selected lines
    included, and `--raw` for the same as input to `layout.mjs`, so before and after states of
    one case draw side by side.
  - `rebuild`: builds, copies the bundle into the vault copy, and returns when the running app
    reports the new build stamp.
- **A skill**, `.agents/skills/driving-obsidian/`, with the symlinks in `.claude/skills/` and
  `.github/skills/`. It says when to reach for the driver — before claiming a visual or caret fix,
  and to reproduce a report before fixing it — how to read what comes back, and what does not
  transfer from a screenshot to a claim.
- **Two unit-test files** for the parts that are logic: chords to protocol events, and state to
  drawing, the latter checked against `layout.mjs` itself while the two are separate copies.
- **A pointer** in `AGENTS.md` and a paragraph in `docs/cloud-sessions.md` saying the driver
  needs no `start-xvfb-and-run.sh`.

## Non-goals

- **Comparing pixels, or asserting from a screenshot.** A model reads a caret's line and character
  reliably and misses 1 to 2 px offsets (`rendered-ui-observability`, "What a model reads off a
  screenshot"); a claim about alignment is made by measuring, with `eval`.
- **Case files that run.** #289 owns the drawn format and its runner. `state` copies the drawing
  logic from `layout.mjs` and is replaced by that helper when it lands.
- **The DevTools access a spec uses** (#287), the ambient invariants (#288), and a second-pass
  agent built on this driver (#293). The driver is a tool a session uses by hand.
- **More than one app at a time, or driving the mobile app.** One session per checkout; mobile
  emulation and Android are separate questions in the same note.
- **Picking the beta the harness picks.** `start` launches `OBSIDIAN_VERSION` when it is set and
  the launcher's `latest` otherwise, and prints the version it got. Matching the tester's build
  stays with the harness's `resolveObsidianTarget`.
- **macOS editing shortcuts.** ⌘← and ⌥← reach the page through the application menu in Chromium,
  and a dispatched key may not reach them. That is unmeasured (the note says so), and the skill says
  it too.
- **A CI job for the driver.** It runs on demand, and no gate depends on it. The unit tests cover
  its logic; the launch path is checked by running it, in the change's last task.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. `e2e-verification` states what the automated harness verifies and what it must not touch;
the driver is a tool for an agent's session, verifies nothing, and touches only a copy of the
vault. The change declares `skip_specs: true`.

## Impact

- `scripts/drive.ts`, `scripts/drive-keys.ts`, `scripts/drive-state.ts`: new. `scripts/install-to-vault.ts`
  exports `stampFromBundle`, which `rebuild` reads the bundle's stamp with.
- `tests/drive-keys.test.ts`, `tests/drive-state.test.ts`: new.
- `.agents/skills/driving-obsidian/SKILL.md` and the two symlinks.
- `package.json`: a `drive` script.
- `AGENTS.md`, `docs/cloud-sessions.md`: a short section and a paragraph.
- `docs/research/driving-a-running-obsidian.md`, its index row, and the probes under
  `docs/research/prototypes/driving-a-running-obsidian/`.
- No `src/` or `styles/` change, no plugin behaviour change and no version bump.
