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

Read literally, the fix type is a conflict between two specs. transaction-classification's "A
replacement synthesized around a caret is not a paste" requires 1.14.4's transaction to pass, and
node-edit-enforcement's "Structural pastes splice at node boundaries" ("Pasting into an empty list
item replaces it") requires the user's paste to be rewritten, keeping a nesting that is in the
clipboard and not in the transaction. This change settles it for structural pastes by making them
reach the enforcement as pastes; for a paste it leaves to Obsidian, the classification rule keeps
governing what Obsidian dispatches (Non-goals).

A fix that recognises 1.14.4's rewrite would be a workaround for one build: the next build's paste
hook can rewrite differently. The enforcement has to receive the same paste on every build. What
1.14.4 dispatches, what it drops, where Obsidian's paste handling starts, and which parts of it are
the same on both builds are measured in `docs/research/obsidian-smart-list-paste`.

## What Changes

- **An outline-mode editor takes a structural paste before Obsidian's paste handling.** A paste
  with one selection range, whose clipboard text parses as a structural block sequence (the same
  test "Structural pastes splice at node boundaries" applies), is inserted over the selection as a
  plain paste with `userEvent: 'input.paste'`. The enforcement then classifies and judges it as it
  judges any paste. Obsidian's paste hook, where 1.14.4's rewrite lives, does not run for it, on any
  build.
- **The handler runs after Obsidian's `editor-paste` listeners.** Another plugin that handles the
  paste through Obsidian's public event still does, and the outline then leaves it alone.
- **The clipboard text is the one Obsidian's paste takes**, in the order Obsidian's code follows on
  both builds: the plain text of Obsidian's own copy; else the clipboard's Markdown; else its HTML,
  sanitized with the public `sanitizeHTMLToDom` and converted with the public `htmlToMarkdown`; else
  its plain text, through CodeMirror's public `clipboardInputFilter`s, the one branch Obsidian's paste
  filters. HTML is converted whatever Obsidian's "Convert pasted HTML to Markdown" says, which a
  plugin can read only through a private API (the maintainer's decision).
- **Every HTML paste is taken as converted**, structural or not, apart from a URL over a selection,
  which Obsidian's paste writes as a link. With the conversion off, Obsidian's paste would take the
  plain text instead, and 1.14.4's collapse would rewrite it at a list item; outline mode converts on
  every build and setting (the maintainer's decision).
- **A list beside a file is taken as text.** Where the clipboard holds a plain text and files, with no
  Markdown, and no HTML or only an image's `<img>`, Obsidian's paste inserts the files on 1.13.7, and
  on 1.14.4, at a list item, its collapse inserts the text with #372's indentation loss and no file.
  Outline mode takes the text when it is a list, on both builds, and the file is not inserted (the
  maintainer's decisions).
- **What Obsidian's paste turns into something else stays Obsidian's**: files with no text, files
  beside a plain text that is not a list, a URL pasted over a selection, and a plain text it links
  to a different `text/uri-list`.
- **A list item pasted at an item's content start does not repeat the item's marker**, on every
  build and whatever "Smart lists" says. For a paste the handler does not take as structural, each
  range that sits right after a list item's marker, with a pasted first line that is itself a list
  item, is written without the pasted marker: `- a` pasted on an empty item gives `- a`, not
  `- - a`. The item keeps its indentation and marker, and takes the pasted line's task box when it
  has one. Each range of a paste over several ranges is treated the same way, with the text
  distributed across them as CodeMirror and Obsidian distribute it. The text is the handler's own
  choice above, so a lone HTML item is converted, and a lone item beside a file is taken. The
  maintainer's decision: a repeated marker has no use in an outline, and outline mode gives the same
  result on every build.
- **A differential check holds the handler to Obsidian's paste.** An e2e spec generates clipboards
  from combinations of plain text, Markdown, HTML, `text/uri-list` and files, pastes each with outline
  mode off and on, into an empty note and onto an empty list item, under both settings, and requires
  each paste to follow the rule it falls under, with the text Obsidian's own paste chooses, and the
  same result on every build the suites run. Its sweep, measured in the note, found the gaps the
  maintainer's decisions above close, and then none on either build.
- **The CI pin is removed with it** (#372, step 4): #359 held the required suites on 1.13.7 until
  this is fixed, and the suites return to the newest build in the same change.

## Non-goals

- A non-structural paste anywhere but right after a list item's marker: in a paragraph, or in the
  middle of an item's text. It stays Obsidian's, and the two builds give the same result there (the
  note's fourth prototype), so `- a` pasted inside `beta` still reads `be- ata`.
- A structural paste over more than one range with no range right after a marker. It stays
  Obsidian's; the enforcement passes it, and the builds give the same result.
- A plain text beside a different `text/uri-list`. Obsidian links it, the same on both builds, and
  the differential check lists those rows as the ones left.
- Pastes that arrive without a paste event: a text drop, and the mobile app's Paste command and its
  context menu, which insert with a dispatch that carries no user event. The enforcement reads such
  a dispatch as programmatic, so a structural text is not spliced and a lone item repeats the
  marker, on every build, before this change and after it. A fix needs its own entry point for each
  route ([#377](https://github.com/laughedelic/obsidian-true-outliner/issues/377)).
- CodeMirror's linewise paste. After a copy made with empty selections, CodeMirror inserts at the
  start of the caret's line; the change inserts at the selection, which "A paste on the blank line
  under a node lands inside it" asks for (the note's review measurements).
- Obsidian's "Convert pasted HTML to Markdown" setting. It can be read only through a private API,
  so in outline mode every HTML paste is converted even with the setting off: a list copied from a
  code editor, whose HTML holds a line a `<div>`, lands as a list item and a paragraph where the
  setting off would keep the list. The maintainer accepted this: outline mode off gives the stock
  paste.
- Smart lists' other behaviours. Enter and Shift-Enter are already taken by the plugin's keymap at the
  highest precedence; the renumbering Obsidian appends is set aside for judging, and whether outline
  mode drops it from what it passes is #263.
- A real paste on iOS or Android. The mobile runs are Chromium's emulation.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `node-edit-enforcement`: two new requirements. "A structural paste is taken before Obsidian's
  paste handling", alongside "Structural pastes splice at node boundaries", whose payloads it
  delivers; and "A pasted list item does not repeat its destination's marker", for the pastes the
  enforcement does not rewrite.

## Impact

- `src/paste-text.ts`: the clipboard-text choice, the marker rule and the distribution across
  ranges, pure functions with the HTML inspection and the converter passed in.
  `src/plugin/structural-paste.ts`: Obsidian's sanitizer and converter, and a CodeMirror `paste`
  handler registered with the enforcement's extensions in `src/plugin/transaction-filter.ts`. The
  prototype measured in the note is 135 lines in the two modules and two edits there.
- Unit tests for the pure functions; e2e coverage in the three failing specs
  (`61-selection-enforcement`, `62-outline-edit-enforcement`, `80-outline-zoom`), drawn cases for the
  payloads whose indentation 1.14.4's rewrite drops and for the marker rule, the differential spec,
  and the HTML and other clipboard shapes; every one run on both builds.
- `.github/workflows/ci.yml`: `env.obsidian-version`, which #359 added, is removed.
