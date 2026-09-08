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
  editor construction, flipped by one effect.
- The default is one persisted setting; changing it touches future editor constructions and
  nothing else.
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

### D4. Initialization and reset are editor construction, by construction

A new tab, a tab switching notes, and a reading↔edit round-trip all build a fresh editor, and
the field's `init` reads the default — so the default applies at exactly those points and
nowhere else, with no listeners, no sweeps, and nothing to drift. The spec's ephemerality
scenarios are this mechanism stated as behavior, not a separate feature to build. Making a
manual state survive file switches would need leaf-keyed state outside the editor — rejected
in the proposal's Non-goals, and the mechanism above is why it would be new machinery rather
than a flag.

### D5. The toggle is a real transaction — the mode-change sweep machinery dies

Dispatching the effect is a CM6 transaction, so every decoration and gate reading the field
recomputes because the field moved. The cursor nudge `refreshDecorations` performs existed
only because mode lived outside CM6 state (`main.ts`'s own comment on it); `forceRedraw`'s
off-on double flip exists for settings changes whose decoration output can be byte-identical —
it stays for those, and mode changes stop needing either. Turning a view OFF co-dispatches the
zoom-clear effect for that view in the same transaction (`outline-zoom` exit trigger 3's "clear
the stored anchor, not merely the gate" satisfied at one site); a settings change never touches
open views, so no zoom interaction exists there.

### D6. The reading-view entry is `View.setState`, then an explicit effect on the fresh editor

On a toggle from a preview-mode pane, `view.setState({ ...state, mode: 'source' })` with the
state's own `source` flag preserved (Live Preview vs source editor), defaulting `source: false`
when the state carries none — the encoding docs/research/24's open question 1 leaves
unmeasured, measured by the change's first task before this is built. The new editor then
initializes from the default, so when the default is off the toggle must reach it explicitly:
dispatch the outline-on effect once the editor mounts (the `setState` promise resolves before
the registry has registered — the dispatch waits on the registry, the same timing the view
registry's deferred `sync` already handles). Only the active pane, only the ON direction; OFF
from reading is a no-op because nothing is outlined there.

### D7. The indicators track the active tab through public events

Status bar item and ribbon icon state the active tab's mode — the active view's field when it
has an editor, the default when the pane is in reading view (the state that pane would get).
They update from the toggle dispatch site (plugin-owned) and from `active-leaf-change` /
`file-open` listeners. Which events fire when a leaf switches view MODE in place is not
documented; the surfaces task measures it in the dev vault and adds what is missing — the
worst case is a stale label until the next event, cosmetic, with the decorations as ground
truth. `addStatusBarItem()` is registered unconditionally (documented as unavailable on mobile,
asserted by the mobile e2e; a `Platform.isMobile` gate is the one-line fallback). The ribbon
icon is `list-tree` — the menu entry's icon — with a class-reflecting on-state; both click into
the same toggle path as the command. Wording and on-state treatment are one visual pass in the
tasks, recorded in docs/research/24, the way the decoration experiments settled theirs.

### D8. The settings toggle sets the default, and nothing else

Declarative `getSettingDefinitions()` toggle plus the pre-1.13 `display()` fallback, kept in
sync; the setter persists and does NOT sweep open tabs — the spec states "changing it SHALL
NOT retoggle already-open tabs", and per D4 there is nothing to sweep: future constructions
pick the new value up at `init`. Discoverable wording states the semantics ("new tabs only")
and names the other surfaces.

### D9. Upgrade is the allow-list doing its job; downgrade degrades to stock, not to breakage

No migration code: an upgrading install's `outlinePaths` is dropped on the first save, and the
new key's default (`true`) is the behavior flip the proposal owns. Downgrading finds no
`outlinePaths` — every note stock, the default setting lost but no data lost; stated here so
the rollback story is written rather than discovered.

## Risks / Trade-offs

- [Gating-seam breadth — every extension touched] → one shared field-read helper; each
  extension's existing unit and e2e coverage pins its behavior, and the stock-behavior e2e
  (off-mode keys) is re-baselined against per-view off rather than per-file off.
- [Indicator staleness on in-leaf mode switches] → measured in the surfaces task; worst case
  is a stale label until the next event, with the decorations as ground truth.
- [Reading-mode `setState` behaves differently from its documented encoding] → task 1 measures
  it before the entry is built; only the `source` default can change.
- [`addStatusBarItem` renders on mobile emulators despite the docs] → the mobile e2e asserts
  absence; the `Platform.isMobile` gate is the one-line fallback.
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

None that change the specs, the approach, or the task breakdown. The deliberately deferred
ones — status-bar wording, the ribbon on-state treatment, and which public events fire on an
in-leaf mode switch — are measurement or polish decisions assigned to tasks with a real vault
in front of them, per D7.
