## Context

See proposal.md, "Why". The figures the design rests on, and the probes that produced them, are in
[`docs/research/driving-a-running-obsidian.md`](../../../../docs/research/driving-a-running-obsidian.md),
and, for the protocol's own costs and what a screenshot lets a model read,
[`docs/research/rendered-ui-observability.md`](../../../../docs/research/rendered-ui-observability.md).

Three facts from the notes shape the CLI:

- The launcher returns at once and leaves Obsidian detached in its own process group, with a
  user-data directory it never removes.
- Each command is a short-lived process against one long-lived app, so the CLI carries no state
  between commands except a session file.
- The native caret blinks, so a screenshot can miss it however soon after the edit it is taken.

`scripts/` is where a tooling script lives, as TypeScript run by Node's type stripping and
checked by `npm run typecheck:scripts` (AGENTS.md, "Conventions"). `scripts/styles.ts` already
shows that a unit test may import from there.

## Goals / Non-Goals

**Goals:**

- An agent goes from a fresh session to a keystroke's result on screen in one command and about two
  seconds, and from an edited source file to the new build running in about a second.
- What the CLI prints is what an agent needs to read next: a path it can open, a drawn column, a
  value.
- A session ends with nothing left running or on disk outside the checkout.

**Non-Goals:**

- Sharing code with the e2e harness. It reaches the app through `wdio-obsidian-service`, and the
  driver through a WebSocket; #287 is the item that puts the protocol inside a spec.
- A long-lived server process. Every command reconnects, at about 5 ms.

## Decisions

**One CLI with subcommands, and a session file.** `.obsidian-cache/drive/session.json` records the
port, the browser's process id, the user-data directory, and the Xvfb's process id and display
when we started one. It sits under `.obsidian-cache/`, which is ignored and belongs to the
checkout, so two worktrees drive two apps. Alternatives considered:

- *A daemon holding the connection.* It saves a reconnect per command, a cost we did not
  measure and expect to be small beside the launch, and adds a process to leak and a protocol to
  keep.
- *Environment variables for the port.* A shell does not persist them between an agent's tool
  calls.

**Start the launcher's binary, not `npx`.** `binPath('obsidian-launcher')` resolves it the way
`e2e-narrow.ts` resolves `wdio`, through a worktree's parent `node_modules`. `npx` measured 0.3 s
slower on a warm start and adds a resolution step that can reach the network. The child is spawned
detached with its output in a log under the session directory, because a launcher that inherited
the CLI's stdio would hold the agent's tool call open.

**Own the display only where there is none.** With `DISPLAY` unset on Linux, `start` picks the
first free display from `:77`, spawns `Xvfb :N -screen 0 1280x900x24 -nolisten tcp`, and waits for
its socket, the check `e2e-tests/docker/start-xvfb-and-run.sh` makes and for the reason it gives:
`xvfb-run`'s readiness handshake hangs. Anywhere else the app opens a window, as CLAUDE.md says
narrow mode does. A Linux machine with no Xvfb gets an error naming `docs/cloud-sessions.md`.

**Stop by the protocol, then verify.** `Browser.close` on the browser-level endpoint, then a wait
on the recorded process id, then `SIGKILL` of its group if it is still there after five seconds.
The user-data directory is removed only if its name starts with `obsidian-launcher-config-`
and it is under the system's temporary directory, so a corrupted session file cannot direct a
delete elsewhere.

**Speak the protocol with a small client of our own.** Node 22's global `WebSocket` and about
thirty lines of request bookkeeping cover it: a page target from `/json`, `Runtime.evaluate`,
`Input.*` and `Page.captureScreenshot`. `puppeteer-core` would add a dependency for a client that
needs five methods. `eval` uses `replMode`, so a `const` in one call does not fail as a
redeclaration in the next, and top-level `await` works.

**Keys become protocol events in one pure module.** `drive-keys.ts` turns `shift+Tab`,
`mod+a` and `ArrowDown*3` into the events `Input.dispatchKeyEvent` takes: `key`, `code`, the
Windows virtual key code, the modifier mask, and `text` only for a key that inserts one. A key with
text is sent as `keyDown` and one without as `rawKeyDown`, both followed by `keyUp`; the probe's
table shows every one of the keys we tried reaching the plugin that way. `mod` is ⌘ on macOS and
Ctrl elsewhere, decided where the app runs, which is where the CLI runs. It is pure so its table is
unit-tested without an app.

**`state` reads the editor and draws in Node.** The page script returns the document, the ranges,
the lines carrying `to-decor-node-selected` (through `posAtDOM`), and whether the editor has focus.
Drawing happens in Node so it can be tested. It writes the document as `layout.mjs` reads it:
`┃` at each head, `«…»` around the part of each covered line a range spans, `∅` at the end of the
document, and `▒` opening a block-selected line, which drops that line's `«»` and `┃` because a
block selection has no caret. Then it runs the layout. The layout is a copy of `layout.mjs`'s,
which is a script that reads stdin and cannot be imported. A unit test runs both on the same
columns and compares the output, so the copies cannot drift until #289 gives them one home.
`--raw` prints the markup, for a session that wants `before` and `after` in one block.

**`shot` waits for a frame, and around the caret waits for the caret.** Every shot follows two
animation frames, because a decoration that updates on the frame after a transaction would
otherwise show its previous state. `--caret` clips a region around the DOM selection's rect,
defaulting to 3×, and takes one clip with `caret-color: transparent` as the caret-free reference
(the same technique as the note's probe). It then takes real clips, up to eight, 80 ms apart, until
one differs from the reference, and says on stderr when none did (an editor that has lost focus, or
a block selection, has no caret to find). Alternatives considered:

- *Painting a caret from the measured rect.* It is always visible, and it hides the very thing the
  screenshot is for: whether the native caret is where the state says.
- *Stopping the blink.* Re-setting the selection did not restart the phase in a way a screenshot
  sees in any of three forms (the note's table), and we found no setting that turns it off.

**`rebuild` is confirmed by the stamp.** It runs the dev build first and leaves the vault alone if
it fails. It then copies `styles.css` and `manifest.json` and, last, `main.js`, because the
vendored hot-reload waits 300 ms after the last write and a reload that saw a new `main.js` beside
an old stylesheet would be a state nobody built. It polls
`plugin.buildStamp.clock` until it equals the clock in the bundle, and reports the elapsed time. It
never sleeps for a fixed time. A timeout says which of the two moved: the stamp, or nothing, which
means `.hotreload` or the plugin is missing from the vault copy.

**Report the versions.** `start` and `status` print the installer and app versions the running app
reports, because Q27 and #31 lost rounds to a harness and a tester on different builds.

**The skill is short and about judgement.** The CLI's `--help` carries the syntax, so the skill does
not restate it. `SKILL.md` gives two procedures, reproducing a report and verifying a fix, each ending
on a condition a session can check (the reproduction is red when `state` draws the report's `actual`,
the fix green when it draws the expected column and the caret shot agrees), then what a screenshot
proves and what it does not, and the limits nothing else records. The page scripts for a claim about
a pixel, the caret's visibility or scroll sit in `measuring.md`, behind a pointer, because only some
sessions reach them. The skill points to `presenting-examples` for how to hand a result over.

## Risks / Trade-offs

- **The driver reads Obsidian internals** (`app.workspace.activeEditor`, `plugins.plugins`, the
  plugin's `buildStamp`), as the specs do, so an Obsidian release can break it in the way it breaks
  them. `start` fails on its readiness check and says which expression failed; the specs would fail
  first in CI.
- **The first launch of a session took 20 s and later ones 1.7 s**, and we did not find why. The
  readiness wait allows 60 s, so a slow first launch does not read as a failure.
- **A dispatched key is not a typed one on macOS**, for the menu-routed shortcuts. The skill names
  the limit and points at `eval` for those cases; nothing here measures it.
- **A stale session file** (the app was killed by hand) would make `start` refuse. `start` checks
  the port and the recorded process id, and treats a session with neither alive as stale: it
  removes what it left and starts again.
- **The vault copy's size.** `test-vault` can carry a generated hub of several hundred notes
  (`.gitignore`, `Backlinks/Hub/`). Copying it on every start is a cost only in a checkout that
  generated one, and `start` says how long the copy took.
