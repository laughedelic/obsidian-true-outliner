## Context

See proposal.md — Why. The shape is decided there and grounded in docs/research/24: a per-tab
state initialized from one global default, surfaced wherever the user is. What the design has
to place is where the per-tab state lives, how the gating seam moves to it, how the
reading-view entry works on public API, and how the indicators track the active tab.

What already exists and carries over: a per-view state pattern with everything this change
needs — `zoom-state.ts`'s `StateField` + effects, its obsidian-free module discipline, and the
view registry (`view-registry.ts`) that routes palette commands to a live `EditorView` because
Obsidian's public API exposes no `EditorState` (`outline-zoom` design D5). Every editor
extension currently gates on `isOutline(path)` (`src/plugin/main.ts`) — that seam moves, and it
is the change's largest code movement. The settings tab renders declaratively with a pre-1.13
fallback that must be kept in sync (`debugCrossCheck`'s pattern). The per-file store being
retired is `OutlineModeRegistry` (`src/plugin/mode-registry.ts`).

## Goals / Non-Goals

**Goals:**

- One source of truth per view: a single boolean `StateField`, initialized from the default at
  `EditorState` construction, flipped by one effect.
- The default is one persisted setting; changing it touches future `EditorState` constructions
  and nothing else.
- A mode toggle is a real CM6 transaction — every consumer recomputes because the field moved,
  with no out-of-band repaint machinery.
- The indicators state the active tab's state and follow tab switches, on public APIs only.

**Non-Goals:**

- Per-file or per-tab persistence of a manual state, strictly tab-scoped state across file
  switches, a global off switch, outline rendering in reading view, extending core chrome, a
  default hotkey — proposal.md, Non-goals, and docs/research/24 for the reasons.
- Changing the zoom scope model (`outline-zoom`): its per-view shape is what the mode now
  matches; only the exit trigger's firing site moves.

## Decisions

### D1. One persisted boolean — the default; the registry retires entirely

`outlineByDefault: boolean`, default `true`, validated by the existing `normalizePluginData`
allow-list. `OutlineModeRegistry` is deleted, not kept as a wrapper: per-path membership and
the ordered write queue it existed for have no per-tab work to do, and `outlinePaths` is
dropped on the first save by the allow-list's own construction (the mechanism `mode-registry.ts`
documents as deliberate). The only writes left are setting changes, which ride the plugin's
existing `saveData` path.

### D2. The per-tab state is a CM6 `StateField` initialized at construction, flipped by an effect

A boolean field in the zoom-state shape (`src/plugin/outline-state.ts`, obsidian-free like
`zoom-state.ts`): `init` reads the default through the same injected handle the other
extensions take — at construction, which is exactly when a new editor should learn the default —
and one effect (`outlineToggled`-style) flips it. The command path dispatches the effect
through the existing view registry, which is the public-API route to an `EditorView` and the
reason that registry exists. Inside a nested per-cell editor the toggle still acts on the HOST
note's editor — the registry already resolves a cell to its host (`nested-editor.ts`), the same
route zoom's commands take.

*Alternative rejected:* keeping the state on the plugin instance keyed by view. It would need
its own lifecycle tracking (register/destroy, mode round-trips, file switches) to stay honest —
exactly the bookkeeping CM6 already does for a `StateField`, re-derived worse.

### D3. The gating seam moves: every extension reads the field; `isOutline(path)` retires

Grammar, decorations, transaction filter, backlinks footer, and the zoom gates read the field
from the state they already hold; the structural and zoom commands' availability checks read it
through the view registry (side-effect-free, as `checking` requires). One shared field-read
helper, not per-extension re-derivations — the same "one definition per shared helper" rule the
codebase already states for line positions. This is the change's largest code movement, named
in the proposal's Impact; it is also what buys D5.

### D4. Initialization and reset are `EditorState` construction, by construction

Measured rather than assumed (docs/research/24, "Measured"): Obsidian keeps ONE `EditorView`
per leaf and rebuilds its `EditorState` only when the leaf switches files. So the field's
`init` runs on a new tab and on a file switch, and the state survives an edit, a mode
round-trip, and everything else. That is the reset boundary, stated as behavior by the spec's
ephemerality scenarios: a manual state dies with the tab or with the note it was set on, and
survives the pane going to reading view and back.

The reading round-trip was originally specified as a reset too, on the assumption that it
rebuilt the editor. It does not, and the mechanism is the better behavior anyway — flipping to
reading view to check something and back is not a request to undo a manual off. Forcing a reset
there would need a signal Obsidian does not give: no public event fires on an in-leaf mode
switch (measured), so it would take a `MutationObserver` or a poll — exactly the out-of-band
machinery this design exists to remove.

Making a manual state survive FILE switches would need leaf-keyed state outside the editor —
rejected in the proposal's Non-goals, and the mechanism above is why it would be new machinery
rather than a flag.

### D5. The toggle is a real transaction — the mode-change sweep machinery dies

Dispatching the effect is a CM6 transaction, so every decoration and gate reading the field
recomputes because the field moved. The cursor nudge `refreshDecorations` performs existed
only because mode lived outside CM6 state (`main.ts`'s own comment on it); `forceRedraw`'s
off-on double flip exists for settings changes whose decoration output can be byte-identical —
it stays for those, and mode changes stop needing either. Turning a view OFF co-dispatches the
zoom-clear effect for that view in the same transaction (`outline-zoom` exit trigger 3's "clear
the stored anchor, not merely the gate" satisfied at one site); a settings change never touches
open views, so no zoom interaction exists there.

### D6. The reading-view entry is `View.setState`, then an explicit effect on the same view

On a toggle from a preview-mode pane, `view.setState({ ...state, mode: 'source' })`. Measured
(docs/research/24): the reading-view state carries the `source` flag the pane was last editing
under, spreading it round-trips the pane to its own editing mode both ways, and a pane with no
editing history reports `source: false` itself — so nothing has to synthesize or default it.

The pane keeps its editor across the switch (D4), so the field holds whatever it held and the
registry already has the view: the toggle dispatches the outline-on effect straight onto it,
with nothing to wait for. The dispatch is not redundant with the default — the field may be off
because the default is off, or because the user turned this tab off before flipping to reading
view, and the spec says an explicit ON from reading view wins either way. Only the active pane,
only the ON direction; OFF from reading is a no-op because nothing is outlined there.

Detecting "this pane is in reading view" is `view.getMode() === 'preview'`, not "the registry
has no view for it": measured, the leaf's `EditorView` stays registered and DOM-connected while
the pane shows reading view, so a registry miss would never fire and the effect would be
dispatched into an editor nobody is looking at.

### D7. The indicators track the active tab through public events

Status bar item and ribbon icon state the active tab's mode: the active view's own field,
which every markdown leaf has — measured, the leaf keeps its editor in reading view too (D4),
so there is no "the state it would get" case to synthesize. They update from the toggle
dispatch site (plugin-owned) and from `active-leaf-change` / `file-open` listeners, which
between them cover every transition that can change the answer.

An in-leaf mode switch fires no public event (measured), and needs none: the same measurement
says the field does not change across one, so the mode the indicators state is still the mode
the tab is in. The staleness this decision originally hedged against cannot arise — a stale
label would require a mode change with no event, and a mode change is either a dispatch through
the toggle path or a fresh `EditorState`, and both are covered.

`addStatusBarItem()` is gated on `Platform.isMobile`. It was to be registered unconditionally,
on the grounds that a platform with no status bar would simply have no item — measured under
Obsidian's own `emulateMobile()`, that is false: the call still returns a live element and the
desktop shell still renders it, so the gate the risk table held as a fallback is what ships. The
ribbon icon is `list-tree` — the menu entry's icon — with a class-reflecting on-state, and
carries the indication alone on mobile; both click into the same toggle path as the command.
Because that on-state is a colour, each indicator also carries `aria-pressed`, removed rather
than set when no markdown tab is active: neither value is true of a control stating no mode.
Wording and on-state treatment are one visual pass in the tasks, recorded in
docs/research/24, the way the decoration experiments settled theirs.

### D8. The settings toggle sets the default, and nothing else

Declarative `getSettingDefinitions()` toggle plus the pre-1.13 `display()` fallback, kept in
sync; the setter persists and does NOT sweep open tabs — the spec states "changing it SHALL
NOT retoggle already-open tabs", and per D4 there is nothing to sweep: future constructions
pick the new value up at `init`. Discoverable wording states the semantics — notes opened from
now on, in a new tab OR in an existing tab that switches notes, since both build a fresh editor
state — and names the other surfaces.

### D9. Upgrade is the allow-list doing its job; downgrade degrades to stock, not to breakage

No migration code: an upgrading install's `outlinePaths` is dropped on the first save, and the
new key's default (`true`) is the behavior flip the proposal owns. Downgrading finds no
`outlinePaths` — every note stock, the default setting lost but no data lost; stated here so
the rollback story is written rather than discovered.

## Risks / Trade-offs

- [Gating-seam breadth — every extension touched] → one shared field-read helper; each
  extension's existing unit and e2e coverage pins its behavior, and the stock-behavior e2e
  (off-mode keys) is re-baselined against per-view off rather than per-file off.
- [Indicator staleness on in-leaf mode switches] → measured away: no event fires, and none is
  needed, because the field does not change across one (D7).
- [Reading-mode `setState` behaves differently from its documented encoding] → measured by task
  1 before the entry was built: it round-trips, and the `source` default it might have needed
  turned out to be unreachable. The same measurement moved D4's reset boundary.
- [`addStatusBarItem` renders on mobile emulators despite the docs] → measured true, so the
  `Platform.isMobile` gate shipped rather than staying a fallback (D7).
- [Two tabs on one file can differ] → the model the scenario asked for, and the per-view shape
  zoom already ships; the indicators state the active tab, so the difference is never hidden.
- [The upgrade flip outlines every newly opened note] → deliberate and one settings toggle
  away; argued in docs/research/24 ("The mode's shape"), owned in the proposal.

## Migration Plan

One release: land the change, sync the delta specs and rewrite the `outline-mode` main spec's
Purpose (still says "per-note"; deltas cannot carry a Purpose change), bump the version
(`npm version minor`), squash-merge; CI releases when `manifest.json` moves. No data migration,
per D9. Rollback is reverting the merge; on the old build every note opens stock until the
setting is re-set there.

## Open Questions

None. Two were closed by task 1's measurement (docs/research/24): the reading-view state
encoding, and which public events fire on an in-leaf mode switch — none do, which is why D7's
indicators take their in-leaf signal from the CM6 side rather than from the workspace. The
remaining deferred ones — status-bar wording and the ribbon on-state treatment — are polish
decisions assigned to tasks with a real vault in front of them, per D7.
