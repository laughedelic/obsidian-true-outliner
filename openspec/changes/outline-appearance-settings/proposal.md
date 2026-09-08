## Why

Two things a reader looks at on every line — how far one level steps, and how the guides that
draw the ladder look — are today either fixed or reachable only from a CSS snippet.

The unit's adjustability is real and deliberate: `outline-unit-width` made overriding
`--to-decor-unit` a stated requirement and put `e2e/specs/58-unit-override.e2e.ts` behind it, so
one declaration retargets every column on both surfaces
([22-outline-unit-width.md](../../../docs/research/22-outline-unit-width.md)). That change
listed a setting as an explicit non-goal — "the CSS route already serves the reader who cares".
It serves a reader willing to write a snippet. It does not serve a phone, where the same step
that reads as a clear ladder on a desktop spends a much larger share of a 390px viewport on
chrome, and where the reader most wants the space back.

The guides have the same shape. Their colour and weight resolve from theme variables
(`--to-guide-color`, `--to-trail-width`) precisely so a snippet can retune them without a plugin
setting, and `docs/research/12-decoration-follow-ups.md` records the rest as a design idea that
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
  [22-outline-unit-width.md](../../../docs/research/22-outline-unit-width.md); its measured floor
  (`unit > gutter + widest ink-left`) is what bounds the ladder from below, and the mobile floor
  is higher than the desktop one because the gutter's checkbox term is
  ([21-marker-text-gap.md](../../../docs/research/21-marker-text-gap.md)).

- **Guide appearance gets two axes**: thickness and intensity, each a preset. Thickness has a
  prerequisite — the guide's own width is a JS literal today (`GUIDE_WIDTH` in `chrome-line.ts`),
  the one geometry constant in the chrome vocabulary that is not a published property. It becomes
  a declaration under the same rule the unit already carries: declared once, no second copy, and
  the accent trail's width follows it so that an accent stays a change of colour rather than of
  weight.

- **Guide visibility gets a mode and a qualifier.** The mode chooses between every level, only
  the levels the cursor is inside, and none at all. The qualifier drops the outermost guide when
  the whole document hangs off a single root — the `# Title` shape above, and every zoomed view
  by construction (`outline-zoom` re-bases the zoom root to depth 0).

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
  (`docs/research/12-decoration-follow-ups.md`).
- **Two stored values for desktop and mobile.** One setting whose default resolves per device
  class, per the shape chosen when this change was scoped. A reader who sets an explicit step
  gets it on both.
- **The marker layer.** Marker size, style, per-kind icons and the gutter are a separate entry in
  the same parking lot, and the gutter is derived rather than chosen
  ([21-marker-text-gap.md](../../../docs/research/21-marker-text-gap.md)) — this change must leave
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
  extends to the guide's own width, which a preset drives.
- `hierarchy-position-indicators`: accents are a treatment of guides that exist, so a guide the
  visibility mode does not draw takes no accent — and the caret chain the cursor-scoped mode
  needs must be computed even where accents are suppressed.
- `backlinks-footer`: the footer draws the outline's chrome at whatever unit, thickness and
  intensity are in force, and draws no guides while the layer is off.

## Impact

- **Modified**: `styles.css` (the chrome-token declarations gain settings-fed defaults and a
  device-class default for the unit); `src/plugin/chrome-line.ts` (`GUIDE_WIDTH` becomes a
  property reference); `src/plugin/chrome-tokens.ts` (one more name in `CHROME_VARS`, no numeric
  siblings); `src/plugin/decorate.ts` (`computeLineGuides` learns the visibility mode and the
  single-root qualifier); `src/plugin/decorations.ts` (the caret chain's gate widens for
  cursor-scoped visibility); `src/plugin/mode-registry.ts` and `src/plugin/main.ts` (five settings,
  their validation, and the property publication on `body`); `src/plugin/backlinks-footer.ts`
  (the master off).
- **Tests**: `58-unit-override.e2e.ts` grows the settings-vs-snippet precedence case;
  `51-guides-gradient.e2e.ts` grows the visibility modes; a mobile-emulation run covers the device
  default. Unit tests cover `computeLineGuides` under each mode and the qualifier.
- **Risk**: bounded by the floor. A narrower unit is the one direction that can break a column —
  a child's mark must still begin right of its parent's text — which is why the ladder's lowest
  rung is measured on both device classes before it ships rather than reasoned about.
