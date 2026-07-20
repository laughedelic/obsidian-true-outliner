# Design: outline-selection-enforcement

## Context

The enforcement (invariant) layer is the third pillar of the decided v1 core (grammar +
node selection + structure invariants, Q4) and the only one with no code behind it. The
feasibility research (docs/research/03) bet the architecture on a CM6 `transactionFilter`
as a single choke point — every document/selection mutation, from every source, flows
through one funnel where it can be classified and normalized. That bet has never been
exercised inside a real Obsidian editor, and the decoration experiments taught us that
"every CM6 instance app-wide" has surprises (nested per-table-cell editors, Live Preview
widget atoms) that state-level mental models miss.

This change builds the funnel in two phases within one change:

- **Phase A (observe)**: a classifier that inspects every transaction and alters nothing
  about document text — pure feasibility instrumentation with permanent regression value.
- **Phase B (selection)**: the first real enforcement — node-boundary selection
  escalation — built on the classifier, altering only selection, never changes.

Edit rewriting/vetoing (Phase C) is a later change, deliberately specified only after
Phase A produces real data about what transactions look like in the wild.

Relevant existing machinery: `parse()` (line → tree, byte-lossless), `locate.ts`
(`nodeAtLine`), the grammar's `userEvent`-annotated dispatches, the `crosscheck` dev
instrumentation pattern (debug setting + console), and e2e helpers that can execute JS
inside the app to read plugin-exposed state.

## Goals / Non-Goals

**Goals:**

- Validate, with falsifiable evidence, the five choke-point assumptions: full mutation-path
  coverage; reliable programmatic/remote detection; per-transaction cost within a
  keystroke budget; nested-editor safety without DOM access; IME non-interference.
- Ship node-boundary selection enforcement: a non-empty selection can never straddle a
  node boundary mid-node in outline mode.
- Keep the fail-safe direction *permissive*: anything unrecognized passes through
  untouched. In this change a misclassification can at worst leave a selection
  un-escalated — it can never corrupt a document.
- Leave a classifier and instrumentation surface that Phase C builds on directly.

**Non-Goals:**

- No modification of transaction *changes* (no deletion rewriting, paste re-indentation,
  or vetoing) — that is Phase C.
- No visual node-selection chrome beyond CM6's native selection rendering (a later
  polish layer; the decoration follow-ups parking lot holds related ideas).
- No vim-mode support (Q8) and no mobile-specific testing (Q7: mobile-safe by
  construction, desktop-tested).
- No changes to existing specs' behavior: grammar, structural commands, decorations, and
  off-mode behavior are untouched.

## Decisions

### D1. Mechanism: `EditorState.transactionFilter`, default-permit

`transactionFilter` (not `changeFilter`) because Phase B must be able to replace the
selection of a transaction, which `changeFilter` cannot. The filter is registered through
the existing `registerEditorExtension` bundle in `main.ts` and gates itself per
transaction: outline mode off (via the public `editorInfoField`, the same gate every
other extension uses) → return the transaction unchanged immediately.

Posture: **default-permit**. The classifier assigns exactly one class per transaction;
any transaction that doesn't confidently match an enforced class passes through
untouched. This is the safe polarity for an observer + selection-only change (worst case:
missed escalation). Phase C will need default-deny reasoning for edits; choosing that
polarity *now*, without Phase A's data, is exactly what this change exists to avoid.

*Alternative considered*: `view.inputHandler`/DOM event handlers (obsidian-outliner's
approach) — rejected; that is precisely the enumerate-the-inputs architecture the
manifest rejects.

### D2. A pure classifier module, filter as thin adapter

Classification logic lives in `src/` as a pure function over plain data —
`classify(factsOfTransaction, tree) → class` — property-tested without Obsidian, in the
same discipline as `ops.ts`/`dispatch.ts`. The CM6 adapter in `src/plugin/` only
extracts facts (userEvent annotation, composition flag, change ranges as line spans,
selection ranges) and applies the verdict. Phase C later swaps "verdict is a label" for
"verdict may carry a rewrite" without re-architecting.

The classes (exactly one per transaction, checked in this order):

1. `programmatic` — no `userEvent` annotation, or a remote/sync/undo-redo signature.
   Includes full-document `setValue`-style loads. Always pass through.
2. `composition` — IME composition in progress. Always pass through.
3. `plugin-own` — carries one of our grammar/command `userEvent` values; already valid
   by construction. Pass through.
4. `selection-only` — no doc changes; user selection event. Phase B's input.
5. `within-node-edit` — all change ranges fall inside single nodes' spans. Pass through.
6. `boundary-crossing-edit` — some change range crosses a node boundary. **In this
   change: pass through, but counted** — the count is the headline Phase A metric and
   the sizing input for Phase C.

### D3. Provenance via `userEvent` annotations, verified not assumed

User-originated transactions are recognized by CM6's `Transaction.userEvent` annotation
(`select`, `select.pointer`, `input.type`, `delete.*`, `move.drop`, `undo`/`redo`, …);
absence of the annotation marks programmatic dispatches (plugins, Obsidian internals,
sync/external reloads). This convention is load-bearing and is treated as a **hypothesis
Phase A must confirm per source**: the e2e evidence suite drives each mutation path
(typing, paste, mouse drag, find-and-replace, a programmatic `Vault.process`-style edit,
an external-file reload) and asserts the observed classification. If a path arrives
without a distinguishing annotation, the conservative default (pass through) already
protects correctness; the finding gets recorded and the classifier tightened.

Undo/redo pass through as programmatic-like (`undo`/`redo` userEvent): history
transactions restore previously-accepted states and must never be re-normalized (Q11:
CM6-native undo).

### D4. Selection escalation: minimal contiguous whole-subtree cover

For each non-empty selection range in a `selection-only` transaction:

- Resolve the lines of `anchor` and `head` to nodes (`nodeAtLine`).
- If both ends resolve to the **same node** (including its trailing gap), the range is
  within-node: **untouched**. Word/phrase selection inside a node's text stays native.
- Otherwise escalate: find the deepest common ancestor scope, take the two
  children-of-that-scope subtrees containing each end, and expand the range to cover the
  **contiguous run of whole sibling subtrees** between them (first subtree's first line,
  char 0 → last subtree's last line, end; trailing gap lines excluded from the visual
  selection but owned for Phase C semantics).
- Anchor/head **orientation is preserved** (backward drags stay backward); only the
  positions move outward.

Why subtrees and not bare nodes: a selection covering a heading but not its section (or
a list item but not its children) has no valid structural meaning — every later
operation on a node selection (delete, move, copy) targets subtrees, and Phase C's
"deletion of an escalated selection is always a valid structural deletion" depends on
this choice. This matches Workflowy/Logseq behavior when selection leaves a single item.

Multi-range (multi-cursor) selections: each range escalates independently;
`EditorSelection` normalization merges any resulting overlaps.

Mechanics: the filter returns `[tr, { selection }]` so escalation lands **inside the
same transaction** — no second dispatch, no history entry (selection-only transactions
aren't history events), no observable intermediate state.

**D4 amendments (2026-07-20, from the real-vault manual pass):**

- **Gap-line trigger — single-node selection.** The original rule offered no way to
  select exactly one node whole: gap lines belong to the preceding node (the parse
  model's total-segmentation rule), so a drag from a node's text onto the blank line
  below still resolved both ends to the same node and passed through. Gap *ownership*
  stays as is (Phase C's structural-deletion semantics depend on it), but the
  escalation rule now distinguishes *where in the node* an end landed: a same-node
  range with an end on a trailing gap line escalates to that node's whole subtree.
  Drag past the node's end, before the next node → that node selected whole; drag
  back into the text → native character selection again (deliberately NOT Logseq's
  sticky block-mode, which the manual pass judged worse than our reversible model).
- **Expand-only invariant.** Escalation never shrinks a range: the result is the
  union of the computed subtree cover and the original range. Required for the
  gap-line trigger to be safe — without it, Select All in a no-frontmatter note
  (head on the document's final gap line) would be pulled back to the last content
  character, dropping the trailing newline from the selection (a stock-behavior
  regression; the single-paragraph note is the sharpest case: same-node + gap end =
  exactly the new trigger). As a bonus it fixes the same latent newline-exclusion in
  the pre-amendment multi-node no-frontmatter Select All path. The "trailing gap
  excluded from the visual selection" phrasing of the original D4 still holds for
  ends the user placed *inside* content — gap lines appear in the selection only
  when the user explicitly dragged onto them.
- **Uniform multi-range escalation.** Per-range independence allowed mixed
  selections (one range block-level, another mid-node), whose copy pastes as a
  structurally invalid mix — a mid-node fragment joining onto a block (observed in
  the manual pass). Now, once any range escalates, every non-empty in-jurisdiction
  range escalates to at least its own node's subtree. Every range then starts/ends
  at node boundaries, and since CM6 joins multi-range copies with newlines, a
  multi-range copy is a concatenation of complete subtrees — structurally valid by
  construction. (Block-wise *keyboard extension* of an escalated multi-range
  selection is a modal-behavior question deferred to a future selection-UX change —
  a track kept deliberately separate from Phase C's edit rewriting; see
  docs/research/13-selection-follow-ups.md.)

### D5. Jurisdiction: preamble and whole-document selections pass through

`nodeAtLine` resolves frontmatter/preamble lines to nothing — they are outside the
tree. Any selection range with an end in the preamble passes through unmodified, which
also keeps Select All (Cmd+A) byte-for-byte native: it spans preamble + all nodes, so it
is out of jurisdiction by this rule (and would escalate to itself anyway). Simple,
predictable, and preserves the most muscle-memory-critical selection gesture.

### D6. Nested-editor safety: degeneracy by construction, verified, plus a flag if needed

The decorations' `isNestedEditor()` DOM-ancestry gate is unavailable here —
`transactionFilter` runs at state level with no view access. Primary strategy:
**degeneracy by construction**. A nested per-cell editor's document is the cell's text —
a single block, parsing to at most one node — so `within-node-edit` and same-node
selection cover everything and the filter never acts. Phase A's e2e evidence must
confirm this on the wide-table fixture (type, select, drag inside a cell), including the
multi-block-cell edge (`<br>`-separated cell content) if reachable.

Fallback (only if verification falsifies degeneracy): a `StateField<boolean>` "nested"
flag, false by default, set once via a `StateEffect` dispatched by a tiny `ViewPlugin`
that *does* have DOM access — the same split the decorations use, adapted to state. The
race window before the effect lands is covered by default-permit. This is designed now
so a falsified hypothesis doesn't stall the change, but not built speculatively.

### D7. Tree access: parse cache keyed by document identity

The filter needs the parsed tree for the transaction's document. Decision: a
module-level `WeakMap<Text, OutlineDoc>` cache keyed by the CM6 `Text` instance —
`parsedDoc(state.doc)` parses once per document version and is shared by every
transaction (and reusable by any other consumer later). No new `StateField`, so no
extension-ordering coupling inside the filter, and selection-only transactions (doc
unchanged) always hit the cache.

Performance budget (Phase A measures against it, via the observer's own timing
counters): classification ≤ 1 ms median / ≤ 8 ms p95 per transaction on a ~2000-line
stress note, on CI-class hardware. If a full re-parse per doc version misses the budget
on edits, the fallback is incremental reuse (parse only from the first changed line's
enclosing top-level block), designed but not built until the numbers demand it.

### D8. Observability: counters on the plugin, logging behind the existing debug setting

A module-level stats object (per-class counts, per-class max/percentile timings, last N
classified transactions in a ring buffer) exposed as a public field on the plugin
instance — the e2e harness already executes JS in the app and reads plugin state the
same way (`isOutlineMode`). Per-transaction console logging sits behind the existing
crosscheck debug setting (same setting, same "developer console" contract — one debug
switch, not a second one), plus a dev command that prints a stats summary. The stats
surface is what turns each Phase A assumption into a permanent, assertable regression
test rather than a one-off manual observation.

## Risks / Trade-offs

- **[Escalation UX aggressiveness]** Shift+Down from mid-node into the next node jumps
  the selection to two whole subtrees — correct per the invariant, but potentially
  surprising mid-muscle-memory. → It is the manifest's defining behavior; mitigate with
  the real-vault manual pass judging feel, not just correctness. If it grates, a
  "boundary-clamp instead of escalate" alternative is a one-function swap in the pure
  module — record the verdict, don't pre-build both.
- **[Live drag re-escalation]** CM6 re-derives pointer selections from the drag anchor
  each move; escalation re-applies per `select.pointer` transaction. Expected stable,
  but jitter (selection bouncing between native and escalated) would be disqualifying.
  → Explicit e2e scenario with a real mouse drag; if unstable, escalate only on drag
  end (pointer-up transaction) as the fallback.
- **[userEvent taxonomy is convention, not contract]** Obsidian or third-party plugins
  may dispatch user-like transactions without annotations (classified `programmatic`,
  passed through) — an enforcement *gap*, not corruption, thanks to default-permit.
  → Phase A records observed annotations per source in the change docs; tighten
  classifier as evidence dictates. **Materialized once, already fixed**: external
  `Vault.process` reconciliation arrives annotated `"set"` (not annotation-less as
  assumed) — see Open Questions and docs/research/04 Q14. The opposite direction of
  this risk (undo dispatching WITH a plugin-own-shaped annotation) was also checked
  and does not occur — undo bypasses the filter entirely.
- **[Filter ordering vs other plugins]** Other plugins' transactionFilters/extenders may
  run after ours and produce a selection we never saw. Accepted for this change
  (coexistence warning already exists for outliner-class plugins, Q5); revisit with
  `Prec` only on observed conflict.
- **[Parse cost on huge notes]** Full parse per doc version could blow the budget on
  10k-line notes. → Budget + measurement are Phase A deliverables; incremental-reuse
  fallback designed (D7). A blown budget is a *finding*, not a silent ship.
- **[Nested-editor degeneracy could be false]** If a table cell's mini-document can
  parse as multiple nodes, selection escalation could visibly corrupt cell editing —
  the exact bug class decorations hit. → Dedicated e2e on the wide-table fixture before
  Phase B is enabled anywhere; D6 fallback flag ready.

## Migration Plan

Purely additive extension registration; no file-format, settings-schema, or command
changes. Rollback = unregister the extension (revert the `main.ts` wiring); documents
are untouched by construction (Phase A never alters text; Phase B alters only
selection). Phase A findings that falsify an assumption get recorded in this design doc
and docs/research/04 before Phase B ships, per the experiment-series discipline.

## Open Questions

- ~~Which exact `userEvent` values (if any) do Obsidian Sync and external-file reloads
  carry?~~ **ANSWERED (Phase A e2e, `60-transaction-classification.e2e.ts`):**
  external reconciliation via `Vault.process`/`Vault.modify` on an open file's path
  dispatches a real transaction annotated `userEvent: "set"` — not annotation-less as
  D3 originally hypothesized. `classify.ts`'s `isProgrammatic` now recognizes `"set"`
  explicitly (see its doc comment) so this path classifies `programmatic`, not
  `boundary-crossing-edit`, keeping that counter meaningful as a USER-edit metric.
  Separately, **undo does not dispatch through the `transactionFilter` at all** —
  confirmed live (zero classifications recorded, not even `programmatic`) — an even
  stronger safety guarantee than the D3 assumption ("classified programmatic, never
  re-normalized"): there is no transaction here to touch in the first place. Neither
  finding required a default-permit compromise; the classifier's conservative default
  already covered both correctly before the `"set"` tightening, and correctly covers
  undo's absence by construction (nothing to misclassify). See docs/research/04 Q14.
- ~~Does live-drag escalation feel right, or should escalation land on pointer-up
  only?~~ **ANSWERED (real-vault manual pass, 2026-07-20).** Both halves confirmed:
  the functional half by e2e (`61-selection-enforcement.e2e.ts`, "live drag
  stability" — escalation re-applies per `select.pointer` transaction, no flicker),
  and the feel half by the manual pass — live escalation reads as natural; no
  pointer-up-only fallback needed. Escalate (not boundary-clamp) confirmed as the
  right model; the D4-risk alternative was not pursued. Notably, dragging back into
  the origin node restoring the exact character-level selection was called out as a
  strength (contrast Logseq's sticky block-mode). Three follow-up findings from the
  same pass — widget-internal drags (native limitation), single-node selection via a
  gap-line trigger, uniform multi-range escalation — are recorded in
  docs/research/13-selection-follow-ups.md as candidate amendments, not defects.
- Real per-transaction parse cost distribution at real note sizes — is incremental
  reuse needed at all? **ANSWERED, budget met without incremental reuse.** On a
  synthetic ~1600-line stress note (400 sections, headings+paragraphs), driving both
  real typing (20 edits) and real mouse-drag selections (10 boundary-crossing drags)
  through the actual registered filter, every observed class's median stayed ≤ 1ms
  and p95 ≤ 8ms (this session's measured numbers; exact figures recorded in
  docs/research/04 Q14 — re-measure on CI-class hardware before treating as final).
  Full re-parse per doc version, cached by `Text` identity, is sufficient; the D7
  incremental-reuse fallback is not needed for this note size class.
