## 1. The shared column definition (design D6)

- [ ] 1.1 Establish one source for a depth's column: the unit, the marker's own centre offset,
      and the gradient's 1px stop all derive from it, so a marker's visible centre and its
      guide's visible centre coincide by construction rather than by convention. Fix the
      measured half-pixel: markers sit at `depth × unit`, the guide paints `[column, column+1]`.
- [ ] 1.2 Establish one vertical anchor for markers across kinds — measured today, a bullet
      centres on its text rect while a block icon sits ~5px above it. Decide the anchor against
      the optical centre of a text row (a rect centre reads ~1.5px high), apply it to synthetic
      markers and the native bullet alike, and fold in `docs/research/12`'s existing
      "vertical-alignment polish" entry for the widget-atom icons while the rule is being set.
- [ ] 1.3 Declare `--to-decor-unit` as a real value rather than a CSS fallback, so
      `--list-indent` and everything else read one number. No user setting in this change.
- [ ] 1.4 Unit-test the shared derivation; e2e-assert that a block marker's centre, a bullet's
      centre and their guide's centre agree at the same depth, in both bundled themes.

## 2. Pure decoration facts

- [ ] 2.1 `LineGuideFact` carries the active list-item ancestor depths in their own field,
      emitted unconditionally (content lines and gap lines alike) so a blank line inside a list
      keeps its guides continuous. Already present on the demo branch — review it against the
      spec rather than rewriting it.
- [ ] 2.2 Unit-test the new field: a pure list, a list under a heading, a list under a
      paragraph, a multi-line item's continuation, a gap line between items, and a non-list
      child of a list item.
- [ ] 2.3 Remove `computePositionTrail`'s two `isListItem` exclusions (`'full'`'s `continue`,
      `'lineage'`'s rung filter) so the trail steps one level per ancestor whatever its kind.
- [ ] 2.4 Rewrite the three trail tests that assert the old omission — "runs the segment at the
      shallower non-list column, through the list levels", "accents only the non-list ancestor
      in the guides style", "draws no segment anywhere in a pure list, in either style" —
      against the new contract, and add a pure-list lineage case.

## 3. List geometry

- [ ] 3.1 Emit the list line's own tree depth alongside its supplemental depth, so the CSS can
      state the hanging indent.
- [ ] 3.2 Push the unit into `--list-indent`, scoped to outline-mode list lines. Verify a
      second note without outline mode, open at the same time, is byte-identical to stock.
- [ ] 3.3 State the hanging indent from `(depth − supplementalDepth) × unit + gutter` with
      `!important`, replacing Obsidian's measured value (design D3).
- [ ] 3.4 Put the marker on its column: zero the marker gap, zero-width bullet box, marker span
      sized to the gutter with `min-width`. Exclude task lines (design D5).
- [ ] 3.5 Set the bullet weight to `0.38em`, colour token unchanged.
- [ ] 3.6 Suppress Obsidian's own list-guide line on those lines — its width only, never the
      user's "Show indentation guides" setting — and include the list-ancestor depths in the
      gradient so our guide draws every level exactly once.

## 4. Remove the experimental settings

- [ ] 4.1 Delete `ListLayout`/`ListBullet`, their `PluginData` fields and defaults, the
      `DecorationSource` members, the plugin accessors, and both settings-tab entries
      (declarative and pre-1.13 fallback).
- [ ] 4.2 Delete the classes and CSS branches that existed only to switch between variants; the
      remaining rules hang off `to-decor-list` alone.
- [ ] 4.3 Confirm a `data.json` carrying the removed keys loads without error and the removed
      keys are not written back.

## 5. Specs and docs

- [ ] 5.1 Fold the two delta specs into `openspec/specs/` on archive; until then keep them
      accurate as the implementation settles.
- [ ] 5.2 Update `docs/research/12-decoration-follow-ups.md`: close "shrinking only our own
      added list margin", "drawing the ancestor trail's segments along native list columns",
      and the "native list decoration experiments" entry; retarget the vertical-alignment entry
      at task 1.2.
- [ ] 5.3 Add the carried-forward findings from
      `docs/research/16-native-list-decoration.md` to `docs/research/11-decoration-lessons.md`:
      look for the variable before building the mechanism; override the variable the consuming
      rule reads, not an intermediate one; Obsidian's list hang is a cached measurement whose
      cache ignores attributes; `--list-indent` is `em`-based so anything of ours flowing into
      it must be `rem`; a user setting can move geometry.
- [ ] 5.4 Record the residuals where a user will meet them, not only in research: two- and
      three-space files, and space-indented files with indent guides off. Settle design.md's
      open question about the surface here.

## 6. Verification

- [ ] 6.1 Grow the shared fixture corpus with a list-geometry fixture: tab / four-space /
      two-space nesting, ordered across the 9→10 boundary, tasks, a blank line inside a list, a
      soft-wrapping item at two levels, and a list attached to a paragraph.
- [ ] 6.2 E2e: every list level steps by one unit and equals a same-depth heading's column;
      guides render one line per level on that same grid; a bullet sits on its own guide.
- [ ] 6.3 E2e: a soft-wrapping nested item's wrapped rows align with its own text — both on a
      freshly opened note AND after turning outline mode on for a note already open, which is
      the case a measured hang got wrong.
- [ ] 6.4 E2e: outline mode off renders stock, for a pure list and for a mixed document.
- [ ] 6.5 E2e: the trail reaches every list level, and every setting combination leaves a
      list's geometry unchanged.
- [ ] 6.6 Screenshot the full corpus in both bundled themes, and run the manual pass with
      Minimal installed (its own `--list-indent` and `--list-edit-offset` collide — design
      Risks).
- [ ] 6.7 Real-vault pass by hand over `test-vault/`, including
      `Notes/List decoration demo.md`. This is the gate, not the fixtures — every bug in this
      layer's history was found here and none by the synthetic corpus.
- [ ] 6.8 Full suite green: unit, lint, typecheck, desktop e2e.
