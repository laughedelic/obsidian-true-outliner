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
- [x] 1.3 Repeat 1.2 with the cursor ON each embed line, recording what actually changes.
      (Written expecting the line to revert to a plain `.cm-line`, which would have been the
      reference the widget state must reproduce. Measured otherwise — see Findings 2: the
      embed element never reverts, and in some cursor states Obsidian ADDS a separate
      `.cm-line` for the same document line while keeping it. That is what removed the
      cursor-on baseline and, later, what produced the double marker.)
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
2. **A whole-line embed does not swap back to a plain `.cm-line`.** Probed with the cursor
   at line 4 ch 0, line 4 ch 5, and line 7 ch 5: the embed element stays
   `internal-embed markdown-embed`. There is therefore no cursor-on plain rendering *of the
   same element* to compare the widget state against, which is what invalidates the
   cursor-on-equals-cursor-off acceptance test.

   **Amended after the reported bugs** (see "Second measurement pass"): what Obsidian does
   in some cursor-on states is not swap but ADD — the raw source appears as its own real
   `.cm-line` alongside the still-present embed block, so one document line has two
   elements. The original probe missed this because it recorded one entry per line index
   and the fixture happened not to reproduce it; a note whose embed is its last block does.

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

- [x] 2.1 Write the same-depth-sibling e2e assertion for the whole-paragraph embed (its
      resolved left edge, marker presence, and guide presence compared against the plain
      paragraph at the same tree depth in the same fixture) and confirm it FAILS on the
      current code, for the documented reason (the embed is never decorated), not an
      unrelated one. Replaces the original cursor-on-equals-cursor-off formulation, which
      task 1.3 showed is not observable — see Findings and design D5.
- [x] 2.2 Confirm the existing widget-atom e2e assertions in `50-decorations.e2e.ts`,
      `51-guides-gradient.e2e.ts`, `52-block-markers-icons.e2e.ts`, and
      `63-selection-visual-treatment.e2e.ts` all pass on the current code — this is the
      baseline the refactor must leave byte-identical.

## 3. Generalize the DOM-patch path

- [x] 3.1 Replace `WIDGET_ATOM_SELECTOR`'s class enumeration with the structural predicate
      (design D1): direct children of `contentDOM` that are not plain `.cm-line`s, plus
      `:scope > .cm-line.hr`, excluding `.cm-gap` and `.cm-widgetBuffer`. Rename it to
      reflect that it selects line-level widgets of any kind, and rewrite its doc comment —
      the current one claims the selector over-matches harmlessly, when measurement showed
      it *under*-matches and misses embeds entirely.
- [x] 3.2 Extract the shift expression into one function of `(fact, nativePaddingLeft)`
      (design D2): `supplementalDepth` vs `depth`, `0px` vs `MARKER_GUTTER_CSS` gutter,
      with the live native-padding subtraction and `max(0px, …)` clamp unchanged.
- [x] 3.3 Verify by inspection and by test that 3.2 reduces to today's exact expression for
      an atom fact, so the atom path is provably unchanged rather than believed to be.
- [x] 3.4 Hoist marker eligibility (`isFirstLine && !isListItem`, then `shouldShowMarker`)
      into one predicate shared by the plain-line and widget paths (design D3), so the two
      cannot disagree about which lines may carry a synthetic marker.
- [x] 3.5 Replace the `fact?.isAtom` gate with "this line has a fact", and route margin,
      marker, guides, and selection chrome through 3.2/3.4 for whatever kind that fact
      reports.
- [x] 3.6 Narrow the `else` branch to its true no-op case and correct its comment (design
      D4) — it is defensive only, no longer the path any widget-rendered non-atom takes.
- [x] 3.7 Confirm `applyWidgetMarker` prepends into the outer `.cm-embed-block` wrapper and
      never into Obsidian-rendered embed content (design Risks), and extend the sanctioned-
      injection-site comment to state that the subtree is now Obsidian-owned for embeds, not
      only CM6-owned.
- [x] 3.8 Check `styles.css` for any rule whose selector assumes an atom-only class
      combination on a line-level widget; widen only where the measured DOM requires it,
      keeping every `>` combinator.

## 4. Verify

- [x] 4.1 The 2.1 assertion now passes, and the 2.2 baseline is still green — the atom
      behavior unchanged.
- [x] 4.2 Per-placement e2e coverage: whole-paragraph embed line gets its paragraph marker +
      indentation + ancestor guides; multi-line-node embed line gets the node's indentation
      and NO marker (continuation line); list-item embed line gets `supplementalDepth` and NO
      synthetic marker; inline embed among text leaves the host `.cm-line` decorated exactly
      once and the nested element unpatched (no doubled shift). The last two are measured to
      be correct already — assert them as regression locks, since the widened predicate is
      what could newly break them.
- [x] 4.3 Escalated-selection coverage: an embed line inside a cover shows the same chrome
      as plain lines in that cover, reaching the same left edge.
- [x] 4.4 Marker-idempotence across repeated renders (design Risks): drive several editor
      renders over the embed and assert exactly one marker child survives each. NOT the full
      scenario this task was written for — it triggers renders by moving the cursor, which
      never makes the EMBEDDED note's own subtree re-render. Forcing that (editing the
      embedded note from another pane) stays deferred and is recorded as such in
      `docs/research/12-decoration-follow-ups.md`; the test name says "repeated renders", not
      "re-render", so the suite does not claim the deferred coverage.
- [x] 4.5 `markerVisibility` across all three settings on the embed fixture: the reserved
      gutter is constant and only icon presence changes, same invariant as every other kind.
- [x] 4.6 Outline-mode-off on the embed fixture renders byte-identical to stock Obsidian
      (no leftover inline styles or marker children after `clearAll()`).
- [x] 4.7 Full suite: unit tests, `openspec validate --strict`, lint, and the whole
      decoration e2e corpus including the newly registered fixture's screenshots.
- [x] 4.8 Manual pass in a real vault with a real embed, at more than one theme, confirming
      the embed sits in the outline geometry and stops moving when the cursor leaves it.

## 5b. Second measurement pass (three bugs reported against the first version)

Reported from real use, all three reproduced in a probe before any code changed:
an embed paragraph showed a marker beside its text AND one mid-block; indenting it into a
list threw the embed too far right (doubled indentation); closing and reopening the note
rendered it correctly.

Measured causes, both of them flaws in this change's own reasoning rather than in Obsidian:

- **Obsidian re-parents the patched element.** After `indent-node`, the same
  `internal-embed markdown-embed` element became a CHILD of the new `.cm-line`, still
  carrying `margin-left: calc(0px + max(...) + 1.25rem)` and a stale `to-decor-marker`.
  Cleanup keyed on the patch selector could no longer see it (design D4's original claim
  that same-selector cleanup is "exactly complete" was simply false), so the patch was
  stranded until the view was rebuilt — hence "correct after reopening".
- **One line can have two elements.** With the cursor on the embed line, `contentDOM` had
  BOTH a `.cm-line` for line 4 and the embed block for line 4. Each decoration path
  decorated its own, producing two markers. The original per-element marker count could not
  have caught this: it counted `:scope > .to-decor-marker-icon` per element, never across
  the elements sharing a line.

- [x] 5b.1 Reproduce all three symptoms in a probe against the shipped code, recording the
      re-parented element's stale inline style and the two-elements-one-line state.
- [x] 5b.2 Stamp patched elements with our own class and sweep by it (design D4), in both
      the per-pass cleanup and `clearAll()`.
- [x] 5b.3 Suppress the widget marker when a plain `.cm-line` renders the same line
      (design D4b), excluding `.cm-line.hr`.
- [x] 5b.4 Regression tests counting markers ACROSS every element rendering a line, and
      asserting no stranded patch survives an indent — plus a live-vs-reopened equality
      check, since "correct only after reopening" was the reported tell. Negative-controlled
      against the shipped code: the two bug repros fail, the outdent lock passes (outdent
      returns the element to the selector's reach, so it locks behavior rather than
      reproducing a defect).

## 5. Close out

- [x] 5.1 Remove the "Wiki-embed blocks bypass decoration entirely" entry from
      `docs/research/12-decoration-follow-ups.md`, and record anything the measurement pass
      turned up that is worth keeping (e.g. an unresolved async-re-render behavior) as a new
      parking-lot entry rather than losing it.
- [x] 5.2 Update the `decorations.ts` module doc comment where it describes the widget path
      in atom terms.
