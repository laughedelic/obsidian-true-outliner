## Context

See proposal.md — Why. What shapes the approach here is the layer's existing discipline, all of
it load-bearing:

- Every column on both surfaces derives from one declaration, `--to-decor-unit` on `body`, and
  nothing anywhere holds a second copy of its value
  ([22-outline-unit-width.md](../../../docs/research/22-outline-unit-width.md)). `UNIT_EXPR` is
  the only way JS may refer to it, and `e2e/specs/58-unit-override.e2e.ts` holds the guarantee
  that overriding that declaration retargets every layer.
- Guides are a comma-joined list of gradient layers built in JS and consumed by one `::after`
  ([09-experiment-2-guide-lines.md](../../../docs/research/09-experiment-2-guide-lines.md)).
  Which depths a line draws is therefore a JS decision, not a CSS one.
- Caret accents ride in the same background list, and `accentsOn`/`hasOverlay` already enforce
  that an accent only exists where a guide does.
- A settings change is applied by `forceRedraw` (`main.ts`), which toggles outline mode off and
  on in the **active** view. It exists because `app.workspace.updateOptions()` demonstrably
  fails the byte-identical-decoration case, and it reaches one view.

## Goals / Non-Goals

**Goals:**

- Presets that cannot put a column somewhere the grid does not survive.
- Settings that compose with the snippet route rather than displacing it: an explicit stylesheet
  override must keep beating the plugin's own choice, so `58-unit-override.e2e.ts` and the
  requirement behind it stay true unchanged.
- Appearance changes that reach every open pane and the footer without a decoration rebuild.

**Non-Goals:**

- Reworking `forceRedraw`. The visibility modes still need it; its active-view-only reach is a
  pre-existing limitation shared by every setting the plugin has, and replacing it is a deferred
  item of its own in `docs/research/12-decoration-follow-ups.md`.
- A settings-driven way to reach anything the chrome vocabulary does not already publish.

## Decisions

### D1 — A setting publishes its own property; the declaration consumes it as a default

The plugin writes its resolved choices as custom properties on `document.body`
(`--to-set-unit`, `--to-set-guide-width`, `--to-set-guide-intensity`), and `styles.css` spells
each token as `var(--to-set-…, <default>)`. The plugin writes a property only while the reader
has chosen something; the default state removes it.

Precedence is the reason. Writing `--to-decor-unit` itself as an inline style on `body` would win
against every stylesheet rule at any specificity, silently demoting the snippet route to
"whatever the plugin is not currently setting" — and the snippet route is a stated requirement,
not a convenience. Publishing a *different* property leaves the single `--to-decor-unit`
declaration exactly where it is, so a snippet at `body` still wins on source order and
`58-unit-override.e2e.ts` measures the same thing it measures today.

*Alternatives considered.* A plugin-owned `<style>` element: same effect as the stylesheet rule,
but its position in the cascade depends on when it is appended relative to Obsidian's snippet
sheets, which is not ours to guarantee. Rewriting the declaration's value in place: the same
inline-style problem one level down.

### D2 — The device-class default is CSS, not a platform check in JS

`styles.css` carries the ladder's default under the class Obsidian already puts on `body`:

```
body           { --to-unit-default: <desktop>; --to-decor-unit: var(--to-set-unit, var(--to-unit-default)); }
body.is-mobile { --to-unit-default: <mobile>; }
```

Only the *default* moves per device class; `--to-decor-unit` itself is still declared exactly
once, at `body`, so a snippet overriding it keeps winning on both device classes. Redeclaring
`--to-decor-unit` under `body.is-mobile` instead would raise the winning specificity above a
snippet's `body` rule and quietly break the escape hatch on phones — the one place a reader is
most likely to want it.

Keying off the DOM rather than `Platform.isMobile` also means the value follows
`app.emulateMobile()` live, which is exactly what the mobile e2e configuration runs
(`e2e/wdio.mobile-emulation.conf.mts`), so the branch is testable rather than mocked.

`is-mobile` covers phones and tablets alike. A tablet has the room a phone does not, so keying
`is-phone` instead is defensible; we take the coarser class because it matches the setting's own
vocabulary and a tablet reader who wants the wider step can pick it explicitly. Whether Obsidian
sets these classes where we assume it does is a measurement, not an assumption — see tasks.

### D3 — The ladder is an enum of measured steps, not a number the reader types

A stored length cannot be validated: `data.json` is a file a reader can edit and an older build
can have written (`normalizePluginData`'s own reasoning), and a length below the floor —
`unit > gutter + widest ink-left`, measured in
[22-outline-unit-width.md](../../../docs/research/22-outline-unit-width.md) — puts a child's mark
left of its parent's text, which is the one way this grid actually breaks. An enum makes an
unknown value fall back to the default like every other setting here, and makes the floor a
property of the ladder rather than of a validator.

The candidate rungs are the ones already rendered and read side by side in that note; the bottom
rung and the mobile default are decided by re-measuring the floor on **both** device classes
first, because the gutter's checkbox term is larger on mobile
([21-marker-text-gap.md](../../../docs/research/21-marker-text-gap.md)) and the floor moves with
it. The specs state the invariant; the numbers land in the research note and then in the code.

### D4 — The guide's own width becomes a declaration, and the accent follows it

`GUIDE_WIDTH` (`chrome-line.ts`) is the last geometry constant in the chrome vocabulary held as a
JS literal. It becomes `--to-guide-width`, declared once alongside the other tokens and referred
to by `var()` with no fallback and no numeric sibling — the rule the unit already carries, and
for the same reason a number cannot follow an override.

Two rules move with it. `--to-trail-width` defaults to `var(--to-guide-width)` rather than to a
literal `1px`, which preserves what styles.css already states about it: an accent is a change of
colour, not of weight, so a thickened guide must not become thinner when the caret enters it. And
`--to-stripe-bleed` — sized "from the widest stripe this overlay can carry" so a stripe centred on
column 0 is not clipped by its own box — becomes the max of both widths instead of
`max(1px, …)`, or a thickened root guide loses its left half.

### D5 — Visibility is decided where the layers are built

Which depths a line draws is a fact-level decision in the render path, not a CSS one: the layers
are a JS-built string, and a depth that is not drawn must also take no accent. That second half
is free — `accentsOn` already clips accents to the depths a line carries, and `hasOverlay` already
drops the whole overlay when there are none — so "guides off" turns off guide accents with it,
while marker accents are untouched. That is the intended reading: an accent is a treatment of a
guide, and there is nothing to treat.

The filter is applied in `activeGuideDepths`, not inside `computeLineGuides`. The walk stays pure
and caret-free so it remains cacheable per document; the caret-dependent part lives beside the
trail, which is already recomputed per state.

### D6 — Cursor-scoped visibility needs the caret chain, not the accent trail's suppressions

`computeTrail` returns an empty trail in two cases: both highlight settings off, and every
non-empty range being an escalated cover. Both are statements about *accents* — the first
because nothing would be drawn, the second because block-selection chrome already answers "where
am I".

Neither may govern visibility. If they did, turning highlights off or selecting a block would
make every guide on the page vanish. So the ancestor chain the cursor-scoped mode needs is
computed under its own condition, and the two suppressions stay attached to the accents they were
written for. This is a widened predicate, so it gets re-measured rather than reasoned about: the
accent behaviour under an escalated cover and under `off` must be identical before and after.

### D7 — The outermost guide is dropped only when the document has exactly one root

The qualifier is a document-level fact — the tree has a single root node — computed once per
document walk and carried alongside the per-line facts. When it holds and the setting is on,
depth 0 is dropped from every line's guide depths. Nothing else changes: indentation is
untouched, so no character moves, and a note that gains a second top-level node simply starts
drawing the guide again (guides are paint, not layout).

A zoomed view satisfies the qualifier by construction — `outline-zoom` re-bases the scope so the
zoom root renders at depth 0 — which is the behaviour we want there anyway: while zoomed into a
node, its own guide down the entire view says nothing.

The cascade is deliberately not taken. A single root with a single child repeats the shape one
level down, and dropping guides recursively would make the visible ladder depend on content
several levels away; the deeper case goes to the parking lot.

### D8 — Appearance applies without a redraw; visibility does not

An appearance change (unit, thickness, intensity) is a property write on `body`. Every rule and
every JS-built expression that consumes it is a `var()`, so the whole grid on every open pane and
the footer moves on the next style recalculation, with no decoration rebuild and no
`forceRedraw`. This is strictly better than what the existing settings get, and it is the
payoff for D1 and D4 keeping every value in CSS.

A visibility change alters the layer list, which is built in JS, so it takes the existing
`forceRedraw` plus `repaintFooters` — the same path `markerVisibility` and the highlight settings
already use.

### D9 — What both surfaces share, and what they cannot

The unit and both appearance axes are chrome vocabulary declared at `body`, which the backlinks
footer already reads through the same `chrome-line.ts` helpers — so they are consistent across
the editor and the footer by construction, not by a second implementation.

The two visibility qualifiers are not portable, and pretending otherwise would be a different
rule wearing the same name. The footer quotes fragments of other notes: it has no caret, so
"the levels the cursor is inside" has no referent, and every row's lineage starts at depth 0 by
construction, so "the document's single root" is not a fact about it. The footer keeps its own
guide toggle and additionally draws nothing while the layer is off — a master switch is a
statement about the layer, and a reader who turned guides off does not expect them in the footer.

### D10 — Four dropdowns and one toggle, in both settings surfaces

The tab renders from `getSettingDefinitions()` (Obsidian 1.13+) with `display()` kept as the
documented pre-1.13 fallback, and the two are kept in sync by hand. Every new control goes in
both, and the plugin's own accessor pair (`getControlValue`/`setControlValue`) grows with them —
that hand-sync is a known cost of the existing shape, not something this change invents.

## Risks / Trade-offs

- **A narrower rung violates the floor on a device class we did not measure** → the floor is
  re-measured on desktop and under mobile emulation, with a task-list fixture (the checkbox is the
  gutter's widest term), before the ladder's numbers are fixed. Bounded below is the only
  direction that breaks.
- **Cursor-scoped visibility rebuilds guide backgrounds on every caret move** → the trail already
  recomputes per state and the guide walk is cached per document; what is new is that more lines
  change their `--to-guides` value per move. Measured on the same large-document fixtures the
  existing decoration cost work uses, and the mode is not the default.
- **A thick guide reads as a bar rather than a line** → the top rung is chosen by looking at it,
  and the gradient's period is the unit, so thickness is bounded well under a level's width.
- **Lifting native-guide suppression while the layer is off flips a second thing** → suppression
  is lifted only in the master `off` mode, never per line, so Obsidian's own setting governs
  exactly when we draw nothing and nothing flickers as the caret moves.
- **Six more controls on a tab that already has eleven** → they are the axes asked for, and the
  hue and per-level knobs stay with the snippet route, which is what keeps this from becoming a
  mirror of the stylesheet.

## Open Questions

- Whether the ladder gets a rung above `2rem`. Nothing wider has been rendered and read; the
  measurement pass either endorses one or the ladder stops there. Neither answer changes a
  requirement, a surface, or the task breakdown.
