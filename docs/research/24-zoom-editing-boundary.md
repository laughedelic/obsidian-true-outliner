# Editing at the zoom boundary: what the shipped feature actually does

`outline-zoom` shipped with the structural-command layer taught about the scope and the
text-editing layer not taught about it at all. This note measures the whole boundary — every
gesture that can reach past the visible range — and separates what is a zoom defect from what
the editor already did before zoom existed.

**Measured 8 September 2026**, Obsidian 1.13.7 (installer 1.5.8, macOS), against the feature as
merged in PR #69, driven from a throwaway `99-zoom-edit-probe.e2e.ts` in three rounds. Round 2
ran every gesture twice — once zoomed, once not — so a row that differs is a zoom row and a row
that matches is base behaviour. Round 4 patched `EditorView.update` to record each dispatched
transaction's changed ranges alongside the visible bounds, which is what turned a symptom into a
mechanism.

## Verdict: two defects, and they are cleanly separable

1. **Escaping user edits are applied, then the zoom silently exits.** A Backspace at the zoom
   root's content start merges the root into the node above it — a node the user cannot see —
   and the view drops back to the whole document with no cue. Seven distinct gestures do this.
2. **In-scope edits at the tail of the scope also exit.** Enter or a structural paste that
   appends a new last child of the zoom root is dispatched at the first HIDDEN line's start, so
   the exit trigger counts it as outside and clears a zoom that had no reason to end.

The two share one root cause: the only thing standing between an edit and the scope is
`zoom-state.ts`'s trigger 2, an offset comparison in the BEFORE state, and it is being asked a
question it cannot answer. Whether an edit escapes is a fact about the AFTER state's tree.

## The fixtures

```
LIST                      HEAD                      PARA
- alpha                   # One                     first para
- beta                                              
  - beta child            para one                  second para
- gamma                                             
                          ## Two                    third para
                          
                          para two
                          
                          ## Three
                          
                          para three
```

Zoom roots: `- beta` (children, hidden siblings both sides), `- alpha` (childless, first node),
`- gamma` (childless, last node), `## Two` (a section whose cover ends on a trailing gap line),
`second para` (childless paragraph with hidden siblings both sides).

## Defect 1: escaping edits are applied and the zoom disappears

Every row below changed the document, cleared the zoom, and showed no cue. The `[UNZOOMED]`
column is the same gesture with no zoom active.

| # | Gesture | Result | Same unzoomed? |
| --- | --- | --- | --- |
| A1 | Backspace at `- beta`'s content start | `- alphabeta` — the root is merged into the hidden node above | yes |
| A3 | Backspace at `second para`'s content start | `first parasecond para` | yes |
| R7 | Mod-Backspace at `- beta`'s content start | `- beta`'s text deleted, marker gone, line left blank | — |
| R8 | Backspace at `para two`'s content start, zoomed to `para two` | `## Twopara two` — merged into its own hidden PARENT | — |
| B1 | Delete at the end of the last visible line | `  - beta childgamma` — the hidden next sibling is pulled in | yes |
| B4 | Delete at the end of `second para` | `second parathird para` | yes |
| B5 | Delete twice at the trailing edge | the second keystroke eats characters out of the pulled-in hidden node | — |
| G1 | Paste `- p\n  - q` at the root's content start | spliced as a TOP-LEVEL sibling after the root's subtree | yes |

The unzoomed column is the finding, not a control that happened to be run: **the zoomed and
unzoomed results are byte-identical**. Nothing in the edit path knows a scope exists.

Two shapes are protected today, and neither is protected by zoom:

| # | Gesture | Result | Why it is refused |
| --- | --- | --- | --- |
| A4 | Backspace at the content start of a root that is the document's FIRST node | unchanged, cue "Nothing here to join with." | `node-edit-enforcement`'s first-node veto |
| B3 | Delete at the end of a heading section's last line | unchanged, cue "These blocks can't be joined into one." | a paragraph cannot merge into a following heading |

B3 is worth stating precisely because it is easy to mistake for coverage: a heading root's
trailing neighbour is always another heading, so markdown's own algebra refuses the merge. A
heading root is therefore accidentally safe at its trailing edge and fully exposed at its
leading one (R8).

### The root can also be dissolved from inside the scope

| # | Gesture | Result | Zoom after |
| --- | --- | --- | --- |
| R4 | Backspace five times on `- beta` — four to empty it, one more | the root is unwrapped; `  - beta child` re-parents under `- alpha` | **still active**, now rooted at `  - beta child` |
| E1 | Mod-A three times, then Backspace | the root's whole subtree is deleted | cleared |
| E2 | Select the root's subtree and Backspace | same | cleared |

R4 is the worst of the set. The zoom root stopped existing, a DIFFERENT node inherited the
anchor, and the trail kept rendering as though nothing happened. `stillRooted` asks whether some
node starts at the anchor, not whether it is the same node, and after an unwrap the answer is
yes for the wrong reason. `zoom.ts`'s `reresolveZoom` comment already names this imprecision and
accepts it on the grounds that the state-level exit trigger catches a vanished root on the next
dispatch; R4 is the case where it does not.

E1 and E2 behave as `outline-zoom` specifies ("Deleting the zoom root exits the zoom"). Whether
that is what we WANT is a design question, not a defect — see the reference apps below.

## Defect 2: in-scope appends exit the zoom too

Round 4 recorded the dispatched changed ranges against the visible bounds
(`zoom-scope.ts`'s resolver: first visible line's `from`, last visible line's `to`).

| # | Gesture | Bounds | Changed range | Structurally in scope? | Zoom after |
| --- | --- | --- | --- | --- | --- |
| X5 | type `X` into the root | 8–29 | 14–14 | yes | kept |
| X6 | Enter in the MIDDLE of a child's text | 17–34 | 29–30 | yes | kept |
| X1 | Enter at the END of `para two` | 17–34 | **35–35** | yes — a new paragraph inside `## Two` | **cleared** |
| X2 | Enter at the end of the last visible line | 8–29 | **30–30** | yes — a new child of `- beta` | **cleared** |
| X3 | Paste a block at the end of `para two` | 17–34 | **35–35** | yes | **cleared** |
| X4 | Backspace at the root's content start | 8–29 | **7–10** | no | cleared (correctly detected) |
| R6 | Delete on the cover's own trailing gap line | 17–34 | 34–35 | yes — only the cover's own gap goes | **cleared** |

The arithmetic is exact and it is the same class of error `docs/research/23` found on the
hiding decorations, one layer over. `bounds.to` is the last visible line's END, before its
newline. Appending a line after the last visible line necessarily inserts at `bounds.to + 1` —
the first HIDDEN line's start — because that is where the text goes. `touchesOutside` tests
`toA > bounds.to`, so every append at the tail of the scope is outside by exactly one position.

R6 is the same defect wearing a different hat, and it took a second reading to classify: the
only thing that keystroke removes is the blank line the cover itself owns (`outline-zoom` D3
includes the trailing gap on purpose). Nothing hidden changes, and the zoom clears anyway.

X1 shows the trailing gap does not rescue it: `## Two`'s cover ends on the empty line 7, and the
insertion still lands at 35, one past it. There is no cover shape for which a tail append is
inside these bounds.

Widening the bounds by one is not the fix, and X2 is the counter-example: inserting `  - ` at
offset 30 makes a child of the zoom root, and inserting `- p` at the SAME offset makes a
top-level sibling. One offset, two structural answers. **An offset comparison in the before-state
cannot decide this question at all.** The fact being asked about is whether the changed content
lands inside the zoom root's subtree in the AFTER state, which is a question about the re-parsed
tree.

## What is already right

The structural-command layer is correct and needs nothing. Each of these is refused with no
document change and the cue "That would move it outside the zoomed view":

| Gesture | |
| --- | --- |
| Outdent a direct child of the root | `zoom.ts`'s `operandEscapes` |
| Outdent, indent, or move the root itself | same |
| Enter at the end of a CHILDLESS root | `zoom.ts`'s `splitEscapes` |
| Enter at a root's content start | same |
| Enter mid-text of a childless non-heading root | same |

So does undo of an in-scope edit (H1: the zoom survives), and so do the ordinary in-scope edits —
typing into the root, emptying it of text, Backspace at a child's content start merging it into
the root.

## A defect this pass found that has nothing to do with zoom

Backspace at a heading's first content character deletes one `#` instead of vetoing. `## Two`
with the caret at ch 3 became `##Two` — no longer a heading, and no cue — **identically with and
without a zoom active**. `node-edit-enforcement` states the opposite:

> Scenario: Structure-corrupting merge is vetoed — Backspace at the first character of a heading
> → the document is unchanged and the rejection cue is shown

Zoomed, the consequence is worse: the scope silently collapses onto the one line, because a
`##Two` paragraph has no section to own. But the edit itself is a base-behaviour defect and
belongs in its own change, not in this one.

## What the reference apps do

**Logseq** is the strongest reference, because its rules are readable in source rather than
inferred from a UI. Zooming into a block redirects to a page whose root IS that block, so the
zoom root is rendered as a page title and not as an editable row in the list. On that "focused
root block":

- `delete-block-when-zero-pos!` checks `root-block?` and refuses — Backspace at position zero of
  the zoomed block does nothing;
- `block-eligible-for-indent-outdent?` and `block-eligible-for-move-up-down?` both check
  `focused-root-block?` and refuse, with a regression test named
  `focused-root-block-cannot-indent-or-move-test`.

**Workflowy** reaches the same place from the other direction: a zoomed item's title is a
distinct UI element (its own release notes call it "the zoomed item title"), and Backspace is
never a delete gesture for an item at all — deleting a bullet is a menu action or
Ctrl/Cmd+Shift+Backspace. Read from help pages and release notes rather than source, so treat it
as corroboration of the pattern rather than as a precise rule.

**obsidian-zoom** — the closest prior art, same platform, same hiding primitive — does exactly
what we do today. `ResetZoomWhenVisibleContentBoundariesViolatedFeature` watches for a
transaction that touches both hidden and visible content and responds by zooming OUT. It confines
selection with a transaction filter but never refuses an edit. So our current behaviour is not
an oversight relative to the Obsidian ecosystem; it is the ecosystem's ceiling, and it is below
what the reference outliners do.

The pattern across all three: **the zoom root is not an ordinary row while it is the root.** Its
boundary gestures are inert rather than destructive, and the user leaves the scope by navigating
out of it, never by editing their way out of it accidentally.

## Consequences for the change

1. **Judge the after-state, and judge it as "did anything outside the subtree change".** Every
   attempt to state the rule as a comparison of changed OFFSETS against the cover fails on some
   row of these tables: X2 defeats a before-state test (one offset, two structural answers), B1
   defeats an after-state offset test (the changed range is a single newline, and a whole hidden
   node is absorbed by it), and every append defeats a cover whose end does not include its own
   terminating line break. The formulation that survives all of them is the invariant itself —
   the text outside the zoom root's subtree is byte-identical before and after, nothing inserted
   lands outside the root's new cover, and the anchor still names the same node.
2. **Refuse escaping user edits rather than exiting.** The typed-rejection path and the
   `would-leave-zoom-scope` reason both already exist and are already used by the structural
   layer. The edit layer should share them, so the two entry points agree by construction — the
   same argument `outline-zoom` already makes for the keyboard and the palette.
3. **Keep the silent exit for what it was built for.** Trigger 2 is the catch-all for changes
   that never pass enforcement: history transactions, sync, another pane. It stops being the
   primary answer for user edits and stays the fallback for foreign ones.
4. **Identity, not "some node starts here".** R4 needs the surviving root to be the SAME node,
   which `stillRooted` does not currently ask.
5. **Deleting the root deliberately is a design decision, not a defect.** E1/E2 do what the spec
   says. Logseq would refuse both; the alternative is to keep the exit for an explicit
   whole-subtree deletion while refusing the accidental dissolutions (R4). Either is defensible
   and the change has to pick one.
6. **The heading-merge veto defect is out of scope** and goes to its own change.
