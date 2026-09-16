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

**Into a list scope**, every node in the payload that has children becomes a list item. This arm
is forced, not chosen: measured, a paragraph below a list item can have no children at all — not
a list, not another paragraph, not an atom, at any indentation, because the attachment rule is
applied at section level only. Converting the root alone and re-indenting the rest loses a level
of the payload's tree. There is exactly one encoding that preserves it.

*Why the caret is the whole interface.* The two arms give the user both behaviours without a
mode or a prompt: a caret at a heading level asks for a section there, a caret inside a list asks
for the subtree replanted there. Both requests are legible from where the caret is, and both are
what the person pointing meant.

### D2. A converted heading carries its `#` run as text

`## Notes` converting into a list scope becomes `- ## Notes`, not `- Notes`.

`- ## Notes` is a list item containing an `h2` — canonical CommonMark, not an Obsidian
extension — and Obsidian renders it with heading styling. Our own `contentColumnCh` already
treats a `#` run following a list marker as chrome, so the caret machinery lands where it should
on such a line without changing.

What this buys is reversibility. Measured, outdenting a converted item back to a heading scope
strips the marker and re-parses the line as a real heading again, at its original rank. The
"lossy clipboard round trip" that made this arm expensive to choose largely stops being a cost:
the rank rides along as text and comes back.

The `#` run is carried VERBATIM rather than re-levelled. A list item has no heading level for a
delta to be relative to, and carrying it unchanged is exactly what makes the return trip restore
what was copied. It also retires the `h6` clamp for this direction: inside a list the run is
text, so a payload deeper than six levels has nothing to clamp against.

The paragraph descendants do convert for real — there is no marker to carry paragraph-ness, and
paragraph/list-item conversion is already what the context-determined rule does everywhere else.

### D3. Absorption is accepted at a heading level, and stated

A heading opens a section that runs to the next heading of its level or shallower, so a heading
spliced among siblings takes the ones that follow into its section. Under D1 that is the
behaviour a caret at a heading level asks for, and the alternatives cost more than it does:
converting would demote a heading where a heading was perfectly writable, and relocating to the
end of the sibling run would put the content somewhere other than where it was pointed.

Two things make it affordable. It is visible — the absorbed content is drawn nested under the
pasted node before anything else happens. And it is bounded: measured, absorption never reaches
past the destination scope's own end, because the enclosing heading's next sibling is shallower
than anything the payload can be re-levelled to.

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

`reencodeBlocksForDestination` is the shared path D16 extracted. The heading arm, the guard and
the conversion all go there. `encodingKindAtDestination` in `rules.ts` gains the kind decision,
per its own comment that revising these rules should stay a local change.

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

## Risks / Trade-offs

- **Paste-then-cut is not the identity at a heading level** → cutting the pasted section back
  out takes the absorbed content with it, because that content is inside the section now. The
  outline shows the nesting before the cut and one undo restores it, but the asymmetry is real
  and belongs in the manual pass rather than in a user's note.
- **At the root of a heading-less note, absorption is unbounded** → pasting a section near the
  top makes the whole remainder its children. Markdown means exactly that, and D3's visibility
  argument still applies, but the magnitude is worth seeing in real use before we accept it for
  good.
- **`- ## Notes` depends on how Obsidian treats a heading inside a list item** → the rendering
  is reported and matches CommonMark, but whether the metadata cache indexes such a heading — so
  whether a `[[note#Notes]]` anchor still resolves — is unmeasured. It is no worse than demoting
  the heading outright, which breaks the anchor too; it may be better. Task 2.3 measures it.
- **An outdent can turn a converted item back into a heading unintentionally** → the reverse
  trip that D2 counts as a feature fires whenever such an item reaches a heading scope, whether
  or not that was the intent. It re-parses cleanly, so it is a surprise rather than a
  corruption, and task 4.4 pins the behaviour.

## Migration Plan

In-editor behavior only. No file or data migration.

## Open Questions

None blocking. The two unmeasured items — Obsidian's heading indexing inside a list item, and
the magnitude of root-level absorption in real use — are tasks, not decisions.
