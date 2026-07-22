# node-edit-enforcement Specification

## Purpose
Defines node-boundary edit enforcement, built on the transaction-classification
funnel: how a `boundary-crossing-edit` transaction resolves to a `pass`, `rewrite`,
or `veto` verdict via a pure function over edit facts and the parsed tree —
structural deletion of whole subtrees (with their trailing gaps), content-adjacent
node merges under the per-kind algebra, boundary-respecting paste/drop splicing and
re-indentation, chrome-transparent intent recognition (gap width and marker
internals never change editing semantics), and the undo/byte-fidelity contract for
every rewrite and veto. Architecture and rationale: the outline-edit-enforcement
change's design.md (D9–D16 for the chrome-transparency, merge, cursor-placement, and
paste-re-indentation amendments from five real-vault manual passes); deferred
threads: docs/research/04 (Q17 outdent-in-place and heading-Enter-split, Q20 the
redo-cursor investigation), docs/research/12–13 (gap-line visual/cursor UX).

## Requirements
### Requirement: User edit transactions receive a verdict
Every transaction classified `boundary-crossing-edit` in an outline-mode editor SHALL
receive exactly one verdict — `pass`, `rewrite`, or `veto` — computed by a pure
function over the edit facts and the parsed tree, unit- and property-tested
independently of Obsidian. `within-node-edit` transactions SHALL always pass
unmodified. Transactions of every other class (`programmatic`, `composition`,
`plugin-own`, `selection-only`) SHALL never receive a verdict and keep their existing
pass-through and selection-escalation behavior byte-for-byte.

#### Scenario: Within-node authoring is never enforced
- **WHEN** the user types `# ` at the start of a paragraph node, changing its parsed
  kind
- **THEN** the transaction passes unmodified — structure-changing within-node edits
  are authoring, not violations

#### Scenario: Sync reconciliation is never enforced
- **WHEN** an external file change is reconciled into the open editor (the
  `set`-annotated path) with a diff spanning several nodes
- **THEN** the transaction is classified `programmatic` and applied byte-identically,
  with no verdict computed

### Requirement: Rewritten edits always yield a valid tree
Every `rewrite` verdict SHALL delegate to the pure structural operations, and its
output SHALL re-parse to a well-formed tree with no partially deleted, partially
merged, or orphaned nodes — verified by property tests over generated documents and
edits.

#### Scenario: No half-node remainders
- **WHEN** any user deletion whose range crosses node boundaries is applied through
  the funnel
- **THEN** the resulting document parses to a tree in which every remaining node is
  complete and every child has its parent

### Requirement: Deleting across boundaries removes whole subtrees with their gaps
A user deletion (or type-over) whose change range crosses node boundaries SHALL be
rewritten to the structural deletion of the range's whole-subtree cover, including
each covered subtree's trailing gap lines. Ranges already escalated by selection
enforcement and stale mid-node ranges (e.g. a programmatically restored selection)
SHALL both resolve through the same subtree-cover rule. Typed-over text SHALL be
inserted as new content at the deletion site within the same transaction.

#### Scenario: Deleting an escalated selection
- **WHEN** the user presses Backspace on a selection escalated to two sibling
  subtrees separated by a blank gap line
- **THEN** both subtrees and their trailing gap lines are removed, and the remaining
  neighbors are direct siblings with no leftover blank lines from the deleted nodes

#### Scenario: Stale mid-node selection deletion
- **WHEN** a selection crossing from mid-node A to mid-node B was applied
  programmatically (never escalated) and the user presses Delete
- **THEN** the edit is rewritten to the structural deletion of the subtree cover of
  A and B, not a character-level splice

#### Scenario: Deleting every node degrades cleanly
- **WHEN** the user deletes a selection covering all nodes of the document
- **THEN** the resulting document (empty or preamble-only) is valid and the editor
  remains fully functional

### Requirement: Editing semantics are chrome-transparent
Gap lines and structural markers are encoding chrome: no user-facing editing
semantic SHALL depend on gap width, gap ownership, or marker internals. An edit
expressing a content-level intent SHALL be interpreted in content space — the space
of node contents and the boundaries between them — with the chrome maintained by the
system. Exception (the deliberate authoring escape hatch): an edit made with the
cursor placed ON a gap line, operating on the gap itself, SHALL stay native.

*(Amendment 2026-07-21, real-vault manual pass: the original single-separator merge
rule made every merge require first manually deleting the gap, one newline per
keystroke, with confusing intermediate states — gap ownership leaking into editing
semantics. This requirement pins the general principle; the merge requirement below
is its first application.)*

#### Scenario: Gap width never changes merge behavior
- **WHEN** the user presses Backspace at a node's first content character, with zero,
  one, or three blank lines separating it from the previous node
- **THEN** the outcome is identical in all three cases — the merge (or its veto)
  behaves as if the gap did not exist, and an accepted merge consumes the gap whole

#### Scenario: Editing the gap itself stays native
- **WHEN** the user places the cursor on a blank gap line and presses Backspace or
  Delete to shrink the gap
- **THEN** the edit applies exactly as stock — deliberate whitespace authoring is
  never rewritten

### Requirement: Content-adjacent deletions become merges or vetoes
A deletion expressing "join this node with its content-space neighbor" SHALL be
rewritten to the structural merge of the two nodes when the merge is expressible
under the per-kind algebra, and SHALL be vetoed with the rejection cue when it is
not. The recognized shapes, all cursor-derived and input-agnostic (any gesture
producing the same edit from the same cursor position is enforced identically):

- Backspace with the cursor at a node's first content character — deleting backward
  into chrome (the separator newline, a gap line's newline, or a list marker's
  trailing space) — merges that node into its content-space predecessor (the node
  whose content ends nearest above; possibly its parent or a previous sibling's
  deepest descendant).
- Delete with the cursor at a node's last content character — deleting forward into
  chrome — merges the node's content-space successor into it. When no successor
  exists, the edit passes natively (trailing whitespace editing, nothing structural
  below).
- A node with no content-space predecessor (the document's first node) vetoes its
  Backspace-merge with the cue rather than passing a chrome-corrupting deletion.

An accepted merge SHALL append the absorbed node's content directly to the end of
the surviving node's content (no continuation-line remnant standing in for the old
gap), consume the intervening gap entirely, re-parent the absorbed node's children
per the algebra, and form one undo step. The resulting cursor SHALL land at the
JOIN point — immediately after the surviving node's own original last line of
content, before the absorbed content now appended there — not at the merged node's
start, so that a follow-up keystroke continues naturally from where the user was
editing.

#### Scenario: Cursor lands at the join point, not the merged node's start
- **WHEN** a merge succeeds (any of the scenarios below)
- **THEN** the cursor sits exactly between the surviving node's original last
  character and the first character of the absorbed content — a follow-up
  keystroke inserts there, not at the merged node's first line

#### Scenario: Paragraph joins across a gap in one keystroke
- **WHEN** the cursor is at the first character of a paragraph separated from the
  previous paragraph by a blank line and the user presses Backspace
- **THEN** the two paragraphs merge into one node with the second's text appended
  directly after the first's, the gap gone, as a single structural edit

#### Scenario: List item merges into its parent paragraph
- **WHEN** the cursor is at the content start of the first list item under a
  paragraph (after the `- ` marker) and the user presses Backspace
- **THEN** the item's text is appended to the paragraph's text, the item's children
  re-parent under the merged node, and no marker fragment is left behind

#### Scenario: Structure-corrupting merge is vetoed
- **WHEN** the user presses Backspace at the first character of a heading (a merge
  that would absorb the heading and destroy its section's anchor)
- **THEN** the document is unchanged and the rejection cue is shown

### Requirement: Structural pastes splice at node boundaries
A paste or text drop whose inserted content parses as a STRUCTURAL block sequence
— more than one top-level block, OR a single top-level block that itself has
children (a whole one-node subtree copy) — and whose target position is inside a
node SHALL be rewritten to insert the parsed subtrees at the nearest node boundary
of the target scope, re-indented to a valid depth for that scope, preserving the
copied content's own relative nesting exactly regardless of the target's depth
relative to the original. Inserted content parsing as a single CHILDLESS block or
as bare continuation lines SHALL pass through unmodified. When the target node is
an EMPTY anchor — no content of its own and no children — the paste SHALL replace
that node with the pasted subtrees rather than splicing after it and leaving it
stranded.

#### Scenario: Block copy pasted mid-paragraph
- **WHEN** a multi-range block-level copy (whole subtrees) is pasted with the cursor
  mid-paragraph
- **THEN** the subtrees are inserted after that paragraph node at its depth, and the
  paragraph's own text is not merged with the pasted content

#### Scenario: A single node with nested children is still spliced and re-indented
- **WHEN** a copy of exactly one node that itself has children (e.g. a list item
  with a nested child) is pasted at a target depth different from where it was
  copied from
- **THEN** the whole subtree re-indents to the target depth, its own internal
  relative nesting preserved exactly — never inserted verbatim at its original
  depth, and never merged raw into the surrounding text

#### Scenario: Plain multi-line fragment stays native
- **WHEN** a multi-line plain-text fragment with no block structure is pasted
  mid-paragraph
- **THEN** the paste applies exactly as stock Obsidian (continuation-line authoring)

#### Scenario: A single CHILDLESS block also stays native
- **WHEN** a copy of exactly one list item with no children of its own is pasted
  mid-paragraph
- **THEN** the paste applies exactly as stock Obsidian — indistinguishable from
  continuation-line authoring, since there is no subtree structure to preserve

#### Scenario: Pasting into an empty list item replaces it
- **WHEN** a multi-block sequence is pasted with the cursor on a list item that has
  no content and no children (e.g. one just created by Enter)
- **THEN** the empty item is replaced by the pasted subtrees — no empty item remains
  in the result

#### Scenario: An empty item WITH children still splices after it
- **WHEN** a multi-block sequence is pasted with the cursor on a list item that has
  no content of its own but DOES have children
- **THEN** the pasted subtrees are inserted after that item, which is left in place

#### Scenario: Replacing the SOLE empty child at a deep level re-indents to that depth
- **WHEN** a multi-block sequence is pasted with the cursor on an empty list item
  that is the ONLY child in its scope (no sibling before or after it to splice
  against)
- **THEN** the pasted subtrees are re-indented to the replaced item's own depth —
  never left at the pasted content's own original depth

### Requirement: Vetoed edits leave no trace and surface a cue
A `veto` verdict SHALL leave the document byte-identical, SHALL add no undo-history
entry, and SHALL surface the existing transient rejection cue naming the reason. The
cue SHALL NOT be emitted from inside the transaction filter itself.

#### Scenario: Veto is invisible to history
- **WHEN** a vetoed Backspace is followed by undo
- **THEN** the undo reverts the last *accepted* edit — the veto contributed no
  history entry

### Requirement: Rewritten edits are single, faithful undo steps
Each rewritten edit SHALL dispatch as one transaction carrying a plugin-own
`userEvent`, forming exactly one undo step whose undo restores the pre-edit buffer
byte-identically, and SHALL NOT be re-processed by the funnel (no rewrite loops).

#### Scenario: Undo after a structural deletion
- **WHEN** the user deletes an escalated selection (rewritten to a subtree deletion)
  and presses undo
- **THEN** the buffer is byte-identical to its state before the deletion, in one step

### Requirement: Enforcement meets the latency budget on the enforced path
Verdict computation and rewrite construction SHALL stay within the funnel's existing
budget (≤ 1 ms median, ≤ 8 ms p95 per transaction on a ~2000-line note), measured by
the stats surface's per-verdict timings on real boundary-crossing edits — the first
recorded samples for this class — with the numbers recorded in the change
documentation.

#### Scenario: Enforced-path timings recorded
- **WHEN** the evidence suite drives boundary deletions, merges, and structural
  pastes on the stress note
- **THEN** recorded per-verdict timings satisfy the budget and are written into the
  change documentation

### Requirement: Enforcement is observable and hard-to-automate paths are still verified
The stats surface SHALL count verdicts per class (`pass`/`rewrite`/`veto`) readable
by automated tests, with per-transaction verdict logging behind the existing debug
setting. The find-and-replace panel and HTML5 drag-drop paths — Phase A's known
automation gaps, now enforced paths — SHALL each get a renewed automation attempt
and, where automation remains infeasible, a scripted manual-pass scenario whose
verdict is recorded before the change is archived.

#### Scenario: Verdict counters drive e2e assertions
- **WHEN** an e2e scenario triggers a rewrite
- **THEN** the stats surface shows the incremented `rewrite` count for the expected
  class

#### Scenario: Automation gap is closed or consciously carried
- **WHEN** the change reaches verification and a gap path still cannot be automated
- **THEN** its scripted manual scenario and observed verdict are recorded in the
  change documentation, not silently skipped

