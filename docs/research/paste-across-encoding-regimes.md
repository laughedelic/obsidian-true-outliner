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
delta, clamped at h6.

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
disappears. It also retires the `h6` clamp for this direction — inside a list the run is text,
with nothing to clamp against.

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
