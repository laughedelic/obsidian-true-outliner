## 1. Measure the ladder before choosing it

- [x] 1.1 Measure the grid's floor (`gutter + widest ink-left`) on desktop and under mobile
  emulation, against a fixture carrying a task list, an ordered list and a nested bullet list —
  the marks the gutter is derived from — and verify the two device classes report different
  floors, since the checkbox term differs by platform
  ([21-marker-text-gap.md](../../../docs/research/21-marker-text-gap.md))
- [x] 1.2 Render the candidate rungs (`1.5rem`, `1.75rem`, `2rem`, plus one wider candidate) across
  the fixture corpus in both bundled themes and both device classes, and verify by screenshot
  which read as a ladder and which spend real width on chrome — the same pass
  [22-outline-unit-width.md](../../../docs/research/22-outline-unit-width.md) records for the
  current default
- [x] 1.3 Render the candidate guide thicknesses (`1px`, `2px`, `3px`) and intensities (subtle,
  normal, strong) over the same corpus in both themes, and verify the top thickness still reads
  as a guide beside a marker rather than as a bar
- [x] 1.4 Record 1.1–1.3 as an addendum to `docs/research/22-outline-unit-width.md` (unit) and
  `docs/research/09-experiment-2-guide-lines.md` (appearance), and verify each preset the code
  will offer has a figure behind it, including the bottom rung's clearance on both device classes
- [x] 1.5 Confirm which classes Obsidian actually puts on `body` for each device class, including
  under `app.emulateMobile()` in the mobile e2e configuration, and verify the class the
  device-class default keys on is present there — the branch is untestable if it is not

## 2. The guide's width becomes a declaration

- [x] 2.1 Replace `GUIDE_WIDTH` in `src/plugin/chrome-line.ts` with a reference to a new
  `--to-guide-width` property declared once in `styles.css`'s chrome-token block, add its name to
  `CHROME_VARS`, and verify no numeric sibling remains by grepping for a literal width in
  `chrome-line.ts`, `chrome-tokens.ts` and `decorations.ts`
- [x] 2.2 Point `--to-trail-width` at `var(--to-guide-width)` and `--to-stripe-bleed` at the max of
  both widths, and verify with an existing guide fixture that an accented guide measures the same
  width as an unaccented one and that a depth-0 guide paints its full width — negative control:
  hold the guide at its thickest preset while pinning `--to-trail-width` back to `1px` from a
  stylesheet, and confirm the depth-0 guide measures half width under the old
  `max(1px, var(--to-trail-width))` bleed and full width under the new one. Restoring the old
  formula alone proves nothing once the trail defaults to the guide's width: both then resolve to
  the same 3px, and only a diverging trail width shows that the guide's own width participates
- [x] 2.3 Verify `e2e/specs/51-guides-gradient.e2e.ts` and `55-position-indicators.e2e.ts` still
  pass unchanged with the width published rather than spelled (`npm run test:e2e:narrow --
  51-guides-gradient`, then `55-position-indicators`)

## 3. Settings storage and publication

- [x] 3.1 Add the five settings to `PluginData` (unit step, guide visibility, single-root
  qualifier, guide thickness, guide intensity) with their defaults and `KNOWN_*` records in
  `src/plugin/mode-registry.ts`, and verify `tests/` covers each field falling back to its default
  from a wrong-typed and an unknown stored value — negative control: drop one field from its
  `KNOWN_*` record and confirm the type check fails to compile
- [x] 3.2 Publish the resolved choices as `--to-set-*` properties on `document.body`, writing a
  property only where the reader has chosen a non-default, and verify by inspecting the element
  that the default state leaves no property behind
- [x] 3.3 Remove every published property and class on plugin unload, and verify from non-default
  choices that the DISABLED midpoint leaves `body` with no `--to-set-*` property and the grid at
  Obsidian's own rendering, and that re-enabling republishes the saved choices — starting from
  defaults exercises no cleanup at all, since there is nothing published to remove
- [x] 3.4 Spell each token in `styles.css` as `var(--to-set-…, <default>)` — unit, guide width,
  guide intensity — keeping each declaration single and at `body`, and verify a stylesheet
  override at `body` still wins over a published setting (design D1)

## 4. The unit ladder

- [x] 4.1 Declare the device-class default (`--to-unit-default` at `body`, overridden under the
  mobile body class) with the numbers task 1 fixed, and verify the desktop and mobile e2e runs
  each report the step their class should get with the setting untouched
- [x] 4.2 Wire the unit setting through publication, and verify every rung renders every column,
  marker, hanging indent and footer group inset at that step, on both surfaces — extend
  `e2e/specs/58-unit-override.e2e.ts`, which already measures each independently positioned layer,
  rather than writing a second measurement harness
- [x] 4.3 Add the settings-versus-stylesheet precedence case and verify the stylesheet wins —
  negative control: publish the setting as an inline `--to-decor-unit` on `body` instead and
  confirm the new case fails. Landed in `59-appearance-settings.e2e.ts` rather than
  `58-unit-override.e2e.ts`: precedence is a property of the publication mechanism, which that
  spec holds end to end, and 58 measures the geometry a unit produces
- [x] 4.4 Verify the narrowest rung clears the floor on both device classes with a task-list
  fixture open, asserting the relationship (child mark right of parent text), never a pixel count

## 5. Guide appearance

- [x] 5.1 Wire the thickness and intensity settings through publication, and verify in the editor
  and the footer that every guide's rendered width and colour follow, with no line's text or
  marker moving — assert the relationship between the two surfaces' values, not absolute widths
- [x] 5.2 Verify a thickness or intensity change reaches a second open pane and an open footer
  without touching a note and without `forceRedraw` — negative control: route the change through
  `forceRedraw` instead and confirm the second pane's assertion fails

## 6. Guide visibility

- [x] 6.1 Teach `activeGuideDepths` (`src/plugin/decorations.ts`) the visibility mode, leaving
  `computeLineGuides` caret-free and its cache keyed on the document alone, and verify every level,
  the cursor's levels and none in `e2e/specs/51-guides-gradient.e2e.ts` — plus unit tests if the
  filter can be exported from a module free of CodeMirror imports, since nothing under `tests/`
  imports `decorations.ts` today. Negative control: return the unfiltered depths and confirm the
  cursor-scoped cases fail
- [x] 6.2 Carry the document's single-root fact through the doc-facts bundle in `decorations.ts`
  (`decorate.ts` learns nothing about either setting) and drop depth 0 when the qualifier is on,
  and verify a single-root note, a two-root note, and a single root with a single child (which
  keeps its deeper guides) — negative control: derive the fact from the first line's guide depths
  instead of the root count and confirm the single-root-with-single-child case fails
- [x] 6.3 Verify the qualifier under an active zoom scope drops the zoom root's own guide and
  leaves the levels inside it drawn (`e2e/specs/80-outline-zoom.e2e.ts` fixtures, asserted in
  `51-guides-gradient.e2e.ts`)
- [x] 6.4 Widen the caret-chain gate in `computeTrail` so cursor-scoped visibility has a chain with
  both accent settings `off` and under an escalated cover, keeping both suppressions attached to
  accents only, and verify accent behaviour is byte-identical before and after in
  `55-position-indicators.e2e.ts` — negative control: leave the gate unwidened and confirm the new
  cursor-scoped-with-accents-off case renders no guides
- [x] 6.5 Gate the native indent-guide suppression on the layer being drawn at all, and verify that
  in the `none` mode a list line reports Obsidian's own guide width restored, while in every other
  mode it stays suppressed on every line regardless of the caret
- [x] 6.6 Verify no line's geometry moves under any visibility mode or as the caret moves — measure
  a row's padding, margin, text start and marker centre with guides on, off, and cursor-scoped
- [x] 6.7 Measure the cost of a caret move under cursor-scoped visibility on the largest existing
  fixture, and verify it stays in the same order as a caret move with accents on today (design
  Risks)

## 7. The footer follows

- [x] 7.1 Draw no footer guides while the layer is off, leaving the footer's own setting otherwise
  in charge, and verify in `e2e/specs/79-footer-appearance.e2e.ts` that the guide-row count goes to
  zero and returns — negative control: read only the footer's own setting and confirm the case
  fails
- [x] 7.2 Verify a footer row's guides do not change as the caret moves under cursor-scoped
  visibility, and that unit, thickness and intensity changes do reach the footer

## 8. The settings tab

- [x] 8.1 Add the five controls to `getSettingDefinitions()` and to the pre-1.13 `display()`
  fallback, with the plugin's accessor pair for each, and verify both surfaces render the same
  controls with the same labels
- [x] 8.2 Verify each control's change applies live in an open note (`e2e/specs/41-backlinks-
  settings.e2e.ts`'s settings-driving helper is the existing pattern), appearance without a
  decoration rebuild and visibility with one

## 10. Review round: what use of it changed

- [x] 10.1 Add the two caret-scoped visibility states that look DOWN from the caret — the node's
  own guide, and every guide inside it — and verify in `tests/decorate.test.ts` that the three
  caret-scoped states partition a row's guides, and in `51-guides-gradient.e2e.ts` that a
  childless node draws none. Negative control: drop the span check and confirm the sibling
  subtree lights up
- [x] 10.2 Suppress Obsidian's own indent guides unconditionally in outline mode, since they sit
  on columns this grid does not use, and verify a list line reports a zeroed native width under
  every visibility state including `none` — negative control: restore the body-class gate and
  confirm the `none` case fails
- [x] 10.3 Retire the thickness setting, keeping `--to-guide-width` as a declaration, and default
  intensity to `subtle`; verify the footer case still catches an editor-scoped `--to-guide-color`
  by changing intensity alone
- [x] 10.4 Rename the unit's rungs (`balanced`, `auto`) and split the defaults — roomy on desktop,
  compact on mobile — and verify `58-unit-override.e2e.ts` reads each rung and the device default
  on both classes
- [x] 10.5 Record the reasoning in `docs/research/09` (weight withdrawn, intensity's default) and
  `docs/research/22` (the two defaults), and park the reader-facing snippet documentation in
  `docs/research/12`

## 9. Close out

- [x] 9.1 Run the unit suite and the touched e2e specs on both device classes
  (`npm run test:e2e:narrow -- 58-unit-override`, `51-guides-gradient`, `55-position-indicators`,
  `79-footer-appearance`, each also with `--mobile`), and verify
  `.obsidian-cache/e2e-summary.json` reports no failures
- [x] 9.2 Regenerate the screenshot corpus at the new defaults and verify the baseline diff shows
  only the intended appearance change — regenerated by `51-guides-gradient`'s own screenshot pass
  on every run of the decorations group. The committed baselines (`e2e/baselines/footer`) record
  structure rather than pixels and are unchanged. The only default that moved anywhere is the
  mobile step, from `1.75rem` to `1.625rem`; desktop's unit, the guide's width and its intensity
  are all exactly what they were
- [x] 9.3 Move the completed parking-lot entries in `docs/research/12-decoration-follow-ups.md` to
  closed, note the deferred cascade of the single-root qualifier there, and verify no entry claims
  work this change did
- [x] 9.4 Run `openspec validate outline-appearance-settings --strict`
