## Context

The machinery is `a-position-does-not-split-its-node`'s, unchanged in shape. A provisional
position is materialized by typing one character into it (`materializeProbe`), the result is
parsed, and a GATE decides whether that parse may stand in for the buffer's own. D1 of that
change argues at length for a gate rather than a line span, and nothing here revisits it.

What this change touches is which question the gate answers for whom. It answered one question
for two consumers with different information: the rendering derives from document and caret
alone (D5), while the operation path is TOLD which line holds a place, from
`provisional-cleanup`'s per-view record. The measurements are in
`docs/research/decoration-follow-ups`.

## Goals / Non-Goals

**Goals:**

- A place at a node's end behaves as a place: it moves with the node, keeps standing for a
  continuation of it, and keeps the caret.
- One gate for the rendering and one for the operations, each stating what it knows.
- One place-line test, in one function, that every entry point asks through.

**Non-Goals:**

- Widening the half of the gate that keeps an invented node out of the resolved tree.
- Changing which caret case any operation falls into.
- Giving a place provenance that survives undo and redo, which several parked entries want and
  none of them is this one.

## Decisions

### D1 — The gate splits along what the caller knows, rather than being relaxed

`positionBisectsANode` asks two things: that the position's own materialized line is not a first
line, and that a line of the same node remains below it. The first is what makes the resolved
tree honest — a position whose own line is a FIRST line stands for a node that does not exist
yet, and two measured shapes show that tree rendering a node into being. The second is what
keeps the document's own final blank line out: nothing distinguishes it from a place, and
`indent` re-emits a node's lines, so Tab at the end of a file would write trailing whitespace
onto it.

Only the second is about information the caller might have. So it splits: `positionJoinsANode`
is the first test alone, and `positionBisectsANode` is that plus the second. The rendering keeps
asking `positionBisectsANode`, because it has nothing to tell a place from a trailing blank line
with. The operations ask `positionJoinsANode`, through `placeOutline`, which will not answer at
all without a place line.

*Alternative — relax `positionBisectsANode` itself.* Rejected: the rendering would then resolve
a node's trailing gap, which is a change to what the user sees, for no defect. Measured, the two
parses agree about every line there, so it would also be a change with no visible effect and no
test to hold it — the worst kind.

*Alternative — keep the gate and special-case a trailing place inside `grammar.ts`.* Rejected
for the reason the gate exists at all: a second copy of "which lines are really this node's"
drifts from the parse.

### D2 — The place-line test lives in `placeOutline`, not at its call sites

`resolvedOutline` took a line and a column; every caller wrapped it in the same test — that the
recorded place line is the caret's line. One caller wrote that test, one wrote it slightly
differently for the after-tree, and the palette wrote it not at all. So the function takes the
caret and the place line and applies the test itself, and its name says what it resolves.

This is `caret-placement-policy`'s own argument one layer down: the answer was spread across
call sites that disagreed, and most of the disagreement was between two of them rather than
wrong inside either.

*Why the function may relax the gate at all:* the place line is our own keypress's record. A
blank line the user authored between two paragraphs is byte-identical to one Shift+Enter opened
inside one, and the document cannot tell them apart — which is exactly why the operation path is
told rather than deriving. Being told is also what makes a trailing place distinguishable from
the document's final blank line, and that is the whole of this change.

### D3 — The palette reads the place through the same function, not a copy

`runOp` resolves the outline before it resolves the operand, exactly as `planKey` does, and
hands the same tree to the operation, to the zoom re-resolution and to the caret policy. The
`EditorView` it needs is already in hand for the zoom scope; it is read once, earlier.

The stated exception in `selection-structural-ops` — the keyboard supplies the live indent unit
and the palette cannot — is untouched and still the only difference between the two paths.

### D4 — An Enter place stays unresolved, and is recorded rather than closed

An Enter position is blank-separated from the node above, so its materialized line is a first
line and `positionJoinsANode` declines it. That is the half of the gate D1 keeps, and it is
right here for the same reason: the place stands for a node that does not exist yet, so there is
no node whose lines an operation could carry it along with.

Measured for this change: with such a place open below a paragraph, Tab indents the paragraph
and leaves the place at column 0. Whether that is wrong depends on where the new node the place
stands for ought to live, which is a question the raw tree does not answer. Parked with its
measurement rather than guessed at.

### D5 — A move's caret is still its subject's content start

`caret-placement-policy` gives move up and move down the SUBJECT case, and an interior place has
always behaved that way. The defect the measurements found in the moves is not the caret but the
place: its line stayed where it was while the node moved, so the node that inherited the line
inherited the place. Resolving the tree fixes that on its own — the place becomes one of the
moved node's own lines — and nothing about the caret rule changes.

Stated because the issue's title is about the caret, and for the moves the caret was never the
defect.

## Risks / Trade-offs

- **The relaxed gate admits a blank line that is not a place** → It cannot be reached without a
  place line, and `placeOutline` refuses to answer without one. Pinned by a test that calls it
  with no place line, with a mismatched one, and with no caret.
- **Tab at the end of a file writes trailing whitespace** → Only onto a place, which is
  whitespace by definition and which `provisional-cleanup` removes when the place is abandoned.
  The no-place case keeps its own test, now stated over the place line rather than over the
  gate.
- **The palette starts resolving places and gets one wrong** → It asks the same function on the
  same terms, and both halves are pinned end-to-end: one spec compares it against the keyboard's
  own result on the same document, one holds it to leaving an authored blank line alone.
