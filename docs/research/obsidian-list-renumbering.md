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

CM6 runs transaction filters from the last facet value to the first, so a filter wrapped in
`Prec.highest` runs after every filter of default precedence. Measured: a `Prec.highest` filter
registered by the plugin sees the transaction with Obsidian's renumbering already merged in, and
a change it appends with `sequential: true` lands after it.

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
  Filed as [#260](https://github.com/laughedelic/obsidian-true-outliner/issues/260).
- **A command move while zoomed** on the parent of a nested ordered list is vetoed as leaving the
  zoom: Obsidian's appended `userEvent: 'input.renumber'` is the command transaction's first one,
  so the verdict layer judges it, and the renumbering of a hidden line escapes the scope. Filed as
  [#259](https://github.com/laughedelic/obsidian-true-outliner/issues/259).
- **Typing while zoomed.** A typed character in the last nested item of a zoomed parent makes
  Obsidian renumber the hidden `2. q`, and the zoom clears, as a change outside the scope clears
  it. ⏎ in the same place keeps the zoom.
- **A line count the plan does not predict.** The restoration aligns the planned and the actual
  document line by line and does nothing when their line counts differ. Obsidian's table-widget
  filter, read next to the renumbering one in `app.js`, can append a newline when a change ends at
  a table's start; a planned change that meets both would keep Obsidian's numbers. Not measured.

## After

With the plugin's planned change set carried on each of those four dispatches and a
`Prec.highest` filter restoring any ordered-marker number that differs from the planned document:

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
