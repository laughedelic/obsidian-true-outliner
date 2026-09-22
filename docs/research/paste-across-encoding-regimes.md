# Paste across encoding regimes

A heading section cut from one note and pasted into a list mangles. Reported from real-vault
use on 2026-07-25, filed as `paste-heading-section-reencoding`, and described there as "the
heading becomes a list item and loses its `#` markers, while the section's other blocks land at
inconsistent depths". The change was written from that description alone and left its central
decision open pending worked examples. This note is those examples: twenty-eight paste shapes
driven through the real verdict path, with what each one produces.

The report is accurate, and it is one of five distinct defects. It is also not the one that
reaches a user most often, and the shape that produces it is not the shape the change's design
assumed.

## What the paste path is

A paste never reaches one insertion point. It reaches one of three, and they do not agree.

| Path | Reached by | Guard | On a rejection |
| --- | --- | --- | --- |
| `insertSubtrees` (`ops.ts`) | a caret paste (`computePasteVerdict`, `enforce.ts:478`) | heading-anywhere and atom-under-paragraph, `ops.ts:2058-2065` | **native pass** (`enforce.ts:479`) |
| `insertSubtrees` (`ops.ts`) | a type-over with a surviving sibling (`deleteAndSplice`) | the same | **veto**, with the "Markdown can't express that content here" notice (`enforce.ts:381`) |
| `insertAsOnlyChildren` (`enforce.ts:291`) | a type-over that consumed every node in its scope | **none** — it calls `reencodeBlocksForDestination` directly | n/a |

The third path is the one D16 built during `minimal-changesets-for-structural-ops`, to stop a
replacement paste landing un-reindented. It reuses the shared re-encode step, exactly as D16
intended, but the expressibility guard does not live in that step — it lives one layer up, in
`insertSubtrees`. So the guard is simply absent from a third of the paste surface.

## Method

`docs/research/prototypes/paste-probe/paste-probe.ts.txt` drives each shape through
`classify` and then `computeVerdict`, the same two gates the transaction filter uses, and
records the class, the verdict and the resulting buffer. A `pass` verdict is Obsidian's own raw
insertion, so the probe applies that insertion itself — otherwise a native fall-through shows up
as nothing happening rather than as the text it actually writes. Each result is re-parsed and the
tree printed, because several of the failures are invisible in the buffer and only appear in what
the buffer means.

The payload is held fixed wherever possible — `## Section` with a paragraph and a nested list —
so the destination is the only variable.

## Caret pastes

| # | Payload root | Destination | Verdict | Result |
| --- | --- | --- | --- | --- |
| 1 | `## H` section | top-level list, anchor has a following sibling | rewrite | the following sibling is **absorbed** into the pasted section |
| 2 | `## H` section | list item under a list item | **pass** | raw text: the payload's first line is concatenated onto the anchor's |
| 3 | list subtree | heading section, after a paragraph | rewrite | correct |
| 4 | `## H` section | under an `###` | rewrite | lands as a sibling of the `##`, **two levels up** |
| 5 | code + list | children of a paragraph | **pass** | raw text |
| 6 | paragraph subtree | top-level list | rewrite | correct (control) |
| 7 | setext section | top-level list | rewrite | absorbed; **stays setext** |
| 8 | `##` with an `###` subsection | top-level list | rewrite | absorbed |
| 9 | `## H` section | root, between two `#` sections | rewrite | correct |
| 10 | `## H` section | after the last sibling | rewrite | correct |
| 11 | paragraph then `## H` | top-level list | rewrite | the paragraph converts, the heading does not; absorbed |
| 12 | `## H` section | empty list item (replaced) | rewrite | absorbed |
| 13 | code + list | nested list | rewrite | correct |
| 14 | callout + list | nested list | rewrite | correct |
| 15 | `## H` section | list under a heading | rewrite | absorbed |
| 16 | `## H` section | tab-indented nested list | **pass** | raw text |
| 17 | `---` + text | top-level list | rewrite | correct |
| 18 | ordered subtree | ordered run | rewrite | correct, renumbered |
| 19 | `---` + text | after a paragraph | rewrite | correct, gap normalized |
| 20 | `#` section | under an `#####` | rewrite | lands at **root** |
| 21 | single `##` subtree | mid-paragraph at root | rewrite | the following paragraph is absorbed |
| 22 | list subtree | heading section | rewrite | correct |
| 23 | `## H` section | depth-2 list under a heading | **pass** | raw text |

## Type-overs

The same payloads pasted over a selection, which is how the other two insert paths are reached.

| # | Shape | Path | Verdict | Result |
| --- | --- | --- | --- | --- |
| T1 | `## H` section over the sole child of a nested item | `insertAsOnlyChildren` | rewrite | the heading is **indented to column 4** and swallowed as a continuation line |
| T2 | `## H` section over a top-level item with survivors | `insertSubtrees` | rewrite | absorbed |
| T3 | code block over the sole list child of a paragraph | `insertAsOnlyChildren` | rewrite | the atom lands at the root column, outside the paragraph |
| T4 | `## H` section over a nested item with a surviving sibling | `insertSubtrees` | **veto** | nothing happens; the notice is shown |
| T5 | the same shape, caret instead of selection | `insertSubtrees` | **pass** | raw text |

T4 and T5 differ only in whether a character was selected. One refuses and says so; the other
corrupts the buffer silently.

## The five defects

### P0. The reported defect: a heading re-indented out of existence

T1 is the original report, reproduced. `reencodeBlocksForDestination` re-indents every block for
the destination, and for a heading that is meaningless — a heading's depth is its `#` count, and
its leading whitespace is chrome markdown allows up to three columns of. Re-indented to column 4
the line stops being a heading: our parser reads it as a continuation line of the anchor's parent,
so `## Section` ends up inside `  - two`'s own text. The buffer still round-trips byte-identically;
it simply encodes a different tree, one with no heading in it.

That is precisely "the heading becomes a list item and loses its `#` markers", one level of
indirection away from how it was described. Its descendants land at the destination column while
the heading that should have scoped them does not exist, which is the rest of the report.

It reaches a user through a type-over into a scope with no other content — which, pasting over
a freshly-created item or over the only child of a node, is an ordinary move.

### P1. A pasted heading absorbs the destination's following siblings

Cases 1, 7, 8, 11, 12, 15, 21 and T2. Where the payload *is* expressible — root scope or a
heading's children — the heading is spliced in verbatim, and a heading's section runs to the next
heading of its level or shallower. Every sibling that followed the anchor is therefore inside the
pasted section now:

```
- one
- two            <- caret here
- three
```

pasting `## Section` / `A paragraph.` / `- alpha` / `  - beta` gives

```
- list-item: - one
- list-item: - two
- h2: ## Section
  - paragraph: A paragraph.
    - list-item: - alpha
      - list-item:   - beta
    - list-item: - three      <- was a top-level sibling
```

`- three` was never copied, never selected and never pointed at. The existing guarantee covers
the payload's own relative nesting; nothing states that a paste must leave the *destination's*
nesting alone, and so nothing does.

Case 10 is the same paste with the caret on the last sibling: nothing follows, nothing is
absorbed, the result is right. The defect is entirely about what sits after the anchor.

### P2. An inexpressible payload falls through to a raw insertion

Cases 2, 5, 16, 23 and T5. `insertSubtrees` rejects a heading-bearing payload below a list item
and an atom below a paragraph, correctly — markdown cannot express either. `computePasteVerdict`
turns that rejection into `PASS`, on the stated principle that "a wrong pass is editable text; a
wrong rewrite is surprising relocation".

The principle does not hold on this path. What lands is not editable text: the payload's first
line is concatenated onto the anchor's line (`    - three## Section`), the rest lands at the
payload's own original indentation, and the re-parse reads a tree that resembles neither
document. Recovering by hand means finding a merged line and re-indenting a dozen others.

This is the defect most users meet, because pasting into a nested list is the common case and
every nested list item is a list item's child.

### P3. A heading payload's levels are never re-derived

Cases 4 and 20. The re-encode step re-indents and can convert between paragraph and list item.
It has no arm for a heading, so a heading payload keeps the levels it was written with, and its
depth at the destination is whatever those levels imply. Pasting a `##` section under an `###`
puts it two levels up; pasting a `#` section under an `#####` puts it at root, five levels from
where the caret was.

This one is *not* a cross-regime problem. Both sides are headings. The change's framing —
"a payload crossing between the heading regime and the list regime" — does not reach it.

### P4. A setext heading payload stays setext

Case 7. `headingWithLevel` rewrites setext to ATX whenever a level changes, and is never called
on the paste path. Minor on its own, and it disappears once P3 is fixed, since re-levelling routes
through that function.

## What the measurement settles

Four things the change treats as open, or as work, turn out not to be.

**The reverse direction needs no rule.** The change asks whether a list-rooted payload pasted into
a heading scope needs its own rule or falls out of the same one. Cases 3 and 22 show it already
works: `encodingKindAtDestination` gives the root the destination's content encoding, the
descendants keep theirs, and the result is a paragraph with a list beneath it — the attachment rule
doing exactly what it is for. Nothing has to become a heading, because headings are only ever
created by the heading regime's own operations. There is no symmetric problem to solve.

**Atoms compose, except under a paragraph.** The design flags callouts, code blocks and tables as
"exactly the sort of assumption that has failed twice on this path". Measured (13, 14, 17, 19),
they move as opaque units and land at the right column. The one atom failure is T3, which is P0's
missing guard rather than anything about atoms — and its caret twin, case 5, is P2.

**Ordered runs already renumber.** Case 18: a payload numbered `5.` pasted into a `1. 2. 3.` run
lands as `3.` and pushes the old third item to `4.`. `renumberOrderedAgainst` covers this.

**Gap normalization already prevents the setext trap.** Case 19 pastes `---` directly after a
paragraph, where an adjacent thematic break would read as a setext underline and silently turn
that paragraph into a heading. `normalizeBoundaries` inserts the blank line and it does not
happen.

## The decision the fix needs

P0, P2 and P4 are defects with no policy in them: a guard belongs in the shared step rather than
one layer up, a rejection on a paste should not become a raw insertion, and a heading that is
being rewritten anyway should be rewritten as ATX. P3 has one obvious reading — a heading payload
re-levels so its root sits at the destination's depth, every heading in it shifting by the same
delta; where the deepest heading in the payload would pass h6 the paste is refused, which
implementation settled — see the addendum below.

P1 and the destination P2 leaves behind are the real question, and it is one question, not two:
**what does a heading-rooted payload mean somewhere a heading cannot mean what it says?**

### Decided (2026-09-16): the destination's depth determines the encoding

A paste replants a subtree at the level the caret names. The subtree takes whatever encoding that
level permits and keeps its own relative hierarchy. Node kinds are the accidental specifics of
how markdown spells a tree; the tree is what we preserve.

This is not a new rule — it is `Context-determined encoding on reparent` (Q2 follow-up #3) with
the heading arm it never needed before, because no reparenting operation could reach a heading.
A paste can. Two arms follow from the one rule:

- **Into a heading-bearing scope**, the payload stays headings and re-levels to the destination's
  depth. P1's absorption is then accepted as what a section at that level means.
- **Into a list scope**, every node in the payload that has children becomes a list item.

The second arm is forced rather than chosen. Measured against the parser: below a list item a
paragraph has no expressible children at any indentation — 2, 3, 4, 5 and 6 columns all land the
list as the paragraph's sibling — because the attachment rule is applied at section level only
(`parse.ts:406`). Converting the root alone and re-indenting the rest loses a level of the
payload's tree. Exactly one encoding preserves it.

The caret is the whole interface. A caret at a heading level asks for a section there; a caret
inside a list asks for the subtree replanted there. Both requests are legible from where the
caret is, so neither needs a mode or a prompt.

### The `#` run rides along

A converted heading keeps its own `#` run as its list item's text: `## Notes` becomes
`- ## Notes`, not `- Notes`.

`- ## Notes` is a list item containing an `h2` — canonical CommonMark, not an Obsidian
extension — and Obsidian renders it with heading styling. Our own `contentColumnCh` already
matches an optional `#{1,6}` run after an optional list marker, so the content column of
`- ## Notes` is 5 and the caret machinery needs no change.

What it buys is reversibility. Measured: outdenting the converted item back to a heading scope
strips the marker, and `## Notes` re-parses as a real `h2` with its children intact. The rank
survives the round trip, so the lossiness that made this arm expensive to choose largely
disappears. The `h6` bound does not reach this direction at all — inside a list the run is
text, and text has no bound.

Paragraph-ness is the part genuinely lost: there is no marker to carry it. Paragraph/list-item
conversion is what the context-determined rule already does everywhere else.

### What absorption costs, measured

Two properties make P1 affordable at a heading level.

It is **bounded by the destination scope**: the enclosing heading's next sibling is shallower
than any level the payload can be re-levelled to, so it ends the inserted section. Measured, an
`h4` pasted under an `### Three` absorbs the paragraph that follows it and stops at `### Four`.

It is **visible**: the absorbed content is drawn nested under the pasted node before anything
else happens.

Two costs stay on the record. At the root of a note with no headings there is no scope end, so
everything below the caret is absorbed — measured, a whole flat note becomes one section's
children. And paste-then-cut is not the identity there: cutting the pasted section back out
takes the absorbed content with it, because that content is inside the section now.

**The magnitude on a real note** (task 2.1). `test-vault/Journal/2026-07-08.md` is a heading-less
journal entry: 20 lines, 13 nodes, five of them at the root. Pasting the `## Aurora review`
section — 7 nodes — with the caret at the end of its first paragraph re-levels the payload to
`# Aurora review` and takes the remaining 12 nodes into it. Every node in the note but the one
the caret sat on is inside the pasted section, and the root goes from five children to two.

The other half of the magnitude is what does NOT happen. The verdict is ONE edit, a pure
insertion of the payload's 14 lines at the boundary after the caret's paragraph: no existing line
is rewritten, re-indented or moved. The reparenting is the outline's reading of bytes that did
not change, and one undo takes the insertion back out. So the cost is a view that draws the rest
of the note under the pasted heading until a heading of the user's own ends the section — not
content the paste has taken away.

That is what makes the unbounded case acceptable where a rewrite of the same magnitude would not
be. It is also why the risk stays on the record rather than closing: the outline is what the user
edits through, and a section that swallows the note is wrong-looking even when every byte is
intact.

### What the options would have cost

Kept for the record, since the decision reads as obvious only with them in view.

**Preserve, landing where it fits.** The section stays headings and lands at the nearest
absorption-free position — in practice the end of the enclosing scope's children. Nothing lost,
nothing reparented, and the content lands somewhere other than where it was pointed, sometimes a
screen away.

**Reject.** The paste is vetoed with the existing cue. It is what a type-over over a surviving
sibling already does, so the machinery is there and it costs a one-line change. Never wrong, and
it makes an ordinary editing move impossible; the workaround is to leave outline mode, which is
a poor answer for something this common.

Reject survives for exactly one case under the decision: an atom below a paragraph, which has no
encoding in either regime.

## Where this meets the other open work

**Drag and drop.** A dropped subtree lands through the same re-encode step, and
`node-edit-enforcement` already words its structural-paste requirement as "a paste or text drop".
Whatever rule is chosen here is the rule a drop needs, and fixing it once covers both — provided
the guard has moved into the shared step first, per P0, since a drop that replaces a scope's only
content takes the same unguarded path a type-over does.

**Q34, the attachment rule.** Case 3's result — a list payload landing as a paragraph with a list
beneath it — is the attachment rule at work. If Q34 ever revises that rule, the reverse direction
stops being settled and comes back here. The list arm above leans on it twice over: it is why a
paragraph below a list item has no children, and so why the conversion must reach every node.

## Addendum (implementation): where the heading regime runs out

The decision above left one case to implementation, and implementation found the obvious answer
wrong twice before the codebase's own answer turned up.

A heading payload whose deepest heading would need a level past `h6` has no encoding that keeps
its tree. **Clamping** — the first reading — puts two of the payload's levels onto one.
**Converting to content**, which works below a list item, was measured at section level and does
not: a payload of `# Top` with a `body` paragraph and a `## Mid` sibling came out with `- ## Mid`
landing as a CHILD of `body`, because a list following a paragraph is that paragraph's children.
The conversion arm is safe exactly where it is used — below a list item or a paragraph, where the
attachment rule does not reach — and unsafe where the heading arm would have needed it.

`indent` already refuses this shape, with `at-h6-bound`, reading the subtree's deepest heading
rather than its root (`ops.ts`). The paste now refuses it identically. That is the unifying
principle's other branch, and it costs nothing the rest of the change wanted.

A destination already at `h6` is the same case by the same arithmetic: its children have no
heading level left.

## Addendum (review round): four defects the implementation's own tests could not see

An independent review of the implementation, run with no access to the reasoning behind it,
found two node-losing defects and the reason neither was caught. Recorded here because the
reason generalizes.

### The closure property was tautological

`finalize` returns `doc: parse(encode(surgery))` — the operation's own result is already the
re-parse. So `treesEqual(result.doc, parse(encode(result.doc)))`, which is how
`insertSubtrees` closure had been asserted, re-checks the encode/parse round trip and can never
fail on a surgery the re-parse reads differently. That is precisely the failure that matters,
and the assertion was blind to it. The three older property tests over the structural ops share
the shape.

What replaced it is a property that CAN fail: every node the payload carried is still a node
afterwards. Absorption reparents without adding or removing, so the node-count delta equals the
payload's own count either way, and a swallowed node shows up immediately. It failed on its
sixth generated case.

### A list item's continuation lines swallow most first children

`normalizeBoundaries` separated a list item from its first child only for `paragraph` and
`html`. Measured against `parse` at every child column, the kinds a continuation line claims are
everything EXCEPT `code`, `table` and a nested list item — `hr`, `quote` and `callout` included.
A payload of `## H` followed immediately by `---` came out as ONE list item carrying both lines.

The rule is now stated the other way round, as the three exceptions, so a kind added later is
separated by default rather than silently absorbed.

### An HTML block runs to a blank line, not to its closing tag

Surfaced by the new property rather than by review. A payload ending in `<div>…</div>` took the
node that followed it into its own lines, because CommonMark ends an HTML block at a blank line.
`needsBlankBetween` had no case for an `html` leaf at all, so this reached any operation that
places one before a sibling — it predates this change and is not specific to a paste.

### The destination heading level ignored the sibling run

Recorded in the main decision above. Worth keeping here as the shape of the mistake: the bound
on absorption was argued from the parent's level, the argument read as obviously true, and it is
false for every scope whose headings skip a level. The fix is the rule the content regime
already used — take it from your siblings, not from your parent.

## Two pre-existing mechanisms this change widens the reach of

Both are real, both are measured, neither is caused by the re-encode rule — and both now fire on
payloads that previously could not reach them at all. Both were re-validated against `main` at
`ca828aa` and filed as issues, which is where their diagnosis and what closing them would involve
now live: **P5 is [#158](https://github.com/laughedelic/obsidian-true-outliner/issues/158)** and
**P6 is [#159](https://github.com/laughedelic/obsidian-true-outliner/issues/159)**. What stays here
is the research they came out of.

### P5. `hr`, `quote`, `callout` and `html` lose their kind past column 3

`HR_RE`, `QUOTE_RE`, `CALLOUT_RE` and `HTML_OPEN_RE` in `parse.ts` all require `^ {0,3}`, and a
child column derived from a list marker crosses that at the second level of nesting. Measured:
`- one` / `  - two` with `## H` + `---` pasted gives a `paragraph` where the payload had an `hr`.
`code` and `table` survive, having no such limit.

Below a LIST ITEM the node survives — the boundary fix above guarantees that much — but its KIND
does not, so the outline shows a paragraph where the document showed a rule. Directly pasting a
callout into a depth-2 list already did this before any of this change, so the mechanism is old;
what is new is that every heading payload converting into a list now routes its atoms through the
same columns.

*(Corrected 2026-09-19, review round: "the node survives" holds only in that direction. In a
HEADING scope an atom re-indented past column 3 loses its kind AND takes the node after it, because
what it becomes is a paragraph and a paragraph claims the next line as a continuation. Measured:
`## H2` / `\tbody` with `- item` / `> quote` pasted at the heading gives `\t> quote` read as a
paragraph carrying `\tbody` — two nodes where there were two plus two. `***` behaves the same. The
kind loss is old; reaching it from a caret on a heading's own line is not.)*

This falsifies design D7's "atoms move as opaque units and land at the right column", which was
measured only at depth 1.

Filed as [#158](https://github.com/laughedelic/obsidian-true-outliner/issues/158). Re-validating it
for filing added the mechanism behind the node-loss half: `finalize` normalizes boundaries on the
tree BEFORE encoding, so the seam is judged on the node's current kind while the parse sees the
kind its new column gives it — a `quote` needs no separator before a paragraph, but the paragraph
it becomes at column 4 does.

The node-loss half is closed by `a-seam-judged-on-the-kind-the-parse-sees`, which separates a seam
on the kind the re-parse will read: every payload node arrives, and the atom arrives as a
paragraph. The kind loss itself is still open, and the measurement it was missing — CommonMark
reads indentation RELATIVE to a block's container, so an `hr` at a list item's child column is an
`hr` to `commonmark` and a paragraph to us — is in `docs/research/seams-across-a-re-indent`.

### P6. A converted heading is always a `-`, which splits an ordered run

`headingAsListItem` hardcodes `{ type: 'bullet', marker: '-' }`, as the paragraph→list-item
conversion beside it already did. Dropped into an ordered run, the bullet splits it, and
`renumberOrderedAgainst` then renumbers the tail as a new run: measured, `- top` /
`  8. eight` / `  9. nine` / `  10. ten` with a heading pasted after `9. nine` leaves `10. ten`
renumbered to `8. ten` — untouched content, renumbered wrongly. Into a `*` run it starts a
second CommonMark list.

A plain bullet payload does the same today, so the mechanism is old and the renumbering half of
it is arguably the sharper bug of the two.

Filed as [#159](https://github.com/laughedelic/obsidian-true-outliner/issues/159), with the
plain-bullet control re-run as the thing that establishes it is not heading-specific. The
renumbering half is closed by `a-split-run-keeps-its-own-numbers`, which leaves a divided run's
fragments on the numbers they already carry — `10. ten` comes through untouched
(`docs/research/ordered-run-split-numbering`). The hardcoded `-` is gone too, in the layer above it
(`a-converted-node-takes-the-destination-style`): a converted node takes the destination's list
style, so it joins the run it lands in rather than dividing it, and the `*` case above stops
making three rendered lists of one (`docs/research/destination-list-style`).

## What Obsidian does with a heading inside a list item (tasks 2.2, 2.3)

Measured in a real instance — Obsidian 1.13.7, default theme, Live Preview and reading mode,
outline mode on — by the probe at
`docs/research/prototypes/heading-in-list-probe/heading-in-list-probe.e2e.ts.txt`. The fixture is
a converted payload exactly as the paste now writes it, `  - ## Notes` at depth 2, beside a real
`## RealHeading` so every reading is a comparison rather than an absolute.

Both editing surfaces render it as a heading; the metadata cache does not index it.

### Reading mode renders it as a real heading

```
<H1> Top
<H2> Notes          <- the converted list item
<H2> RealHeading
```

CommonMark's "a list item contains blocks" is honoured in full: `- ## Notes` produces an `<h2>`.

### Live Preview renders it at heading size too

| element | classes | font | weight |
| --- | --- | --- | --- |
| line `# Top` | `HyperMD-header HyperMD-header-1` | 25.9px | 700 |
| its text span | `cm-header cm-header-1` | 25.9px | 700 |
| line `## RealHeading` | `HyperMD-header HyperMD-header-2` | 23.4px | 680 |
| its text span | `cm-header cm-header-2` | **23.4px** | **680** |
| line `  - ## Notes` | `HyperMD-list-line HyperMD-list-line-2` | 16px | 400 |
| its text span | `cm-header cm-header-2 cm-list-2` | **23.4px** | **680** |
| line `  - one` (plain) | `HyperMD-list-line HyperMD-list-line-1` | 16px | 400 |
| its text span | `cm-list-1` | 16px | 400 |

The converted item's TEXT renders at exactly the real `h2`'s size and weight. The `##` is
concealed on an unfocused row and comes back when the caret is on it, the same treatment a real
heading's markers get, and focused it carries `cm-formatting-header-2` at heading size as well.

*(Corrected 2026-09-18. The first pass read `getComputedStyle` on the `.cm-line` element and
reported 16px/400 — but the line box holds the list chrome and keeps the list's own size; the
heading treatment is on the text span inside it. The reading below was drawn from that number and
is withdrawn: Live Preview does give the converted item heading styling, and D2's ergonomic
argument holds. Every table above now reports the line AND its text span, and the probe does the
same so a re-run cannot repeat the mistake.)*

### The metadata cache does not index it

```
headings:  [ {Top, 1}, {RealHeading, 2} ]      <- `Notes` absent
listItems: 4                                    <- counted here instead
```

So `[[note#Notes]]` has no target. The file resolves, the fragment does not, and the link lands
at the top of the note rather than at the section. Every heading-anchor link into a converted
section breaks.

This is not a REGRESSION — demoting the heading to `- Notes` instead would break the same anchor,
and before this change the paste did not produce a well-formed result at all. But it is a cost
the decision was recorded as possibly avoiding, and it does not.

### What this leaves of the decision

Design D2's three supports stand, with one cost the decision did not name:

- *"Obsidian renders it with heading styling"* — true in reading mode and in Live Preview, where
  outline mode lives. The text renders at the real `h2`'s size and weight.
- *"`contentColumnCh` already treats the run as chrome"* — unchanged and true.
- *"the rank survives the move and returns on an outdent"* — unchanged and true, verified through
  the real operations rather than by hand.

The heading ANCHOR is the cost. It is not a regression — demoting the heading breaks the same
link, and before this change the paste produced no well-formed result at all — but a reader
following `[[note#Notes]]` into a converted section lands at the top of the note.

## Manual pass (2026-09-18 onward): six reports from a real vault

Driven against `test-vault/Journal/2026-07-10.md` — copying its `## Aurora review` section and
pasting it in different places — through `classify` + `computeVerdict`, the same two gates the
transaction filter uses, and through the real editor where the gesture is what matters. The
section parses as `h2` → [a childless paragraph, a paragraph with three list children, a
callout].

### M1. Peers in the payload landed as two kinds of row

Pasted inside `- one` / `  - two`, the section's first paragraph stayed a paragraph and its
second became a list item:

```tree
list-item: "  - ## Aurora review"
  paragraph: "    The review went better than the navigation…"   <- childless
  list-item: "    - Decisions that came out of it:"              <- has children
    list-item: "      - severity-first layout approved ✅"
```

`reencodeIntoListScope` read each node's own child count: `hasChildren ? 'list-item' : own`. The
having-children half is forced (a paragraph below a list item has no expressible children); the
childless half was a free choice, and it made two siblings of one copied section land as two
different kinds of row. Every structural node in a list scope now converts.

The same frame also fires P5: the section's callout lands at column 4 and comes back a
paragraph. Untouched here, parked above.

### M2. A paste on the blank line under the note's `h1` landed at the bottom

Caret on line 1 — the blank line between `# Wednesday — review day` and the rest — the pasted
copy appeared at line 23 of 37 as `# Aurora review`, promoted from `h2`, while nothing appeared
where the caret was.

`nodeAtLine` resolves a gap line to the node that PRECEDES it, and `computePasteVerdict` inserted
`'after'` that node — meaning after its whole subtree, which for a note's `h1` is the end of the
note. Root was then the destination, so `destinationHeadingLevel` answered 1 and the payload
re-levelled to `h1`. The landing-at-the-bottom half is old; the promotion is this change's
re-levelling arm faithfully serving a wrong anchor.

A node's trailing gap sits immediately before its first child, so that blank line is the first
child's `before`. `pasteAnchor` reads it that way when the caret's COLUMN is at or past the
node's child column, and leaves the shallower reading as the `after` it always was.

Measured after the fix: the copy lands at line 2, as the `h1`'s first child, still `## Aurora
review`.

### M3. Trailing gap lines: the place the paste never consumed

It did not reproduce through the verdict layer — ~800 (document, caret, payload) combinations,
including payloads carrying one and two trailing blank lines, grew no blank run. It reproduces
immediately through the real gesture, which is Enter and then Ctrl+V:

| document | after Enter at `# Day`'s end | after the paste, before the fix |
| --- | --- | --- |
| `# Day` / gap / `## First` | `# Day` / gap / gap / gap / `## First` | three blank lines still above the payload |

A structural Enter opens a PLACE, and a place needs a separator on each side to parse as a node
of its own rather than as a continuation line — so it widens the gap it opens in by two. Nothing
in the paste path consumed it: the payload landed in the right position and the widened gap
stayed above it.

The paste now collapses the gap the caret sat in to a single blank line, and only that gap, and
only when it is already wider than one — a gap of none or one is the separation the document
already had. Measured after the fix, through the real editor:

```
# Day

## Notes

Some prose.
## First

body
```

A list scope needs none of this: Enter there writes a real empty list item (`- one` / `- ` /
`- two`), which `isEmptyAnchor` already replaces with the payload.

### M4. A caret ON a heading still pasted at the end of its section

Reported after the first two fixes landed. `pasteAnchor` read the gap line correctly and left the
node's OWN lines on the old reading — `insertSubtrees(..., 'after')`, which means after the whole
subtree.

The two are one rule, and stating it once fixes both: **a paste inserts at the boundary
immediately after the anchor's own lines** — its first child's `before` whenever it has children.
On a gap line the caret's column can still ask for the shallower reading; on the node's own lines
there is no such choice to express, because the column there is a position in the node's text.

The heading arm's absorption (D3) is what this makes reachable from the commonest caret position
on a heading. Pasting a section with the caret on `## First` gives:

```tree
h1: # Day
  h2: ## First
    h3: ### Notes
      paragraph: Some prose.
      paragraph: body      <- absorbed
```

`body` was `## First`'s own content and is now inside the pasted subsection. That is what a
heading placed before content at the same scope means, and there is no encoding in which it does
not: the alternatives are placing the payload after the content, which is the defect above, or
demoting it, which loses the rank. Worth watching in use.

### M5. The caret jumped to the end of the absorbed section

Reported from the manual pass after M1–M4 landed: pasting a heading section leaves the caret at
the end of the sibling subtree rather than at the end of what was pasted.

The anchor was right by then; the CARET was not. `endOfInsertedRun` took the last inserted
block's SUBTREE end, which is the payload only until the insertion changes it. A pasted heading
opens a section that takes the anchor's following siblings into it (D3), and the attachment rule
can put what it absorbs BELOW the payload's own last node rather than beside it — so the subtree
whose end the caret took was the payload plus everything the section had just swallowed.

Measured, `## Notes` / `Some prose.` pasted with the caret on `## First`:

```
## First

### Notes

Some prose.          <- what was pasted ends here

body                 <- CARET landed here
```

It fires exactly when the pasted heading absorbs something, which is why the frames that pin the
anchor did not catch it: in those the payload's level is ended by a sibling heading and nothing is
absorbed at all.

The count of the payload's own nodes is what the caret walks now, not a subtree. Anything absorbed
followed the anchor, so it follows the payload in document order too, and the payload's nodes are
the first N from the insertion point. That N is the payload's own is what the payload-survival
property already pins.

### M6. The run landed flush against what followed it

Reported from the same vault: pasting a section into a provisional paragraph between a heading
and a paragraph leaves no blank line between the pasted content and that paragraph — and pasting
between two headings does not show it.

The payload is the `## Aurora review` section, which ends in its callout. Pasting it under
`## Kitchen` after an Enter on the heading:

```
> [!warning] Follow-up needed
> Legal wants a review of the alarm-name field — some customers put PII in there.
Tomás's tile shop was a bust (nothing in stock until September) but the owner pointed us to a
```

The callout and the paragraph below it have no separation at all. Which payloads show it is
what the report's "not between two headings" is reading: `normalizeBoundaries` adds a blank line
only where the PARSE needs one, and a callout followed by a paragraph needs none, while the
paragraph-ending payload the earlier frames used gets one for free — `paragraph` → `paragraph`
merges, so a blank is required and appears. The seam was flush in both cases; only one of them
showed it.

What put the run there with nothing below it is `insertSubtrees`' gap ownership. A gap belongs to
the node above it, and an insertion BEFORE a node left the run's own final gap stripped, so the
separation that boundary had stayed above the run and the run met the next node bare. The same
rule ran the other way for an `after`: the anchor's gap MOVED down onto the run, leaving the run
flush under the anchor instead.

Measured at the verdict layer, `## Notes` / `Some prose.` into `# Day` / gap / `## First`:

| | today | with the boundary's separation on both sides |
| --- | --- | --- |
| caret in the gap | `Some prose.` / `## First` | `Some prose.` / gap / `## First` |
| caret at the end of `first.` | `first.` / `## Notes` | `first.` / gap / `## Notes` |

A gap is a BOUNDARY's separation, and an insertion turns one boundary into two — so both take
it. The node above the insertion point keeps its own gap and the run takes a copy of it, which
leaves the run separated from what follows exactly as what follows was separated from what
preceded it. A tight list has no separation to copy and stays tight.

The document's last node is the exception, and it is not a separation at all: its gap is the
file's terminating newline, which is why `- a` / `\t- b` with a payload pasted after `\t- b` must
hand that newline to the run rather than copy it. What separates the run from the node now above
it there is the scope's own separation — the parent's gap, or the boundary before it at the root.
Copied instead, the file would end in two newlines and the run would still sit flush.

A copied gap line is written as an EMPTY line rather than byte-for-byte: a place line carries
indentation so that it parses as a node, and reproducing that indentation below the run would
write trailing whitespace where it says nothing.

The third insert path needed its own reading of the same rule. A type-over reaches its
destination through a deletion, which takes the replaced run's gap with it, so there is nothing
left in the tree to copy by the time the payload lands — the replacement inherits the gap read
off the tree before the deletion instead. Measured, `- one` / `  - a` / `- three` with `- x` /
`  - y` typed over `  - a` left a blank line before `- three` that the tight list never had; the
payload's own text ended in one, and nothing overrode it.

Found while measuring that path, and not this change's to fix: deleting the last node of a note
that no blank line precedes drops the file's terminating newline (`- a` / `- b` minus `- b` gives
`- a`, no newline). It is the deletion's own — the node owned that gap, deletion takes a node's
gap with it, and at the end of a document that gap is the newline rather than a separation — and
it reproduces with no paste involved. Filed as
[#160](https://github.com/laughedelic/obsidian-true-outliner/issues/160), measured in the real
editor against `main` with an off-mode control.

## An unterminated leading `---` is not ours to fix (review round, 2026-09-19)

The review round reported that a paste can swallow a note's whole body into frontmatter: `---` /
gap / `- a` with `## H2p` / `---` pasted at `- a` gives a document of ZERO nodes, every line in
the preamble. It reproduces exactly, on this branch and on `main` — `parse.ts`'s frontmatter scan
is unbounded, so any later `---` closes a block that takes everything above it, and the same
leading line is an `hr` or a frontmatter opener depending on text arbitrarily far below.

Measured against a real instance before filing it anywhere, which is what settled it. Obsidian's
own metadata cache reads the three shapes as:

| note | `sections` | `frontmatter` |
| --- | --- | --- |
| `---` / gap / `- a` / `# H2p` / gap / `---` | `yaml@0` and nothing else | absent |
| `---` / gap / `- a` | `thematicBreak@0`, `list@2` | absent |
| `---` / `title: x` / `---` / gap / `- a` | `yaml@0`, `list@4` | present |

Obsidian swallows the prefix too, and lists no section for the body. `frontmatter` is absent
because the content is not a YAML mapping, but the SECTION is yaml all the same. Our parse agrees
with it on all three.

So there is no divergence to fix: the file's text is intact, and an outline of nothing is an
honest reading of a document Obsidian also thinks is all YAML. Typing `---` at the end of such a
note does the same with no plugin involved. Recorded here as reference rather than filed, per
AGENTS.md's "A follow-up is an issue" — the claim worth keeping is the one that refutes the
report, so nobody pays for this diagnosis twice.
