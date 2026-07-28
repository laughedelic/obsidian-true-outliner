# transaction-classification Specification

## Purpose
Defines the enforcement funnel: a CM6 `transactionFilter` scoped to outline mode that
classifies every transaction against the parsed tree — the single choke point all
document and selection mutations flow through. Covers the six-class taxonomy and its
pass-through contract for programmatic/remote/composition transactions, the
keystroke-latency budget, nested-editor safety, and the dev-facing observability that
turns each choke-point assumption into a permanent regression test. Architecture and
rationale: the outline-selection-enforcement change's design.md; evidence and findings:
`docs/research/04` Q14.
## Requirements
### Requirement: Enforcement funnel is registered and scoped to outline mode
A CM6 `transactionFilter` SHALL be registered via `registerEditorExtension` and SHALL
inspect every transaction dispatched in any editor. For editors whose file does not have
outline mode enabled (resolved through the public `editorInfoField`), the filter SHALL
return the transaction unchanged with no other observable effect, so off-mode editor
behavior is byte-for-byte and timing-indistinguishable from stock Obsidian.

#### Scenario: Off-mode transaction untouched
- **WHEN** any edit or selection change is made in a note without outline mode
- **THEN** the dispatched transaction is applied exactly as produced, and no
  classification side effects (stats, logs) are recorded for it

#### Scenario: Mode toggle takes effect immediately
- **WHEN** outline mode is toggled on for the active note
- **THEN** the very next transaction in that editor is classified, with no editor reload

**Covered by**: `e2e/specs/60-transaction-classification.e2e.ts` (off-mode
byte-identity in "a boundary-crossing edit sequence is byte-identical whether outline
mode is on or off")

### Requirement: Every transaction receives exactly one classification
In outline-mode editors the filter SHALL assign each transaction exactly one class from:
`programmatic`, `composition`, `plugin-own`, `selection-only`, `within-node-edit`,
`boundary-crossing-edit` — evaluated in that order, first match wins. Classification
SHALL be computed by a pure function over transaction facts and the parsed tree, unit-
and property-tested independently of Obsidian. Any transaction not confidently matching
an enforced class SHALL pass through unmodified (default-permit). Transactions
classified `boundary-crossing-edit` SHALL additionally be handed to the
node-edit-enforcement verdict layer, which determines whether they pass, are
rewritten, or are vetoed.

`boundary-crossing-edit` covers, beyond change ranges whose line spans touch more than
one node: pure insertions whose inserted text parses as a multi-block sequence
(landing on a node's own line), single-character deletions of a line boundary whose
adjacent lines belong to different nodes, and — per node-edit-enforcement's
chrome-transparency requirement (amendment 2026-07-21) — chrome-boundary deletions
whose merge intent is established by the pre-edit cursor position: a deletion of a
list marker's trailing space ending exactly at the item's first content column with
the cursor there, and a deletion of the newline ending a node's last content line
with the cursor at that node's content end (Delete into the node's own trailing
gap). The pre-edit main-selection cursor is a classification fact supplied by the
adapter for exactly these shapes; an edit with the same bytes but a different cursor
(editing the gap from within it) remains `within-node-edit`.

#### Scenario: Typing inside a node
- **WHEN** the user types a character in the middle of a paragraph node's text
- **THEN** the transaction is classified `within-node-edit` and applied unmodified

#### Scenario: Edit spanning two nodes counted but not altered
- **WHEN** a deletion's change range starts inside one node and ends inside the next
- **THEN** the transaction is classified `boundary-crossing-edit`, counted in the stats
  surface, and receives a verdict per the node-edit-enforcement capability (superseded
  by this change: "not altered" no longer holds unconditionally — a `rewrite` or
  `veto` verdict may change or block the edit; the byte-identical guarantee survives
  narrowed to a `pass` verdict, per the new "Text modification is confined to enforced
  verdicts" requirement below)

#### Scenario: Marker-space deletion at content start is enforced
- **WHEN** the cursor sits at a list item's first content character and Backspace
  deletes the marker's trailing space
- **THEN** the transaction is classified `boundary-crossing-edit` and handed to the
  verdict layer (a merge intent), not applied as a within-node marker corruption

#### Scenario: The same bytes with a gap-line cursor stay native
- **WHEN** a deletion removes the newline between a node's last content line and its
  own trailing gap, with the pre-edit cursor ON the gap line
- **THEN** the transaction is classified `within-node-edit` and applied unmodified
  (deliberate whitespace authoring)

### Requirement: A change exactly covering whole subtrees is a boundary-crossing edit
A user change whose range exactly covers one or more whole subtrees — including each
covered subtree's owned trailing gap — SHALL be classified `boundary-crossing-edit`
so that it reaches the verdict layer, even when the raw line span it touches falls
inside a single node. Cover recognition SHALL reuse the exported cover computation
rather than deriving subtree bounds a second time.

*(Added 2026-07-25, `fix-orphan-gap-on-node-deletion`: the change span's OLD line-span
convention is deliberately blind to a single trailing newline, so a deletion that
exactly covers one node's content plus its own trailing gap read as within-node —
never reaching the boundary-crossing class at all.)*

#### Scenario: Deleting one exactly-selected node reaches the verdict layer
- **WHEN** the user deletes a selection that exactly covers a single node's whole
  subtree
- **THEN** the transaction is classified `boundary-crossing-edit` and a verdict is
  computed, rather than passing as a within-node edit

#### Scenario: An ordinary within-node deletion is unaffected
- **WHEN** the user deletes a few characters inside a node's text
- **THEN** the transaction is still classified `within-node-edit` and passes
  unmodified

### Requirement: Multi-range user edits receive verdicts
A user edit transaction with more than one change range SHALL NOT be excluded from
verdict computation by construction. Each change range SHALL be evaluated, and the
transaction SHALL receive a verdict derived from all of them. Where any range's shape
is not one the verdict layer models, the transaction SHALL pass unmodified,
preserving today's conservative default.

*(Added 2026-07-25, `fix-orphan-gap-on-node-deletion`: the verdict layer previously
declined any transaction with more than one change range unconditionally — a
deliberate conservative bias from `outline-edit-enforcement` D1 that left escalated
multi-range selections, reachable by ordinary multi-cursor gestures, unenforced.)*

#### Scenario: Deleting a multi-range selection of exact covers is enforced
- **WHEN** the user deletes a selection consisting of two ranges, each exactly
  covering a whole subtree
- **THEN** a verdict is computed and the result is a structural deletion of both
  subtrees

#### Scenario: An unmodelled multi-range edit still passes
- **WHEN** a multi-range edit contains a range whose shape the verdict layer does not
  model
- **THEN** the transaction passes unmodified, as it does today

### Requirement: Programmatic and remote transactions pass through untouched
Transactions carrying no `userEvent` annotation, carrying undo/redo history
signatures, or carrying the `set` annotation Obsidian uses when reconciling an
external file change into an open editor SHALL be classified `programmatic` and
passed through with changes and selection untouched. This SHALL hold for
full-document loads and sync/external-reload style replacements, preserving the
interop guarantee that other tools' edits are never fought or rewritten.

#### Scenario: External-style full-document replacement
- **WHEN** the document is replaced programmatically (a `setValue`-style dispatch with
  no user event, as an external reload or sync would produce)
- **THEN** the transaction is classified `programmatic` and applied byte-identically,
  including its selection

#### Scenario: Undo restores state without re-normalization
- **WHEN** the user invokes undo after any classified transaction
- **THEN** the history transaction passes through unmodified and restores the prior
  state exactly

**Covered by**: `e2e/specs/60-transaction-classification.e2e.ts` ("setValue-style and
external replacements…", "undo restores state exactly…" — which also records the
finding that on desktop Obsidian's undo bypasses the filter entirely, a stronger
guarantee; under mobile emulation the bypass is platform-dependent, see
docs/research/04 Q14)

### Requirement: Grammar and command transactions are recognized as plugin-own
Transactions dispatched by this plugin's own keyboard grammar and structural commands
(identified by their `userEvent` annotations) SHALL be classified `plugin-own` and
passed through unmodified — they are valid by construction and MUST NOT be re-processed.

*(Amendment 2026-07-27, `minimal-changesets-for-structural-ops`: this requirement
previously also covered the cursor re-assertion transaction that followed EVERY
structural operation, via a `select.structural` `userEvent` in the plugin-own set. That
`userEvent` is removed. The re-assertion itself still exists — narrowed to the
operations that choose their own cursor (`structural-history-integration`) — but it is
no longer classified at all: it dispatches with `filter: false`, so the enforcement
funnel never observes it, which is what the plugin-own entry had existed to achieve. The
guarantee for grammar and command dispatches is unchanged.)*

*(Amendment 2026-07-25, `content-space-caret`: an earlier wording named
"marker-transparent cursor clamping", the `clampCursorToContent` mechanism that change
retires. The guarantee is unchanged — plugin-own dispatches land byte-exactly — only the
name of what they are exempt from.)*

#### Scenario: Tab indent is not reclassified
- **WHEN** Tab indents a node via the outline keyboard grammar
- **THEN** the resulting transaction is classified `plugin-own` and applied exactly as
  the grammar produced it, including its cursor placement

**Covered by**: `e2e/specs/60-transaction-classification.e2e.ts`

### Requirement: IME composition is never interfered with
Transactions that are part of an active IME composition SHALL be classified
`composition` and passed through with changes and selection untouched, regardless of
what spans they touch.

#### Scenario: Composition across a node boundary region
- **WHEN** an IME composition session is active in an outline-mode note
- **THEN** every composition transaction applies unmodified and composition completes
  exactly as in stock Obsidian

**Covered by**: manual verification (2026-07-20, Chinese IME — see docs/research/04
Q14: composition transactions classify `composition`, the candidate-commit transaction
classifies `programmatic`; both pass-through). Not automatable in the e2e harness.

### Requirement: Nested editors are safe from enforcement effects
Classification and any enforcement built on it SHALL produce no observable effect
inside Obsidian's nested per-cell editors (e.g. Live Preview table cells), whose
transactions also flow through globally registered extensions. Safety SHALL be
verified against the existing wide-table fixture, not assumed.

#### Scenario: Editing a table cell in an outline-mode note
- **WHEN** the user types, selects, and drag-selects inside an actively edited table
  cell of an outline-mode note
- **THEN** cell content and cell selection behave byte-for-byte as stock Obsidian, with
  no escalation or other enforcement effect inside the cell

**Covered by**: `e2e/specs/60-transaction-classification.e2e.ts` ("nested per-cell
table editor…")

### Requirement: Classification meets the keystroke-latency budget
Per-transaction classification cost (including tree access) SHALL stay within the
budget of ≤ 1 ms median and ≤ 8 ms p95 on a ~2000-line stress note, measured by the
instrumentation's own timing counters, with the measured evidence recorded in the
change's verification notes. Parsed-tree access SHALL be cached per document version so
selection-only transactions never re-parse.

#### Scenario: Stress-note measurement recorded
- **WHEN** the evidence suite drives typing and selection across a ~2000-line note
- **THEN** recorded timings satisfy the budget, and the numbers (median/p95) are
  written into the change documentation

**Covered by**: `e2e/specs/60-transaction-classification.e2e.ts` ("performance:
classification stays within budget…"); measured numbers in docs/research/04 Q14

### Requirement: Classification is observable for verification
The plugin SHALL maintain a classification stats surface (per-class counters, timing
aggregates, and a bounded ring buffer of recent classifications) readable by automated
tests through the plugin instance. Per-transaction console logging SHALL be gated
behind the existing parser-crosscheck debug setting, and a developer command SHALL
print a stats summary on demand. Every mutation path in the coverage matrix — typing,
paste, mouse drag selection, keyboard selection, find-and-replace, drag-drop text,
programmatic edit — SHALL have an automated scenario asserting its observed
classification, forming the permanent evidence that all mutation paths flow through
the funnel.

#### Scenario: Paste is observed by the funnel
- **WHEN** multi-line text is pasted into an outline-mode note
- **THEN** the stats surface records a classification for the paste transaction

#### Scenario: Debug logging stays opt-in
- **WHEN** the debug setting is off
- **THEN** no per-transaction console output is produced, while counters still update

**Covered by**: `tests/stats.test.ts`; `e2e/specs/60-transaction-classification.e2e.ts`
(coverage matrix — note: find-and-replace and drag-drop-text are known automation gaps,
recorded in the change's tasks.md 3.1; both are UI-panel/native-DnD gestures the
WebDriver harness cannot reliably synthesize)

### Requirement: Text modification is confined to enforced verdicts
The funnel SHALL NOT add, remove, or alter any change spec of any transaction
classified `programmatic`, `composition`, `plugin-own`, `selection-only`, or
`within-node-edit`, under any condition — for these classes the buffer SHALL remain
byte-identical to the same dispatches applied with the filter absent. Only
transactions classified `boundary-crossing-edit` may have their changes replaced, and
only as prescribed by the node-edit-enforcement capability.

#### Scenario: Pass-through classes stay byte-identical
- **WHEN** a sequence of within-node edits, programmatic replacements, and plugin-own
  grammar operations is dispatched in an outline-mode note
- **THEN** the resulting buffer is byte-identical to the same sequence applied with
  the filter absent

#### Scenario: Off-mode is untouched by the verdict layer
- **WHEN** any boundary-crossing edit is made in a note without outline mode
- **THEN** the transaction is applied exactly as dispatched, with no classification
  or verdict recorded

