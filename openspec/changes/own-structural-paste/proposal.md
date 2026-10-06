# Proposal

## Why

On Obsidian 1.14.4 with "Smart lists" on, a list pasted at a list item's content start no longer
reaches the enforcement as a paste. Obsidian's own paste hook rewrites it into a replacement of the
item's marker, which drops the first pasted line's indentation, and the filter passes that
replacement as an ordinary edit. Three paste cases in the `clipboard` group fail on it, desktop and
mobile ([#372](https://github.com/laughedelic/obsidian-true-outliner/issues/372)): a pasted subtree
keeps the depth it had in the clipboard, the file gains a blank line, and a paste at the start of
an item with children lands in the item's own text. The same pastes pass on 1.13.7. The required
suites are held on that build until this is fixed (#359), and Obsidian updates itself in place, so a
user on 1.14.4 gets the stock result today.

A fix that recognises 1.14.4's rewrite would be a workaround for one build: the next build's paste
hook can rewrite differently. The enforcement has to receive the same paste on every build. What
1.14.4 dispatches, what it drops, where Obsidian's paste handling starts, and which parts of it are
the same on both builds are measured in `docs/research/obsidian-smart-list-paste`.

## What Changes

- **An outline-mode editor takes a structural paste before Obsidian's paste handling.** A paste
  with one selection range, whose clipboard text parses as a structural block sequence (the same
  test "Structural pastes splice at node boundaries" applies), is inserted over the selection as a
  plain paste, the transaction CodeMirror's stock paste dispatches. The enforcement then classifies
  and judges it as it judges any paste. Obsidian's paste hook, where 1.14.4's rewrite lives, does
  not run for it, on any build.
- **The handler runs after Obsidian's `editor-paste` listeners.** Another plugin that handles the
  paste through Obsidian's public event still does, and the outline then leaves it alone.
- **The clipboard text is the one Obsidian's paste takes**: the plain text of Obsidian's own copy,
  else the clipboard's Markdown, else its HTML converted to Markdown, else its plain text, the order
  Obsidian's code follows on both builds. A clipboard holding files, properties or media is left to
  Obsidian.
- **Everything else stays Obsidian's.** A non-structural paste, a paste over more than one range and
  a paste outside outline mode go through Obsidian's handling as they do today.
- **The CI pin is removed with it** (#372, step 4): #359 held the required suites on 1.13.7 until
  this is fixed, and the suites return to the newest build in the same change.

## Non-goals

- A paste the enforcement does not treat as structural. Obsidian's result for it follows the build:
  a lone childless list item pasted on an empty item reads `- - a` on 1.13.7 and `- a` on 1.14.4
  (the note's version-independent prototype). Making outline mode give one result there is a
  decision of its own.
- A paste over more than one range, which Obsidian distributes across the ranges differently on each
  build. The enforcement passes such a paste either way.
- Obsidian's "Convert pasted HTML to Markdown" setting. It can be read only through a private API,
  so a structural HTML clipboard is converted in outline mode even with the setting off.
- Smart lists' other behaviours. Enter and Shift-Enter are already taken by the plugin's keymap at the
  highest precedence; the renumbering Obsidian appends is set aside for judging, and whether outline
  mode drops it from what it passes is #263.
- A real paste on iOS or Android. The mobile runs are Chromium's emulation.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `node-edit-enforcement`: a new requirement, "A structural paste is taken before Obsidian's paste
  handling", alongside "Structural pastes splice at node boundaries", whose payloads it delivers.

## Impact

- `src/plugin/structural-paste.ts`: the clipboard-text choice, pure, and a CodeMirror `paste`
  handler registered with the enforcement's extensions in `src/plugin/transaction-filter.ts`. The
  prototype measured in the note is 36 lines and two edits there.
- Unit tests for the clipboard-text choice; e2e coverage in the three failing specs
  (`61-selection-enforcement`, `62-outline-edit-enforcement`, `80-outline-zoom`), new cases for the
  payloads whose indentation 1.14.4's rewrite drops, an HTML clipboard, and the pastes left to
  Obsidian; every one run on both builds.
- `.github/workflows/ci.yml`: `env.obsidian-version`, which #359 added, is removed.
