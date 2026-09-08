## 1. Measurement — the reading-view state encoding

One question gates one task: D6's `source` default. The surfaces task also carries a small
measurement of its own (D7), but only this one can change a design decision.

- [ ] 1.1 Dev-vault probe: for a `MarkdownView` switched to reading view, record `getState()`
      for both histories — last in Live Preview, and last in the source editor — and what
      `setState({ mode: 'source' })` alone does in each. Amend docs/research/24's open question
      1 with the measured answer and the verdict for D6's default. Task 4.4 waits on this; if
      the encoding is not round-trippable at all, STOP and revise D6 before building the entry

## 2. Data model — the default

- [ ] 2.1 `src/plugin/mode-registry.ts`: `PluginData` gains `outlineByDefault: boolean`
      (default `true`, validated by the existing `bool()` pattern); the `outlinePaths`
      interface field, `DEFAULT_DATA` entry, and normalize branch are removed;
      `OutlineModeRegistry` is deleted (D1). Verify: `npm run lint` and typecheck clean, and
      `npm test` fails only where `tests/plugin.test.ts` still names the registry — fixed by
      2.2
- [ ] 2.2 `tests/plugin.test.ts`: the registry lifecycle suite is replaced by
      `normalizePluginData` cases for the new key — absent → `true`, non-boolean → `true`,
      explicit `false` preserved, and a stored `outlinePaths` array is not carried across
      normalize (the D9 drop). Negative controls: removing the `bool()` validation must fail
      the non-boolean case; replacing the allow-list pick with a spread must fail the
      outlinePaths-drop case. Verify: `npm test`

## 3. The per-view state and the gating seam

- [ ] 3.1 `src/plugin/outline-state.ts` (D2): the boolean `StateField` in `zoom-state.ts`'s
      shape — `init` reads the default through the injected handle, one effect flips it,
      obsidian-free module. Verify: typecheck; `npm run lint`
- [ ] 3.2 Unit tests driving real `EditorState.update` calls (the `zoom-state` suite's
      pattern): init follows the default at construction; the effect flips the field; a second
      editor's state is independent of the first's. Negative controls: initializing from a
      captured-once constant must fail the default-change case; storing the state on the
      plugin rather than the field must fail the independence case. Verify: `npm test`
- [ ] 3.3 The gating seam (D3): grammar, decorations, transaction filter, backlinks footer,
      and the zoom gates read the field through one shared helper; the structural and zoom
      commands' availability checks read it through the view registry; `isOutline(path)` and
      its accessors retire. The stock-behavior guarantee moves with it: per-view off is the
      new "not in outline mode". Verify: `npm test`; the off-mode e2e specs re-baselined in
      5.1 still pass
- [ ] 3.4 The toggle dispatch (D5): one path the command and both indicators call — effect
      through the view registry, notice, and the zoom-clear effect co-dispatched on the OFF
      direction. The mode-change cursor nudge and the all-leaf sweep retire with it;
      `forceRedraw` stays for settings changes only. Verify: dev-vault pass — toggling one of
      two splits does not repaint the other, and a zoomed tab's zoom clears when it is toggled
      off; `npm test`

## 4. The surfaces

- [ ] 4.1 The command becomes a `checkCallback` over `getActiveViewOfType(MarkdownView)` with
      a file (any view mode; not offered without one); the editor context-menu entry is
      untouched. Verify: the palette offers the command in reading view in the dev vault;
      `npm run lint`
- [ ] 4.2 The indicators (D7): status bar item and ribbon icon stating the ACTIVE tab's mode,
      both toggling through 3.4's path; updates from the dispatch site plus
      `active-leaf-change`/`file-open`; the dev-vault measurement of which events fire on an
      in-leaf mode switch, adding what is missing; `styles.css` under namespaced classes. The
      status text wording and the ribbon on-state treatment are settled by a visual pass and
      recorded in docs/research/24. Verify: two tabs in different states — both indicators
      restate on tab switch; the screenshot lands in 24
- [ ] 4.3 The settings tab (D8): declarative `getSettingDefinitions()` toggle plus the
      pre-1.13 `display()` fallback, in sync, with search wording stating "new tabs only" and
      naming the other surfaces; the setter persists and does not touch open tabs. Verify: a
      settings flip in the dev vault leaves every open tab's state alone, and the next note
      opened follows the new default
- [ ] 4.4 The reading-view entry (D6, gated on 1.1): ON from a preview pane switches it via
      `setState` with the measured `source` default, then dispatches the outline-on effect on
      the fresh editor — overriding an off default, per the spec; only the active pane; OFF
      from reading is a no-op. Verify: dev vault — entry lands in the pane's own editing mode
      outlined, with the default off as well as on

## 5. E2E — lifecycle and surfaces

- [ ] 5.1 `e2e/helpers.ts`: the plugin-data reset writes `outlineByDefault` (defaulting it on,
      so the specs whose subject is outlined behavior keep their subject), and every spec that
      asserts stock behavior flips the view off through the toggle or sets the default off —
      sweep `e2e/specs/` for the `outlinePaths` writes. Verify:
      `npm run test:e2e:narrow -- 10-outline-mode` launches (green after 5.2)
- [ ] 5.2 Rewrite `e2e/specs/10-outline-mode.e2e.ts` for the per-tab lifecycle: a fresh
      install is on by default; the default survives restart while a manual state does not;
      changing the setting leaves open tabs alone; a manual state resets on file switch and on
      a reading round-trip; two tabs on one file differ; bytes and mtime are untouched; rename
      and delete change nothing and the store records no per-path entries, dropping a previous
      version's entries on save; the structural commands are gated per tab. Negative controls:
      defaulting the setting to false must fail the fresh-install case; persisting any
      per-path or per-tab state must fail the restart and store cases. Verify: the narrow run
      is green
- [ ] 5.3 New `e2e/specs/11-outline-mode-surfaces.e2e.ts`: the palette offers the toggle in
      reading view; the indicators state the active tab's mode, restate on tab switch, and
      toggle the active tab only; toggling on from reading view enters the view's own editing
      mode outlined, overriding an off default; toggling off from reading view does nothing;
      other panes are not switched. Negative controls: an indicator writing a private copy of
      the state must fail the restate case; switching panes on the OFF-from-reading direction
      must fail the does-nothing case. Verify: the narrow run is green
- [ ] 5.4 Mobile pass for both specs (`npm run test:e2e:narrow -- 10-outline-mode --mobile`,
      then 11): the ribbon states and toggles the active tab, no status bar item exists, and
      the reading-view entry works. Negative control: any desktop-only assumption (a
      status-bar click) must fail here. Verify: `.obsidian-cache/e2e-summary.json` reports no
      failures for both runs
- [ ] 5.5 Full-suite check before the checkpoint: `npm test`, `npm run lint`, and the full e2e
      sweep (`npm run test:e2e`). Verify: all green; a pushed checkpoint then runs the CI
      matrix, which is the source of truth for the whole suite

## 6. Land

- [ ] 6.1 Sync the delta specs into the main specs and rewrite the `outline-mode` main spec's
      Purpose, which still says "per-note, … persisted per file path" — deltas cannot carry a
      Purpose change (design.md, Migration Plan). Verify: the main spec states the per-tab
      model end to end, and `openspec status` reports the change ready to archive
- [ ] 6.2 `openspec validate per-tab-outline-mode --strict`
