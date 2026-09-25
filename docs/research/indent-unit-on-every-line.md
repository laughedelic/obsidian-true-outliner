# The indent unit on every line a node owns

An indent in a tab-indented vault wrote a node's first line with a tab and every line below it
with spaces: one node, indented two ways. Reported as
[#154](https://github.com/laughedelic/obsidian-true-outliner/issues/154), and measured here
against `main` at `48ecec3`, and re-run unchanged at `e31db46`, after the drag feature and the
list-item-relative block starts of #210 landed.

`┆` marks a column edge, `⏵` a tab.

```
 before    main          this change
┆- top    ┆- top        ┆- top
┆- foo    ┆⏵   - foo    ┆⏵   - foo
┆  bar    ┆      bar    ┆⏵     bar
```

Both results put `bar` at column 6 and both parse to the same tree. Only the characters differ.

## Two writers, one of which knows the unit

`reencodeForDestination` (`src/reencode.ts`) writes the node's first line as `indentText` — the
destination's indentation string, tabs included, which `destinationIndent` chose from a sibling,
the document, or the editor's setting. Every other line the node owns, its continuation lines and
its whole subtree, went through `shiftSubtree` by the WIDTH delta between the old first-line
indentation and the new one. `shiftLine`'s indent branch spells a positive delta in spaces,
because a column count is all it is handed.

A space unit hides this: the delta is the unit, spelled the same way. A tab is where the two
diverge, and Obsidian's **Indent using tabs** is on by default.

## The reading: swap the prefix, not the width

Every line a node owns opens with the node's own first-line indentation whenever the document is
written consistently: `- foo` / `  bar` share `''`, `\t- foo` / `\t  bar` share `\t`. Swapping that
prefix for `indentText` writes the destination's characters and keeps whatever the source put
after them. `reindentSubtreeVerbatim` (`src/ops.ts`) already does exactly this for a pasted
subtree, for the same reason; the move operations were the ones still on a width delta.

The swap is taken only where it lands where the delta says, and falls back to `shiftLine` on
every other line:

- **A tab after the prefix.** `- foo` / `\tbar` indented by two spaces swaps to `  \tbar`, whose
  tab re-expands from column 2 and reaches 4 — two short of the 6 the delta asks for. `shiftLine`
  writes `\t  bar`, which reaches 6.
- **A space in front of a tab.** `- foo` / `\tbar` indented by four spaces swaps to `    \tbar`,
  which does reach 8, but puts a space in front of a tab — the arrangement `shiftLine`'s own
  comments exist to avoid. It writes `\t    bar` instead, as `main` does.
- **A line that does not open with the prefix.** A document whose own lines already disagree
  keeps `main`'s behaviour for them.

The width check is what keeps the change a characters-only change: a line either lands on the
column `shiftLine` would have put it at, or `shiftLine` puts it there.

A list item whose marker run is normalized on the way (`-  a` or `-\ta` to `- a`) moves its own
content column as well, by the change in the marker's width. That shift is applied AFTER the
swap, to the swapped line, and a line that is not swapped takes the width delta and the marker's
change as one shift, exactly as `main` gives it. Applying the marker's change first, as a
separate dedent, breaks a tab the dedent cannot keep into spaces before the fallback ever sees
the line: `\t\t- kid` under `    -\tfoo`, indented with a tab, came out `\t      - kid` where
`main` writes `\t\t  - kid`.

## Measured

A differential over `indent` and `outdent` on every node of thirteen targeted shapes and the
eight corpus files, each with a tab, a two-space and a four-space fallback unit — 690 rows, 405
of them rejections on both sides. The probe is
[`prototypes/indent-unit-differential/`](prototypes/indent-unit-differential/).

| | rows |
| --- | --- |
| verdict changed | 0 |
| parsed tree shape changed | 0 |
| text changed | 21 |
| …of which `main` wrote a tab stop's worth of spaces after a tab on a line it moved | 21 |
| a space in front of a tab, anywhere in the result | 0 on `main`, 0 here |

Every changed row in this sweep is an indent. An outdent can change text too — through the
siblings it re-parents under the node, or a marker run it normalizes — and the review round's randomized sweep over
6 000 generated documents found such rows, each at the same column as on `main`. The corpus's own tab-indented list
(`02-deep-lists.md`) is where most of them are: indenting `- Archive` under `- 2. second`
wrote `\t    - old stuff` on `main` and writes `\t\t- old stuff` here. Three changed rows still
carry four spaces after a tab on a moved line, all the same shape: a continuation line the source
wrote four columns past its own item (`  - kid` / `    more`), whose relative indent the swap
carries over verbatim.

`tests/reencode.test.ts` states the invariant directly, over every pairing of eight first-line
shapes, nine continuation shapes and seven destination strings: each line below the first lands
on the column a shift of the whole node by the combined delta gives it, with the same text past
its indentation, and a line that does not open with the node's own indentation is written
character for character as that shift writes it.

`commonmark` 0.31.2 renders `main`'s encoding and this one identically for the issue's frame,
for a node with children and a continuation, for a fenced block in a list item, and for a quote
in one.

## What this does not reach

- **A conversion.** A paragraph indented into a list item, or a list item outdented into a
  paragraph, writes its own lines with `indentText` already; its CHILDREN still move by a width
  delta, because the conversion changes the column they hang from by the marker's width and no
  prefix of theirs names that. Filed as
  [#215](https://github.com/laughedelic/obsidian-true-outliner/issues/215).
- **Renumbering.** `shiftBelowMarker` moves a subtree when a marker widens from `9.` to `10.` by
  one column, which is a space whatever the unit.
- **A paste from outside the vault.** A pasted subtree keeps the clipboard's own indentation below
  its roots, by `reindentSubtreeVerbatim`'s design, so a two-space list pasted into a tab vault
  lands as `\t  - b`. Filed as
  [#216](https://github.com/laughedelic/obsidian-true-outliner/issues/216).
