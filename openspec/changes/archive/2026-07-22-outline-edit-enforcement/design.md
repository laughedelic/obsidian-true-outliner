# Design: outline-edit-enforcement

## Context

Phases A+B (`outline-selection-enforcement`, archived 2026-07-20) built and validated
the choke point: a `transactionFilter` classifies every transaction (six classes,
default-permit), and boundary-crossing user *selections* escalate to whole sibling
subtrees. Phase A's findings (docs/research/04 Q14) materially de-risk this change:

- All driven user mutation paths arrive through the filter with usable provenance;
  external reconciliation is annotated `set` (classifier already tightened).
- Desktop undo bypasses the filter entirely; where undo does arrive (platform-
  dependent under mobile emulation) it carries history userEvents and classifies
  `programmatic`. Either shape is safe for a layer that rewrites forward edits.
- Nested-editor degeneracy holds without the StateField fallback.
- Classification runs an order of magnitude under the latency budget, leaving
  headroom for the heavier rewrite path.
- `boundary-crossing-edit` was counted but never enforced — and never perf-sampled;
  this change produces the first real numbers for it.

Phase B's amendments also strengthen this change's ground: any *user-made* non-empty
selection is already a whole-subtree cover (uniform multi-range rule, gap-line
trigger), so type-over/delete of a user selection is boundary-aligned before Phase C
even looks at it. The remaining character-level boundary crossings are: Backspace at
node start / Delete at node end (the grammar binds neither key), multi-line paste and
text drop mid-node, and deletions over selections the filter never escalated
(programmatically restored ones — passed through by spec).

Scope guard: selection-UX threads (Select All ladder, modal block selection,
bullet-click, block-selection rendering — docs/research/13 Track 2) are a separate
future change; visual gap treatment is decoration territory (docs/research/12); the
drag-from-inside-a-rendered-widget limitation is native and out of jurisdiction.

## Goals / Non-Goals

**Goals:**

- Close the invariant: every recognized user *edit* either maps to a valid structural
  operation (possibly rewritten) or is vetoed with feedback — the buffer always
  parses to the tree the user's structural intent implies, never a half-merged one.
- Structural deletion takes trailing gaps; merges and insertions respect the mapping
  algebra; every accepted rewrite's output re-parses to a valid tree by construction.
- Preserve every Phase A/B pass-through guarantee untouched: `programmatic` (incl.
  `set` reconciliation), `composition`, `plugin-own`, off-mode, nested editors.
- Single-undo-step restore of the exact pre-edit state for every rewritten edit.

**Non-Goals:**

- No selection-UX features, no new keymaps (enforcement stays input-agnostic — the
  whole point of the funnel), no visual chrome.
- No enforcement of *within-node* edits: typing markdown syntax that changes a node's
  kind or creates structure is authoring, not violation.
- No attempt to intercept DOM-level selections inside rendered widgets (native
  limitation, docs/research/13).

## Decisions

### D1. A verdict layer on top of classification, both pure

`classify.ts` stays what it is — provenance/shape taxonomy. A new pure module
(`src/enforce.ts`) maps `(class, edit facts, tree) → pass | rewrite(edits, selection)
| veto(reason)`, evaluated only for `within-node-edit` (always pass, by definition)
and `boundary-crossing-edit`. Policy lives entirely in the pure layer, tested by
property ("every rewrite's output re-parses to a well-formed tree"; "veto never
changes text"), with the filter adapter only translating verdicts into CM6 specs.
This keeps Phase C a swap of "verdict is a label" for "verdict may carry a rewrite" —
exactly the seam the A+B design left.

*Posture:* taxonomy-level default-permit is unchanged and inviolable (unrecognized
provenance passes — Q6). Default-deny applies only *inside* the recognized
`boundary-crossing-edit` class: an edit we cannot map to a valid structural operation
is vetoed, not passed. Phase A's provenance evidence is what makes this narrow
default-deny safe to adopt now.

### D2. Rewrites delegate to new pure tree ops with the existing guarantees

Three new operations in `src/ops.ts`, under `structural-operations`' existing
closure/minimal-edit/rejection discipline:

- `deleteSubtrees(doc, nodeIds)` — removes complete subtrees *with their trailing
  gaps* (the ownership model becoming user-visible, Track 1); contiguity required;
  result may be the empty document (valid).
- `mergeNodes(doc, firstId)` — joins a node with its following sibling-or-boundary
  neighbor per a per-kind algebra (paragraph←paragraph and list-item←list-item join
  content; kinds whose join would re-parent or corrupt — e.g. absorbing a heading and
  thereby its section — reject).
- `insertSubtrees(doc, anchorId, parsedBlocks, position)` — splices a parsed block
  sequence at a node boundary, re-indented to the anchor scope's valid depth.

Rewrites are then *compositions of ops* — e.g. Backspace-at-node-start becomes
`mergeNodes(prev)`, a boundary-crossing deletion becomes `deleteSubtrees(cover)` — so
Phase C inherits the property-test discipline instead of re-deriving edit math.

### D3. Deletion semantics: subtree cover, gaps included, escalate-then-delete

For a deletion (or type-over) whose change range crosses node boundaries:

- If the range already equals a whole-subtree cover (the normal case — Phase B
  escalated the selection), rewrite to `deleteSubtrees` of that cover, which extends
  the removal over the covered nodes' trailing gaps. Type-over additionally inserts
  the typed text as new content at the deletion site.
- If the range is a *stale* mid-node crossing (a selection the filter passed through
  programmatically, then deleted by the user), apply escalate-then-delete: compute
  the Phase B subtree cover of the range, rewrite to its structural deletion. One
  rule for both paths; no partial-node remnants can survive a user deletion.

The remainder is valid by construction — complete subtrees are removed from a valid
tree.

### D4. Merges: Backspace/Delete at boundaries become ops, not keymaps

A cursor Backspace at a node's first character (or Delete at the last) produces a
transaction deleting the separator into the neighboring node — a
`boundary-crossing-edit` by shape. The verdict layer recognizes this single-separator
pattern and rewrites it to `mergeNodes`; where the merge algebra rejects (per-kind
inexpressibility, child re-parenting), the edit is vetoed with the rejection cue.
Deliberately **not** implemented as new grammar keybindings: the funnel must catch the
*edit shape* regardless of which gesture produced it (key, macro, another plugin), and
adding Backspace to the enumerate-the-inputs layer would recreate the architecture the
manifest rejects.

### D5. Insertion: structural pastes splice at boundaries; ambiguous pastes pass

For `input.paste`/`move.drop` edits landing mid-node: if the inserted text parses as a
*multi-block sequence* (headings, list items, multiple paragraphs — in particular any
whole-subtree copy produced by Phase B's uniform multi-range rule), rewrite to
`insertSubtrees` at the nearest node boundary after the target node, re-indented to
the target scope. If it parses as a single block or bare continuation lines, pass
through — a multi-line plain-text fragment pasted mid-paragraph is a legitimate
continuation-line edit, not a violation. The parse-based test keeps the policy
principled, but the block/continuation boundary is this change's riskiest heuristic —
flagged as an open question with a conservative bias to *pass* (a wrong pass is
editable text; a wrong rewrite is surprising relocation).

### D6. Veto mechanics: no history entry, cue via effect observer, never from the filter

A veto returns a spec with no changes (the transaction dissolves; nothing enters
history). The user-facing cue (the existing transient-Notice rejection pattern from
`messages.ts`) MUST NOT fire inside the filter (filters should be side-effect-free and
may run more than once); the veto verdict attaches an annotation/StateEffect that a
small update-listener observes to show the cue — same split the decorations use for
DOM work.

### D7. Rewritten transactions: annotations, history, and re-filtering

A rewrite replaces the original changes wholesale in the filter's returned spec,
carrying: a plugin-own `userEvent` (extending the existing grammar vocabulary, e.g.
`delete.structural`, `input.paste.structural`), `addToHistory: true` as one history
entry, and the post-op selection per the op's cursor contract (mirroring
`editor-structural-commands`). Two mechanics to verify explicitly in e2e, not assume:
(a) the rewritten spec is not re-processed into a loop by our own filter (the
plugin-own annotation short-circuits classification — same mechanism Phase A already
proved for grammar dispatches); (b) undo after a rewrite restores the exact pre-edit
buffer bytes (Phase A's undo findings make this safe in both observed undo shapes,
but the rewrite path is new).

### D8. Performance and observability extend the existing surfaces

The stats surface gains per-verdict counters and timings (`pass`/`rewrite`/`veto` per
class); the same budget applies (≤ 1 ms median / ≤ 8 ms p95, ~2000-line note) now
measured on the enforced path, which may parse twice (current tree + pasted-content
parse or post-op validation). Phase A's ~10× headroom says this fits; the measurement
is a deliverable, and the incremental-reuse fallback from A+B's D7 remains the
designed escape hatch. Debug logging stays behind the existing crosscheck setting.

### D9. Chrome transparency (amendment 2026-07-21, real-vault manual pass)

The first manual pass surfaced one systemic failure mode behind three symptoms
(gap-blocked merges, marker-space Backspace corruption, split jumping over
children): the verdict layer recognized intents in **markdown character space**
while the user acts in **outline content space** — and everywhere chrome (gap
lines, list markers) sits between the cursor and the content boundary, the two
diverge. The model's trailing-gap ownership is correct for STORAGE (byte fidelity)
but was leaking into user-facing semantics. Adopted principle (pinned as a
node-edit-enforcement requirement): gap lines and structural markers are encoding
chrome; no editing semantic may depend on gap width, gap ownership, or marker
internals. Escape hatch: a cursor placed ON a gap line editing the gap stays
native.

### D10. Content-adjacent merges (amendment 2026-07-21)

Replaces D4's single-separator recognition: Backspace with the cursor at a node's
first content character (deleting into any chrome — separator newline, gap
newline, marker space) merges the node into its content-space predecessor,
consuming the whole gap; Delete at a node's last content character mirrors it.
Recognition is cursor-derived (the pre-edit main selection becomes a
classification/enforcement fact — Backspace-at-node-start and Delete-at-end-of-gap
produce byte-identical transactions, only the cursor distinguishes merge intent
from deliberate gap editing) but stays input-agnostic across gestures. The merge
table is re-pinned: content kinds join across kinds (survivor keeps its own kind
and marker; absorbed content appends directly at the survivor's content end — no
continuation-line remnant); children re-parent instead of rejecting; a heading
absorbs single-line content only (per the manual-pass decision); absorbing a
heading, and atoms on either side, still veto. First-node Backspace-merge vetoes
with the cue rather than passing a chrome-corrupting deletion.

### D11. Split lands content-adjacent (amendment 2026-07-21)

`splitNode` on a node with children places the remainder as the new FIRST CHILD
(encoded per the child scope's kind rules) instead of a sibling beyond the whole
subtree; childless splits are unchanged. Modifies structural-operations' "Node
split" and outline-keyboard-grammar's "Enter splits the node" (deltas added to
this change per the A+B amendment precedent).

### D12. Merge cursor lands at the join point (bug fix, second manual pass 2026-07-21)

`mergeNodes` was reusing `finalize`'s generic cursor convention (content-start of
the subject node) — correct for indent/outdent/split, wrong for a merge: the user
expects the cursor where they were typing, at the seam between the two joined
node's content, not jumped back to the merged node's own start. Fixed to compute
the join position directly (end of `first`'s original last line — line 0 for a
setext heading, since the underline carries no text — before `second`'s content
was appended), independent of `first`'s own line count. No spec-visible behavior
change beyond the cursor position itself; covered by a unit regression (multi-line
`first`, so it isn't a single-line coincidence) and an e2e cursor assertion through
the real dispatch path.

### D13. Marker-transparent cursor placement (amendment 2026-07-21, second manual pass)

Extends D9's chrome-transparency principle from edit recognition to cursor
*placement* itself, for list markers specifically: a cursor-only selection (no
document change) that would land inside a list item's marker prefix (the
indentation, marker character, and the single space after it — anything before
`contentColumnCh`) is redirected to the marker's content-start column instead,
regardless of which gesture produced it (Left arrow, Home, a mouse click, Up/Down
landing on a shorter marker line). Precedent: obsidian-outliner's "stick cursor to
content." Scoped to LIST MARKERS only, deliberately not gap lines (see docs/research/13's
"Gap-line cursor transparency" entry for why that's a separate, larger, deferred
piece — vertical goal-column risk, click-position ambiguity, and a real invariant
to reverse rather than narrow).

Mechanically this is a MODIFICATION to node-selection-enforcement's own "Within-node
content selections and cursors are untouched" requirement (archived
`outline-selection-enforcement`, now in main specs), not a new node-edit-enforcement
rule — cursor moves are `selection-only` transactions through the same filter
Phase B already escalates non-empty ranges on, so this reuses the identical choke
point for a per-line clamp instead of a range escalation. A delta spec is added to
this change for it, per the A+B/D10/D11 amendment precedent of touching whichever
capability a manual-pass finding actually lands in.

**Not in scope, anywhere near this change**: preventing or auto-collapsing extra
blank lines the user types (docs/research/12's own scope note on this) — that is
auto-correcting keystrokes as they happen, not cursor placement, and carries the
same "surprising rewrite" risk D5's paste heuristic already treats as the thing to
avoid.

### D14. Structural paste replaces an empty anchor instead of stranding it (third manual pass, 2026-07-21)

A block-sequence paste (D5) landing on an EMPTY anchor node — a list item with no
content of its own and no children, typically one just created by Enter — now
REPLACES that node instead of splicing the pasted subtrees after it and leaving the
empty placeholder behind. Mechanically: `computePasteVerdict` detects the empty-
anchor case (`isEmptyAnchor`, scoped to list items only — the model gives paragraphs
no empty encoding at all, so this can't arise for them) and routes through the same
delete-then-splice composition `composeTypeOver` (D3) already uses, extracted into a
shared `deleteAndSplice` helper. Falls back to the plain splice-after-anchor path if
the replacement doesn't succeed for some reason (the same conservative-on-failure
posture D5 already has). A non-empty anchor, or an empty one that already has
children, is unaffected — splicing after it is still correct there.

### D15. Structural-paste detection and re-indentation both corrected for a single-node subtree copy (fourth manual pass, 2026-07-22)

Two compounding bugs, both specific to copying/pasting a SINGLE top-level node that
itself has nested children (e.g. one list item with a child two levels deep) —
copying MULTIPLE top-level siblings already worked correctly, which is why this
shape alone slipped through:

1. **Detection.** `isMultiBlockInsertion` (classify.ts) and `computePasteVerdict`'s
   own pass-through gate both used "more than one top-level parsed block" as the
   sole test for "this needs structural splicing." A single node WITH children
   parses to exactly one top-level block, so it satisfied neither check and always
   fell through to a raw, unmodified character-level insertion — the pasted
   subtree's ORIGINAL literal indentation (e.g. two literal tabs) landed verbatim
   at the new cursor position, regardless of the target depth. Fixed by a shared
   `isStructuralBlockSequence` predicate (classify.ts, exported): true for more
   than one top-level block, OR exactly one block that itself has children. Both
   call sites now use it, closing the gap between "what classify.ts hands to the
   verdict layer" and "what the verdict layer treats as structural" — the same kind
   of two-gate mismatch already seen once this session (the stale pre-reparse id
   bug) is now guarded against by sharing one predicate instead of duplicating the
   condition.
2. **Re-indentation.** Once routed to the rewrite path, `insertSubtrees` re-indented
   the whole copied subtree via `reencodeForDestination`'s `shiftSubtree`, which
   expresses the indent change as a flat numeric column delta and always inserts
   it as SPACES — correct in width, but style-mismatched against a tab-indented
   destination (or source), so a multi-level subtree's deeper descendants ended up
   with a visible mix of the original tabs plus newly-added spaces at the seam.
   Fixed with a new `reindentSubtreeVerbatim` (ops.ts), used only for
   `insertSubtrees`'s no-kind-conversion case (the common list-item→list-item /
   paragraph→paragraph paste): it swaps the top node's OWN leading-whitespace
   PREFIX for the destination's `indentText` on every line in the subtree,
   preserving each descendant's original relative indent string beyond that prefix
   untouched — so whatever unit the copied content's own internal nesting already
   used carries over exactly, just re-rooted at the new depth. `indent`/`outdent`
   keep using `reencodeForDestination`/`shiftSubtree` unchanged (single-level moves
   within one document, where the delta approach has always been correct and is
   well covered by existing tests) — this only replaces the multi-level,
   foreign-context paste case.

### D16. The empty-anchor paste fallback never re-indented at all (real-vault repro, 2026-07-22)

D14's empty-anchor replacement (`composeTypeOver`/`computePasteVerdict`'s
`isEmptyAnchor` branch) deletes the empty placeholder via `deleteAndSplice`, which
picks ONE of three ways to re-attach the pasted content depending on what survives:
splice before/after a surviving sibling (both go through `insertSubtrees`, correctly
re-indented per D15), or — when the empty anchor had NO siblings at all (the sole
child in its scope, e.g. the only item under a deeper list node) —
`insertAsOnlyChildren`. That third path spliced `parsedBlocks` in completely
verbatim, with NO re-indentation whatsoever: `finalize`'s own `normalizeBoundaries`
repairs blank-line adjacency but was never going to fix indentation columns. A
paste replacing the sole empty child at depth 3 landed at the pasted text's OWN
original depth instead (e.g. depth 0, if that's where it was copied from) — on
re-parse, popping out to a shallower scope, often top-level. Root-caused directly
from a real-vault repro note ("Paste bug repro.md") giving the exact input/action/
observed-output triple, confirmed byte-for-byte with a unit test before fixing.

Fixed by extracting the re-encode step `insertSubtrees` already had
(`reencodeBlocksForDestination`, ops.ts: indent + kind resolution + per-block
reencode, exported) so `insertAsOnlyChildren` calls the SAME logic with empty
preceding/following-sibling arrays — `destinationIndent`'s own parent-based
fallback (already used by `insertSubtrees` when a scope element has no
list-item sibling to sample from directly) resolves the parent's own depth
correctly with no siblings needed. One shared function instead of one correct
path and one silently-forgotten duplicate closes the gap for good — same
category of bug as D15's detection gate (two call sites for one rule, only one
kept current).

## Risks / Trade-offs

- **[Wrong rewrite is worse than no rewrite]** A misfired structural deletion or
  paste relocation destroys user trust in exactly the layer that promises safety. →
  Conservative verdicts (pass on ambiguity, D5), property tests on re-parseability,
  byte-level undo restore verified in e2e, and the real-vault manual pass as the
  final gate — same discipline that caught the Phase B amendment needs.
- **[Veto frustration ("my key does nothing")]** Overly broad veto turns enforcement
  into a fight. → Prefer rewrite over veto wherever a structural meaning exists;
  every veto shows the existing rejection cue naming why; the manual pass explicitly
  judges veto frequency on organic editing.
- **[Paste heuristic misclassification]** The block-sequence vs continuation-lines
  test (D5) can guess wrong in both directions. → Bias to pass; record real-vault
  paste shapes during the manual pass and tighten from evidence, mirroring how the
  `set` finding tightened the classifier.
- **[Filter re-entry / other-plugin filters]** Another plugin's filter may see our
  rewritten spec, or ours could loop on it. → Plugin-own annotation short-circuit
  (proven mechanism), explicit e2e for no-loop, coexistence caveat already covered by
  Q5's warning notice.
- **[Automation gaps now cover enforced paths]** Find-and-replace (UI panel) and
  HTML5 drag-drop could not be automated in Phase A and are now paths whose edits get
  rewritten. → One more harness attempt each; if still infeasible, they become
  mandatory scripted manual-pass scenarios with results recorded — not silently
  skipped (no-silent-caps rule).
- **[Trailing-gap deletion surprises]** Removing a node now visibly removes its
  following blank line. → It is the model's ownership semantics becoming honest;
  manual pass judges feel; visual gap cues remain parked in docs/research/12.

## Migration Plan

Additive to the existing funnel: the verdict layer activates only for
`boundary-crossing-edit` transactions in outline-mode editors. Rollback = revert the
filter adapter to Phase A+B behavior (classification + selection only); the pure ops
and verdict module are inert without the adapter wiring. No settings-schema or
file-format changes. Findings that falsify a design hypothesis (paste heuristic, merge
algebra cases, perf on the enforced path) are recorded here and in
docs/research/04/13 before the change is archived, per series discipline.

## Open Questions

- **Merge algebra edges** ✅ RESOLVED (implementation): pinned in the structural-
  operations delta spec's "Adjacent-node merge" requirement — paragraph←paragraph and
  list-item←list-item (same bullet/ordered family) join; every cross-kind pair, heading
  absorption, atoms, and either side having children reject. Finding: the
  paragraph←paragraph row is real (property/unit-tested) but organically unreachable as
  an enforced rewrite through live typing — see docs/research/04 Q15.
- **Paste ambiguity boundary** (D5) ✅ SHIPPED and TIGHTENED from real-vault
  evidence: the original "more than one top-level parsed block" rule was widened
  by `isStructuralBlockSequence` (D15) to also catch a single top-level block that
  itself has children — a whole one-node subtree copy — which the original rule
  let fall through untouched. Re-indentation of the spliced/replaced content was
  separately corrected twice (D15's `reindentSubtreeVerbatim` for the sibling-
  splice path, D16's `reencodeBlocksForDestination` for the no-sibling/only-child
  fallback). Bare continuation lines and single childless blocks still pass
  through natively, as designed.
- **Rewritten userEvent vocabulary** ✅ RESOLVED: `delete.structural` (subtree
  deletion, plain or type-over/paste-splice via its `input.paste.structural` sibling),
  `delete.structural.merge` (boundary merge) — sub-namespaced under the existing
  grammar's `input.structure.*`/`move.structure` convention, all registered as
  plugin-own for the D7a short-circuit.
- **Empty-document edge** ✅ CONFIRMED clean: `deleteSubtrees` yields a valid empty
  `OutlineDoc` (unit/property-tested); the funnel's rewrite path degrades to a
  zero-length changeset with the cursor at `{line: 0, ch: 0}`, and the evidence suite's
  "deleting every node leaves a valid, functional empty note" scenario confirms the
  editor accepts input immediately afterward.

## Closure (2026-07-23)

Five real-vault manual-pass rounds (D9-D16) found and fixed every reachable bug this
change's scope covers; the amendment discipline held throughout (docs before code,
each round's findings recorded here and in docs/research/04 as Q15-Q20 before the
next implementation pass). Two findings are explicitly OUT of this change's scope,
by the owner's own go-ahead, and carried forward rather than fixed here:

- `outdent`'s following-siblings gap — a pre-existing, foundational
  `mapping-core` behavior with a wide blast radius (docs/research/04 Q17,
  tasks.md 8.2).
- Heading Enter-splitting — a pre-existing `outline-keyboard-grammar` behavior
  (docs/research/04 Q17, tasks.md 8.3).

A third finding — the redo-cursor bug — was investigated as far as this change's
own code paths go (Q19 empirically confirmed undo/redo never reach
`transactionFilter`, so the cause is outside this change entirely) and then spun
out as its own separate investigation once further testing showed it takes more
than one wrong-landing shape (docs/research/04 Q20).
