# Enter inside a quote: a replacement the editor synthesizes around the caret

Measured 20 September 2026 against the plugin at `6d071b2` (issue #155's report, re-run), Obsidian
1.13.7 on Linux through the e2e harness, plus unit-level probes of `classify` and `computeVerdict`
over the same documents.

Issue #155 reports that with outline mode on, Enter with the caret past a quote's content start
replaces the whole quote with a single character — the one immediately before the caret — followed
by a line holding the quote's prefix. The issue rules the keyboard grammar out and points at
classification or enforcement. This note records the transaction Obsidian actually dispatches,
where that transaction leaves the funnel, the fact that separates it from the shape it was being
read as, and the two fixes that were rejected.

## The transaction

`> alpha` / `> beta`, caret at the end of `> alpha` (line 0, ch 7), Enter. Every transaction the
view applied was recorded by wrapping `EditorView.update` before the keypress.

| mode | changes (old-document offsets) | `userEvent` | result |
| --- | --- | --- | --- |
| off | `{from: 6, to: 7, insert: "a\n> "}` | `input.type` | `> alpha` / `> ` / `> beta` |
| on | `{from: 0, to: 6, insert: ""}`, `{from: 10, to: 14, insert: ""}` | `input.paste.structural` | `a` / `> ` |

The stock keypress is not an insertion. Obsidian's continuation REPLACES the character before the
caret with that character, a line break and the quote's `> ` — one change of one character, whose
inserted text begins with the character it removed. Nothing in the plugin runs before it: the
grammar declines Enter on an atom, and the only handler ahead of stock behaviour in that path,
`advanceFromEmptyPlace`, returns without dispatching because the caret is on a content line.

With the mode on, the funnel classified that change `boundary-crossing-edit` and the verdict layer
rewrote it (`verdictCounts: {rewrite: 1}`). What it dispatched instead is the second row: the
quote's lines deleted and `a` plus `> ` left in their place.

## Where it goes

`classify` has four rules that admit a change whose line span stays inside one node. The one that
fires is `isMultiBlockInsertion`, written for a paste: an inserted text that parses as a structural
block sequence, landing on a node's own line. `a\n> ` parses as a paragraph and a quote — two
blocks — and the rule checked only that the change stayed on one line, never that nothing was
deleted, although its own comment describes "a pure insertion (nothing deleted)".

Classified as boundary-crossing, the change reaches `computeVerdict` with `from ≠ to`, so it is
not the paste path but the deletion path. `recognizeMergeIntent` declines it (its inserted text is
not empty), and `computeDeletionVerdict` hands the one-character range to `coverGroupsOf`, which
ESCALATES a range inside one node to that node's whole subtree — the rule written so that a stale
mid-node selection deletes the same cover an escalated one does. `composeTypeOver` then deletes the
quote and splices in `parse("a\n> ")`: a paragraph `a` and an empty quote. That is the reported
document exactly, and it explains which character survives — the one Obsidian re-inserted.

Every row of the issue's table, driven through both gates at unit level with the transaction shape
measured above:

| gesture | change | inserted text parses as | class | verdict |
| --- | --- | --- | --- | --- |
| Enter at the end of `> alpha` | `a` → `a\n> ` | 2 blocks | `boundary-crossing-edit` | `rewrite` → `a` / `> ` |
| Enter in `> al┃pha` | `l` → `l\n> ` | 2 blocks | `boundary-crossing-edit` | `rewrite` → `l` / `> ` |
| Enter at the content start `> ┃alpha` | ` ` → ` \n> ` | 1 block | `within-node-edit` | pass |
| Enter at column 0 | `` → `\n` | 0 blocks | `within-node-edit` | pass |
| Enter at the end of `> beta` | `a` → `a\n> ` | 2 blocks | `boundary-crossing-edit` | `rewrite` → `a` / `> ` |
| Shift+Enter at the end of `> alpha` | `a` → `a\n` | 1 block | `within-node-edit` | pass |
| `x` typed at the end of `> alpha` | `` → `x` | 1 block | `within-node-edit` | pass |
| Enter at the end of a callout's body | `y` → `y\n> ` | 2 blocks | `boundary-crossing-edit` | `rewrite` → `y` / `> ` |
| Enter at the end of `> ⏵- nested` | `d` → `d\n> ⏵- ` | 2 blocks | `boundary-crossing-edit` | `rewrite` → `d` / `> ⏵- ` |
| Enter inside a code fence | `e` → `e\n` | 1 block | `within-node-edit` | pass |

The five destroying rows and the five correct ones fall exactly where the issue measured them, and
the split is the block count: a continuation that re-inserts the removed character and adds a
`> ` prefix parses as two blocks, and one that adds only a line break does not. The asymmetry the
issue flags between Enter and Shift+Enter is not in the grammar, which declines both identically;
it is that Shift+Enter's stock continuation carries no prefix.

## The same reading, reached by paste

The rule was written for pastes, and a paste can reach the same path. A structural payload pasted
over a selected WORD inside one node — a change on one line with `from ≠ to` — classifies through
the same rule and takes the same deletion path:

| gesture | class | verdict |
| --- | --- | --- |
| `alpha` selected in `> alpha` / `> beta`, paste `One.` / `` / `Two.` | `boundary-crossing-edit` | `rewrite` → `One.` / `` / `Two.` — the quote is gone |
| `para` selected in `First para.` / `` / `Second.`, paste the same | `boundary-crossing-edit` | `rewrite` → `One.` / `` / `Two.` / `` / `Second.` — `First ` and `.` are gone |

Here the user did select something, and `paste-lands-where-it-is-pointed` (#122) pins this shape
as a type-over: `tests/enforce.test.ts`'s "the insertion path does not change the answer" pastes a
section over a one-character selection inside `- a` and requires the same rewrite a caret paste
produces. The escalation from a partial range to the whole node is that change's decision, and this
note does not reopen it. What separates #155 from it is that no selection was ever made.

## The fact that separates them

The transaction carries it: `tr.startState.selection.main.empty`. Obsidian's continuation runs
from a caret, a type-over from a range. A replacement whose pre-edit selection was EMPTY is the
editor rewriting text around the caret, and the block sequence its inserted text parses to was
never pasted or typed over anything.

`classify` already takes one pre-edit selection fact from the adapter, `cursorBefore`, for the
chrome-boundary deletion shapes. This adds a second, `emptySelectionBefore`, read by exactly one
rule: `isMultiBlockInsertion` declines a change that deletes something when the selection before
it was empty. A pure insertion at a caret is unchanged — a paste at a caret is still a paste — and
a replacement over a range keeps its type-over reading. Callers that do not supply the fact keep
today's behaviour, which is what every pre-existing unit test exercises.

Re-driven through both gates with the fact supplied, every destroying row above passes, and the
same bytes handed in with a non-empty selection still produce the `a` / `> ` rewrite — which is the
negative control the tests keep. Against the real app, the on-mode buffer and caret after Enter are
byte-identical to the off-mode ones for the quote, the mid-line case, the callout and the list
inside a quote, with no rewrite verdict recorded.

Issue #115 names the same fact — "require a non-empty selection before the edit" — as one of two
candidate discriminators for a different shape, a caret-derived "delete to line start" whose range
happens to cover a whole paragraph. The fact is now available to that rule too; wiring it there is
that issue's change, since it changes what an exact cover means, and this note leaves it alone.

## Two fixes rejected

**Requiring a pure insertion**, as the rule's own comment describes. It closes #155 and every row
above, but it also turns the word-selection pastes in the previous section into native pastes —
reversing the type-over reading #122 pinned two days ago, in a test that would have to be
rewritten. The selection fact keeps that decision where it is.

**Minimizing the change before classifying it** — trimming the prefix the deleted and inserted
texts share, so `a` → `a\n> ` becomes an insertion of `\n> ` after `a`. It reads the continuation
as what it is, but it is unsafe for a real type-over: `R` typed over a selection that itself begins
with `R` trims to a deletion of the rest, the deletion path escalates that to the covered nodes,
and the typed `R` is gone with them. A minimization that can lose a keystroke is worse than the
defect.

## What this does not cover

A caret-originated replacement that crosses a boundary by span, or exactly covers a subtree, is
still boundary-crossing: the fact narrows one rule and nothing before it. And the escalation of a
partial in-node range to the whole node inside `computeDeletionVerdict` is untouched, so a
one-character SELECTION typed over with structural text still replaces the node it sits in, as #122
decided.
