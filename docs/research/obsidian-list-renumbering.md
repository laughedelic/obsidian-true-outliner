---
type: "research"
title: "Obsidian's live list renumbering"
description: "Obsidian's \"Smart lists\" transaction filter: how it measures a list level in tabs and four-space groups, so a three-column nested ordered item reads as its parent's sibling; the structural and typing gestures where it renumbers a list the edit never touched; that it runs before our default-precedence filters and after a `Prec.highest` one; the plugin dispatches it reaches (#252); and the shape of the ranges it appends to a user edit (#260)"
---

# Obsidian's live list renumbering

Measured 26 September 2026 on Obsidian 1.13.7 (desktop, Linux), through the e2e harness, on
`main` at `20a4418` and on the branch that closes
[#252](https://github.com/laughedelic/obsidian-true-outliner/issues/252). Outline mode on unless
a row says otherwise; "Indent using tabs" off.

## What it is

With the editor's "Smart lists" setting on (`smartIndentList`, on by default), Obsidian installs a
CM6 `transactionFilter` that renumbers the ordered list around every changed line. It returns the
transaction with a second change spec appended, `userEvent: 'input.renumber'`, so the renumbering
lands in the same transaction as the edit that caused it and joins its undo step. Read from
`app.js` in the 1.13.7 asar:

- It skips a transaction that changes no text, one annotated `set`, one whose `userEvent` is
  `input.renumber` or below it, a table cell's own, and one made during IME composition. Nothing
  else exempts a transaction, and none of those exemptions is open to a plugin: `userEvent` is read
  from the first annotation, and the table-cell annotation is private.
- It measures an item's LEVEL by counting leading tabs and four-space groups, and a `>` for each
  quote level. Three spaces are level 0. So `   1. a`, nested under `1. p` at that item's content
  column, is to this filter a sibling of `p` in the same list.
- For each changed line that is an ordered item it looks back for the previous item at the same
  level to choose the line's number, then walks forward, renumbering every following item at that
  level until one already carries the number it would get.

Because the filter reads nesting that way, it rewrites lines in a list the edit never touched. The
parser, CommonMark and Obsidian's own reading view all nest the three-column item.

## Where it fires

| Shape | Gesture | Result on `main` |
| --- | --- | --- |
| `1. p` / `   1. a┃` / `2. q` | ⏎ | `   2. ` inserted, `2. q` → `3. q` |
| `1. p` / `   1. a┃` / `   2. b` / `2. q` | ⏎ | `   3. b`, `2. q` → `4. q` |
| same | ⏎ ↑ | back to `   2. b`, but `q` stays `3. q` |
| `1. p┃` / `   1. a` / `2. q` | ⏎ | `   2. ` / `   3. a` / `4. q`: the new first child and `a` numbered as siblings of `p` |
| `1. p` / `   1. a` / `   2. b` / `2. q`, caret in `a` | move node down (command hotkey) | `   2. b` / `   3. a` / `4. q` |
| `1. p` / `   1. a┃` / `2. q` | type `x` | `   2. ax` / `3. q` |
| same, `   1. ab┃` | ⌫ | `   2. a` / `3. q` |
| `1. p` / `   1. a` / `   2. b┃` / `2. q` | type `x` | `   2. bx` (unchanged) / `3. q` |

The last three rows are ordinary typing, and they give the same result with outline mode off: it
is stock Obsidian behaviour on a document that nests an ordered list at three columns. With
outline mode off, a plain ⏎ at the end of `   1. a` gives `   2. a` / `   3. ` / `4. q`.

It does NOT fire wrongly where the nesting is a whole level to it: under `10. p` (a four-column
content column), under a four-space or tab-indented parent, or under a bullet parent (`- p` /
`  1. a` / `  2. b` / `- q`). Each ⏎ there leaves the parent list alone.

A direct `view.dispatch` of the same insertion, with no `userEvent`, with `input`,
`input.type` or `input.structure.split`, renumbers `q` the same way in both modes. So it is not
the keypress path, and not our own transaction filter.

## Which transactions it reaches

Every structural dispatch this plugin makes renumbers the runs it changes itself
(`structural-operations`, "Ordered-run renumbering"), and the filter then renumbers on top of it.
The plugin's dispatches of a planned change are four (the within-node deletions of ⌘⌫ and of a
marker's surplus spaces are typing, and are not among them): the keyboard grammar (`keymap.ts`), the
structural commands (`main.ts`'s `runOp`), a drag's drop (`zoom-click.ts`) and the removal of an
abandoned place (`provisional-cleanup.ts`). An enforcement `rewrite` is not reached: Obsidian's
filter runs before ours, so the verdict layer sees the user's edit with the renumbering already
appended, and the spec it returns replaces the whole transaction (`open-questions` Q23 measured
the same order from the other side).

## Filter order

CM6 runs transaction filters from the last facet value to the first. Obsidian's markdown editor
builds its dynamic extensions with every plugin's `registerEditorExtension` extensions first and
the renumbering filter after them (`getDynamicExtensions` in `app.js`), so at equal precedence it
runs before every plugin filter. A plugin filter registered after the plugin's others runs next,
and one wrapped in `Prec.highest` runs after all of them.

The restoration first ran at `Prec.highest`. That fixed the text but not a fold: `fold-carry`, at
default precedence, ran between Obsidian's filter and the restoration, read Obsidian's
renumbering of a folded node's hidden lines as an edit to them, and opened the fold. ⏎ at the end
of `   1. a` in `1. p` / `   1. a` / `   2. b` / `2. q` / `   1. c` / `   2. d`, with `q` folded,
kept the text and lost the fold. Registered last at default precedence instead, the restoration
runs before `fold-carry` and the enforcement funnel, and the fold stays closed (e2e
`92-fold-through-edits`).

Where our default-precedence enforcement filter sits relative to Obsidian's is read from its
effects rather than from the bundle. ⌫ at the content start of `   2. b` in `1. p` / `   1. a` /
`   2. b` / `2. q` is an enforcement merge, and gives `   1. ab` / `2. q`: had Obsidian's filter run
on the rewrite, it would have numbered the merged line `2.` as a sibling of `p`. Q23's two-range
transaction, seen by the verdict layer, is the same order.

## Known gaps

- **A block deletion across nested items** is Q23's shape: Obsidian's renumbering is appended
  before the verdict layer sees the deletion, the verdict layer declines a range that is not a
  pure deletion, and the edit passes natively. Selecting `   2. b` in `1. p` / `   1. a` /
  `   2. b` / `   3. c` / `2. q` and pressing ⌫ gives `   1. a` / blank / `   2. c` / `3. q`.
  Unchanged by the restoration, which covers only transactions this plugin planned.
  Filed as [#260](https://github.com/laughedelic/obsidian-true-outliner/issues/260), measured
  below under "The ranges it appends to a user edit".
- **A command move while zoomed** on the parent of a nested ordered list was vetoed as leaving the
  zoom: Obsidian's appended `userEvent: 'input.renumber'` is the command transaction's first one,
  so the verdict layer judges it, and the renumbering of a hidden line read as escaping the scope
  ([#259](https://github.com/laughedelic/obsidian-true-outliner/issues/259)). With the restoration
  running before the verdict layer, the escape check sees the move as planned, and the move goes
  through (e2e `80-outline-zoom`). The transaction was still classified by shape rather than
  as plugin-own, because it answered Obsidian's `input.renumber` as its `userEvent`. Since
  #260 that is read as none, and the command's transaction is `programmatic`.
- **Typing while zoomed.** A typed character in the last nested item of a zoomed parent makes
  Obsidian renumber the hidden `2. q`, and the zoom clears, as a change outside the scope clears
  it. ⏎ in the same place keeps the zoom.
- **A line count the plan does not predict.** The restoration aligns the planned and the actual
  document line by line and does nothing when their line counts differ. Obsidian's table-widget
  filter, read next to the renumbering one in `app.js`, can append a newline when a change ends at
  a table's start; a planned change that meets both would keep Obsidian's numbers. Not measured.

## After

With the plugin's planned change set carried on each of those four dispatches and a filter
running right after Obsidian's, restoring any ordered-marker number that differs from the planned document:

| Shape | Gesture | Result |
| --- | --- | --- |
| `1. p` / `   1. a┃` / `2. q` | ⏎ | `   2. ` inserted, `2. q` kept |
| `1. p` / `   1. a┃` / `   2. b` / `2. q` | ⏎ | `   2. ` / `   3. b`, `2. q` kept |
| same | ⏎ ↑ | the document before the ⏎ |
| `1. p┃` / `   1. a` / `2. q` | ⏎ | `   1. ` / `   2. a` / `2. q` |
| `1. p` / `   1. a` / `   2. b` / `2. q`, caret in `a` | move node down | `   1. b` / `   2. a` / `2. q` |
| `1. p` / `   1. a` / `2. q┃` / `3. r` | ⇥ | `   2. q` / `2. r` |
| `1. p` / `   1. a` / `   2. b┃` / `2. q` | ⇧⇥ | `2. b` / `3. q` |
| `1. p` / `    1. a┃` / `    2. b` / `2. q` (four spaces), and the same with a tab | move node down | `    1. b` / `    2. a` / `2. q` |
| `1. a` / `2. b` / `3. c` / `- x┃` | move node up | `2. b` / `- x` / `3. c`: the split run keeps its numbers |
| `1. a` / `2. b┃` / `3. c`, "Indent using tabs" on | ⇥ | `⏵1. b` / `2. c`, as on `main`. Restoring the plan alone gave `⏵2. b`, the number the spec then kept for a new list; `a-new-sublist-starts-at-one` numbers a new sublist from `1.` |

The typing rows are unchanged: those edits are not the plugin's, and
`transaction-classification` requires a within-node edit to land exactly as it would with our
filter absent. One consequence stands out: after ⏎ at the end of the LAST nested item, typing the
new item's text still turns `2. q` into `3. q`. Whether outline mode should keep Obsidian's
renumbering off typing too is a decision of its own, not made here: [#263](https://github.com/laughedelic/obsidian-true-outliner/issues/263).

## The ranges it appends to a user edit

Measured 27 September 2026 on Obsidian 1.13.7 (desktop, Linux), through the e2e harness, on
`main` at `04879ad`, for [#260](https://github.com/laughedelic/obsidian-true-outliner/issues/260).
Each transaction that reached the view was recorded by wrapping `EditorView.update`, with every
change range in start-document coordinates. Two gestures on the middle item `b`: a selection of
its whole line followed by ⌫ (outline mode's ⇧↓ gives the same selection on a tight list), and ⌫
⌫ at the end of its text, which empties it and then deletes its marker's space. Outline mode on,
unless a row says otherwise; `┆` marks a column's left edge, `⏵` a tab.

| List | Gesture | The user's range | Ranges Obsidian appends |
| --- | --- | --- | --- |
| `1. a` / `2. b` / `3. c` / `4. d` | line, ⌫ | `2. b` → nothing | `3. ` → `2. ` at ch 0, `4. ` → `3. ` at ch 0 |
| same | ⌫ ⌫ | ` ` → nothing, ch 2 | the same two |
| `1. p` / `┆  1. a` / `┆  2. b` / `┆  3. c` / `2. q` | line, ⌫ | `   2. b` → nothing | `3. ` → `2. ` at ch 3, and `2. q`'s `2. ` → `3. ` at ch 0 |
| same | ⌫ ⌫ | ` ` → nothing, ch 5 | the same two |
| the same, four spaces | line, ⌫ | `    2. b` → nothing | `3. ` → `2. ` at ch 4; `2. q` untouched |
| the same, `⏵` | ⌫ ⌫ | ` ` → nothing, ch 3 | `3. ` → `2. ` at ch 1 |
| `1) a` / `2) b` / `3) c` | line, ⌫ | `2) b` → nothing | `3) ` → `2) ` at ch 0 |
| `8. a` / `9. b` / `10. c` / `11. d` | line, ⌫ | `9. b` → nothing | `10. ` → `9. ` at ch 0, `11. ` → `10. ` at ch 0 |
| `> 1. a` / `> 2. b` / `> 3. c` | line, ⌫ | `> 2. b` → nothing | `3. ` → `1. ` at ch 2 |
| `1. a` / blank / `2. b` / blank / `3. c` | line, ⌫ | `2. b` → nothing | none |
| same, ⇧↓ selecting `2. b` and the line break after it | ⌫ | `2. b⏎` → nothing | `3. ` → `2. ` at ch 0 of `3. c` |

Outline mode off gives the same appended ranges for the same user range.

More gestures, the same way:

| List | Gesture | The user's range | Ranges Obsidian appends |
| --- | --- | --- | --- |
| `1. p` / `┆  1. ab` / `2.·` | ⌫ at the end of `ab` | `b` → nothing | `1. ` → `2. ` at ch 3 of the SAME line, and `2. ` → `3. ` at ch 0 |
| `1. ab` / `5.·` / `6. c` | ⌫ at the end of `ab` | `b` → nothing | `5. ` → `2. `, `6. ` → `3. ` |
| `1. a` / `2. b` / `3. c` | ⌘X with the caret in `b` (a linewise cut) | `2. b⏎` → nothing | `3. ` → `2. ` at ch 0 of the next line, touching the user's range |
| `1. [ ] a` / `2. [ ] b` / `3. [ ] c` | line, ⌫ | `2. [ ] b` → nothing | `3. ` → `2. ` at ch 0 |
| same | ⌫ ⌫ | ` ` → nothing, ch 6 | none |
| `1.⏵a` / `2.⏵b` / `3.⏵c` | line, ⌫, and ⌫ ⌫ | as above | none |
| `1.··a` / `2.··b` / `3.··c` | ⌫ ⌫ | ` ` → nothing, ch 3 | none |

**The shape.** Every appended range covers one line's marker number, its delimiter and the one
space after it, from the column the number starts at: past the line's indentation and any `> `.
It replaces them with a new number, the same delimiter and the same space. The number's width can
change, as `10. ` → `9. ` shows. A marker followed by a tab or by surplus spaces was never
renumbered in these gestures.

The same shape is what the filter's code writes. In 1.13.7's `app.js` it matches each line
against `/^([>\s]*)(([*+-] |(\d+)([.)] ))(?:\[(.)\] )?)?/`. It replaces the number, the
delimiter and the space, from the end of the container prefix, whenever `String(n)` differs
from the number's text. So `02. ` → `2. ` is a renumbering as well. It returns
`[tr, {changes, sequential: true, userEvent: 'input.renumber'}]`, with the changes in the
offsets of the document the user's edit produced.

**Where it sits.** An appended range can be on the line the user edited, as the typing rows of
"Where it fires" already show, and it can touch the user's range: the linewise cut ends at the
next line's start, which is where that line's marker begins. CM6's `iterChangedRanges` joins
touching ranges unless asked for them individually, so the enforcement filter received the cut as
one range, `2. b⏎3. ` → `2. `, crossing two nodes. The verdict layer read that as a type-over and
rewrote it, and on `main` the cut leaves `1. a` / `2.·`: `c` is gone.

**What the verdict layer does with it on `main`.** Every other row with an appended range reaches
`computeVerdictForRanges` as several ranges, one of which is not a pure deletion, so the whole
transaction passes. The result is the native edit plus Obsidian's numbers: the line selection
leaves an empty line where `b` was; ⌫ ⌫ leaves `2.`, a bare marker that `bare-marker-is-a-paragraph`
reads as a paragraph, with `c` beneath it. On the three-column list `2. q` becomes `3. q` as well.
The rows with nothing appended reach the layer as one range and are enforced as the same range is
anywhere else.

**Which class the appended ranges give.** Usually none, but not always. A range that stays inside
one marker crosses no node boundary, deletes no line break and inserts no block. On an empty item,
though, the marker IS the whole line, and `isExactSubtreeCoverDeletion` reads a range covering it
as an exact subtree cover without asking whether it inserts anything. In the `2.·` rows above the
appended range therefore makes a ⌫ inside `ab` `boundary-crossing-edit`. On `main` the verdict for
it is still `pass`, because the multi-range rule declines the insertion. But judging the user's
range alone under the class the appended range gave would delete the whole of `ab`. So the class
has to be computed from the user's ranges too.

**Which `userEvent` the transaction answers.** A combined transaction answers `userEvent` from
its first annotation. After a user's edit that is the user's. After a dispatch with no
`userEvent` of its own — `Editor.transaction`, which this plugin's structural commands use, or
another plugin's edit — it is Obsidian's `input.renumber`. Such a dispatch is `programmatic`
when nothing is appended, and is classified by shape when something is. A single-line deletion inside a quote, as in the
`> ` row, is `within-node-edit` and never reaches the verdict layer.
