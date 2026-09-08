## 1. Measurement — the reading-view state encoding

One question gates one task: D6's `source` default. The surfaces task also carries a small
measurement of its own (D7), but only this one can change a design decision.

- [x] 1.1 Dev-vault probe: for a `MarkdownView` switched to reading view, record `getState()`
      for both histories — last in Live Preview, and last in the source editor — and what
      `setState({ mode: 'source' })` alone does in each. Amend docs/research/outline-mode-surfaces's open question
      1 with the measured answer and the verdict for D6's default. Task 4.4 waits on this; if
      the encoding is not round-trippable at all, STOP and revise D6 before building the entry.
      **Measured** (docs/research/outline-mode-surfaces, "Measured"): the state round-trips and the `source`
      default is unreachable, so D6 stands with that clause dropped. The same probe answered
      open question 4 (no public event fires on an in-leaf mode switch — D7 no longer needs
      one) and found that a reading round-trip does NOT rebuild the editor state, which moved
      D4's reset boundary and the ephemerality scenarios in both delta specs

## 2. Data model — the default

- [x] 2.1 `src/plugin/mode-registry.ts`: `PluginData` gains `outlineByDefault: boolean`
      (default `true`, validated by the existing `bool()` pattern); the `outlinePaths`
      interface field, `DEFAULT_DATA` entry, and normalize branch are removed;
      `OutlineModeRegistry` is deleted (D1). Verify: `npm run lint` and typecheck clean, and
      `npm test` fails only where `tests/plugin.test.ts` still names the registry — fixed by
      2.2
- [x] 2.2 `tests/plugin.test.ts`: the registry lifecycle suite is replaced by
      `normalizePluginData` cases for the new key — absent → `true`, non-boolean → `true`,
      explicit `false` preserved, and a stored `outlinePaths` array is not carried across
      normalize (the D9 drop). Negative controls: removing the `bool()` validation must fail
      the non-boolean case; replacing the allow-list pick with a spread must fail the
      outlinePaths-drop case. Verify: `npm test`

## 3. The per-view state and the gating seam

- [x] 3.1 `src/plugin/outline-state.ts` (D2): the boolean `StateField` in `zoom-state.ts`'s
      shape — `init` reads the default through the injected handle, one effect flips it,
      obsidian-free module. Verify: typecheck; `npm run lint`
- [x] 3.2 Unit tests driving real `EditorState.update` calls (the `zoom-state` suite's
      pattern): init follows the default at construction; the effect flips the field; a second
      editor's state is independent of the first's. Negative controls: initializing from a
      captured-once constant must fail the default-change case; storing the state on the
      plugin rather than the field must fail the independence case. Verify: `npm test`
- [x] 3.3 The gating seam (D3): grammar, decorations, transaction filter, backlinks footer,
      and the zoom gates read the field through one shared helper; the structural and zoom
      commands' availability checks read it through the view registry; `isOutline(path)` and
      its accessors retire. The stock-behavior guarantee moves with it: per-view off is the
      new "not in outline mode". Verify: `npm test`; the off-mode e2e specs re-baselined in
      5.1 still pass
- [x] 3.4 The toggle dispatch (D5): one path the command and both indicators call — effect
      through the view registry, and the zoom-clear effect co-dispatched on the OFF direction. The mode-change cursor nudge and the all-leaf sweep retire with it;
      `forceRedraw` stays for settings changes only. Verify: dev-vault pass — toggling one of
      two splits does not repaint the other, and a zoomed tab's zoom clears when it is toggled
      off; `npm test`

## 4. The surfaces

- [x] 4.1 The command becomes a `checkCallback` over `getActiveViewOfType(MarkdownView)` with
      a file (any view mode; not offered without one); the editor context-menu entry is
      untouched. Verify: the palette offers the command in reading view in the dev vault;
      `npm run lint`
- [x] 4.2 The indicators (D7): status bar item and ribbon icon stating the ACTIVE tab's mode,
      both toggling through 3.4's path; updates from the dispatch site plus
      `active-leaf-change`/`file-open`, which 1.1 measured to be the complete set — an in-leaf
      mode switch fires nothing and changes nothing; `styles.css` under namespaced classes.
      The status text wording and the ribbon on-state treatment are settled by a visual pass and
      recorded in docs/research/outline-mode-surfaces. Verify: two tabs in different states — both indicators
      restate on tab switch; the screenshot lands in 24
- [x] 4.3 The settings tab (D8): declarative `getSettingDefinitions()` toggle plus the
      pre-1.13 `display()` fallback, in sync, with search wording stating "new tabs only" and
      naming the other surfaces; the setter persists and does not touch open tabs. Verify: a
      settings flip in the dev vault leaves every open tab's state alone, and the next note
      opened follows the new default
- [x] 4.4 The reading-view entry (D6, gated on 1.1): ON from a preview pane switches it via
      `setState` on the state's own spread, then dispatches the outline-on effect on the pane's
      own editor — which survives the switch, so there is nothing to wait for — overriding both
      an off default and a manual off, per the spec; the pane is recognized by
      `getMode() === 'preview'`, not by a registry miss; only the active pane; OFF from reading
      is a no-op. Verify: dev vault — entry lands in the pane's own editing mode outlined, with
      the default off as well as on, and from a tab manually switched off

## 5. E2E — lifecycle and surfaces

- [x] 5.1 `e2e/helpers.ts`: the plugin-data reset writes `outlineByDefault` (defaulting it on,
      so the specs whose subject is outlined behavior keep their subject), and every spec that
      asserts stock behavior flips the view off through the toggle or sets the default off —
      sweep `e2e/specs/` for the `outlinePaths` writes. Verify:
      `npm run test:e2e:narrow -- 10-outline-mode` launches (green after 5.2)
- [x] 5.2 Rewrite `e2e/specs/10-outline-mode.e2e.ts` for the per-tab lifecycle: a fresh
      install is on by default; the default survives restart while a manual state does not;
      changing the setting leaves open tabs alone; a manual state resets on a file switch and
      SURVIVES a reading round-trip (1.1); two tabs on one file differ; bytes and mtime are
      untouched; rename and delete change nothing and the store records no per-path entries,
      dropping a previous version's entries on save; the structural commands are gated per tab.
      Negative controls:
      defaulting the setting to false must fail the fresh-install case; persisting any
      per-path or per-tab state must fail the restart and store cases. Verify: the narrow run
      is green
- [x] 5.3 New `e2e/specs/11-outline-mode-surfaces.e2e.ts`: the palette offers the toggle in
      reading view; the indicators state the active tab's mode, restate on tab switch, and
      toggle the active tab only; toggling on from reading view enters the view's own editing
      mode outlined, overriding an off default and a manual off alike; toggling off from
      reading view does nothing; other panes are not switched. Negative controls: an indicator
      writing a private copy of the state must fail the restate case; switching panes on the
      OFF-from-reading direction
      must fail the does-nothing case. Verify: the narrow run is green
- [x] 5.4 Mobile pass for both specs (`npm run test:e2e:narrow -- 10-outline-mode --mobile`,
      then 11): the ribbon states and toggles the active tab, no status bar item exists, and
      the reading-view entry works. Negative control: any desktop-only assumption (a
      status-bar click) must fail here. Verify: `.obsidian-cache/e2e-summary.json` reports no
      failures for both runs
- [x] 5.5 Full-suite check before the checkpoint: `npm test`, `npm run lint`, and the full e2e
      sweep (`npm run test:e2e`). Verify: all green; a pushed checkpoint then runs the CI
      matrix, which is the source of truth for the whole suite

## 6. Land

- [x] 6.1 Sync the delta specs into the main specs and rewrite the `outline-mode` main spec's
      Purpose, which still says "per-note, … persisted per file path" — deltas cannot carry a
      Purpose change (design.md, Migration Plan). Verify: the main spec states the per-tab
      model end to end, and `openspec status` reports the change ready to archive
- [x] 6.2 `openspec validate per-tab-outline-mode --strict`
- [x] 6.3 `openspec archive per-tab-outline-mode`, so the change leaves the active tree once
      its specs are synced
- [x] 6.4 `npm version minor` — minor, not patch: the mode's shape changes and the per-file
      store retires, so an upgrading install behaves differently on its next file open. Both
      6.3 and 6.4 land on this branch before the merge, per design.md's Migration Plan; the
      version bump is what makes CI cut a release from the squashed merge commit, so it is
      held until the change is ready to merge rather than run alongside the rest
