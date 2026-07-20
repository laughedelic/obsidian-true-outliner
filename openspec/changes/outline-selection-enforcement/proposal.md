# Proposal: outline-selection-enforcement

## Why

The project's defining invariant — every operation respects node boundaries — has no
enforcement mechanism yet: the grammar keymaps and structural commands only *generate*
valid edits, while every other mutation path (mouse selection, paste, find-and-replace,
other plugins) reaches the document unchecked, which is exactly the "one careless
selection away from breaking" failure the manifest calls out. The architecture bet behind
fixing this — a CM6 `transactionFilter` as a single choke point over all document and
selection changes — was scored "High confidence, novel engineering" in the feasibility
research (docs/research/03) but has never been validated in a real Obsidian editor. This
change builds the smallest slice that both validates the bet with falsifiable checks
(Phase A) and ships the first user-visible enforcement: node-boundary selection
normalization (Phase B).

## What Changes

- **Phase A — transaction classification (observe, never alter document text).** A
  `transactionFilter` registered via `registerEditorExtension` that classifies every
  transaction in outline-mode editors against the parsed tree (within-node edit /
  boundary-crossing edit / selection-only / programmatic-or-remote / composition) and
  exposes the classification to dev instrumentation (extending the existing `crosscheck`
  dialect-drift pattern). It must answer, with concrete pass/fail evidence, the
  choke-point assumptions the enforcement architecture rests on:
  - every mutation path (typing, paste, drag-drop, find-and-replace, spellcheck, other
    plugins' dispatches) flows through the filter;
  - programmatic/remote changes (Obsidian Sync, external reload, `Vault.process`) are
    reliably distinguishable via transaction annotations and are always passed through
    untouched;
  - per-transaction classification cost stays within a keystroke-latency budget at
    real note sizes;
  - behavior inside Obsidian's nested per-table-cell editors is safe by construction or
    explicitly gated (the state-level filter cannot use the DOM-ancestry
    `isNestedEditor` gate the decorations use);
  - IME composition transactions are recognized and never interfered with.
- **Phase B — node-boundary selection enforcement.** Selection changes whose range would
  straddle a node boundary are normalized in the same funnel: the selection escalates to
  cover whole nodes (the pro-outliner-v1 pattern, rebuilt on our universal block tree).
  Cursor placement (empty selections) is never altered. Off-mode notes and pass-through
  transaction classes are byte-for-byte and behavior-identical to stock Obsidian.
- **Explicitly out of scope (Phase C, a later change):** rewriting or vetoing *document
  edits* (boundary-crossing deletions → structural deletions, paste re-indentation,
  orphan prevention). This change never modifies transaction *changes*, only selection.

## Capabilities

### New Capabilities

- `transaction-classification`: the enforcement funnel — a transactionFilter scoped to
  outline mode that classifies every transaction against the parsed tree, its
  pass-through contract for programmatic/remote/composition transactions, its
  performance budget, its nested-editor safety, and its dev-facing observability.
- `node-selection-enforcement`: selection normalization built on the funnel — when and
  how a boundary-crossing selection escalates to whole-node coverage, cursor and
  multi-range semantics, and the stock-behavior guarantees outside outline mode.

### Modified Capabilities

<!-- none: existing specs' requirements are unchanged; new behavior lands as new
     capabilities, and existing gating/e2e patterns are reused, not altered -->

## Impact

- **New code**: a pure classifier module in `src/` (mirroring the `ops.ts`/`dispatch.ts`
  pure-function + property-test discipline: `(tree, transaction facts) → class`), a thin
  CM6 `transactionFilter` adapter plus selection-normalization logic in `src/plugin/`,
  wired in `main.ts` alongside the existing grammar/decoration extensions.
- **Existing code touched**: `main.ts` (register the extension), `crosscheck.ts` or a
  sibling dev-instrumentation surface (classification counters/log), reuse of
  `locate.ts` (node-at-line) and the parse cache the decorations already maintain.
- **Tests**: unit/property tests for the classifier and escalation math; e2e specs
  driving real mutation paths (mouse selection, paste, find-and-replace, sync-like
  programmatic edits, table-cell nested editors) — the Phase A assumption checks become
  permanent regression tests.
- **No file-format, settings-schema, or existing-spec behavior changes.** Off-mode
  notes and all pass-through transaction classes remain byte-identical to stock
  Obsidian, preserving the Q6 interop guarantees.
