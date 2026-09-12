## Context

The zoomed view already re-bases everything it renders by handing the pure decoration functions
the zoom root's subtree AS a document and shifting their line numbers back by the root's start
line — `outline-zoom` D9, implemented in `baseFacts` for the facts and guides and in
`zoomAwarePositionTrail` for the caret trail. A provisional position bypasses both: it is
materialized from a probe built against the whole buffer, and every consumer of that
materialization spends its depths unshifted. The measurement, the three leaks it produces, and
the case-by-case breakdown are in docs/research/decoration-follow-ups ("A provisional position inside a zoomed
subtree renders the view at the source document's depth"); see proposal.md for why it matters.

Two properties the fix rests on are contracts this project already states, and both were
re-checked against the generated corpus before this design was written: the subtree document's
text is byte-identical to the source lines it covers, and its line K is the source's line
N + K, where N is the root's start line (`tree-projection`, `project.ts`'s `subtreeDocument`).
That is what makes probing the smaller document a coordinate translation rather than a
reinterpretation.

## Goals / Non-Goals

**Goals:**

- One frame for every render a provisional position feeds: the same document, the same offset,
  applied in one place rather than at each of the three consumers.
- No new parameter on `decorate`, `computeLineGuides`, `materializeProbe`, or
  `computePositionTrail`. Re-basing stays a different INPUT, which is the decision D9 already
  made for this layer.
- The unzoomed path byte-identical to today's, not merely equivalent.

**Non-Goals:**

- Re-basing anything the position means to the GRAMMAR. `provisional-cleanup`'s record, the
  structural keys, and the enforcement filter act on the buffer, where whole-document derivation
  is the correct frame.
- Any change to when a position is recognised. The gate stays "one empty cursor, on a blank
  line, owned by a node".

## Decisions

### Scope the probe, not the result

The probe is built from the scope document's text at a root-relative line, parsed there, and the
resulting per-line facts shifted back by the root's start line.

The alternative — keep the whole-buffer parse and subtract the root's depth from every fact
afterwards — was rejected because depth is not the only thing the wrong tree is wrong about.
The guide tracks are two arrays of depths, not one number; `hasChildren` and the bisection gate
are answered by tree shape; and the trail's accents are clipped by depth membership against the
re-based guides, so a subtraction would have to be repeated correctly in four places and would
still produce depths for lines the zoomed view does not render. Scoping the input answers all of
them with one substitution, and the answer is the same kind of object every other zoomed
computation already produces.

### The record carries the offset; the consumers do the shifting

`computeProvisional` resolves the scope (it already reads `EditorState`, and `zoomScope` is
cached per state, so this costs nothing per render) and stores the offset on the `Provisional`
record alongside the materialized document, which stays in the SCOPE's own line numbering. The
position's `line` and its own `fact` are stored in ABSOLUTE line numbers, because every consumer
looks those up by the line the editor renders.

Resolving the scope at each consumer instead would put the same translation in three places, and
`accentsOn` exists precisely because two computations drifting out of step is the failure mode
this layer has already had.

### The bisection gate is answered inside the scope

`positionBisectsANode` is evaluated against the scoped parse, so "does this position bisect a
node" is asked about the document the view is showing. For a position anywhere inside the
subtree the answer is the same as the whole-buffer one — the node in question is entirely inside
the subtree either way. It can differ only at the cover's own trailing gap, where the whole
buffer has content below that the view does not; there the scoped answer is the one that matches
what is on screen, which is what this layer renders.

### The derivation is pure; the adapter only reads state

The scoped materialization — probe, parse, own fact, bisection answer — is stated once as a pure
function beside the existing provisional helpers in `decorate.ts`, taking the text, the caret's
line and column, and the scope (or null). `decorations.ts`'s `computeProvisional` becomes the
thin `EditorState`-reading wrapper around it.

This is the same split `zoomAwarePositionTrail` already makes, and for the same reason: what the
unit suite can exercise is the pure half, and a derivation reachable only through a live editor
is a derivation only e2e can pin. The alternative — keeping the whole thing inside the adapter —
would leave the zoomed and unzoomed frames provable only in the browser.

### Falling back rather than guarding

If the caret's line is outside the scope document — unreachable while caret confinement holds —
`materializeProbe` returns null for an out-of-range line, the position is simply not recognised,
and the view renders from `baseFacts`. That is a correct rendering, so no explicit guard is
added for a state the enforcement layer already prevents.

## Risks / Trade-offs

- [The scoped and unscoped parses disagree at the cover's trailing gap] → Stated as a decision
  above rather than left implicit, and covered by a spec scenario: while zoomed, the view's own
  document is the frame.
- [Two parses per keystroke on a blank line while zoomed — the scoped probe plus the buffer parse
  every other layer takes] → Not new: the position path already parses a probe on every such
  render, and this one parses a SMALLER document. The existing per-`EditorState` caches are
  kept unchanged.
- [A future consumer reads `provisional.doc` and forgets it is scope-local] → The offset lives on
  the same record, so the translation is reachable wherever the document is; the field is
  documented as local at its declaration.
- [The re-basing is invisible in the unzoomed case, so a regression there would go unnoticed] →
  The unit coverage asserts the unzoomed derivation against today's output, not only the zoomed
  one.
