---
name: driving-obsidian
description: Drive the real running Obsidian to see what the editor holds and paints. Use before claiming a visual, caret, focus or scroll fix, and to reproduce a report before fixing it.
---

# Driving Obsidian

`npm run drive -- <command>` keeps one Obsidian running on a copy of `test-vault`. A key or an
evaluation costs about 5 ms, a screenshot about 45 ms, and an edited source file reaches the
running app in about a second; a narrow spec run takes 40 s and starts a fresh app.
`npm run drive -- --help` lists every command and flag.

Two views, and they can disagree: `state` is what the editor holds, drawn with the glyphs of
`presenting-examples`; `shot` is what is painted. A disagreement is the finding.

## Reproduce a report

1. `start`, then `open <note> --stdin --outline on|off --at <line>:<ch>` with the reporter's
   document, mode and caret. `--at` counts from 0, like the editor's positions.
2. `key` the reporter's keys, and `state` after each step.
3. The reproduction is **red** when the drawn columns show the report's `actual`. When they do not,
   say so and quote the versions `start` printed: a harness and a tester on different builds cost
   several rounds in #28 and #31.

## Verify a fix

1. Edit, then `rebuild`. The plugin reloads and a tab's outline mode returns to the default, so open
   the reproduction's document again with its `--outline` and `key` the same keys.
2. The fix is **green** when `state` shows the expected column and `shot --caret` shows the caret on
   the line and character `state` names.
3. A claim about a pixel, the caret's visibility or scroll rests on a measurement: read
   [measuring.md](measuring.md) and quote its numbers.
4. Done when the result names the document, the keys and the build (`status`).

## Reading what comes back

`shot` prints an absolute path; open it with Read. The window is 1024×800 CSS px. A PNG is that size
times `--scale` times the display's device pixel ratio (2 on a retina screen), and the theme follows
the OS appearance.

- The native caret blinks, so about half the shots of a still screen show none. `shot --caret`
  crops around the caret (`--pad` sets the half-width in px, 60 by default), defaults to 3×, and
  retakes the clip until the caret shows, or says on stderr that it never did. Take the caret from
  `--caret`, and read a plain `shot` for everything else.
- A model reads the caret's line and character, a missing bullet, an overlap and clipped text
  reliably, and a 1 to 2 px offset unreliably: it read a 4 px shift as "about 2" and a 0 px shift as
  "about 1" (`docs/research/rendered-ui-observability`). Pixel-level claims go through
  [measuring.md](measuring.md).
- `--selector <css>` and `--clip x,y,w,h` crop to an element or a region, and `--scale 3` enlarges
  either.
- `type` inserts text as a paste does, with no `keydown`; `key` reaches the keymaps.

## Handing over

Load `presenting-examples`. `state --raw` prints the document as its `layout.mjs` reads it: put
`=== before` above one and `=== after` above another, pipe both in, and they draw side by side.

## Ending

`stop` closes the app and removes what `start` made, including any Xvfb. It is done when `status`
says `not running`. `stop --shots` removes the saved screenshots too.

## Limits

- `start` does not raise the window. On a desktop it can open behind other windows, so raise it
  before pressing a key by hand to compare with a dispatched one.
- `start` launches `OBSIDIAN_VERSION` when set and the launcher's `latest` otherwise, and the
  harness may pick a beta the driver does not. Compare the versions each prints before comparing
  results.
- A first launch on a cold cache (a download and an extraction) can take 20 s; with the versions
  cached, `start` takes 1 to 5 s.
