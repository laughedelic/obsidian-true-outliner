# 24 — Outline mode as an explicit state: surfaces and API feasibility

Researched 2026-09-08 for the `per-tab-outline-mode` change (created as `global-outline-mode`,
renamed when the model was revised the same day — see below). The request: make outliner mode an
explicit, persistent, visible state — switchable from any view mode, on by default, and indicated
in the main UI. This note records what was measured about the public API surface, the decision
about the mode's shape, and what was rejected, so the diagnosis is not paid for twice.

## What exists today (measured)

- The toggle is an `editorCheckCallback` command (`src/plugin/main.ts`, "toggle-outline-mode") and
  an editor context-menu entry (`src/plugin/main.ts`, the `editor-menu` handler). Both entry
  points exist only where an editor exists: in reading view neither is reachable, which is where
  the confusion comes from — a note that opens in reading view (the core default view mode can be
  exactly that) shows no way in and no way to see the current mode.
- The mode is a per-file path set (`OutlineModeRegistry`, `src/plugin/mode-registry.ts`), persisted
  in `data.json`, migrated on rename, pruned on delete.
- The only feedback is the transient toggle Notice and the decorations themselves.
- Decorations render through CM6 editor extensions exclusively; reading view is untouched by
  construction (doc 20, "The two renderers").

## The public-API surface for an explicit state

Verified against the pinned `obsidian.d.ts` (1.13.1) and the current official API docs.

| Surface | Verdict |
| --- | --- |
| Plugin status bar item (`addStatusBarItem`) | Public. **Desktop-only** — the API docs state "Not available on mobile". |
| Ribbon icon (`addRibbonIcon`) | Public, both platforms. The returned `HTMLElement` can carry classes at runtime, so it can reflect a toggle state. |
| Adding to a pane's view header (the edit/source/reading switcher) | **No public API.** Nothing in `obsidian.d.ts` adds an action to an existing `MarkdownView`'s header. |
| Extending the core status-bar pencil (core setting "Show editing mode in status bar") | **No public API.** The button exists (it offers Reading / Live Preview / Source), but plugins cannot hook its click, add options to its menu, or place their item relative to it. Plugin status bar items are appended as separate entries. |
| `workspace.on('file-open')` | Public and documented; fires with the opened `TFile` or `null`, including embeds. |
| Switching a view's mode from a command | Public: `View.setState` / `View.getState`. The markdown state encodes `mode: 'source' | 'preview'` plus a `source` boolean (`false` = Live Preview, `true` = source editor). Not yet measured: what `getState()` carries for `source` while the view is in `preview`, and what `setState({ mode: 'source' })` alone defaults to. |
| A default hotkey for the toggle | Possible (`hotkeys` in `addCommand` is public and not deprecated; the project already ships defaults for move up/down with a documented rationale). Decided: none — there is no dominant convention to inherit, so the guideline's recommendation is followed. |

CSS restyling of core chrome (the switcher, the pencil) from `styles.css` is technically possible
— the stylesheets can target non-public DOM — and is rejected under the same bar that forbids
`(editor as any).cm` (`plugin-shell`, no private API): the one presentational exception this
project carries (suppressing the core in-document backlinks section) is spec'd, reversible, and
confined to notes we decorate; tinting core buttons is fragile against Obsidian's own DOM churn
and signals nothing a plugin-owned status bar item cannot.

## The mode's shape: a per-tab state with a global default

**First decision, revised the same day.** The change was first planned around one global
plugin setting, on by default — the mode as a single app-level switch. A scenario check
against the author caught the difference before any code was written: a user switching a given
tab back to stock editing expects that switch to be *local and ephemeral* — that tab stays
stock until it is closed, other tabs keep their states, and every newly opened note still
follows the default. A global toggle fails exactly that: flipping it off in one tab changes
the whole vault, including future opens.

The revised shape: **a per-tab outline state, initialized from one persisted default** ("open
new tabs in outline mode", on by default). The per-file path store is retired, not repurposed
— no per-file question remains for it to answer, and `normalizePluginData`'s allow-list
construction already drops unknown keys on the first save, so an upgrading vault's
`outlinePaths` disappears without a migration step.

Consequences worth naming:

- **The per-tab state is ephemeral by mechanism.** It lives in the editor state (the same shape
  `outline-zoom` gives its scope: per view, never persisted), so it dies when the tab closes and
  when the tab switches notes — Obsidian rebuilds the editor state in both cases, and the fresh
  one initializes from the default. A reading-view round-trip does NOT, which this section
  originally assumed it would; the editor survives it. See "Measured" below, which is where that
  came from and which supersedes the assumption. "Until it's closed" is only approximately
  achievable either way; strictly tab-scoped persistence needs leaf-keyed state outside the
  editor and was rejected.
- **No per-file memory at all.** A note reopened later starts from the default every time; a
  remembered opt-out would be an explicit-off list with its own rename/delete hygiene — the
  next number in this series if real use demands it.
- **Changing the setting touches future opens only**, mirroring the built-in "default view
  mode for new tabs" setting it was modeled on; already-open tabs are not retoggled.
- **Two tabs on one file can differ**, exactly as two panes already hold different zoom
  scopes.
- **Upgrade flips behavior.** An existing install's next file open after the update outlines
  every newly opened note (the default is on; Obsidian updates do not rewrite settings a user
  has modified, but this key is new, so the default applies). Deliberate: the mode is the
  product; hiding it behind an opt-in repeats the discoverability defect this change exists to
  remove.
- The zoom-exit trigger "outline mode is switched off" (`outline-zoom`, exit trigger 3)
  narrows to the view whose mode turned off — clearing that pane's zoom — which matches the
  per-view shape that spec's own scope model already has.

## What was rejected, and why:

- **Extending the mode switcher or the core status-bar pencil** — no public API (table above).
- **One global toggle for the whole vault** — the first decision, revised: it makes one tab's
  escape hatch flip every other tab and every future open, which the deciding scenario
  rejects. Kept here because its simplicity is genuinely tempting and the scenario is what
  dissolved it.
- **A per-file default-plus-exceptions model** (global default, per-file explicit on/off) — needs
  an explicit-off store with tri-state semantics ("toggle off a file while the default is on"
  must persist off, or the file re-adopts on next open), rename/delete pruning for the new store,
  and an indicator that answers "why is this note outlined" with "default or explicit?". None of
  that complexity maps to a recorded need; the actual request is "the outliner stays on", and the
  per-tab model answers it without any per-file store at all.
- **Adoption-on-open** (each newly opened file written into the per-file store as if toggled) —
  writes every file ever opened into `data.json` forever, and turning the default off later
  cannot restore any per-file state because none was ever recorded.

## Open questions carried into the change's design

1. ~~What `MarkdownView.getState()` returns for the `source` flag while the view is in reading
   mode, and what `setState({ mode: 'source' })` does without one.~~ Measured below: the flag
   round-trips, and nothing has to synthesize one.
2. Where a plugin status bar item lands relative to the core pencil (when the core setting is
   on) — layout is not controllable, so this is a look-and-feel check, not a design input.
3. ~~The ribbon icon's on/off appearance.~~ Settled below.
4. ~~Which public events fire when a leaf switches view mode IN PLACE (reading ↔ editing).~~
   Measured below: none do.

## Measured: view state, editor lifetime and mode-switch events

Answers open questions 1 and 4, and one thing neither of them asked. Measured against Obsidian
1.13.7 through the e2e harness, driving a real workspace rather than reasoning about the API.

**Question 1 — the reading-view state encoding. Round-trippable, and more forgiving than
assumed.** In reading view `getState()` returns `{ file, mode: 'preview', source }` with the
`source` flag the view was last editing under, preserved verbatim. Spreading that state and
overriding `mode` lands the pane back in its own editing mode, both ways round. Omitting
`source` entirely — `setState({ mode: 'source' })` on its own — also preserves it, so the flag
survives whether or not the caller carries it. A leaf opened straight into reading view with no
editing history reports `source: false`, synthesized by Obsidian: the state never lacks the
flag, so nothing has to default it.

**Question 4 — no public event fires on an in-leaf mode switch.** Flipping a leaf between
reading and editing in place fires none of `active-leaf-change`, `file-open` or
`layout-change`. Tab switches fire `active-leaf-change` + `file-open`, and opening a note fires
both plus `layout-change`, as documented. An indicator that tracks the active tab therefore
cannot learn about a mode switch from the workspace at all; the CM6 side has to report it.

**Unasked, and it decides the reset semantics: Obsidian keeps ONE `EditorView` per leaf and
rebuilds its `EditorState` only on a file switch.** Tracking object identity of the view and of
`EditorState`'s configuration across each transition:

| transition | `EditorView` | `EditorState` rebuilt |
| --- | --- | --- |
| an edit or cursor dispatch | same | no |
| editing → reading → editing, in place | same | **no** |
| the leaf switches to another note | same | **yes** |
| a new leaf | new | yes |

So a `StateField`'s `create` runs on a new tab and on a file switch, and does NOT run on a mode
round-trip: the state chain survives the pane going to reading view and back. A per-tab mode
held in a `StateField` therefore resets on a new tab, on a file switch and on tab close, and
SURVIVES a reading round-trip.


## The indicators, as built

**The status bar chip has three forms**, chosen by a setting: an icon (the default), the state
in words (`Outline on` / `Outline off`), or nothing. It exists because Obsidian lets a user hide
a ribbon icon from its own right-click menu and offers no equivalent for a plugin's status bar
item, so declining that chip has to be answerable somewhere.

In every form it distinguishes THREE states, not two: on, off, and no markdown tab active —
"no tab" is a different thing to say than "off", and an indicator that guessed would be stating
a mode nothing is in. In words mode it reserves the width the two labels differ by, so the
items beside it do not shift as the mode changes.

**The chip states OFF with a different glyph, not a tint.** `list-tree` for on — the ribbon's
own icon, so the two surfaces read as one control in two places — and `align-left` for off:
flat prose lines against branching ones, a contrast that survives being small and monochrome. A
tinted chip would compete for attention with everything else in that bar, which the ribbon's
accent does not have to do.

**There is no toggle notice.** One was carried at first, on the reasoning that a mode change
had to announce itself somewhere; once both indicators state the mode continuously and the
document visibly changes under it, a toast is a third report of the same fact delivered by
interruption. Removed after a manual pass said so.

**The ribbon's on-state** is a color change to the theme's own `--text-accent`, not a second
icon. The ribbon is a column of same-sized glyphs, so a swapped icon reads as a different
control while a tinted one reads as the same control in a different state; taking the accent
from the theme means it says "on" in whatever palette the user runs.

**`addStatusBarItem` on mobile — the docs are right, the emulator is not.** Measured under
Obsidian's own `emulateMobile()`, the call still returns a live element and the desktop shell's
status bar still renders it, so an ungated registration would ship an item onto a platform with
nowhere to put it. Gated on `Platform.isMobile`, which is the one-line fallback the design named.

**The ribbon on mobile is present but not clickable from a test, and that is the emulator.**
The mobile shell renders it inside `.side-dock-ribbon.mod-left.workspace-drawer-ribbon`.
Measured: `leftSplit.expand()` DOES open the drawer (`display: none` → `flex`), and the ribbon
column inside it stays `display: none` with a zero-sized box either way. The emulation run is
the desktop Electron app in a phone viewport, not the Capacitor app whose drawer actually
renders that row, so there is no visible mobile control for the harness to reach.

The e2e helper therefore checks for a box rather than branching on platform — a real click
wherever one is possible, a dispatched click only where it is not, so the coverage upgrades
itself the day a build renders the row. The dispatched click still exercises the handler the
requirement is about, and the mobile spec separately asserts the icon exists and carries its
state, so a surface that went missing fails rather than passing quietly.

**Left to a manual pass:** that a real mobile user can see the ribbon icon and press it. No run
in this harness covers it, for the reason above.
