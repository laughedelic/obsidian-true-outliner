## Context

See proposal.md — Why. The measured state, from probing `parse`/`decorate` directly:

| Document | Caret's line | `decorate()` fact today |
|---|---|---|
| `# H` / `para` / Enter at end | `""` | none |
| same, one character typed there | `"x"` | depth 1, paragraph, first line |
| `# H` / `- alpha` / `  - beta` / Shift+Enter at end | `"    "` | none |
| same, one character typed there | `"    x"` | depth 2, list item, continuation, `supplementalDepth` 1 |

A blank or whitespace-only line is a trailing-gap line, and `decorate()` emits facts only for
nodes' own lines. So the caret renders at the line box's left edge plus whatever literal
whitespace the line holds: at column 0 for Enter's position — on top of the depth-0 guide
column — and one `supplementalDepth` unit left of the list for Shift+Enter's. One character
repairs both, which is the visible jump users report.

Three constraints shape the fix:

- **Decorations are a pure rendering projection.** They may not dispatch, move the caret, or
  create history entries (`outline-decorations`). Whatever the caret's line renders as, it has
  to be a function of the buffer and the selection.
- **Intent may not be read from chrome.** `node-edit-enforcement`'s chrome-transparency rule,
  and `enter-and-shift-enter-grammar`'s D1 built on it, forbid deciding what an edit means
  from gap width or marker shape. The leading whitespace of a line, by contrast, is content
  space — it is exactly what `parse.ts` reads to decide whether a line continues an item.
- **`enter-and-shift-enter-grammar` D1 already guarantees what this needs.** It chose the
  two-blank-line encoding precisely so Enter's position and Shift+Enter's are distinguishable
  from the document alone. This change is the first consumer of that property.

## Goals / Non-Goals

**Goals:**

- The caret on a provisional position renders where the node it stands for will render.
- One rule covers both reported shapes, and every other provisional position the grammar can
  produce, without enumerating them.
- No new editor state, no new setting, no change to what the caret may do.

**Non-Goals:**

- Decorating gap lines the caret is not on. Blank separator lines stay exactly as they render
  today; only the guide continuity rule applies to them.
- Making a provisional position addressable. `content-space-caret` is unchanged: no user
  gesture reaches one, and only the plugin's own dispatch parks the caret there.
- Collapsing or hiding gap lines, and the rest of the parking lot's gap-line family
  (`docs/research/12-decoration-follow-ups.md`).
- Replicating Obsidian's native list metrics. Our contribution stays additive.

## Decisions

### D1 — The line renders as what the parse would make of it, not as a new depth rule for gaps

The parking lot framed this as "give a gap line the owning node's depth", and stalled on its
open question: which depth a gap between two different depths should take. The question
dissolves once the layer answers a different one — not "what depth is this gap at" but "what
would this line be if it had content". The parse already answers that, for every shape,
including the one the depth framing cannot express at all: Shift+Enter's position is not a
node at any depth, it is a continuation line of the node above.

Alternatives:

- *Every gap line takes its owner's depth.* Decorates lines nobody is on, needs a tie-break
  the model does not have, and still cannot tell a continuation position from a new-node one.
- *Remember which key ran, in a `StateField`.* The state this project has now declined three
  times, most recently as `enter-and-shift-enter-grammar` D1. It would also make the rendering
  disagree with the file whenever the state was lost or stale.
- *Inherit the previous non-blank line's fact.* Correct for Shift+Enter's position by accident
  and wrong for Enter's whenever the new node's scope differs from the node above.

### D2 — The preview is a re-parse with one sentinel character, not a re-derivation

`provisionalFact(text, line)` appends one character to the line, parses, runs `decorate()`,
and returns the fact for that line. It is not a second implementation of the "would this line
continue the item" question — it is the same implementation, asked the question directly.

A hand-derived rule would have to restate: the content-column test that makes an indented line
a continuation, the blank-separation that makes it a new block, list-stack popping, and the
indented-code-block simplification. Every one of those is a place to drift from `parse.ts`,
and the drift would be invisible until a user hit the shape.

Cost is one extra parse, and only when the caret is on a line with no fact — which, given
that motion skips gap lines and clicks resolve off them, means only while a provisional
position is open. Cached per `EditorState`, the way the position trail already is.

### D3 — Only the caret's own line takes the preview fact

Everything else keeps the facts of the document as it actually is. Computing the whole
document from the preview would be simpler to write and wrong to look at: an Enter at the end
of a childless heading makes that heading a parent in the preview, so under `markerVisibility:
'with-children'` its marker would blink on while the position is open and off again when it is
abandoned. The preview is a statement about one line, not a hypothetical document to render.

### D4 — The position trail IS computed from the preview document

The exception to D3, for a reason specific to that layer. The trail's entire content is "the
chain from the root to the node the caret is in". Against the real document, a caret on a gap
line resolves to the node that OWNS the gap — deliberately, so the trail does not blink off
while crossing a blank line. For a provisional position that answer is wrong in a way that
shows: Enter at the end of a paragraph opens a position for that paragraph's SIBLING, and the
owner-based chain accents the paragraph as if it were the new node's parent.

The preview document has the same line count and the same nodes everywhere else, so the
per-line accents it produces are correct for the whole document, not just the caret's line.

### D5 — The trigger is "the caret is on a line with no node content", not "we just created one"

`provisional-cleanup.ts` already tracks the created place precisely, but reaching that record
from the decoration layer means threading view state into a state-derived computation. It is
also unnecessary: the only ways the caret comes to rest on a blank line are the plugin's own
provisional dispatch and a programmatic placement `content-space-caret` deliberately does not
correct (a workspace restore, a search jump). The second gets the same truthful rendering as
the first, and the next user motion moves off it.

This also gives the disappear-on-abandon behaviour for free — not as a second mechanism to
keep in step with undo-on-abandon, but because the decoration is a function of where the caret
is.

### D6 — The buffer fix is in scope, and is limited to indentation

`splitNode`'s gap-widening branch writes `['', '']` regardless of destination. Measured: on a
list item that has a paragraph child, Enter at the end opens a position at column 0, and
typing there produces a TOP-LEVEL paragraph and leaves the item's existing child as a
top-level sibling too — the subtree flattens. That is `enter-and-shift-enter-grammar`'s own
E10 case failing at the encoding rather than at the routing.

It is in scope because D1 cannot be both truthful and useful while it holds: the preview would
faithfully render depth 0, which is exactly the misplacement the user is complaining about.
Fixing the encoding makes the rendering right everywhere instead of right except there.

The fix writes indentation ONLY — `destinationIndent`, the same rule paste and every
reparenting operation use (D9 of `enter-and-shift-enter-grammar`). It deliberately does not
try to encode depth in general: a paragraph's depth under headings is positional, leading
whitespace would not change it, and four or more spaces reclassifies the line. Where the
destination is at the top level or under a heading, `destinationIndent` returns the empty
string and the bytes are unchanged from today.

### D7 — Marker eligibility is not special-cased

The provisional line goes through the same `isFirstLine && !isListItem` predicate and the same
`markerVisibility` gate as any other line. Everything the requirement asks for falls out:
Enter's position is a first line, so it gets the paragraph marker; Shift+Enter's is a
continuation line, so it gets none; a position whose materialized line would be a list item
gets no synthetic marker, because list items never do. Under `'with-children'` a provisional
paragraph is a leaf and shows no marker — the same answer a real leaf paragraph gets, which is
what the setting means.

### D8 — Guides keep coming from the real document

`computeLineGuides` already covers gap lines, deliberately, for continuity. The provisional
line keeps that guide fact and gains only the indentation fact, so the guide column on it is
unchanged and continuity across the position is preserved by construction. The two must agree
about how far the line's own box is shifted (`--to-own-shift`), which is the one place the mix
could show; a pure test pins that the preview fact's own-shift matches the regime the guide
rule assumed for that line.

## Risks / Trade-offs

- **Obsidian's own rendering of a whitespace-only line is not ours to control.** Restoring the
  `supplementalDepth` margin fixes the reported case exactly (it is one unit, and the report is
  "one level to the left"), but in a PURE list that margin is 0, so if Obsidian renders a
  whitespace-only line differently from a real continuation line there is a residual we have
  not measured. → Measure it first (task 1), against the column the same text occupies once
  typed. If a residual exists, record it in `docs/research/12` rather than replicating native
  list metrics, which the decoration layer deliberately never does.
- **An extra parse on caret moves onto a blank line.** → Only on blank lines, cached per
  editor state, and skipped entirely by a leading `trim()` test on the caret's line.
- **A whitespace-only line can now be written to the file** (D6), where the destination is
  inside a list item. → It is removed in full by undo-on-abandon, it is invisible in markdown,
  and it is the same whitespace a real continuation line at that position would carry. Only
  the list-item destination is affected; top-level and heading destinations stay byte-identical.
- **The pure-list byte-identity e2e could see a provisional marker** if its fixture happens to
  park the caret on a blank line. → Pin the caret into content space in that spec, the same way
  `hierarchy-position-indicators` pinned its own settings.
- **A marker on a line with no node could read as "a node exists here".** → It is exactly as
  provisional as the position itself, and it disappears the moment the caret leaves. This is
  the intended reading: the position stands for a node, which is why abandoning it is a
  cancellation rather than a deletion.
- **Ordering.** This change reads `enter-and-shift-enter-grammar`'s "Provisional positions"
  requirement as its premise and amends one branch of its split. → Land that change first; its
  tasks are complete but for its manual pass.

## Open Questions

- Whether the caret-derived accent clause belongs in `outline-decorations` long-term or in the
  `hierarchy-position-indicators` capability, whose spec is still carried by its own unarchived
  change. Deferrable to archive time: it is a placement question about one requirement's text,
  and it changes no behaviour, no task, and no test.
