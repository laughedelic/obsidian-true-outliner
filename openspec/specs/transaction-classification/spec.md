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
an enforced class SHALL pass through unmodified (default-permit).

#### Scenario: Typing inside a node
- **WHEN** the user types a character in the middle of a paragraph node's text
- **THEN** the transaction is classified `within-node-edit` and applied unmodified

#### Scenario: Edit spanning two nodes counted but not altered
- **WHEN** a deletion's change range starts inside one node and ends inside the next
- **THEN** the transaction is classified `boundary-crossing-edit`, counted in the stats
  surface, and applied unmodified (rewriting is out of scope for this capability)

**Covered by**: `tests/classify.test.ts` (order precedence, every class reachable,
totality property); `e2e/specs/60-transaction-classification.e2e.ts` (coverage matrix)

### Requirement: Document text is never modified by this layer
The classification layer SHALL NOT add, remove, or alter any change spec of any
transaction, in any class, under any condition. Its only permitted transaction
modification is the selection replacement defined by the node-selection-enforcement
capability.

#### Scenario: Byte-identical buffer across classified edits
- **WHEN** any sequence of edits is dispatched in an outline-mode note with the filter
  active
- **THEN** the resulting buffer is byte-identical to the same sequence applied with the
  filter absent

**Covered by**: `e2e/specs/60-transaction-classification.e2e.ts` (on-mode vs off-mode
byte-identity; undo-stack non-interference)

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

#### Scenario: Tab indent is not reclassified
- **WHEN** Tab indents a node via the outline keyboard grammar
- **THEN** the resulting transaction is classified `plugin-own` and applied exactly as
  the grammar produced it, including its cursor placement

**Covered by**: `e2e/specs/60-transaction-classification.e2e.ts`
("grammar/structural-command transactions are plugin-own…")

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
