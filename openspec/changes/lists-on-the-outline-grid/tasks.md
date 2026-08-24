## 1. The shared column definition (design D6)

- [x] 1.1 Establish one source for a depth's column: the unit, the marker's own centre offset,
      and the gradient's 1px stop all derive from it, so a marker's visible centre and its
      guide's visible centre coincide by construction rather than by convention. Fix the
      measured half-pixel: markers sit at `depth × unit`, the guide paints `[column, column+1]`.
- [x] 1.2 Establish one vertical anchor for markers across kinds — measured today, a bullet
      centres on its text rect while a block icon sits ~5px above it. Decide the anchor against
      the optical centre of a text row (a rect centre reads ~1.5px high), apply it to synthetic
      markers and the native bullet alike, and fold in `docs/research/12`'s existing
      "vertical-alignment polish" entry for the widget-atom icons while the rule is being set.
- [x] 1.3 Declare `--to-decor-unit` as a real value rather than a CSS fallback, so
      `--list-indent` and everything else read one number. No user setting in this change.
- [x] 1.4 E2e-assert that a marker's centre and its own guide's PAINTED centre agree, in both
      bundled themes (`56-list-grid.e2e.ts`). Not unit-tested: the derivation lives in
      `decorations.ts`, which imports `obsidian` and so cannot be loaded by vitest — and the
      rendered stripe is the thing worth asserting anyway, this layer's whole history being of
      computations that were internally consistent and rendered wrong.

## 2. Pure decoration facts

- [x] 2.1 `LineGuideFact` carries the active list-item ancestor depths in their own field,
      emitted unconditionally (content lines and gap lines alike) so a blank line inside a list
      keeps its guides continuous. Already present on the demo branch — review it against the
      spec rather than rewriting it.
- [x] 2.2 Unit-test the new field: a pure list, a list under a heading, a list under a
      paragraph, a multi-line item's continuation, a gap line between items, and a non-list
      child of a list item.
- [x] 2.3 Remove `computePositionTrail`'s two `isListItem` exclusions (`'full'`'s `continue`,
      `'lineage'`'s rung filter) so the trail steps one level per ancestor whatever its kind.
- [x] 2.4 Rewrite the three trail tests that assert the old omission — "runs the segment at the
      shallower non-list column, through the list levels", "accents only the non-list ancestor
      in the guides style", "draws no segment anywhere in a pure list, in either style" —
      against the new contract, and add a pure-list lineage case.

## 3. List geometry

- [x] 3.1 Emit the list line's own tree depth alongside its supplemental depth, so the CSS can
      state the hanging indent.
- [x] 3.2 Push the unit into `--list-indent`, scoped to outline-mode list lines. Verify a
      second note without outline mode, open at the same time, is byte-identical to stock.
- [x] 3.3 State the hanging indent from `(depth − supplementalDepth) × unit + gutter` with
      `!important`, replacing Obsidian's measured value (design D3).
- [x] 3.4 Put the marker on its column: zero the marker gap, zero-width bullet box, marker span
      sized to the gutter with `min-width`. Exclude task lines from CENTRING — a checkbox is
      wider than the gutter and is a click target — and scope every rule that implements the
      exclusion the same way, so it is stated once rather than holding by accident.
- [x] 3.5 CENTRE a task checkbox on its own depth column, like the bullet it sits among,
      without changing its width or hit area. (Landed first as "start on the column", which
      real use reported as a checkbox sitting nearer its text than the bullets around it; the
      "wider than the gutter" reason for not centring was measured false — 16px against a 20px
      gutter. See design D5.)
- [x] 3.6 Set the bullet weight to `0.38em`, colour token unchanged.
- [x] 3.8 Bring an ordered number onto the column too, by a fixed half-gutter shift rather than
      half its own width (which leaves no room for the fold chevron), so a single digit centres
      exactly and every number in a list shares one left edge.
- [x] 3.9 Move the fold chevron off the marker it belongs to: Obsidian renders it with its right
      edge on the content origin, which is now the marker's own centre. `--list-bullet-end-padding`
      is not the lever — measured at three values, the glyph never moved (design D8).
- [x] 3.7 Suppress Obsidian's own list-guide line on those lines — its width only, never the
      user's "Show indentation guides" setting — and include the list-ancestor depths in the
      gradient so our guide draws every level exactly once.

## 4. Remove the experimental settings

- [x] 4.1 Delete `ListLayout`/`ListBullet`, their `PluginData` fields and defaults, the
      `DecorationSource` members, the plugin accessors, and both settings-tab entries
      (declarative and pre-1.13 fallback).
- [x] 4.2 Delete the classes and CSS branches that existed only to switch between variants; the
      remaining rules hang off `to-decor-list` alone.
- [x] 4.3 Normalize persisted data on load: build `this.data` by picking the known keys rather
      than spreading whatever `loadData()` returns, so a removed setting actually disappears
      instead of surviving on the object and being written back by the next `saveData`
      (design D7). Cover it with a test that loads a `data.json` carrying unknown keys and
      asserts they are gone after the next save.

## 5. Specs and docs

- [x] 5.1 Fold the two delta specs into `openspec/specs/` on archive; until then keep them
      accurate as the implementation settles.
- [x] 5.2 Update `docs/research/12-decoration-follow-ups.md`: close "shrinking only our own
      added list margin", "drawing the ancestor trail's segments along native list columns",
      and the "native list decoration experiments" entry; retarget the vertical-alignment entry
      at task 1.2.
- [x] 5.3 Add the carried-forward findings from
      `docs/research/16-native-list-decoration.md` to `docs/research/11-decoration-lessons.md`:
      look for the variable before building the mechanism; override the variable the consuming
      rule reads, not an intermediate one; Obsidian's list hang is a cached measurement whose
      cache ignores attributes; `--list-indent` is `em`-based so anything of ours flowing into
      it must be `rem`; a user setting can move geometry.
- [x] 5.4 Record the residuals where a user will meet them, not only in research: two- and
      three-space files, and space-indented files with indent guides off. Settle design.md's
      open question about the surface here.

## 6. Verification

- [x] 6.1 Grow the shared fixture corpus with a list-geometry fixture: tab / four-space /
      two-space nesting, ordered across the 9→10 boundary, tasks, a blank line inside a list, a
      soft-wrapping item at two levels, and a list attached to a paragraph.
- [x] 6.2 E2e: every list level steps by one unit and equals a same-depth heading's column;
      guides render one line per level on that same grid; a bullet sits on its own guide.
- [x] 6.3 E2e: a soft-wrapping nested item's wrapped rows align with its own text — both on a
      freshly opened note AND after turning outline mode on for a note already open, which is
      the case a measured hang got wrong.
- [x] 6.4 E2e: outline mode off renders stock, for a pure list and for a mixed document.
- [x] 6.5 E2e: the trail reaches every list level, and every setting combination leaves a
      list's geometry unchanged.
- [x] 6.6 Screenshot the full corpus in both bundled themes (specs 50/51/52 do this for every
      fixture, and the corpus now includes `list-grid`), and the Minimal pass: Minimal sets
      `--list-indent: 2em` itself and puts a `--list-edit-offset` margin on list lines, and our
      per-line rules win both — grid intact, bullets on their columns, wrapped rows under their
      own text.
- [ ] 6.7 Real-vault pass by hand over `test-vault/`, including
      `Notes/List decoration demo.md`. This is the gate, not the fixtures — every bug in this
      layer's history was found here and none by the synthetic corpus.
- [x] 6.8 Full suite green: 854 unit tests, lint, typecheck, 22/22 desktop e2e spec files.
