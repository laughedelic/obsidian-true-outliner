## Context

The mapping model has two encoding regimes: a heading's depth is its `#` count, a list item's is
its indentation. Structural operations already respect the split for level-shifting (Q2). Paste
is where the two have to meet, and the rule for that meeting was never written — so each block
was re-encoded on its own, and three insert paths grew apart.

What a paste actually does today, and the five defects that separates, is measured in
`docs/research/paste-across-encoding-regimes`. The worked frames for each decision below, with
the trees they re-parse to, are in this change's `examples.md`. Neither is restated here.

The change was originally scoped as "a heading section pasted into a list", with its central
decision deliberately left open pending worked examples. The examples changed the shape of the
question: the heading/list boundary is one of five defects, the reverse direction turned out to
need no rule at all, and the hardest case is not cross-regime at all but heading-into-heading.

## Goals / Non-Goals

**Goals:**

- One rule, at one call site, reached by every insert path.
- A replanted subtree keeps its own relative hierarchy exactly, whatever encoding it lands in.
- Where a payload cannot be expressed, it is refused with the existing cue — never passed
  through to a raw insertion.
- Every rule expressible as a before/after frame a manual pass can check.

**Non-Goals:** as `proposal.md` lists them.

## Decisions

### D1. The destination's depth determines the encoding — one rule, not two

A paste replants a subtree at the level the caret names. The subtree takes whatever encoding
that level permits and keeps its own relative hierarchy; node kinds are the accidental specifics
of how markdown spells a tree, and the tree is what we preserve.

This is not a new rule. `Context-determined encoding on reparent` already says a reparented
node's encoding is a pure function of its new surroundings. It excludes headings only because,
under the two-regime algebra, no *reparenting* operation can reach one — headings move by level.
A paste can, so the rule needs the arm it never had.

Two arms follow, and they are one rule applied to two kinds of destination:

**Into a heading-bearing scope** — the root, or a heading's children — the payload stays
headings. Its root re-levels to the destination's depth and every heading in it shifts by the
same delta, so the payload's internal level relationships (skips included) survive. Setext
normalizes to ATX on the way, because re-levelling routes through `headingWithLevel`, which
already does that for Tab.

**Into a list scope**, every structural node in the payload becomes a list item. For the nodes
with children this arm is forced, not chosen: measured, a paragraph below a list item can have no
children at all — not a list, not another paragraph, not an atom, at any indentation, because the
attachment rule is applied at section level only. Converting the root alone and re-indenting the
rest loses a level of the payload's tree. There is exactly one encoding that preserves it.

The childless nodes convert with them. That part is a choice, and a manual pass against a real
note is what settled it: a section whose first paragraph had no children and whose second had a
list under it landed as a paragraph beside a list item, so two siblings of the payload became two
different kinds of row over an accident of their own contents. A list scope is one list, and the
node's own child count is not a property the person pasting pointed at.

*Why the caret is the whole interface.* The two arms give the user both behaviours without a
mode or a prompt: a caret at a heading level asks for a section there, a caret inside a list asks
for the subtree replanted there. Both requests are legible from where the caret is, and both are
what the person pointing meant.

### D2. A converted heading carries its `#` run as text

`## Notes` converting into a list scope becomes `- ## Notes`, not `- Notes`.

`- ## Notes` is a list item containing an `h2` — canonical CommonMark, not an Obsidian
extension. Our own `contentColumnCh` already treats a `#` run following a list marker as chrome,
so the caret machinery lands where it should on such a line without changing.

*Measured since, in a real instance (`docs/research/paste-across-encoding-regimes`): both reading
mode and Live Preview render it at the real `h2`'s size and weight, with the `##` concealed on an
unfocused row exactly as a real heading's markers are. The metadata cache does NOT index it, so
`[[note#Notes]]` has no target after a conversion — not a regression, since demoting the heading
breaks the same link, but a cost this decision did not name.*

What this buys is reversibility. Measured, outdenting a converted item back to a heading scope
strips the marker and re-parses the line as a real heading again, at its original rank. The
"lossy clipboard round trip" that made this arm expensive to choose largely stops being a cost:
the rank rides along as text and comes back.

The `#` run is carried VERBATIM rather than re-levelled. A list item has no heading level for a
delta to be relative to, and carrying it unchanged is exactly what makes the return trip restore
what was copied. It also means the `h6` bound does not reach this direction at all: inside a
list the run is text, and text has no bound.

The paragraph descendants do convert for real — there is no marker to carry paragraph-ness, and
paragraph/list-item conversion is already what the context-determined rule does everywhere else.

### D2a. Where the heading regime runs out, the paste is refused

Added during implementation, which measured the two alternatives and found both worse than the
refusal the project's unifying principle already prescribes.

A heading payload whose DEEPEST heading would need a level past `h6` has no encoding that keeps
its own tree. Clamping puts two of the payload's levels onto one. Converting it to content
instead only works below a list item: at section level a converted run meets the attachment
rule, which reparents it under whatever paragraph precedes it — measured, a payload's second
level landed as a child of its own first level's paragraph rather than beside it.

So the rule is the unifying principle's other branch: the minimal encoding of the new tree, or a
rejection. `indent` already refuses this exact shape with `at-h6-bound`, reading the SUBTREE's
deepest heading rather than its root, and the paste now refuses it on the same terms with the
same reason. A destination whose own level is already `h6` is the same case: its children have
no heading level left.

This costs nothing the other arms wanted. Below a list item a heading converts and carries its
run as text (D2), where no level exists to exceed.

### D3. Absorption is accepted at a heading level, and stated

A heading opens a section that runs to the next heading of its level or shallower, so a heading
spliced among siblings takes the ones that follow into its section. Under D1 that is the
behaviour a caret at a heading level asks for, and the alternatives cost more than it does:
converting would demote a heading where a heading was perfectly writable, and relocating to the
end of the sibling run would put the content somewhere other than where it was pointed.

Two things make it affordable. It is visible — the absorbed content is drawn nested under the
pasted node before anything else happens. And it is bounded, because the payload re-levels from
the destination's own heading SIBLINGS: landing level with them, the next one ends its section.

That bound was first argued from the PARENT's level, and an independent review round proved the
argument wrong — a scope whose headings skip a level (an `h1` whose children are `h3`) gave the
payload `h2`, which is shallower than the siblings it lands among and swallows them. Taking the
level from the siblings, as `encodingKindAtDestination` takes a kind from them, is what makes
the bound true rather than merely stated.

The exception is the root of a note with no headings, where there is no scope end and everything
below the caret is absorbed. Recorded as a risk below rather than special-cased.

### D4. The guard belongs in the shared re-encode step

`insertSubtrees` holds the expressibility guard; `insertAsOnlyChildren` calls
`reencodeBlocksForDestination` directly and so never runs it. That is the same shape D16 fixed
for the re-indent after the second duplicate-logic incident — a second call site that forgot one
half of the rule — recurring for the guard rather than for the re-indent.

The guard moves down into `reencodeBlocksForDestination` beside the rule it guards, so a path
cannot reach the re-encode without it.

### D5. An inexpressible payload is refused, never passed through

`computePasteVerdict` turns a rejection into `PASS` on the principle that "a wrong pass is
editable text; a wrong rewrite is surprising relocation". Measured, the principle does not hold
here: what lands is the payload's first line concatenated onto the anchor's, with the remainder
at its source indentation. That is not editable text, and `structural-operations` already
requires such a sequence to be "rejected rather than inserted in corrupted form".

Under D1 almost nothing is left to refuse — a heading payload converts rather than failing. The
residual is an atom below a paragraph, which has no encoding in either regime, and it vetoes
with the existing cue on every path.

### D6. One call site

`reencodeBlocksForDestination` is the shared path D16 extracted. The guard and the conversion go
there. The heading arm's RULE — which level a payload takes at a destination — goes in `rules.ts`
beside `encodingKindAtDestination`, per that module's own comment that revising these rules
should stay a local change: the two are one rule over the two regimes, one answering with a kind
and one with a level.

### D7. What the measurement retired

Three things this change carried as work turn out to need none, and are dropped rather than
quietly left in the tasks:

- **The reverse direction.** A list-rooted payload into a heading scope already lands correctly:
  the root takes the destination's content encoding, the descendants keep theirs, and the
  attachment rule restores the nesting. Nothing has to become a heading.
- **Atoms as a risk.** Callouts, code blocks, tables and thematic breaks move as opaque units
  and land at the right column. The one atom failure is D4's missing guard, not anything about
  atoms.
- **Ordered-run renumbering and the setext-underline trap.** Both already handled, by
  `renumberOrderedAgainst` and by `normalizeBoundaries` respectively.

### D8. A paste inserts at the boundary after the anchor's OWN lines

Added after a real-vault manual pass, which found the change's own thesis failing on the two
commonest caret positions there are: the blank line under a note's top heading, and a heading's
own line.

`nodeAtLine` resolves a gap line to the node that PRECEDES it — right for every question the
verdict layer asked of it before, since a caret there is inside that node's extent. What was
wrong was the SIDE: `insertSubtrees(..., 'after')` means after the node's whole SUBTREE. Measured,
an `h2` pasted on the blank line under a note's `h1` came out at the bottom of the note,
re-levelled to `h1` because root was the destination it reached; and a paste with the caret on a
heading's own line landed past that heading's whole section. Nothing appeared where the caret was
in either case.

The boundary a paste wants is the next one after the anchor's own lines, which is its first
child's `before` whenever it has children, and `after` the node when it has none. A node's
trailing gap sits immediately before its first child, so a caret there names the same boundary.

On a GAP line the COLUMN can still ask for the shallower reading — at or past the node's child
column the caret stands for a child, to its left for a sibling — which is the same thing that
decides what typing there would parse as. On the node's own lines there is no such choice to
express, because the column there is a position in the node's text.

This is not the provisional-position machinery. `placeOutline` answers a different question —
which tree a position that JOINED a node stands for — and has to be TOLD the place's line, because
nothing in the document tells a place from a blank line the user authored. The anchor question
needs neither: it reads the tree the verdict layer already has, and the reading is the same
whoever put the caret there.

### D9. The gap the caret sat in collapses to one blank line

A structural Enter opens a PLACE, and a place needs a separator on each side to parse as a node
of its own rather than as a continuation line — so it widens the gap it opens in by two.
Measured, Enter at a heading's end followed by Ctrl+V left three blank lines above the pasted
content: the payload landed in the right position and nothing consumed the place it filled.

So the paste consumes it. A gap is one separation however wide it is, and rewriting it to the
single blank line the document already used is chrome maintenance rather than an editing
semantic — the tree is identical either way. Two bounds keep it that: only the gap the caret was
actually IN, and only one already wider than a single line, since a gap of none or one is the
separation the document had and the paste has no business changing it.

A list scope needs none of this. Enter there writes a real empty list item, which
`isEmptyAnchor` already replaces with the payload.

### D10. A run keeps the separation of the boundary it landed in

A gap is a BOUNDARY's separation, and an insertion turns one boundary into two. Both take it: the
node above the insertion point keeps its own gap, and the last inserted block takes a copy, so the
run is separated from what follows it exactly as what follows was separated from what preceded it.

The rule it replaces stripped that gap and left the separation to `normalizeBoundaries`, which
adds a blank line only where the PARSE requires one. A callout followed by a paragraph requires
none, so a pasted section ending in a callout ran straight into the paragraph below it. The same
rule ran the other way for an `after`, moving the anchor's gap down onto the run and leaving the
run flush under the anchor.

Two bounds. A gap the destination did not have is not invented — a tight list stays tight, since
there is no separation to copy. And the document's LAST node holds no separation: its gap is the
file's terminating newline. A run landing at the end takes that over, and what separates it from
the node now above it is that scope's own separation — the parent's gap, or the boundary before it
at the root. Copying there would end the file in two newlines and leave the seam flush anyway.

A copied gap line is written as an empty line rather than byte-for-byte. A place line carries
indentation so that it parses as a node, and that indentation says nothing anywhere else.

The type-over path reaches its destination through a deletion, and a deletion takes the deleted
run's own gap with it — so there the separation is read off the tree BEFORE the deletion and the
replacement inherits it. Left to the payload's own final gap, a section copied out of a note
carried that note's blank line into a tight list, and a replacement at the end of a note took
whatever the copied text happened to end with.

## Risks / Trade-offs

- **Paste-then-cut is not the identity at a heading level** → cutting the pasted section back
  out takes the absorbed content with it, because that content is inside the section now. The
  outline shows the nesting before the cut and one undo restores it, but the asymmetry is real
  and belongs in the manual pass rather than in a user's note.
- **At the root of a heading-less note, absorption is unbounded** → pasting a section near the
  top makes the whole remainder its children. Markdown means exactly that, and D3's visibility
  argument still applies, but the magnitude is worth seeing in real use before we accept it for
  good.
- **`- ## Notes` breaks heading anchors** → measured, not predicted. Both editing surfaces render
  it at heading size, but the metadata cache does not index it, so `[[note#Notes]]` has no target
  after a conversion. Not worse than the alternative, which loses the rank outright and breaks the
  same link, but a reader following such a link lands at the top of the note.

- **A caret ON a heading now opens a section that absorbs the heading's own content** → D8 makes
  D3's absorption reachable from the commonest caret position on a heading: pasting with the
  caret on `## First` puts the payload before `## First`'s body, which is therefore inside the
  pasted subsection. Markdown means exactly that, the outline draws it before anything else
  happens, and one undo restores it — but the gesture is far more common than the mid-run splice
  absorption was first measured on.
- **An outdent can turn a converted item back into a heading unintentionally** → the reverse
  trip that D2 counts as a feature fires whenever such an item reaches a heading scope, whether
  or not that was the intent. It re-parses cleanly, so it is a surprise rather than a
  corruption, and task 4.4 pins the behaviour.

## Migration Plan

In-editor behavior only. No file or data migration.

## Open Questions

None blocking. The two unmeasured items — Obsidian's heading indexing inside a list item, and
the magnitude of root-level absorption in real use — are tasks, not decisions.
