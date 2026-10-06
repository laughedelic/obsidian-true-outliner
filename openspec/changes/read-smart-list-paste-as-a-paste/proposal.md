# Proposal

## Why

On Obsidian 1.14.4 with "Smart lists" on, a list pasted at a list item's content start reaches the
enforcement filter as a replacement of the item's marker, and the filter passes it as an ordinary
edit. Three paste cases in the `clipboard` group fail on it, desktop and mobile
([#372](https://github.com/laughedelic/obsidian-true-outliner/issues/372)). A pasted subtree keeps
the depth it had in the clipboard, the file gains a blank line, and a paste at the start of an item
with children lands in the item's own text. The same pastes pass on 1.13.7, and the required suites
are held on that build until this is fixed (#359). Obsidian updates itself in place, so a user on
1.14.4 gets the stock result today.

The cause is not the plugin's paste handling failing to run, nor the harness: a real ⌘V gives the
same transaction. Obsidian's own paste hook now rewrites the paste, and `classify` reads the rewrite
as a within-node edit. What the rewrite is, what it drops and where the filter lets it through are
measured in `docs/research/obsidian-smart-list-paste`.

## What Changes

- **A smart-list paste is read as the paste it came from.** A single-range `input.paste` whose
  one change starts at the marker of the list line the range follows is read, for classification and
  for the verdict, as a plain paste at that range's content start. The verdict layer, the rewrite and
  everything after it are the code that already runs for a plain paste.
- **The payload is recovered from the paste event.** Obsidian's rewrite drops the first pasted
  line's indentation, and two clipboards that differ only in it give one transaction and two
  different trees. The editor records the clipboard's text on each `paste` event, before Obsidian's
  hook runs and without handling the event, and the filter reads the change as the paste of that text
  when the change is exactly what Obsidian builds from it.
- **Where no recorded text reproduces the change**, as with a clipboard Obsidian converts from HTML,
  the change's inserted text is the payload. It opens with the destination's marker at depth 0, so
  nothing is lost.
- **Every other transaction is read as before.** A change that does not have the rewrite's exact
  shape, a paste with more than one range or one change, and a paste outside a list prefix are
  judged as they are today.
- **The CI pin is removed with it** (#372, step 4), whichever of this change and #359 lands second.

## Non-goals

- A multi-range paste. Obsidian distributes a multi-line clipboard across the ranges and rewrites
  each; the change has one change per range and is left to Obsidian. On two carets that gives two
  list items where 1.13.7 gave `- - a` and `- - b` (the note's edge table).
- Stopping Obsidian from rewriting. The paste hook and "Smart lists" are Obsidian's; whether outline
  mode should override smart-list behaviour is the question #263 already asks for renumbering.
- Which marker, task box or numbering the first pasted item takes. Obsidian adopts the destination's
  marker and the pasted line's task box, and the results measured in the note equal 1.13.7's.
- A clipboard of files or an image, and a real paste on iOS or Android. The note lists both as not
  measured; the mobile runs are Chromium's emulation.
- Which 1.14.x build introduced the rewrite. 1.14.0 to 1.14.3 are insider builds the harness cannot
  reach.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `transaction-classification`: a new requirement, "A smart-list paste is judged as the paste it came
  from", reads Obsidian's marker rewrite of a paste as the plain paste at the content start before the
  transaction is classified and judged, joining "A transaction is judged on the user's own changes".

## Impact

- A new module under `src/plugin/` holding the recorder and a pure reader of the rewrite, and
  `src/plugin/transaction-filter.ts` reading the changes through it. The prototype measured in the
  note is 62 lines plus three edits there.
- Unit tests for the reader over the measured shapes, and e2e coverage in the three failing specs
  (`61-selection-enforcement`, `62-outline-edit-enforcement`, `80-outline-zoom`) and drawn cases for
  the payloads whose indentation the rewrite drops.
- `.github/workflows/ci.yml`: `env.obsidian-version`, which #359 adds, is removed.
