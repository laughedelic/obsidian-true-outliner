## 1. The controls model, pure and off the DOM

Design D1. This section reads no files and touches no DOM, so it is finished and tested before
anything renders. Everything the axes need is already in the reverse map — that is what makes the
order possible.

- [x] 1.1 `src/plugin/footer-filter.ts`: the controls state (selected folders, selected kinds,
      search term, sort order, cap overrides) and the pure function from
      (summaries, references-by-source, controls) to admitted groups, true totals and shortfall.
      No `App`, no `TFile`, no `place()` — verified by the module importing nothing from
      `obsidian`
- [x] 1.2 Axis derivation: the folder values from `splitPath(path).folder` and the kind values
      from `referencesFrom()`, each with the count of contributing notes, and each offering only
      values actually present. Verify a note whose references are all of one kind offers exactly
      one kind value
- [x] 1.3 Focus-on semantics: an empty axis admits everything, a non-empty axis admits only its
      values, axes combine conjunctively, and the search term matches source note NAMES only.
      Verify the last one by a term that occurs in a reference's text and in no note name
      returning nothing
- [x] 1.4 The overall cap admits whole groups in sort order (D2): the first group that would
      cross the cap is not admitted, nor anything after it, except that a single group exceeding
      the cap on its own is still admitted. Verify the reported totals stay the true filtered
      totals across all three cases
- [x] 1.5 The four sort orders, with recency the default and path the tie-break only.
      `backlinks-footer` shipped a comparator whose tie-break used to be the whole comparison; do
      not reintroduce that — verify two notes with equal mtime order by path, and that changing
      sort never changes a group's internal row order
- [x] 1.6 `tests/footer-filter.test.ts` covering 1.2–1.5, including the empty-controls case that
      must reproduce today's unfiltered footer exactly. Negative control: make an empty axis
      admit nothing instead of everything and confirm the focus-on cases fail; make the overall
      cap cut mid-group and confirm 1.4 fails

## 2. Settings, before anything reads them

Design D8. Six keys, and the settings tab declares each twice — `getSettingDefinitions()` for
1.13+ and `display()` as the pre-1.13 fallback — plus defaults and coercion in `mode-registry.ts`.
The duplication is accepted (design D8's trade-off), so the risk is a key declared in one place
and not the other.

- [x] 2.1 `mode-registry.ts`: the six keys in `DEFAULT_DATA` with their defaults — overall cap 50,
      per-note bound `standard`, core-backlinks suppression on, segment icons `all`, separator
      `none`, footer guides off — and each coerced the way the existing keys are, so an unknown
      stored enum falls back rather than reaching a dropdown with no matching option
- [x] 2.2 The two caps as dropdowns of named values, not free numeric or length input (D8):
      25 / 50 / 100 / no limit, and compact / standard / tall / unlimited mapping to
      `--to-backlinks-group-max`. Verify every option maps to a value the stylesheet accepts
- [x] 2.3 Register all six in both declaration sites and their setters, verified by
      `e2e/specs/41-backlinks-settings.e2e.ts` in the `shell` group: both declaration paths offer
      every key, each carries the name and description Obsidian's settings search reads, each
      round-trips through the value hooks into plugin data and survives a reload, and an unknown
      stored enum falls back to its default. Negative control: remove one setting from `display()`
      only and confirm the fallback case fails while the 1.13+ case still passes

## 3. The header control row

Specs: `backlinks-footer` — "The footer carries a single header control row". Design D4 for where
the state lives.

- [x] 3.1 `ViewState` gains the per-note controls — selected folders, selected kinds, search term,
      cap override — pruned with the tab like the collapse state beside them (D4). Sort order does
      NOT go here: it is plugin data, because its values are note-independent
- [x] 3.2 Header row: totals, the filter affordance, the sort dropdown. The affordance carries a
      dot while any filter or search is active, and the row stays one line while the controls are
      hidden. Verify the dormant and unfiltered footers are visually unchanged from what
      `73-footer-render.e2e.ts` expects
- [x] 3.3 The revealed second row: round pills for folders, square icon chips for kinds, the
      search field, and reset. Two shapes so the axes are told apart without reading labels — the
      spec requires the distinction be in form, not wording
- [x] 3.4 Reset clears both axes and the search term together and is offered only while something
      is active. Verify from the spec's scenario: all three active, one reset, everything eligible
      again
- [x] 3.5 A selected value that stops existing is dropped, returning its axis to admitting
      everything (design Risks). Verify by editing a source note so its folder no longer
      contributes, with that folder selected, and confirming the footer does not go empty
- [ ] 3.6 Every control routes through the existing `render()` and changes nothing else. Verify
      the read-only guarantee holds across filtering, searching, sorting and reset — file bytes,
      caret, selection and undo stack unchanged

## 4. Caps and the incompleteness cue

Design D2, D3 and D5. The per-note bound stays the shipped height cap; only the overall cap is a
count. The rung comes out of the measurement pass that already runs.

- [ ] 4.1 The overall cap is applied by the model (1.4), so only admitted groups reach
      `place()`. Verify by counting `place()` calls for a note with far more sources than the cap
      — a note beyond the cap must not be read at all, which is the spec's own scenario
- [x] 4.2 Drive `--to-backlinks-group-max` from the per-note setting. This is a value change, not
      a mechanism change: the measurement in `fillGroup()` stays exactly as it is, including the
      sub-line-height case that removes the cap rather than clipping a row through its glyphs
- [x] 4.3 The ellipsis rung (D3): in the same pass that compares `scrollHeight` to `clientHeight`,
      count the rows past `clientHeight` and take the depth of the first of them. Render the rung
      after the capped body — inside it, the clip would hide it — at that depth, reading the
      count, and folding the group open when activated. It replaces the bare chevron rather than
      joining it
- [x] 4.4 The footer-level cue: a rung after the last group naming the notes not shown, and the
      fade dissolving the last card so an incomplete list does not look finished. A complete list
      gets neither — verify the spec's "A complete list is not marked" scenario
- [x] 4.5 "Load more" adds a tranche to the per-note cap override and repaints (D5). Verify
      nothing already rendered is removed or reordered, which follows from the model's stability
      rather than from preserving DOM
- [x] 4.6 The header's totals stay the true filtered totals under every cap. Verify against a
      fixture whose reference count is several times the cap

## 5. Coexistence with Obsidian's own backlinks

Specs: `plugin-shell` — "Coexistence warning". Design D6. Presentational only: no other plugin's
configuration is read or written, and the whole thing unloads with the stylesheet.

- [x] 5.1 Verified against Obsidian 1.13.7, and it corrected the design twice. The class is
      `.embedded-backlinks`, but it sits INSIDE the editor as a direct child of `.cm-sizer`,
      sibling to the `.cm-content` our widget lives in — so the scope is `.cm-sizer`, not the
      workspace leaf. And Obsidian drives that element's visibility with an INLINE style, so the
      declaration needs `!important` or it loses in exactly the case it exists for. Both folded
      into design D6
- [x] 5.2 The single stylesheet rule from D6, keyed on our own footer carrying
      `is-suppressing-core`. No container class, no lifecycle hook, nothing to reverse on unload
- [x] 5.3 The footer applies that class from the setting, verified by
      `e2e/specs/42-backlinks-coexistence.e2e.ts`. This found a real bug: the footer widget's
      identity is its NOTE, so CM6 keeps the mounted DOM and never calls `toDOM` again — a
      settings change needed `repaintFooters()` beside `nudgeFooters()`, without which NONE of
      the six settings reached a mounted footer. Negative control: remove the repaint and the
      second toggle fails while the first still passes
- [ ] 5.4 Verify the three containment guarantees the spec states: a note the plugin is not
      decorating renders as it does without the plugin; every other plugin's configuration is
      byte-identical after enabling and disabling suppression; disabling our plugin leaves no
      residue

## 6. The appearance settings

Design D7. Three renderings `backlinks-footer` chose between and shipped one of (research 18,
D19). The model keeps one shape; the renderer is the single site that declines.

- [ ] 6.1 Segment icons on a lineage row — every ancestor named (default), only the row's own
      marker, or none — as a renderer-side decline. `buildRows` keeps emitting every segment
      whatever the setting says
- [ ] 6.2 Ancestor separator — none (default) or a chevron
- [ ] 6.3 Footer guide lines, off by default. The model keeps reporting `guideDepths`; the
      renderer declines to draw them. Verify by asserting the model output is identical with the
      setting on and off — if it is not, the decline has leaked into the model

## 7. End-to-end

New specs in the `backlinks` group (70–76 are the footer's; zoom takes 80). Assert relationships,
never glyph-width pixels — CI's font is not macOS's.

- [ ] 7.1 `e2e/specs/77-footer-controls.e2e.ts`: the header is one row until the filter affordance
      is used; the second row carries both axis shapes, the search field and reset; a folder
      selection narrows and its deselection restores; kind and folder combine conjunctively;
      search matches names and not reference content; reset clears all three. Negative control:
      make deselection clear the whole controls state and confirm the restore case still passes
      while the conjunctive case fails
- [ ] 7.2 `e2e/specs/78-footer-caps.e2e.ts`: a note beyond the overall cap is never placed; the
      header reports true totals under a cap; the rung appears at the right depth with the right
      count and folds the group open; the footer-level rung and fade appear only when something is
      omitted; "Load more" is additive. Negative control: raise the cap above the fixture's
      reference count and confirm the rung and fade assertions fail rather than silently passing
- [ ] 7.3 Suppression in a live instance: Obsidian's section is gone with the setting on, back
      with it off, present in an undecorated note, and present after the plugin is disabled
- [ ] 7.4 The read-only guarantee under every control, extending `70-footer-enforcement.e2e.ts`'s
      approach: filter, search, sort, change a cap, load more — then assert file bytes, document
      positions, caret, selection and undo stack are unchanged throughout
- [ ] 7.5 Run the `backlinks` group locally; CI runs the full sweep on push

## 8. Wrap-up

- [ ] 8.1 Fill in `docs/research/18-structured-backlinks.md` where this change answers it: D8's
      search field is source-note names only, D10's caps are two different mechanisms for two
      different questions, and the cap defaults chosen on S5's legibility footing
- [ ] 8.2 Confirm the deferred items are written where they will be found: chronological mode
      (D15) and the footer scoped to a zoomed node, which needs `outline-zoom` as well as this
      change and belongs to neither
- [ ] 8.3 Full suite, linter, and the desktop e2e run; then use the controls against a real vault
      for a session before archiving. Every defect that mattered in the decoration era was found
      that way, not by a test
- [ ] 8.4 Sync the delta specs into `openspec/specs/`, archive the change, and bump the version on
      this branch before merging
- [ ] 8.5 `openspec validate backlinks-controls --strict`
