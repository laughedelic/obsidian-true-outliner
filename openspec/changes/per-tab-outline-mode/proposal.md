## Why

Outline mode is the product, and it is currently invisible: a per-file toggle reachable only from
editing modes (`editorCheckCallback`, the editor context menu), so a note that opens in reading
view — which the core default view mode can be — offers no way to see or change the mode; the
only feedback is a 1.5s toast; and every new file starts stock unless toggled by hand. The mode
needs to be an explicit, persistent, visible state rather than a hidden per-file fact.
docs/research/24 records the surface research and the mode-shape decision this change rests on.

## What Changes

- **BREAKING — outline mode becomes a per-tab state with a global default.** A new setting,
  "open new tabs in outline mode", on by default, governs every note a tab newly opens; the
  per-file `outlinePaths` store is retired with no migration (the `normalizePluginData`
  allow-list drops the key on first save). An upgrading install's next file open is outlined,
  which is deliberate — see docs/research/24, "The mode's shape".
- **The toggle acts on the active tab only.** Switching a tab back to stock editing changes
  that tab and nothing else: other tabs keep their state, and every newly opened note still
  follows the default. Two tabs on the same file can differ, exactly as two panes already can
  hold different zoom scopes.
- **A tab's manual state is ephemeral.** It dies with the tab's editor state: closing the tab or
  switching it to another note resets the tab to the default. A reading-view round-trip does not
  — measured, Obsidian keeps one editor per leaf and rebuilds its state only on a file switch
  (docs/research/24, "Measured"), so a pane the user flipped to reading view and back comes back
  as they left it. Nothing is persisted per file or per tab — the same shape zoom's scope already
  has.
- **Changing the setting touches future opens only.** Like the built-in "default view mode for
  new tabs" setting it mirrors, it does not retoggle already-open tabs.
- **The toggle works from any view mode.** The command switches from `editorCheckCallback` to a
  `checkCallback` over the active `MarkdownView`, so the palette offers it in reading view and
  in both editing modes. No default hotkey — there is no dominant convention to inherit, so the
  no-default-hotkeys guideline is followed (docs/research/24, table).
- **Toggling from reading view enters outlined editing.** Reading view renders no outline
  (doc 20, the two renderers), so the ON direction switches the pane to an editing mode via the
  public `View.setState` route — the editing mode the view was last in, which the view's own
  state round-trips verbatim (measured; a pane with no editing history reports Live Preview
  itself, so nothing has to default it). The OFF direction is a no-op: nothing is
  outlined in reading view, and switching a pane the user did not ask to leave would be a
  second unrequested change.
- **A visible indication in the main UI:** a plugin status bar item (desktop-only, public API)
  and a ribbon icon (both platforms), each stating the ACTIVE tab's state — updating as tabs
  switch — and toggling that tab on click. What the status bar chip renders is itself a setting
  (an icon, the state in words, or nothing), because Obsidian can hide a ribbon icon from its own
  menu and offers no equivalent for a plugin's status bar item. No toggle notice: with both
  indicators stating the mode continuously and the document changing visibly under it, a toast
  is a third report of the same fact delivered by interruption. The core chrome
  surfaces — the edit/source/reading switcher and the core status-bar pencil — are not publicly
  extensible and are left alone.

## Capabilities

### New Capabilities

None — the mode already has a capability; this change reshapes it.

### Modified Capabilities

- `outline-mode`: the per-note toggle becomes a per-tab state with a global default, surfaces
  (command from any view mode, settings, status bar, ribbon), ephemerality semantics, and the
  reading-view entry behavior. The per-file persistence requirement is REMOVED; the gating
  requirement is restated per view.
- `e2e-verification`: the outline-mode e2e requirement's scenarios encode the per-file
  lifecycle (rename follows, delete prunes, per-note command gating); they are restated for the
  per-tab model and extended with the new surfaces (indicator, reading-mode toggle,
  default-on, ephemerality).
- `outline-zoom`: exit trigger 3 says the mode is "switched off for the file", and its two
  scenarios say the same. With a per-tab mode that is no longer a thing that happens, so the
  trigger is restated for the view holding the zoom and a scenario is added for the view that
  was not toggled. Only the wording of one trigger moves; the scope model it appeals to is
  unchanged, and was already per view.

## Impact

- `src/plugin/mode-registry.ts`: `OutlineModeRegistry` and the `outlinePaths` field retire;
  `PluginData` gains the `outlineByDefault` boolean (default `true`), validated by the existing
  `normalizePluginData` allow-list.
- **The gating seam moves.** Every extension that today asks `isOutline(path)` — grammar,
  decorations, transaction filter, backlinks footer, zoom gates, structural and zoom commands —
  reads a per-view CM6 state field instead, initialized from the setting at editor
  construction. This is the change's largest code movement, and it pays for itself: a mode
  toggle becomes a real CM6 transaction dispatched through the view registry zoom already built,
  so the cursor-nudge sweep and the per-leaf `forceRedraw` pass that existed because mode lived
  outside CM6 state are no longer needed for mode changes.
- `src/plugin/main.ts`: the toggle command becomes a `checkCallback` dispatching through the
  view registry; the reading-view switch lands beside it; status bar item and ribbon icon
  register in `onload` with `active-leaf-change`/`file-open` listeners to track the active tab;
  the rename/delete `registry` handlers go.
- Zoom's exit trigger 3 ("outline mode is switched off", `outline-zoom`) narrows to the view
  whose mode turned off — clearing that pane's zoom — which is the per-view shape that spec's
  own scope model already has. Its per-file WORDING does have to change, though, because a
  per-tab mode is never switched off for a file; that is the `outline-zoom` delta above.
- `e2e/specs/10-outline-mode.e2e.ts` is rewritten for the per-tab lifecycle;
  `e2e/helpers.ts` writes the new key; a new spec covers the indicator surfaces, tab-switch
  updates, two-tab independence, and the reading-mode toggle, under both desktop and mobile
  emulation (no status bar on mobile).
- `tests/plugin.test.ts`: registry lifecycle tests are replaced by the per-view state and
  default-normalization equivalents.

## Non-goals

- **Per-file persistence of a tab's manual off state.** Reopening a note starts from the
  default every time; if real use demands remembered opt-outs, that is an explicit-off list
  with its own rename/delete hygiene, recorded in docs/research/24 with the shape it would take.
- **Strictly tab-scoped state across file switches.** A manual off that survives the tab
  switching notes needs leaf-keyed state outside the editor; the editor-rebuild reset is
  accepted instead (design D4).
- **A global off switch.** The setting is the only global control and it touches future opens
  only; there is no "turn everything off now" command.
- **Outline rendering in reading view.** The reading-view entry behavior exists because
  reading view is untouched by construction (doc 20, Surface 3); making it render the outline is
  the parking-lot entry in doc 12, unchanged.
- **Extending core chrome.** The mode switcher and the core status-bar pencil stay untouched —
  no public API, and CSS-hacking core DOM is barred (docs/research/24).
- **A default hotkey for the toggle.** Palette, context menu, status bar, ribbon, and a
  user-assigned binding remain the entry points.
