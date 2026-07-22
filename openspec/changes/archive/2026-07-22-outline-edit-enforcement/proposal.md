# Proposal: outline-edit-enforcement

## Why

Phase A confirmed the transaction-filter choke point live (all driven mutation paths
observed, programmatic/remote provenance reliable including the `set`-annotation
finding, timings an order of magnitude under budget, nested-editor degeneracy holds —
docs/research/04 Q14), and Phase B made boundary-crossing *selections* structurally
valid. But document *edits* still splice at character level: the funnel counts
`boundary-crossing-edit` transactions and passes them through, a block-level copy
pasted mid-node merges into the surrounding paragraph (docs/research/13, Track 1), and
Backspace/Delete at node boundaries join nodes with no structural mediation — the
grammar binds neither key. This change is Phase C, the last pillar of the defining
invariant: every *mutation* respects node boundaries, closing the loop the manifest
opened.

## What Changes

- **Verdict-carrying classification.** The pure classifier's output for user edit
  classes gains a verdict: `pass` | `rewrite(structural edit)` | `veto(reason)`. The
  filter applies verdicts instead of always passing through. Default-permit survives at
  the *taxonomy* level (unrecognized provenance still passes untouched — the Q6 interop
  guarantee is inviolable); enforcement applies only to confidently recognized user
  edits.
- **Structural deletion.** Deleting/typing-over a whole-subtree selection (which Phase
  B guarantees for user selections) removes complete subtrees *including their trailing
  gaps* — the gap-ownership model becomes user-visible for the first time (Track 1's
  gap-line deletion thread). Boundary-crossing deletions arriving from non-escalated
  selections (e.g. a programmatically restored mid-node selection) are rewritten to
  their subtree-cover deletion.
- **Node-boundary merges.** Backspace at a node's start and Delete at a node's end
  become structural merges where the result is expressible (per the mapping algebra),
  and are vetoed with the existing rejection-cue pattern (transient Notice, document
  untouched) where they would corrupt structure or orphan children — e.g. a merge that
  would silently re-parent a heading's section.
- **Boundary-respecting insertion.** Multi-line/block paste and text drop at a mid-node
  position splice at the nearest valid node boundary and re-indent to a valid depth for
  the target scope. Single-line within-node paste stays byte-for-byte native.
- **Within-node edits remain untouched.** Typing markdown syntax that changes a node's
  own kind or spawns structure (e.g. `# ` at line start) is authoring, not violation —
  the tree is re-derived from text; enforcement targets only edits *spanning* nodes.
- **Undo contract.** Each rewritten edit forms a single undo step restoring the exact
  pre-edit state; vetoed edits leave no history entry. (Phase A finding: desktop undo
  bypasses the filter entirely; where it does arrive it classifies `programmatic` —
  both shapes are safe for rewritten transactions.)
- **Explicitly out of scope:** selection-UX work (progressive Select All ladder, modal
  block selection, bullet-click selection, block-selection rendering — Track 2 of
  docs/research/13, its own later change); visual gap treatment (docs/research/12);
  the known native limitation of drags starting inside rendered widgets. *(Amendment
  2026-07-21, second manual pass)*: gap-line cursor/vertical-navigation transparency
  and visual gap hiding/collapsing are ALSO explicitly deferred — filed together with
  Track 2 (docs/research/13) since both are cursor/selection-level UX work sharing the
  same escalation core, not edit rewriting. Marker-transparent cursor placement (D13)
  is narrower and ships in this change; the gap-line case does not.

## Capabilities

### New Capabilities

- `node-edit-enforcement`: the edit-rewriting layer on the classification funnel — how
  each user edit class maps to pass/rewrite/veto, structural deletion (subtrees +
  trailing gaps), node-boundary merge semantics, boundary-respecting paste/drop
  insertion, rejection feedback, and the undo/byte-fidelity contract.

### Modified Capabilities

- `transaction-classification`: the "counted but not altered" contract for
  `boundary-crossing-edit` and the "document text is never modified by this layer"
  requirement are superseded — the funnel now applies verdicts for enforced user edit
  classes; pass-through guarantees for `programmatic`/`composition`/`plugin-own` are
  restated unchanged.
- `structural-operations`: extended (ADDED requirements) with the new pure tree
  operations the rewrites delegate to — subtree deletion (with trailing-gap handling),
  adjacent-node merge, and subtree insertion at a boundary — under the same per-kind
  algebra, rejection semantics, and closure/minimal-edit guarantees as the existing
  ops. *(Amendment 2026-07-21)*: the "Node split" requirement is additionally
  MODIFIED — a node with children splits its remainder into the FIRST CHILD, not a
  sibling past the subtree.
- `outline-keyboard-grammar` *(added by amendment 2026-07-21)*: "Enter splits the
  node" MODIFIED to match the content-adjacent split rule.
- `e2e-verification` *(added by amendment 2026-07-21)*: the keyboard-grammar
  verification requirement's split-scenario text updated to match.
- `node-selection-enforcement` *(added by amendment 2026-07-21, second manual
  pass)*: the "Within-node content selections and cursors are untouched"
  requirement is narrowed — cursor placement now redirects away from a list
  marker's prefix to its content start (D13); cursor placement on gap lines is
  explicitly unchanged and stays out of this change's scope.

## Impact

- **New code**: pure ops in `src/ops.ts` (delete-subtrees, merge, insert-at-boundary)
  and a pure verdict module mapping classified edit facts to ops; the filter adapter in
  `src/plugin/transaction-filter.ts` applies rewrites/vetoes; `src/plugin/stats.ts`
  gains verdict counters; rejection cues reuse `messages.ts`/Notice.
- **Existing code touched**: `classify.ts` (facts enriched for verdicts), the e2e
  helpers, `main.ts` only if a new debug surface is needed.
- **Tests**: property tests for the new ops (closure, minimal-edit, re-parseability)
  and the verdict module (rewritten output always parses to a valid tree; veto never
  changes text); a new e2e suite (62) driving real Backspace/Delete/paste/type-over at
  boundaries, byte-fidelity and undo assertions. The known automation gaps
  (find-and-replace panel, HTML5 drag-drop) now cover paths that get *rewritten*, not
  just counted — they get harness-level attempts and, failing that, mandatory
  manual-pass scenarios.
- **Performance**: rewrite-path timing joins the existing budget discipline; Phase A
  recorded no `boundary-crossing-edit` samples, so this change produces the first real
  measurements of the enforced path.
- **No settings-schema or file-format changes.** Off-mode notes, programmatic/sync
  reconciliation (`set`), IME composition, and undo behavior remain byte-for-byte
  stock.
- *(Amendment 2026-07-21, second manual pass)*: `mergeNodes`' cursor now lands at the
  join point instead of the merged node's start (D12, bug fix — no spec change).
  Marker-transparent cursor placement (D13) touches `src/plugin/transaction-filter.ts`'s
  `selection-only` handling and needs a new pure module (or an `escalate.ts` addition)
  for the marker-clamp logic, plus e2e coverage through real Left/Home/click gestures.
- *(Amendment 2026-07-21, third manual pass)*: structural paste onto an empty anchor
  node now replaces it instead of stranding it (D14) — `src/enforce.ts`'s
  `composeTypeOver` and `computePasteVerdict` share a new `deleteAndSplice` helper;
  `node-edit-enforcement`'s paste requirement gains two scenarios.
