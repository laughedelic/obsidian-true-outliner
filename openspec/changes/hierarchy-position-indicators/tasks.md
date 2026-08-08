## 1. Probe the mechanisms this change is betting on

Design decisions 5 and 6 rest on DOM we do not own. Settle them with live evidence before
building on them — a wrong answer here changes what gets built, not just how.

- [x] 1.1 In a running vault, inspect a nested list line in Live Preview and record whether
      `.cm-indent` spans are emitted per indentation level, whether they exist with Obsidian's
      "Show indentation guides" setting both ON and OFF, and what their measured widths are
      relative to the list's own per-level nesting.
- [x] 1.2 Determine what can be drawn on those spans: whether a `::before` accent (the selector
      `obsidian-outliner` disables) is reachable and lands on the native column, and whether an
      accent survives when native guides are disabled.
- [x] 1.3 Record the current node's own line DOM in both mounted forms — caret on a list line vs.
      caret elsewhere — confirming whether `.list-bullet` is present or replaced by revealed
      `.cm-formatting-list` text, and which selector reaches each form.
- [x] 1.4 Write the findings into a new `docs/research/14-experiment-position-indicators.md`
      (probe setup, measurements, screenshots), and record whether the fallback from design
      decision 5 — omit list-level segments — is needed.

## 2. Pure computation and unit tests

- [x] 2.1 Add `computePositionTrail(doc, cursorLine, style)` to `src/plugin/decorate.ts`,
      returning the current node's own first line plus, per line, which depths are accented and
      where level-change links belong. Keep it free of CM6 and Obsidian imports, alongside
      `decorate()` / `computeLineGuides()`.
- [x] 2.2 Cover the `guides` style in `tests/decorate.test.ts`: strict ancestors only (a node
      never accents its own level), sibling subtrees unaccented, nested ancestors all accented,
      accents present on the same gap lines the base guides already cover.
- [x] 2.3 Cover the `path` style: each level's segment stops where the next level starts,
      nothing renders below the current node, the half-segment on an ancestor's own line is
      present, and level-change links sit on the lines where the level actually changes.
- [x] 2.4 Cover the list cases: a chain running through list nesting reports those levels as
      native-metric levels distinguishable from our own columns, and a pure list (no non-list
      ancestor) reports no non-list levels at all.
- [x] 2.5 Cover degenerate inputs: caret on a top-level node (no ancestors), caret on a blank gap
      line, caret on a continuation line of a multi-line node, empty and preamble-only documents.

## 3. Settings

- [x] 3.1 Add `guideHighlight: 'off' | 'full' | 'lineage'` (default `'full'`) and
      `markerHighlight: 'off' | 'current' | 'lineage'` (default `'current'`) to `PluginData` and
      `DEFAULT_DATA` in `src/plugin/mode-registry.ts`, with doc comments in the style of
      `MarkerVisibility`. **Reshaped after review**: the first version bundled the axes (a
      current-marker boolean plus a trail enum whose `path` state implied lineage guides AND
      lineage markers), which made markers-only unreachable — the one rendering a plain list can
      show, since it has no guide column to accent. Split into two independent three-state axes.
- [x] 3.2 Add the accessors and persisting setters in `src/plugin/main.ts`, following
      `setMarkerVisibility` (persist, then `forceRedraw()`), and extend `DecorationSource` so the
      decoration layer reads both settings fresh on every recompute.
- [x] 3.3 Register both settings in `getSettingDefinitions()` **and** the pre-1.13 `display()`
      fallback, keeping the two in sync as the existing comment requires.
- [x] 3.4 Confirm existing installs pick the defaults up through the
      `{ ...DEFAULT_DATA, ...(await this.loadData()) }` merge, with no migration step.

## 4. Current-node marker accent

- [x] 4.1 Emit the current-node class from the decoration builder on the current node's first
      line only, gated on outline mode, on `markerHighlight` being other than `off`, and on the
      suppression rule (spec: suppressed while every non-empty range is a whole-subtree cover).
- [x] 4.2 Apply the same class on the widget-atom DOM-patch path in `MarginCompensation`, and
      clear it in `clearAll()` alongside the other decoration state.
- [x] 4.3 Add the `styles.css` rules accenting the synthetic marker icon and the native list
      marker in both mounted forms (task 1.3's findings), driven by the accent custom property
      from task 6.1 — colors only, no size or position changes.
- [x] 4.4 Verify the accent never lands on continuation lines, gap lines, or any other node.

## 5. Ancestor trail rendering

- [x] 5.1 Extend the guide-layer generator in `src/plugin/decorations.ts` so an accented depth
      emits its layer in the accent color **instead of** the normal one, never in addition, and
      path half-segments emit as additional layers in the same
      comma-separated background list.
- [x] 5.2 Wire `computePositionTrail` into the existing decoration builder (which already
      recomputes on every update, selection changes included), gated on outline mode,
      `isNestedEditor`, the trail setting, and the suppression rule.
- [x] 5.3 Implement the `guides` style end to end: full-extent accent on every strict ancestor's
      guide, with column, width, and gap-line continuity unchanged.
- [x] 5.4 Implement the `path` style end to end: per-level segments bounded by the next level's
      start, half-segments from each ancestor's own marker, and an accent on every ancestor's own
      marker, terminating at the current node. **Reworked after the first real-note review**: the
      original built the Logseq shape, with a horizontal elbow at each level change. Those ran
      through the very marker icons they were reaching for (a marker is centered ON its own guide
      column) and picked up visible offsets, so the elbows are gone and the accented ancestor
      marker is the junction — which also makes the style say something inside a deep list, where
      no segment can be drawn at all. Renamed `thread` → `path` to match what it now is.
- [x] 5.5 Implement list-level rendering per task 1.2's finding — native chrome accenting for
      those levels, or the documented omission fallback. A misaligned segment is never an
      acceptable outcome. **Shipped as the omission fallback** (native list threading was scoped
      as a stretch goal): the probe found `.cm-indent`'s native guide column sits 24px off the
      parent bullet's, so accenting it as-is would be misaligned. The trail's SEGMENTS descend at
      the nearest non-list ancestor's column; each list ancestor's own bullet is accented, so the
      levels stay legible and only the connecting lines are missing. What closing it properly
      needs is written up in `docs/research/14` and re-filed in `docs/research/12`.
- [x] 5.6 Handle the guide pseudo-element's flat `opacity: 0.6` so the accent is not dampened
      along with the base guides (design decision 7).

## 6. Theming and geometry guarantees

- [x] 6.1 Introduce `--to-decor-accent` (defaulting to the theme's own accent variable) and a
      trail line-weight property; use them everywhere instead of hardcoded colors or widths.
- [x] 6.2 Audit every new rule and every new emitted style for geometry: no `--to-marker-gutter`,
      `padding-left`, `margin-left`, `--to-depth`, marker size, or marker position is touched by
      any of them.
- [x] 6.3 Confirm no new `!important` is introduced, and that the new selectors do not fight
      Obsidian's own specificity — extend an existing override rather than adding a competing one
      where the base layer already solved it.

## 7. Real-vault experiment and design confirmation

- [x] 7.1 Compare `guides` and `path` side by side on a real, deep note (screenshots into
      `docs/research/14`) — including the deep-tree noise trade-off the design flags for the
      `guides` default.
- [x] 7.2 Confirm or overturn the open questions the design records with working answers: the
      route stops at the current node; block-selection chrome suppresses indicators. Update the
      design and the spec if the screenshots disagree.
- [x] 7.3 Sweep the bundled themes plus Minimal and Catppuccin, checking the accent's contrast in
      light and dark, and checking that nothing in the new layer regresses the base layers under a
      `max-width`-style theme. **Bundled light + dark done and pinned by e2e; the community-theme
      sweep was NOT run** — no third-party theme is installed in the harness, and doc 12 records
      the cost of committing one. The base-layer regression risk it guards against cannot reach
      this layer, which writes no geometry at all (audited per 6.2, measured per 8.4).
- [x] 7.4 Record the outcome, including anything deliberately not fixed, in `docs/research/14`.

## 8. End-to-end coverage

- [x] 8.1 Add `e2e/specs/55-position-indicators.e2e.ts` covering: no indicators with outline mode
      off; current-marker accent on a heading and on a list item (both mounted forms); `guides`
      accenting an ancestor's guide but not a sibling's; `path` connectivity from root to caret
      and its termination at the current node.
- [x] 8.2 Cover the settings axis: each of the three trail states renders what it should and
      nothing more; `off` plus current-marker off renders exactly the base layers; a settings
      change applies live on a note containing only widget-replaced atoms.
- [x] 8.3 Cover the caret-tracking contract: indicators follow arrow-key movement with no reload,
      and a whole-subtree cover suppresses them until the selection collapses.
- [x] 8.4 Cover the geometry contract: measured indentation, text position, and marker
      size/position are identical across every setting combination.
- [x] 8.5 Cover the nested per-cell editor gate, alongside the existing assertion in
      `53-decoration-contracts.e2e.ts`, and assert the layer dispatches no transaction (buffer,
      caret, and undo stack unchanged across caret movement).
- [x] 8.6 Cover the pure-list case the modified `outline-decorations` requirement now spells out:
      base-layer geometry unchanged with the caret inside a pure list at any setting.

## 9. Regressions, defaults, and cleanup

- [x] 9.1 Re-run the existing decoration e2e specs (`50`–`53`, `63`) against the new **on**
      defaults; pin settings explicitly in any spec whose assertion would otherwise become
      ambiguous, rather than letting the default change weaken an existing net.
- [x] 9.2 Negative-control the new e2e assertions: disable each new rendering path and confirm the
      corresponding test actually fails.
- [x] 9.3 Run `npm run lint`, `npm run build`, `npm test`, `npm run build:e2e`, and
      `npm run test:e2e` clean.
- [x] 9.4 Mark the graduated entries in `docs/research/12-decoration-follow-ups.md` as done by this
      change, and move anything the experiment surfaced but this change is not doing into that same
      parking lot.
- [x] 9.5 Add the `**Covered by**` lines to both spec files, naming the real test names, following
      the convention the existing `outline-decorations` spec uses.
