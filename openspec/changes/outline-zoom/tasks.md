## 1. Mechanism spike — a gate, not a warm-up

Design D2. Nothing below this section starts until 1.6 records a verdict. The whole point is
that this is the shape of bet docs/research/06 was written about, and the postmortem's lesson was
that the visual layer gave false confidence when it was verified after the design rather than
before it.

- [x] 1.1 Throwaway extension in the dev vault: two `Decoration.replace({block: true})` ranges
      over a hard-coded line span, registered alongside the existing decoration extensions (NOT
      instead of them — the question is composition, not whether the primitive works in
      isolation). Include the newline-consumption correction from D2; a stray empty line where a
      replacement ends is the first thing to look for
- [x] 1.2 Run it against `test-vault/` fixtures covering: a heading section, a nested list, a
      note with frontmatter, and — the case most likely to break — widget-rendered atoms (table,
      callout, `hr`, raw html) both INSIDE and OUTSIDE the hidden ranges. Record what each does
      with a screenshot, the way the decoration experiments did
- [x] 1.3 Check the visible lines' chrome is intact: the existing line decorations, block
      markers, guide gradients, the shared column definition from `chrome-tokens.ts`, and
      `MarginCompensation` all still apply. A hidden line's own decorations being inert is
      expected (D11); a VISIBLE line losing its marker is a stop
- [x] 1.4 **The footer (D12).** `backlinks-footer` mounts a block widget at `state.doc.length`,
      inside the trailing hidden range. Establish that it does disappear, then settle which fix
      holds: shortening the hidden range, or re-anchoring the widget to the visible end. Both are
      one-line changes with different failure modes — a range stopping one position short may
      leave a rendered blank line, and a re-anchored widget changes a position `backlinks-footer`
      states in its own spec. Decide by measurement, and record which and why
- [x] 1.5 Check confinement comes for free where D2 claims it does: caret at either boundary,
      arrow keys, Mod-A, and find-in-page. Write down which of these CM6 already prevents and
      which need explicit work — section 8's size depends on the answer. Also measure the scroll
      position question from design.md's Open Questions, and whether `showPanel` from
      `@codemirror/view` renders in the markdown view
- [x] 1.6 Verdict in `docs/research/23-zoom-hiding-mechanism.md` (16–22 are taken), in the
      experiment docs' format: what was tried, what held, what didn't, screenshots. If it did not
      hold, STOP — the change does not continue on the fallback (D2 says why the fallback is a
      different design), and this doc plus a revised proposal is the deliverable

## 2. Pure zoom module

- [x] 2.1 `src/project.ts`: the subtree-as-document operation beside `project` (D9) — a node and
      its descendants, re-rooted at depth 0, no ancestors and no preamble. NOT in `src/zoom.ts`:
      the two detached-tree constructions carry one consumer contract and state it in one place
- [x] 2.2 `src/zoom.ts`: resolve a zoom root from an anchor LINE and a parsed doc (`nodeAtLine`,
      so gap ownership is inherited rather than re-implemented), the visible cover
      (`subtreeCoverOf` verbatim — D3: the cover INCLUDING the root's trailing gap, so scope and
      cover are the same kind of object), the two hidden line ranges, the ancestor trail, and the
      line offset that maps sub-document lines back to document lines. No new tree geometry
- [x] 2.3 The scope predicates the clamps consume: is a `LinePos` inside the cover, is a
      `LineRange` inside it, and the intersection of a cover with the scope. Keep them here, not
      at the four call sites — the same predicate copied four times is how `LinePos` ended up
      declared in three modules (see `line-pos.ts`'s own module comment)
- [x] 2.4 Lift `footer-model.ts`'s private `stripBlockPrefix` to a shared home and use it for the
      crumb labels (D13). Do NOT write a third marker-stripping function; do NOT change what the
      footer gets out of it — this is a move plus an export, pinned by the footer's existing tests
      passing unchanged. Empty label falls back to the kind name
- [x] 2.5 `tests/project.test.ts`: subtree-as-document cases — the subject at depth 0 whatever its
      source depth, nothing outside the subtree surviving, content carried through unmodified, a
      leaf yielding a single-node document, and the constant line offset
- [x] 2.6 `tests/zoom.test.ts`: unit cases per node kind for root resolution, cover, hidden
      ranges, trail and labels, including a top-level root (one hidden range, not two), a root
      that is the document's last node, a root with frontmatter above it, and a childless root
- [x] 2.7 Property tests over generated trees (`tests/generators.ts`): the two hidden ranges plus
      the visible cover partition every line of the document exactly once; the visible cover is
      always an exact cover, so escalating it is the identity; the trail's length equals the
      root's depth; and clamping any cover to the scope yields a cover (design D7's claim — the
      one the whole confinement design rests on, so it is asserted, not argued)

## 3. Zoom state and the dispatch route

- [x] 3.1 `src/plugin/view-registry.ts`: a `ViewPlugin` recording its `EditorView` against the
      `MarkdownFileInfo` from the public `editorInfoField`, dropped on destroy (D5). Public API
      only — this exists precisely because `(editor as any).cm` is off the table and Obsidian's
      `Editor` exposes no `EditorState`. Do NOT also fix the `indentUnit` gap `main.ts` documents;
      it is a separate defect with its own tests
- [x] 3.2 `src/plugin/zoom-state.ts`: a `StateField<number | null>` holding the anchor position,
      with `zoomTo` / `zoomCleared` effects. Map the anchor through `tr.changes` on every
      transaction (D1) with FORWARD association (`assoc: 1`), not CM6's default of -1. Pin it with
      a test: insert text containing a newline at the root's own line start and assert the anchor
      still resolves to the root. Under `assoc: -1` it resolves to the inserted node instead —
      run that as the negative control, since this is exactly the claim an earlier draft got wrong
- [x] 3.3 Derive-on-demand accessor: given a state, return the resolved root, cover, hidden
      ranges, trail and sub-document, or null. Cache per `EditorState` the way `decorations.ts`'s
      `factsFor`, `parsed-doc.ts` and `source-tree-cache.ts` already do — this is read by
      decorations, the panel, the keymap and the filter on every transaction
- [x] 3.4 Gate on outline mode and `isNestedEditor`, through the same helpers every other
      extension uses. A zoom must be unreachable in a nested per-cell editor
- [x] 3.5 Unit tests for the state field driven by real `EditorState.update` calls (the way
      `tests/plugin.test.ts` drives its subjects), including anchor mapping across an insertion
      above, below, and inside the root

## 4. Hiding

- [x] 4.1 Hiding decorations from the field's derived ranges, exposed through
      `EditorView.decorations` alongside the existing sources (D11). Ranges are DERIVED per state,
      never stored and never mapped — that is D1's whole point and the thing obsidian-zoom does
      differently
- [x] 4.2 Both boundary cases: a root that is the document's first node (no range above) and one
      that is its last (no range below). 1.1's newline correction applies to whichever ranges exist
- [x] 4.3 Apply 1.4's verdict (docs/research/23): `backlinks-footer.ts` anchors its widget at the
      END OF THE VISIBLE RANGE while a zoom is active, rather than at `state.doc.length`.
      Shortening the trailing range was measured and is NOT an option — for a document ending in a
      newline the final line's start IS `doc.length`. Assert the footer's presence in the e2e
      suite rather than trusting the spike's memory of it
- [ ] 4.4 Verify against 1.3's findings that visible-line chrome is unchanged — as an assertion in
      the e2e suite, not as a memory of the spike

## 5. Depth re-basing

- [x] 5.1 Derive the visible lines' decoration facts by decorating the SUB-DOCUMENT from 2.1 with
      the existing `decorate()` and `computeLineGuides()`, translating line numbers by the constant
      offset from 2.2. `src/plugin/decorate.ts` and `chrome-tokens.ts` are READ, not changed — if
      this task ends up editing either, the sub-document approach has been abandoned and D9 needs
      revisiting first
- [x] 5.2 Guides above the root disappear as a consequence, not as a special case: the
      sub-document has no such levels to emit. Assert that, so a later change to the guide walk
      cannot quietly reintroduce them
- [x] 5.3 The list-item exception (D9): confirm a list-item zoom root loses its
      `supplementalDepth` contribution and KEEPS the within-list depth Obsidian's list rendering
      supplies. Assert it deliberately — this is a stated limit, and a test that pretends
      otherwise would be asserting a bug as a feature
- [x] 5.4 Identity property: with no zoom, every decoration fact is byte-identical to today's
      output. If that fails, the zoom path has leaked into the unzoomed one
- [x] 5.5 Record the deferred container-shift mechanism for list-item roots in
      `docs/research/12-decoration-follow-ups.md`, with D9's diagnosis — one uniform negative
      margin on the container, not per-line surgery, and now a computable offset (the root's depth
      within its list × the outline unit) rather than a measured one

## 6. Breadcrumb panel

- [x] 6.1 A CM6 panel via `showPanel`, present only while zoomed (D10). File crumb first, then
      ancestors outermost-in; the zoom root is NOT a crumb
- [x] 6.2 Crumb activation dispatches the same `zoomTo` / `zoomCleared` effects the commands use —
      one dispatch path, not a parallel one
- [x] 6.3 `styles.css`: panel styling built on the published `--to-*` chrome custom properties, no
      fixed colours. Long trails may overflow; overflow polish is out of scope (proposal.md) but
      the panel must not break the editor's layout when it does
- [ ] 6.4 The panel appears on zoom and disappears on every exit path, including the automatic
      ones in section 10

## 7. Entry points

- [ ] 7.1 Three commands in `main.ts` — zoom in, zoom out one level, clear zoom — resolving the
      active view's `EditorView` through the registry and dispatching. `editorCheckCallback` so
      they are unavailable outside outline mode, matching `toggle-outline-mode`
- [ ] 7.2 Keymap bindings in `src/plugin/keymap.ts`, gated through `outlinePathOf` like every
      other binding there — NOT a private `editorInfoField` + `isOutline` check; that is the
      defect #35 fixed after it bit twice, and the module comment requires the shared gate
- [ ] 7.3 Editor context-menu entries for zoom in and clear zoom, next to the existing outline-mode
      entry
- [ ] 7.4 Zoom in with the caret in the preamble, or in an empty document, does nothing — resolve
      to no node and return, no cue

## 8. Confinement

1.5 answered this section's sizing question, and the answer is the expensive one
(docs/research/23): NOTHING is prevented for free. Arrow keys walk into hidden lines in both
directions and three Mod-A presses select the whole document. Every task below is an
implementation, not an assertion.

- [ ] 8.1 Escalation clamp in `src/plugin/transaction-filter.ts`: intersect the escalated range
      with the scope (D7 — this is the ONE site that truncates, and it is safe because the scope
      is a cover). Property test that the clamped result is still an exact cover, and a negative
      control: remove the clamp and confirm the test fails
- [ ] 8.2 `src/select-all-ladder.ts` takes the scope as a bound: rungs stop at the zoom root's own
      subtree, ancestors above it contribute none, and the native-Select-All fall-through is
      suppressed while zoomed. Bound the ENUMERATION, not its output (D7)
- [ ] 8.3 `src/select-extend.ts` takes the same bound, with the same rule — every dispatched
      selection stays an exact cover. Test the anchor-is-the-zoom-root case: the sequence is one
      element and every press is a no-op
- [ ] 8.3a Zoom-in collapses a non-empty selection to its anchor, and resolves its target from
      that anchor rather than the head — so the gesture zooms to the same node whichever direction
      the selection was grown in, and no zoom transition can leave a selection end in content it
      just hid. Test both directions and the multi-range case
- [ ] 8.4 Motion handlers in `keymap.ts` return without moving when their computed target lies
      outside the scope — not "move to the boundary and get corrected", which would put a second
      caret authority beside `caret-placement-policy`
- [ ] 8.5 Assert the MECHANISM, not the outcome: a motion that does not move looks identical
      whether our handler declined or never ran. Use the existing `motionCounts` liveness
      counters, the same way the Home/End work had to after an outcome-only test hid a real
      defect through three rewrites

## 9. Refusing escaping operations

- [ ] 9.1 `would-leave-zoom-scope` in `src/result.ts` and its cue in `src/plugin/messages.ts`
- [ ] 9.2 The precondition on the RESOLVED OPERAND (D8), at the single site
      `selection-structural-ops` resolves the operand and the after-state — not once per entry
      point. Refuse when any covered root is the zoom root, and when an outdent's operand contains
      any direct child of the zoom root. `src/ops.ts` stays zoom-unaware; do not add a scope
      parameter to the algebra
- [ ] 9.3 The multi-root test, which a single-subject formulation passes wrongly: an operand whose
      FIRST root is safe and whose LAST root escapes is refused as a whole, with nothing moved.
      Negative control — write the check over the operand's first root only and confirm this test
      fails
- [ ] 9.4 The split refusal in the grammar (`outline-keyboard-grammar` delta), judged by
      DESTINATION SCOPE and not by node identity: refuse the cases the grammar sends to the zoom
      root's SIBLING scope (content start; content end on a childless root; an interior split of a
      childless non-heading root; Enter on an empty list-item root, which outdents or unwraps).
      ALLOW the ones it sends to the child scope — content end on a root with children, an
      interior split of a root with children, and any interior Enter on a heading root. Read
      `openspec/specs/outline-keyboard-grammar/spec.md`'s "Enter splits the node" for the case
      table rather than reconstructing it; a blanket refusal on `node === zoomRoot` was the first
      draft of this task and it rejected valid in-scope edits
- [ ] 9.4a Negative control for 9.4: implement the blanket `node === zoomRoot` refusal and confirm
      the "Enter at the end of a zoom root with children creates a first child" test fails. A
      refusal test that passes under both rules is testing nothing
- [ ] 9.5 An operation the algebra rejects for its own reason keeps that reason while zoomed —
      the scope check must not shadow `no-previous-sibling` and friends
- [ ] 9.6 Assert the two entry points agree by exercising both, even though
      `selection-structural-ops` makes them agree by construction: the palette missing a guard the
      keyboard had is a defect this codebase has already shipped once (`resultCursor`'s
      addressability guard)

## 10. Automatic exit

- [ ] 10.1 Trigger 1: the anchor's line no longer resolves to a node → clear
- [ ] 10.2 Trigger 2: a change touches any position outside the visible range as it stood in
      `tr.startState` → clear. This is what catches history transactions (dispatched with
      `filter: false`, so they never see the clamps), sync writes, and another pane's edits
- [ ] 10.3 Trigger 3: outline mode off → clear, on the existing refresh path
- [ ] 10.4 No other trigger. Explicitly test that editing the zoom root's own text — including
      emptying it — does NOT exit, and that an exit changes neither the document nor the caret
- [ ] 10.5 The retarget property (D4): for generated documents and every in-scope edit, the
      resolved root after the edit is the same node it was before, or the zoom has exited. This
      is the property that turns "the clamp makes the anchor safe" from an argument into a test

## 11. End-to-end

- [ ] 11.0 Two harness facts from the spike (docs/research/23), or these tests measure nothing:
      park the caret OFF a line before reading it (with the caret on it Live Preview renders the
      source beside the widget and `getLineElementInfo` refuses the ambiguity), and never measure
      the span's BOUNDARY lines through that helper (a block decoration at the last visible line's
      end is attributed to that line by `posAtDOM`). Count widgets, not `.cm-line`s, for a span of
      widget-rendered atoms — a correct render reports zero cm-lines
- [ ] 11.1 `e2e/specs/80-outline-zoom.e2e.ts` — 70–76 are the footer's — plus `8: 'zoom'` in
      `scripts/spec-groups.mjs`'s `LABELS`, or the decade gets a group named after its prefix.
      Driving a real Obsidian instance: zoom in on each node kind, hidden content absent from the
      DOM, breadcrumb contents and crumb activation, zoom out one level and clear
- [ ] 11.2 Byte-fidelity: zoom in, zoom out, and assert the file on disk is unchanged; then edit
      inside a zoom and assert the on-disk result is identical to making the same edit unzoomed
- [ ] 11.3 Confinement in a live instance: Mod-A ladder tops out at the root, Shift+Arrow stops,
      arrow keys stop at the boundaries, and the refusals show their cue with no document change
- [ ] 11.4 Automatic exit: delete the root's subtree; undo past the zoom boundary; toggle outline
      mode off
- [ ] 11.5 Two panes on one file zoom independently, and reopening a note shows it unzoomed
- [ ] 11.6 Re-basing assertions from 5.x measured in the live instance, including the list-item
      root's within-list indentation being deliberately left alone
- [ ] 11.7 The footer renders below the zoomed content, with the same groups and counts it shows
      unzoomed, and is unchanged after a zoom out — no `--to-*` chrome regression against
      `73-footer-render.e2e.ts`'s expectations

## 12. Wrap-up

- [ ] 12.1 Confirm every "Out of scope" item in proposal.md that has a diagnosis behind it is
      written down where it will be found: the list-item container shift and the click-to-zoom
      gestures in `docs/research/12-decoration-follow-ups.md`, the Workflowy Enter rule and zoom
      persistence in this change's own follow-ups, and footer-scoped-to-the-zoom-root wherever
      `backlinks-controls` will look for it
- [ ] 12.2 `docs/research/README.md` table row for doc 23 from task 1.6
- [ ] 12.3 Run the full suite, the linter, and the e2e desktop run; then use the feature against a
      real vault for a session before archiving — every decoration-era defect that mattered was
      found that way, not by a test
