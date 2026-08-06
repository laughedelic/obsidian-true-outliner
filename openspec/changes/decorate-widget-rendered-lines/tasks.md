## 1. Measure the real DOM before changing anything

Design D1/D5: the predicate is chosen from measured behavior, not an assumed DOM shape.
Nothing in section 3 starts until this section's findings are written down.

- [x] 1.1 Add the embed fixture to `e2e/fixtures/decorations.ts`: an embed *target* note
      plus a source note covering all four placements — a whole-paragraph embed line under a
      heading, an embed as one line of a multi-line paragraph, an embed on a list-item line
      (`- ![[…]]`), and an inline embed among other text on a paragraph line. Register it in
      `ALL_DECORATION_FIXTURES` so the existing screenshot-everything loop picks it up.
- [x] 1.2 With the fixture open in outline mode and the cursor away from the embeds, dump
      for each of the four placements: the rendered element's tag/classes, whether it is a
      direct child of `.cm-content`, its `parentElement` chain up to `.cm-content`, and what
      `posAtDOM` resolves it to. Record the results in the change (a short findings note in
      this file or `docs/research/12`'s entry).
- [x] 1.3 Repeat 1.2 with the cursor ON each embed line, confirming the line reverts to a
      plain `.cm-line` and recording which decoration state it carries in that form — this
      is the reference the fix must reproduce in the widget state.
- [x] 1.4 Confirm a line-level `.cm-embed-block` does not contaminate the reference-line
      readings in `nativeMarginBasePx()` / `nativeContentRightPx()` (design Risks). If it
      does, that selector needs the same exclusion `.hr` already has.
- [x] 1.5 If any placement contradicts the direct-child predicate (D1), stop and revisit
      D1 with the finding before writing code — the predicate is the load-bearing decision.

### Findings (Obsidian 1.13.4, installer 1.5.8, darwin — probe run 2026-08-06)

Two premises inherited from `docs/research/12`'s entry are **wrong on this version**, and
both were written as inference rather than measurement:

1. **`WIDGET_ATOM_SELECTOR` does not match a wiki embed at all.** Measured over the embed
   fixture: `.cm-embed-block, .cm-line.hr` → `any=0, direct=0`. The rendered element's class
   is `internal-embed markdown-embed inline-embed is-loaded` — no `cm-embed-block` anywhere.
   The embed is therefore never *visited* by the DOM-patch loop, so it never reaches the
   cleanup branch either; it is simply never decorated. (Same probe over the widget-atoms
   fixture: `any=4, direct=4`, classes `cm-embed-block cm-table-widget…`,
   `cm-embed-block cm-callout`, `cm-html-embed cm-embed-block`, plus `.cm-line.hr` — so the
   selector remains correct for the atom kinds.)
2. **A whole-line embed never reverts to a plain `.cm-line`.** Probed with the cursor at
   line 4 ch 0, line 4 ch 5, and line 7 ch 5: the element stays
   `internal-embed markdown-embed`, and no line carries `cm-active` (confirming the cursor
   really is on the widget-replaced line). There is no cursor-on plain-line rendering to
   compare the widget state against.

Confirmed as designed:

- **The direct-child predicate (D1) holds.** Both widget-replaced embeds are direct children
  of `.cm-content`, and `posAtDOM` resolves them to the correct lines (4 and 7).
- **Only two of the four placements are broken.** A list-item embed (line 11) and an inline
  embed among text (line 13) render as ordinary `.cm-line`s with the embed nested inside,
  and already carry correct decoration (`ml=48px` with no synthetic marker for the list
  item; `pl=44px` with a marker for the inline paragraph). The nested embeds are not direct
  children, so the direct-child scoping excludes them for free.
- **No contamination of the reference-line readings.** The embed element is not a `.cm-line`,
  so `nativeMarginBasePx()` / `nativeContentRightPx()` skip it already.
- **Geometry baseline** (default theme, no readable-line-width offset): unit 24px, marker
  gutter 20px. Depth-0 heading `pl=20px`; depth-1 paragraph `pl=44px`; the broken embeds sit
  at `ml=0px, pl=0px` with no marker and no `to-decor-guides`.

CM6 scaffolding present in `contentDOM`: `.cm-widgetBuffer` (8 in this fixture) — all nested
inside lines, never a direct child here; `.cm-gap` — 0 in these small documents, but it *is*
a direct child of `contentDOM` in documents large enough to be viewport-virtualized, so the
selector must exclude it explicitly rather than rely on it being absent.

## 2. Lock in negative controls

Per project practice: a new assertion that passes before the fix proves nothing.

- [ ] 2.1 Write the same-depth-sibling e2e assertion for the whole-paragraph embed (its
      resolved left edge, marker presence, and guide presence compared against the plain
      paragraph at the same tree depth in the same fixture) and confirm it FAILS on the
      current code, for the documented reason (the embed is never decorated), not an
      unrelated one. Replaces the original cursor-on-equals-cursor-off formulation, which
      task 1.3 showed is not observable — see Findings and design D5.
- [ ] 2.2 Confirm the existing widget-atom e2e assertions in `50-decorations.e2e.ts`,
      `51-guides-gradient.e2e.ts`, `52-block-markers-icons.e2e.ts`, and
      `63-selection-visual-treatment.e2e.ts` all pass on the current code — this is the
      baseline the refactor must leave byte-identical.

## 3. Generalize the DOM-patch path

- [ ] 3.1 Replace `WIDGET_ATOM_SELECTOR`'s class enumeration with the structural predicate
      (design D1): direct children of `contentDOM` that are not plain `.cm-line`s, plus
      `:scope > .cm-line.hr`, excluding `.cm-gap` and `.cm-widgetBuffer`. Rename it to
      reflect that it selects line-level widgets of any kind, and rewrite its doc comment —
      the current one claims the selector over-matches harmlessly, when measurement showed
      it *under*-matches and misses embeds entirely.
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
- [ ] 4.2 Per-placement e2e coverage: whole-paragraph embed line gets its paragraph marker +
      indentation + ancestor guides; multi-line-node embed line gets the node's indentation
      and NO marker (continuation line); list-item embed line gets `supplementalDepth` and NO
      synthetic marker; inline embed among text leaves the host `.cm-line` decorated exactly
      once and the nested element unpatched (no doubled shift). The last two are measured to
      be correct already — assert them as regression locks, since the widened predicate is
      what could newly break them.
- [ ] 4.3 Escalated-selection coverage: an embed line inside a cover shows the same chrome
      as plain lines in that cover, reaching the same left edge.
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
