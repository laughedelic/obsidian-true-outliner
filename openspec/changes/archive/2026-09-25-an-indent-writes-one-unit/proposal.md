## Why

With **Indent using tabs** on — Obsidian's default — an indent writes the node's first line with
a tab and every other line the node owns with spaces. Reported as
[#154](https://github.com/laughedelic/obsidian-true-outliner/issues/154), `p1`, and reproduced
against `main` at `48ecec3` through `indent`, and again at `e31db46`. `┆` marks a column edge, `┃` the caret, `⏵` a tab;
the caret stays where it was in `foo`, as the caret policy for indent maps it.

```
 before    main          this change
┆- top    ┆- top        ┆- top
┆- foo┃   ┆⏵   - foo┃   ┆⏵   - foo┃
┆  bar    ┆      bar    ┆⏵     bar
```

The tree is right and `bar` is at the right column either way. The file is not: one node's own
lines are indented two ways, and that is what the next session opens and what
`source-indentation-collapses` has to render. A deep tab-indented list shows it most: indenting
`- Archive` in the corpus's `02-deep-lists.md` wrote its child as `\t    - old stuff`.

`reencodeForDestination` (`src/reencode.ts`) writes the first line with `indentText`, the
destination's indentation string, and moves every other line by the WIDTH delta between the old
and new first-line indentation. `shiftLine` spells a positive width in spaces, because a column
count is all it is handed.

`docs/research/indent-unit-on-every-line.md` carries the frames, the three places the reading
below cannot apply, and a 690-row differential against `main`.

## What Changes

- In `reencodeForDestination`'s no-conversion branch, every line the node owns — continuation
  lines and the whole subtree — has the node's own first-line indentation PREFIX swapped for
  `indentText`, which is what `reindentSubtreeVerbatim` already does for a pasted subtree.
- The swap is taken only where the line lands on the column the width delta asks for, and only
  where it does not put a space in front of a tab that had none in front of it before.
  Everywhere else, `shiftLine` answers exactly as it does on `main`, so no line moves to a
  different column than it did.
- The marker-run normalization (`-  a` to `- a`) still moves the continuation lines and children
  by the marker's width change: after the swap on a swapped line, and together with the width
  delta, as one shift, on any other.

## Non-Goals

- **A conversion's children.** A paragraph indented into a list item, or a list item outdented
  into a paragraph, already writes its own lines with `indentText`; its children move by the
  marker's width as well as the destination's, which no prefix of theirs names. They keep the
  width delta.
- **Renumbering.** A marker widening from `9.` to `10.` moves its subtree one column, which is a
  space in any unit.
- **Normalizing what the source wrote.** A continuation four columns past its own item keeps
  those four columns after the new prefix; the change writes the destination's characters where
  the node's own indentation was, not a canonical indentation for every line.

## Impact

- Affected specs: `structural-operations` (a new requirement on the characters a moved node is
  written in).
- Affected code: `src/reencode.ts` (`reencodeForDestination`, a new `reprefixLine` /
  `reprefixSubtree`), `tests/ops.test.ts`, and the one `tests/plugin.test.ts` case that pinned the
  spaces as the minimal change.
