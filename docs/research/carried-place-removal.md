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
┆- foo┃    ┆  - foo   ┆  - fo┃o
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
┆- foo┃    ┆- foo     ┆- fo┃o
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
┆   1. a┃     ┆   1. a       ┆   1. a       ┆   1. a┃
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
┆  - b┃    ┆  - b     ┆  - b     ┆  - b┃
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

The node shapes above, as each stands after its carrying key, handed to `deleteSubtreeGroups`
with the empty item as the only group and the edit applied to the text (a unit probe on `main` at
`3c91c9a`). Every result is the document before the key that opened the place, and the two
ordered runs come out numbered as if the item had never been there. That includes `q`, which the
Enter had moved to `3.`.

| After the carry | After removing the empty item |
| --- | --- |
| `1. a` / `⏵   1. ` / `2. b` | `1. a` / `2. b` |
| `1. p` / `   1. a` / `2. ` / `3. q` | `1. p` / `   1. a` / `2. q` |
| `- one` / `- foo` / `⏵   - ` | `- one` / `- foo` |
| `- a` / `  - b` / `- ` | `- a` / `  - b` |
| `- a` / `  - b` / `- ` / `- c` | `- a` / `  - b` / `- c` |
