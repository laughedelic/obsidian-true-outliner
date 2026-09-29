## 1. Chords to protocol events

- [x] 1.1 Add `scripts/drive-keys.ts`: `parseChord(chord, platform)` returns the fields
      `Input.dispatchKeyEvent` takes (`key`, `code`, `windowsVirtualKeyCode`, `modifiers`, and
      `text` only for a key that inserts one), and `expandKeys(args)` turns `Tab*3` into three
      chords. It covers letters, digits, the US punctuation keys and their shifted forms, Space,
      Enter, Tab, Backspace, Delete, Escape, the arrows, Home, End, PageUp, PageDown and F1 to F12,
      with `mod` as ⌘ on `darwin` and Ctrl elsewhere. An unknown key throws, naming the chord.
      Verified by `tests/drive-keys.test.ts` (16 cases), which pins the rows of
      `docs/research/driving-a-running-obsidian.md`'s key table (ArrowDown, ArrowUp, Tab, Shift+Tab,
      Enter, `x`, Backspace, Shift+ArrowLeft, Ctrl+A) and the shifted symbols, `mod` on both
      platforms, repeat expansion, and the refusal of `Ctrl+Nonsense`. Negative controls: giving
      Enter no `text` must fail its row; dropping the shift bit from `shift+Tab` must fail its
      row; resolving `mod` to Ctrl on `darwin` must fail the platform row.

## 2. State to drawing

- [x] 2.1 Add `scripts/drive-state.ts`: `stateMarkup(doc, ranges, blockLines)` writes the document in
      `layout.mjs`'s input form (`┃` at each head, `«…»` around the part of each covered line a
      range spans, `∅` at the end, `▒` on a block-selected line, which carries neither `«»` nor
      `┃`), and `drawColumns(columns)` is the layout, copied from `layout.mjs` with a comment
      saying so and naming #289. Verified by `tests/drive-state.test.ts`: markup for a caret at the
      end of a line, at the end of the document with and without a final newline, a selection
      inside one line, one across three lines, two ranges, a block-selected line, and tabs and
      trailing spaces; and a comparison that runs `.agents/skills/presenting-examples/layout.mjs`
      and `drawColumns` on the same three multi-column inputs and requires equal output.
      Negative controls: dropping the `▒` branch must fail the block-selected case; emitting `∅`
      for a document that ends in `\n` on the last text line instead of on its own must fail
      the end-of-document pair; changing one glyph in the copied layout must fail the comparison.

## 3. A session: start, status, stop

- [x] 3.1 Add `scripts/drive.ts` with the session file, the protocol client and `start`, `status`
      and `stop`, and export `stampFromBundle` from `scripts/install-to-vault.ts`. `start`
      builds, copies `test-vault` to `.obsidian-cache/drive/vault`, starts an Xvfb when Linux has no
      `DISPLAY`, launches the launcher's binary detached on a free port with the flags
      `wdio.conf.mts` gives its windows, waits until the plugin is loaded and the layout ready,
      records the browser's process id and the user-data directory, and prints both versions. It
      treats a session whose port and process are both gone as stale. `stop` closes the browser,
      waits, kills the group after five seconds, and removes the vault copy, the user-data
      directory (only under the temporary directory and named `obsidian-launcher-config-*`) and
      the Xvfb it started. Verified by running, from a cloud session, `npm run drive -- start`,
      `status`, `stop`, and then `ps -eo cmd | grep -c '[o]bsidian-installer'` and
      `ls -d /tmp/obsidian-launcher-config-* .obsidian-cache/drive` printing 0 and no matches; a
      second `start` while one runs says so and starts nothing; a `start` after `kill -9` of the
      app recovers. Negative controls: taking out the directory removal must fail the `ls`
      check, and taking out the Xvfb stop must leave an `Xvfb` in `ps`.

## 4. The commands

- [x] 4.1 `open`, `key`, `type` and `eval` in `scripts/drive.ts`. `open <note>` opens a note from
      the vault, or with `--stdin` creates or overwrites it, then sets outline mode with
      `--outline on|off` and the caret with `--at <line>:<ch>`, and waits until each reads back.
      `key` sends each chord of `expandKeys`, `type` sends `Input.insertText`, and `eval` prints a
      value (a string raw, anything else as JSON), prints an exception to stderr and exits 1, reads
      stdin for `-`, and evaluates with `replMode`. Verified against the running app: `open Repro.md --stdin
      --outline on --at 0:6` on #257's four-line note, then `key shift+Enter shift+Tab` and
      `key ArrowUp` twice, draw the four columns of that issue's Case 1 through `state --raw` and
      `layout.mjs`; `type "new item"` then `key Backspace*8` removes the eight characters;
      `eval 'const a = 1; a'` and then `eval 'const a = 2; a + 1'` print 1 and 3, and
      `eval 'nope()'` exits 1.
- [x] 4.2 `state` and `shot`. `state` reads the document, ranges, block-selected lines and focus
      through one page script, draws a column headed by the note's path (`--header` to change),
      prints outline mode and focus beneath it, and prints only the markup with `--raw`. `shot`
      waits two frames, then writes a PNG under `.obsidian-cache/drive/shots/` (`--out` to choose),
      prints its path and pixel size, and takes `--clip x,y,w,h`, `--selector <css>`,
      `--caret` (with `--pad`) and `--scale n`. Around the caret it takes a caret-free reference, then
      retakes up to eight times until a shot differs from it, and warns on stderr when none does.
      Verified against the running app: `state` after Ctrl+A in outline mode draws `▒` on the
      selected lines and no `┃`; twelve `shot --caret` runs in a row each differ from the
      reference, where the probe's twelve plain shots showed the caret in 7; a `--caret --scale 3`
      shot is three times the pad's size; `--selector .cm-content` and a `--clip` match their
      rects. Negative control: with the retry loop reduced to one attempt the twelve-run check
      must fail on at least one run.
- [x] 4.3 `rebuild`. Runs the dev build (failing without touching the vault), copies
      `styles.css`, `manifest.json` and then `main.js` into the vault copy's plugin folder,
      polls the loaded plugin's `buildStamp.clock` against the one in the bundle, and prints the
      build id and the elapsed time. A timeout reports whether the stamp moved. Verified against
      the running app: three runs each print a new clock, in 0.7 to 1.1 s from the start of the build, the
      note open before is open after with its caret, and a syntax error inserted into `src/` makes `rebuild`
      exit 1 with the build's output and leaves the running app's stamp as it was. Negative
      control: disabling the `hot-reload` plugin in the running app must make it time out after
      15 s, naming the build the app still runs.

## 5. The skill and its pointers

- [x] 5.1 Add `.agents/skills/driving-obsidian/` (`SKILL.md` and `measuring.md`) and the symlinks in
      `.claude/skills/` and `.github/skills/`, alongside the existing ones. `SKILL.md` gives the
      trigger as a description of two branches, a reproduce procedure and a verify procedure with
      checkable endings, how to read a screenshot with the note's blind-test findings, the caret's
      blink and `--caret`, the limits and `stop`; `measuring.md` holds the page-script recipes from
      `rendered-ui-observability`'s "Re-running the probes" that were run against the app. Verified by `ls -L`
      reading the skill through both symlinks, by running each recipe in `measuring.md` against the
      running app, and by following the skill's own steps, from a fresh `start` to a `stop`, on
      #257.
- [x] 5.2 Add the `drive` script to `package.json`, a short section in `AGENTS.md` after "E2E
      testing" pointing at the skill, and a paragraph in `docs/cloud-sessions.md` under "Running
      the suites" saying the driver needs no `start-xvfb-and-run.sh`. Verified by
      `npm run drive -- --help` printing the commands, and by `node scripts/check-research-index.ts`.

## 6. Check the change as a whole

- [x] 6.1 `npm run typecheck:scripts`, `npm run typecheck`, `npm run lint` and `npm test` pass, and
      `openspec validate drive-a-running-obsidian --strict` passes.
