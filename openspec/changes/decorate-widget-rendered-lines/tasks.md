## 1. Measure the real DOM before changing anything

Design D1/D5: the predicate is chosen from measured behavior, not an assumed DOM shape.
Nothing in section 3 starts until this section's findings are written down.

- [ ] 1.1 Add the embed fixture to `e2e/fixtures/decorations.ts`: an embed *target* note
      plus a source note covering all four placements — a whole-paragraph embed line under a
      heading, an embed as one line of a multi-line paragraph, an embed on a list-item line
      (`- ![[…]]`), and an inline embed among other text on a paragraph line. Register it in
      `ALL_DECORATION_FIXTURES` so the existing screenshot-everything loop picks it up.
- [ ] 1.2 With the fixture open in outline mode and the cursor away from the embeds, dump
      for each of the four placements: the rendered element's tag/classes, whether it is a
      direct child of `.cm-content`, its `parentElement` chain up to `.cm-content`, and what
      `posAtDOM` resolves it to. Record the results in the change (a short findings note in
      this file or `docs/research/12`'s entry).
- [ ] 1.3 Repeat 1.2 with the cursor ON each embed line, confirming the line reverts to a
      plain `.cm-line` and recording which decoration state it carries in that form — this
      is the reference the fix must reproduce in the widget state.
- [ ] 1.4 Confirm a line-level `.cm-embed-block` does not contaminate the reference-line
      readings in `nativeMarginBasePx()` / `nativeContentRightPx()` (design Risks). If it
      does, that selector needs the same exclusion `.hr` already has.
- [ ] 1.5 If any placement contradicts the direct-child predicate (D1), stop and revisit
      D1 with the finding before writing code — the predicate is the load-bearing decision.

## 2. Lock in negative controls

Per project practice: a new assertion that passes before the fix proves nothing.

- [ ] 2.1 Write the cursor-on-equals-cursor-off e2e assertion for the whole-paragraph embed
      (resolved horizontal geometry + marker presence + guide presence, compared across the
      two cursor states) and confirm it FAILS on the current code, for the documented reason
      (widget state is stripped), not an unrelated one.
- [ ] 2.2 Confirm the existing widget-atom e2e assertions in `50-decorations.e2e.ts`,
      `51-guides-gradient.e2e.ts`, `52-block-markers-icons.e2e.ts`, and
      `63-selection-visual-treatment.e2e.ts` all pass on the current code — this is the
      baseline the refactor must leave byte-identical.

## 3. Generalize the DOM-patch path

- [ ] 3.1 Scope the widget query to direct children of `contentDOM`
      (`:scope > .cm-embed-block, :scope > .cm-line.hr`), matching the `>` combinator the
      stylesheet already uses. Leave `clearAll()`'s query unscoped (design D4) and say why
      in its comment. Rename `WIDGET_ATOM_SELECTOR` to reflect that it now selects
      line-level widgets of any kind, and rewrite its doc comment: the current one asserts
      the over-matching is a harmless no-op, which is the bug this change fixes.
- [ ] 3.2 Extract the shift expression into one function of `(fact, nativePaddingLeft)`
      (design D2): `supplementalDepth` vs `depth`, `0px` vs `MARKER_GUTTER_CSS` gutter,
      with the live native-padding subtraction and `max(0px, …)` clamp unchanged.
- [ ] 3.3 Verify by inspection and by test that 3.2 reduces to today's exact expression for
      an atom fact, so the atom path is provably unchanged rather than believed to be.
- [ ] 3.4 Hoist marker eligibility (`isFirstLine && !isListItem`, then `shouldShowMarker`)
      into one predicate shared by the plain-line and widget paths (design D3), so the two
      cannot disagree about which lines may carry a synthetic marker.
- [ ] 3.5 Replace the `fact?.isAtom` gate with "this line has a fact", and route margin,
      marker, guides, and selection chrome through 3.2/3.4 for whatever kind that fact
      reports.
- [ ] 3.6 Narrow the `else` branch to its true no-op case and correct its comment (design
      D4) — it is defensive only, no longer the path any widget-rendered non-atom takes.
- [ ] 3.7 Confirm `applyWidgetMarker` prepends into the outer `.cm-embed-block` wrapper and
      never into Obsidian-rendered embed content (design Risks), and extend the sanctioned-
      injection-site comment to state that the subtree is now Obsidian-owned for embeds, not
      only CM6-owned.
- [ ] 3.8 Check `styles.css` for any rule whose selector assumes an atom-only class
      combination on a line-level widget; widen only where the measured DOM requires it,
      keeping every `>` combinator.

## 4. Verify

- [ ] 4.1 The 2.1 assertion now passes, and the 2.2 baseline is still green — the atom
      behavior unchanged.
- [ ] 4.2 Per-placement e2e coverage of the widget state: whole-paragraph embed line gets
      its paragraph marker + indentation + ancestor guides; multi-line-node embed line gets
      the node's indentation and NO marker (continuation line); list-item embed line gets
      `supplementalDepth` and NO synthetic marker; inline embed among text leaves the host
      `.cm-line` decorated exactly once and the nested widget unpatched (no doubled shift).
      Each run as a negative control first.
- [ ] 4.3 Escalated-selection coverage: an embed line inside a cover shows the same chrome
      as plain lines in that cover, in both cursor states.
- [ ] 4.4 Marker-idempotence under embed re-render (design Risks): force the embed to
      re-render and assert exactly one marker child survives. Record what actually happens
      if it does not — that finding decides whether a follow-up is needed, not a guess.
- [ ] 4.5 `markerVisibility` across all three settings on the embed fixture: the reserved
      gutter is constant and only icon presence changes, same invariant as every other kind.
- [ ] 4.6 Outline-mode-off on the embed fixture renders byte-identical to stock Obsidian
      (no leftover inline styles or marker children after `clearAll()`).
- [ ] 4.7 Full suite: unit tests, `openspec validate --strict`, lint, and the whole
      decoration e2e corpus including the newly registered fixture's screenshots.
- [ ] 4.8 Manual pass in a real vault with a real embed, at more than one theme, confirming
      the embed sits in the outline geometry and stops moving when the cursor leaves it.

## 5. Close out

- [ ] 5.1 Remove the "Wiki-embed blocks bypass decoration entirely" entry from
      `docs/research/12-decoration-follow-ups.md`, and record anything the measurement pass
      turned up that is worth keeping (e.g. an unresolved async-re-render behavior) as a new
      parking-lot entry rather than losing it.
- [ ] 5.2 Update the `decorations.ts` module doc comment where it describes the widget path
      in atom terms.
