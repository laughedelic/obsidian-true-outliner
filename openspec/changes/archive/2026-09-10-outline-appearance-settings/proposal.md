## Why

Two things a reader looks at on every line — how far one level steps, and how the guides that
draw the ladder look — are today either fixed or reachable only from a CSS snippet.

The unit's adjustability is real and deliberate: `outline-unit-width` made overriding
`--to-decor-unit` a stated requirement and put `e2e/specs/58-unit-override.e2e.ts` behind it, so
one declaration retargets every column on both surfaces
([outline-unit-width.md](../../../../docs/research/outline-unit-width.md)). That change
listed a setting as an explicit non-goal — "the CSS route already serves the reader who cares".
It serves a reader willing to write a snippet. It does not serve a phone, where the same step
that reads as a clear ladder on a desktop spends a much larger share of a 390px viewport on
chrome, and where the reader most wants the space back.

The guides have the same shape. Their colour and weight resolve from theme variables
(`--to-guide-color`, `--to-trail-width`) precisely so a snippet can retune them without a plugin
setting, and `docs/research/decoration-follow-ups.md` records the rest as a design idea that
was never started: every layer optional except indentation, and the unit configurable. This
change takes that entry.

There is one asymmetry worth naming. Guides are drawn for **every** ancestor now
(`lists-on-the-outline-grid`), which is what makes a deep list legible and also what makes a
long note's leftmost column busy — and in the common shape where a whole note hangs off one
`# Title`, that outermost guide runs down every line of the note while distinguishing nothing.

## What Changes

- **The outline unit becomes a small preset ladder**, defaulting to a narrower step on mobile.
  One setting, not two: its default state resolves per device class, so a phone gets the tighter
  ladder with no configuration and no second value to keep in sync across a synced vault. The
  candidate steps are the ones already rendered and read side by side in
  [outline-unit-width.md](../../../../docs/research/outline-unit-width.md); its measured floor
  (`unit > gutter + widest ink-left`) is what bounds the ladder from below, and the mobile floor
  is higher than the desktop one because the gutter's checkbox term is
  ([marker-text-gap.md](../../../../docs/research/marker-text-gap.md)).

- **Guide appearance gets one axis, and one prerequisite.** Intensity becomes a preset over the
  theme's own faint text, defaulting to the quietest rung that still traces. Weight does not: the
  two answer the same question — how much of the page a guide takes — and only intensity answers
  it without thickening a line whose role is to stay a background relationship. It still becomes
  a declaration, because the guide's own width is a JS literal today (`GUIDE_WIDTH` in
  `chrome-line.ts`), the one geometry constant in the chrome vocabulary that is not a published
  property; a snippet retunes it, the accent trail follows it, and a later use for weight —
  marking the guide under the pointer — has it waiting.

- **Guide visibility gets a mode and a qualifier.** The mode chooses between every level, two
  scoped to the caret — the levels it is inside, and the levels inside the node it is in — and
  none at all. The two caret-scoped states partition a row's guides where they meet: the route
  down to the caret's node, and the ladder inside it. The
  qualifier drops the outermost guide when the whole document hangs off a single root — the
  `# Title` shape above, and every zoomed view by construction (`outline-zoom` re-bases the zoom
  root to depth 0).

- **Obsidian's own indent guides stay hidden in outline mode**, whatever this layer draws. They
  are positioned by native list nesting, and outline mode does not use those columns, so a native
  guide lands beside the grid rather than on it — drawing none of ours is a reason to show
  nothing, not a reason to show one that does not line up.

- **Settings drive the same declarations a snippet would.** Each preset resolves to a value the
  plugin publishes as its own custom property, which the existing declaration consumes as its
  default. A snippet overriding `--to-decor-unit` therefore keeps winning over both the default
  and the setting, and `58-unit-override.e2e.ts`'s contract is untouched. Appearance settings
  need no decoration rebuild at all — they land on every open pane and on the footer at once,
  where `forceRedraw` reaches only the active view.

- **Both surfaces move together, where the question means the same thing on both.** The unit and
  the appearance axes are chrome vocabulary declared at `body`, which the backlinks footer
  already reads; visibility modes that ask about a document root or a caret have neither in a
  footer that quotes fragments of other notes, so the footer keeps its own guide toggle and
  follows the master off.

## Non-goals

- **A colour picker, or a second colour axis.** Intensity is a percentage over the theme's own
  faint text, so it stays correct in light and dark; hue stays a snippet's job. This keeps the
  settings axis "small and opinionated" rather than a mirror of every CSS knob
  (`docs/research/decoration-follow-ups.md`).
- **A thickness setting.** Offered, measured, withdrawn — see the What Changes entry above. The
  declaration stays for snippets and for a later weight-based affordance.
- **Documenting the snippet route for readers.** Every token this change touches is overridable
  from a CSS snippet, and the specs require it to stay that way, but telling readers so — a
  documented list of the properties and what each one moves — is its own piece of work and is
  parked in `docs/research/decoration-follow-ups.md`.
- **Two stored values for desktop and mobile.** One setting whose default resolves per device
  class, per the shape chosen when this change was scoped. A reader who sets an explicit step
  gets it on both.
- **The marker layer.** Marker size, style, per-kind icons and the gutter are a separate entry in
  the same parking lot, and the gutter is derived rather than chosen
  ([marker-text-gap.md](../../../../docs/research/marker-text-gap.md)) — this change must leave
  a mark's distance from its own text exactly where that derivation put it.
- **Turning indentation itself off.** Indentation is the one layer that is not optional; the unit
  bounds are what keep it usable, not a switch.
- **Cascading the outermost-guide rule deeper.** A root with a single child repeats the shape one
  level down; the qualifier stops at the outermost guide and the deeper case goes to the parking
  lot rather than into a second setting.
- **Per-level or per-kind units.** The single-unit rule is what makes every layer agree.

## Capabilities

### Modified Capabilities

- `outline-decorations`: the single-declaration unit rule gains a settings-driven default that
  resolves per device class without displacing a snippet's override; the guide-rendering
  requirement gains visibility modes (every level / cursor's levels / none) and the
  single-root qualifier; and the chrome vocabulary's "declared once, never restated" rule
  extends to the guide's own width, which a stylesheet retunes and no setting touches.
- `hierarchy-position-indicators`: accents are a treatment of guides that exist, so a guide the
  visibility mode does not draw takes no accent — and the caret chain the cursor-scoped mode
  needs must be computed even where accents are suppressed.
- `backlinks-footer`: the footer draws the outline's chrome at whatever unit, weight and
  intensity are in force, and draws no guides while the layer is off.

## Impact

- **Modified**: `styles.css` (the chrome-token declarations gain settings-fed defaults and a
  device-class default for the unit); `src/plugin/chrome-line.ts` (`GUIDE_WIDTH` becomes a
  property reference); `src/plugin/chrome-tokens.ts` (the preset-to-declaration maps and the
  settings' own property names, no numeric siblings); `src/plugin/decorate.ts` (the pure filter,
  the caret's per-line ancestor depths and the single-root predicate — the guide walk itself
  stays settings- and caret-free so its per-document cache still holds);
  `src/plugin/decorations.ts` (one funnel that applies the filter, the single-root fact carried
  with the doc facts, and a caret chain read outside the accent trail's own gates);
  `src/plugin/mode-registry.ts` and `src/plugin/main.ts` (four settings — the unit, guide
  visibility, the single-root qualifier and intensity — their validation, and the property
  publication on `body`); `src/plugin/backlinks-footer.ts` (the master off).
- **Added**: `src/plugin/appearance.ts` — what the settings publish to the document, and what
  unload takes back.
- **Tests**: `59-appearance-settings.e2e.ts` (new) holds the publication mechanism: a default
  publishing nothing, a preset naming a declaration rather than a length, a snippet still
  winning over both, a second pane and a pop-out window following, and unload clearing.
  `58-unit-override.e2e.ts` measures each rung's geometry on both surfaces, the device-class
  default under mobile emulation, and the narrowest rung's clearance over the grid's floor.
  `51-guides-gradient.e2e.ts` covers the visibility modes, the single-root qualifier and the
  guide-width declaration; `55-position-indicators.e2e.ts` covers the accent gates;
  `79-footer-appearance.e2e.ts` covers the footer. `tests/decorate.test.ts` unit-tests the pure
  filter, the caret depths and the single-root predicate; `tests/plugin.test.ts` covers the four
  settings' validation.
- **Risk**: bounded by the floor. A narrower unit is the one direction that can break a column —
  a child's mark must still begin right of its parent's text — which is why the ladder's lowest
  rung is measured on both device classes before it ships rather than reasoned about.
