---
name: driving-obsidian
description: Look at the real running Obsidian between edits — press keys, read the document as a drawn column, take screenshots of the window or the caret, rebuild and reload the plugin, all in about a second. Use before claiming a visual, caret, focus or scroll fix works, and to reproduce a report before fixing it. Not for regression sweeps (the e2e suite) or pixel-exact claims (measure with `eval`).
---

# Driving Obsidian

`npm run drive -- <command>` keeps one Obsidian running on a copy of `test-vault` and drives it
over the DevTools protocol. A key or an evaluation costs about 5 ms, a screenshot about 45 ms, and
an edited source file reaches the running app in about a second, where a narrow spec run takes 40 s
and starts a fresh app each time (`docs/research/driving-a-running-obsidian`).

## When to use it

- **Before saying a visual, caret, focus or scroll fix works.** A spec asserts what its author
  predicted; the tester looks at the result. Look at it first: `state` for what the editor holds,
  `shot` for what is painted. Where they disagree, that is the finding.
- **To reproduce a report before fixing it.** Open a note holding the reporter's document, press
  their keys, and draw the result. If it does not reproduce, say so, and say which Obsidian
  `start` printed: a harness and a tester on different builds cost several rounds in #28 and #31.
- **After a fix**, `rebuild` and repeat the same keys against the same document. Compare with
  the reproduction, not with the result a fix was expected to give.

Do not use it for what a spec already covers (add the case there), for a claim about a pixel or
two (measure it, below), or for anything that needs the operating system's input method or the
mobile app.

## The loop

```bash
npm run drive -- start                                   # build, copy the vault, launch; ~2-3 s
printf -- '- alpha\n  - beta\n- gamma\n' |
  npm run drive -- open Scratch.md --stdin --outline on --at 1:8   # a document, a mode, a caret
npm run drive -- key shift+Tab                           # chords; ArrowDown*3 repeats
npm run drive -- state                                   # the document, drawn
npm run drive -- shot --caret                            # the caret's surroundings, 3x
# edit src/ or styles/, then:
npm run drive -- rebuild                                 # ~1 s; the note stays open
npm run drive -- stop                                    # always, when done
```

`npm run drive -- --help` lists every command and flag. A cloud session needs nothing beyond the
packages in `docs/cloud-sessions.md`: with no `DISPLAY` the driver starts its own Xvfb, and stops
it. Locally the app opens as a window.

`open --stdin` writes the note into the vault copy, so any document can be tried, including a
reporter's. `--at line:ch` counts from 0, like the editor's own positions. `eval` runs in the page
with Obsidian's `app`; the editor is `app.workspace.activeEditor.editor` and its CodeMirror view
`.cm`. `type` inserts text as a paste does, with no `keydown`; use `key` for typing that must
reach a keymap. A bare `stop` leaves `shots/` in place; `stop --shots` removes them.

## Reading what comes back

**`state`** prints the logical document as the project draws examples: `┃` the caret, `«x»`
a selection, `▒` a block-selected line (a block selection has no caret), `∅` the end of the
document, tabs and trailing spaces visible. The line under the column says the mode and the focus.
`state --raw` prints the same as input to `presenting-examples`' `layout.mjs`: put a `=== before`
line above one and a `=== after` line above another, pipe both in, and they draw side by side for
the user.

**`shot`** prints a path; open it with Read. The window is 1024×800 at device pixel ratio 1, in
the light theme.

- **The native caret blinks**, so about half the shots of a still screen have none. `shot --caret`
  crops around the caret (`--pad` sets the half-width in px, 60 by default), defaults to 3×, and
  retakes the clip until the caret shows, or says on stderr that it never did. A plain `shot` does
  not, so do not conclude "no caret" from one.
- **What a model reads reliably from a screenshot:** the caret's line and character, a missing
  bullet, an overlap, clipped text. **What it does not:** a 1 to 2 px offset. It read a 4 px shift
  as "about 2", and a 0 px shift as "about 1"
  (`docs/research/rendered-ui-observability`). A claim about alignment is a measurement:

```bash
npm run drive -- eval '
const cm = app.workspace.activeEditor.editor.cm;
const painted = getSelection().getRangeAt(0).getClientRects()[0];   // the native caret
const logical = cm.coordsAtPos(cm.state.selection.main.head);
({ painted: painted.x, logical: logical.left, top: painted.y, height: painted.height })'
```

  Equal means the caret is where the state says. It does not mean it can be seen: #128's caret was
  placed right and clipped by an `overflow: hidden` box, and `document.elementFromPoint` at the
  caret's centre answers that.
- **`--selector <css>` and `--clip x,y,w,h`** crop to an element or a region; `--scale 3` enlarges
  either.
- Scroll is `cm.scrollDOM.scrollTop`. A jump that lasts one frame needs a frame sampler
  (`requestAnimationFrame` pushing it into an array), not two reads.

## Handing a result to the user

Draw it, do not describe it: load `presenting-examples`, and put the `state` columns in the case.
The caret in a `state` column is the editor's own, so it can be given as measured. A screenshot
goes to the user as a file; say which build it came from (`status`).

## Limits

- One app per checkout; a second `start` says so and starts nothing. Two worktrees run two apps.
- `start` launches `OBSIDIAN_VERSION` when set and the launcher's `latest` otherwise. The harness
  may pick a beta the driver does not; compare the versions each prints before comparing results.
- A dispatched key reaches the plugin's keymap and Chromium's own editing. On macOS the
  menu-routed shortcuts (⌘←, ⌥←) may not fire from it; that is unmeasured. Use `eval` to move the
  caret there, and say so.
- The first launch of a session can take 20 s; later ones take 2 to 3.
- A failed `rebuild` (a syntax error) prints the build's message and leaves the running app as it
  was; a `rebuild` that times out says the app never reported the new build.
