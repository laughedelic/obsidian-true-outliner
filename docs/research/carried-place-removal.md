# What abandoning a carried place does today

Issue #249: a place a structural key CARRIED — Tab, Shift+Tab, the empty-item ladder's outdent —
is not removed when the user declines it, although the same place is removed when nothing carried
it. This note records what each shape does on `main` at `3c91c9a`, so the change that closes the
issue is measured against a baseline rather than against the issue's own reading.

In the frames below `┆` marks each column's left edge, `┃` the caret, and `·` a space on a line of
only spaces. Carets are as measured.

## How it was measured

Every shape was driven through the e2e harness in the real app (Obsidian v1.13.7, Linux, desktop),
keys pressed one at a time, buffer and caret read after each. The vault's indent unit is a tab, so
a Tab that has no evidence in the document writes `\t`; where the document already holds
two-space indentation the unit is inferred from it instead. That split is visible below and is not
this note's subject.

## A gap place

**Tab then ⌫.** `- one` / `  - kid` / `- foo┃`, then ⇧⏎ ⇥ ⌫. The ⌫ strips the place's
indentation and leaves an empty line; a second ⌫ is needed to reach what one ⌫ reaches with no Tab
in between.

```
 before     ⇧⏎         ⇥          ⌫
┆- one     ┆- one     ┆- one     ┆- one
┆  - kid   ┆  - kid   ┆  - kid   ┆  - kid
┆- foo┃    ┆- foo     ┆  - foo   ┆  - foo
           ┆··┃       ┆····┃     ┆┃
```

**Tab then ↑.** Same start, ⇧⏎ ⇥ ↑. The place stays in the file as a line of spaces inside the
item, where no caret can reach it.

```
 before     ⇧⏎ ⇥       ↑
┆- one     ┆- one     ┆- one
┆  - kid   ┆  - kid   ┆  - kid
┆- foo┃    ┆  - foo   ┆  - ┃foo
           ┆····┃     ┆····
```

Two Tabs (`- sib` added as `kid`'s sibling, ⇧⏎ ⇥ ⇥ ↑) leave `······` behind the same way.

**Control: Shift+Tab then ↑.** `- one` / `  - foo┃`, ⇧⏎ ⇧⇥ ↑ removes the place. Over a gap place
outdent is a CREATING dispatch (`structural-history-integration`), so it writes a removal record of
its own; only indent has none.

```
 before      ⇧⏎ ⇧⇥     ↑
┆- one      ┆- one    ┆- one
┆  - foo┃   ┆- foo    ┆- fo┃o
            ┆··┃
```

## An empty node

**Bullet, Enter then Tab then ↑.** `- one` / `- foo┃`, ⏎ ⇥ ↑. The empty item stays.

```
 before     ⏎ ⇥        ↑
┆- one     ┆- one     ┆- one
┆- foo┃    ┆- foo     ┆- foo┃
           ┆⏵   -·┃   ┆⏵   -·
```

The same shape with ⌫ in place of ↑ already removes the item: ⌫ at an empty item's content start
is the merge rule, which reaches the same document without the removal record.

**Ordered, Enter then Tab then ↑.** `1. a┃` / `2. b`, ⏎ ⇥ ↑. The Enter renumbers `b` to `3.`, the
Tab renumbers it back, and the empty item stays.

```
 before    ⏎          ⇥            ↑
┆1. a┃    ┆1. a      ┆1. a        ┆1. a┃
┆2. b     ┆2.·┃      ┆⏵   1.·┃    ┆⏵   1.·
          ┆3. b      ┆2. b        ┆2. b
```

Control: the same ⏎ then ↑, with no Tab, returns `1. a` / `2. b` — the removal reverses the
renumbering, as `structural-history-integration`'s "Removal restores an ordered run's numbering"
states.

**Ordered, Enter then Shift+Tab then ↑.** `1. p` / `   1. a┃` / `2. q`, ⏎ ⇧⇥ ↑. The empty item
stays at the top level, between `a`'s parent and `q`, and `q` reads `3.`.

```
 before        ⏎              ⇧⇥             ↑
┆1. p         ┆1. p          ┆1. p          ┆1. p
┆   1. a┃     ┆   1. a       ┆   1. a       ┆   1. ┃a
┆2. q         ┆   2.·┃       ┆2.·┃          ┆2.·
              ┆3. q          ┆3. q          ┆3. q
```

The Enter itself turned `2. q` into `3. q` in the live editor, although `planKey`'s own plan for
that Enter inserts `   2. ` and touches no other line. So something downstream of the plan
renumbers the parent's run; it is not located here, and it matters to this issue only in that an
abandon has to leave the parent's run numbered correctly whatever the key before it did.

**The empty-item ladder, then ↑.** `- a` / `  - b┃`, ⏎ ⏎ ↑. The second Enter is the ladder: an
empty item outdents rather than stacking another. The item it moved stays.

```
 before     ⏎          ⏎          ↑
┆- a       ┆- a       ┆- a       ┆- a
┆  - b┃    ┆  - b     ┆  - b     ┆  - ┃b
           ┆  -·┃     ┆-·┃       ┆-·
```

## Why

`provisional-cleanup` keeps two records per view. The place record — which line holds an open
place — survives a key that carries it. The removal record — how to remove the place — does not:
it is written only by a dispatch `recordablePlace` counts as CREATING a place, from the removal
edit that dispatch's plan states, and every document change drops it. Indent is neither a creating
event nor a plan that states a removal (`STRUCTURAL_DISPATCH.indent.abandon` is `none`), and
outdent over a NODE place is not a creating event for nodes. So after either, the record is gone.

The removal edit cannot be carried forward by mapping it through the carrying key's change set.
Measured through `planKey` and CodeMirror's `ChangeSet.map` on the gap shape above: the Tab's
change set is two insertions of the indent unit, one at the start of `- foo` and one inside the
place line. The fresh removal — the place line from the end of `- foo` to its own end — maps to a
deletion that still spans the original two columns but not the two the Tab inserted, and applying
it gives `- one` / `  - kid` / `  - foo··`: the place's line goes, and its new indentation is left
on the end of the item's own line as trailing spaces. The removal has to be stated again, against
the document the carrying key produced, by the plan that knows where the place now is.

## Removing a carried empty node

Two ways of removing the empty item after its carry were probed at unit level through `planKey`,
on `main` at `3c91c9a`, two-space unit.

**Deleting the node** (`deleteSubtreeGroups` over the carried document) gives back the pre-Enter
document only where nothing follows the list and the item has no children. The five shapes this
note first tried all qualified:

| After the carry | After deleting the empty item |
| --- | --- |
| `1. a` / `⏵   1. ` / `2. b` | `1. a` / `2. b` |
| `1. p` / `   1. a` / `2. ` / `3. q` | `1. p` / `   1. a` / `2. q` |
| `- one` / `- foo` / `⏵   - ` | `- one` / `- foo` |
| `- a` / `  - b` / `- ` | `- a` / `  - b` |
| `- a` / `  - b` / `- ` / `- c` | `- a` / `  - b` / `- c` |

It fails in two common families, both found by review:

- **A blank line after the list.** The Enter gives the new item the list's trailing gap, and
  deleting the item takes the gap with it. `- foo` / `` / `para` with ⏎ ⇥ becomes `- foo` /
  `para`, which Markdown reads as one paragraph continuing the item. A loose list becomes tight the
  same way.
- **An outdent that adopts siblings.** Outdent re-parents the node's following siblings under it,
  so a ladder ⏎ ⏎ in the middle of a nested list gives the empty item a child. Deleting the subtree
  deletes that sibling; dropping only the line leaves the ordered numbering wrong.

**Reverting the carries, then applying the opening removal**, gives back the document before the
opening Enter exactly, in every shape probed. The carrying key's own reversal, stated as the
`reverse` form against its result, is composed with the removal the place held before the carry.

| Shape | Keys | Carried | Restored exactly |
| --- | --- | --- | --- |
| `- a` / `  - b┃` / `  - c` | ⏎ ⏎ | `- a` / `  - b` / `- ` / `  - c` | yes |
| `- a` / `  - b┃` / `` / `para` | ⏎ ⏎ | `- a` / `  - b` / `- ` / `` / `para` | yes |
| `- foo┃` / `` / `para` | ⏎ ⇥ | `- foo` / `  - ` / `` / `para` | yes |
| `- foo┃` / `` / `- bar` | ⏎ ⇥ | `- foo` / `  - ` / `` / `- bar` | yes |
| `1. p` / `   1. a┃` / `   2. b` / `2. q` | ⏎ ⇧⇥ | `1. p` / `   1. a` / `2. ` / `   3. b` / `3. q` | yes |
| `1. a┃` / `2. b` | ⏎ ⇥ | `1. a` / `   2. ` / `2. b` | yes |
| `## Foo┃` / `body` / `## Bar` / `text` | ⇧⏎ ⇧⇥ | `## Foo` / `body` / `#` / `## Bar` / `text` | yes |

## The nested ordered Enter

In the live editor, ⏎ at the end of `   1. a` in `1. p` / `   1. a` / `2. q` gives
`   2. ` and turns `2. q` into `3. q`. With `   2. b` after `a`, it gives `   3. b` and `4. q`.
`planKey`'s own plan for that Enter touches only the inserted line. ⏎ then ↑ in the same shape
returns `1. p` / `   1. a` / `2. q`, so the renumbering arrives within the transaction the removal
record is kept for, and the reversal undoes it. Where the renumbering comes from is not located
here. The removal is correct either way.

## After

The same shapes on the branch that closes #249, driven through the e2e harness in the real app,
desktop and mobile. Each row is an assertion in `e2e-tests/specs/30-keyboard-grammar.e2e.ts`,
"a carried place is declined like a fresh one" and "the command path carries a place the way the
keys do".

| Shape | Keys | Result |
| --- | --- | --- |
| `- one` / `  - kid` / `- foo┃` | ⇧⏎ ⇥ ⌫ | `- one` / `  - kid` / `  - foo┃`: one ⌫ |
| same | ⇧⏎ ⇥ ↑ | `- one` / `  - kid` / `  - foo`: no whitespace left |
| `- one` / `  - kid` / `  - sib` / `- foo┃` | ⇧⏎ ⇥ ⇥ ↑ | `    - foo` with no line below it |
| `- one` / `  - kid` / `- foo┃` / `- bar` | ⇧⏎ ⇥ ⏎ | position removed, caret at `- ┃bar` |
| `- a` / `  - b┃` / `- c` | ⇧⏎ ⇧⇥ ⌫ | `- a` / `- b┃` / `- c`: the caret returns where ⇧⏎ started |
| `- foo┃` | ⏎ ⇧⏎ ⌫ | `- foo` / `- ┃`: the second place goes, the empty item stays |
| `- one` / `- foo┃` | ⏎ ⇥ ↑ | the document before the ⏎ |
| `1. a┃` / `2. b` | ⏎ ⇥ ↑ | the document before the ⏎ |
| `1. p` / `   1. a┃` / `2. q` | ⏎ ⇧⇥ ↑ | the document before the ⏎ |
| same, with the parent run reaching `9.` | ⏎ ⇧⇥ ↑ | the document before the ⏎, across the `10.` width change |
| `- a` / `  - b┃`, with and without `  - c` | ⏎ ⏎ ↑ | the document before the first ⏎, `c` back under `a` |
| `para` / `  - a┃` / `  - b` | ⏎ ⏎ ↑ | the document before the first ⏎ |
| `- foo┃` / `` / `para` | ⏎ ⇥ ↑ | the document before the ⏎, blank line kept |
| `## Foo┃` / `body` / `## Bar` / `text` | ⇧⏎ ⇥ ↑ | the document before the ⇧⏎ |
| same | ⇧⏎ ⇧⇥ ⌫ | the document before the ⇧⏎ |
| ⇧⏎ ⇥ ↑, then ⌘Z | | the carried place back |
| ⇧⏎ ⇥, type, delete, ↑ | | the place stays: typing ended its record |
| the palette's "Indent node" and "Outdent node" in place of ⇥ and ⇧⇥ | | the same results as the keys |

Two shapes behave as the table does not predict, and neither is this change's:

- **With `   2. b` after the nested `a`,** ⏎ ⇧⇥ ↑ leaves `3. q`. The fresh ⏎ ↑ leaves the same, because
  the Enter's renumbering of the parent run is not part of the removal its plan states (#252). That
  renumbering was Obsidian's, and since #252's fix both return the source
  (`docs/research/obsidian-list-renumbering`).
- **On a line holding only `#`,** which ⇧⇥ used to leave from a drafted `## `, the arrow keys did not
  move the caret, so ↑ never left the place, and only ⌫ removed it. Our keymap never saw the key:
  the level shift wrote the bare `#` with the caret after it, Obsidian's tag suggester opened
  there, and the suggester took ↑ and ↓. Measured in 1.13.7 through the e2e harness, with a
  `.suggestion-container` open and the motion probe counting no press. The shift now keeps the
  space, `# ` with the caret after it, and nothing opens (#257).
