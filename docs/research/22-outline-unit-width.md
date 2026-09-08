# The outline unit: a wider default, and an override that is guaranteed

`--to-decor-unit` is one tree level's worth of horizontal distance — the only number any
layer may derive a column from ([08](08-experiment-1-additive-indentation.md)). It had been
`1.5rem` since Experiment 1, chosen the way the marker gutter was chosen before
[21](21-marker-text-gap.md) derived it: it worked.

Two things happen here. The default widens, and the property's adjustability stops being an
accident.

**Measured 2 September 2026**, Obsidian 1.13.7, both bundled themes, 16px root font, against
the gutter [21](21-marker-text-gap.md) derived (`0.875rem`).

## Why it wanted widening

Tightening the gutter changed how the unit reads. A mark and its text are now one row rather
than two things beside each other, and against that the step from one level to the next became
the loosest relationship left on screen — the rows tightened and the ladder did not.

## What was measured, and what was chosen

Four candidates, rendered across the fixture corpus in both themes and read as screenshots:

| Unit | Step | Reading |
| --- | ---: | --- |
| `1.5rem` | 24px | The previous default. Levels sit closer than the tightened rows do. |
| `1.625rem` | 26px | Barely distinguishable from the previous default. |
| **`1.75rem`** | **28px** | **Chosen.** A visibly clearer ladder, and a four-deep list still spends most of its width on text. |
| `2rem` | 32px | Legible, but a four-deep list starts spending real width on chrome. |

Nothing else moved. The gutter is derived from the marks it holds and is independent of the
unit; every candidate rendered every mark on its own column with its text the same distance
after it.

The floor is well clear. A child's mark must begin right of its parent's text, which is
`unit > gutter + widest ink-left` — about 22px at the derived gutter. The previous default sat
2px above that; the new one sits 6px above it. Widening only increases the margin.

That 22px is arithmetic from the widest mark the gutter is sized for. Measured per device class
later, the binding mark turns out to be a narrower one and the floor differs between desktop and
mobile — see "A preset ladder, and the floor on two device classes" below.

## The override, and why it needed a test rather than a fix

Overriding `--to-decor-unit` the way a snippet would already retargeted everything, before this
change touched anything. Measured on the current build at `2rem` and `1.75rem`, on both
surfaces: every depth's column, every marker, every row's text, the hanging indent, the
`.cm-hmd-list-indent` wrapper's width, the guide gradient's period, Obsidian's own
`--list-indent` bridge, and the footer's rows and group inset all followed.

That is a real property of the design — every column derives from one value, which is the
grid's own rule — and it was entirely incidental. Nothing asserted it, so the next change to
touch a column could have taken it away silently.

So the work was not to build the adjustment but to hold it:

- **The spec now states it.** One declaration, at a scope every surface inherits; no surface
  declares its own; no rule falls back to a literal; no layer holds the value in another form.
- **An e2e spec applies an override the way a snippet does** — a `<style>` element at the scope
  the plugin declares at — and asserts both surfaces land every row at `depth × unit + gutter`
  at two different units, plus that the mark-to-text distance does not move with it.

  It measures each layer that positions itself, not just the visible one: a block line's
  padding, an atom's margin, a list item's supplemental margin, its stated hanging indent, the
  guide gradient's period and stripe positions, and the `--list-indent` bridge. Review found
  the first version watching only row text and marker centres, where pinning any of the others
  would have passed. Each was then pinned in turn to confirm the current one catches it.

  Two of them are not where they look. An atom's margin and a list item's supplemental margin
  are written INLINE from JS, so the stylesheet rules that appear to position them are
  overridden and editing those changes nothing — which is why the first attempt at controlling
  them reported a pass.
- **Two unused JS copies were deleted.** `DECOR_UNIT_REM` and `DECOR_UNIT_CSS` held the unit as
  a number and a string for a caller that never arrived. A number cannot follow an override, so
  the first caller to position something from one would have left that piece on the old grid
  while every other layer moved — the same shape as the stale gutter fallback
  [21](21-marker-text-gap.md) found in the footer's heading, caught before it happened.

## What the widening surfaced

One e2e spec computed an ancestor guide's column from a spelled `1.5`
(`52-block-markers-icons.e2e.ts`, the fold-chevron clearance test). It failed at the new
default, and the failure was the literal rather than the geometry: with the unit read from the
published property the chevron's clearance is exactly what it was.

That is the change's own thesis arriving as evidence. A spelled unit is inert until the
declaration moves, and then it is wrong. The two specs that held one — this and
`56-list-grid.e2e.ts` — now read the value the document publishes.

## A preset ladder, and the floor on two device classes

`outline-unit-width` left the unit a single derived default with a snippet as the only way to
retune it, and called a setting an explicit non-goal. `outline-appearance-settings` takes that
back up, which means the ladder's rungs have to be chosen against the floor rather than against
taste alone — and the floor is not one number, because the gutter it is built from is not
([21](21-marker-text-gap.md) derives the gutter from the marks it must hold, and one of those
marks is sized by the platform).

**Measured 8 September 2026**, Obsidian 1.13.7, bundled theme, 16px root font, against
`Notes/List decoration demo.md` — a fixture carrying a task list, an ordered list and four levels
of bullets. Desktop is the 1024×800 window the e2e harness runs; mobile is the same build under
`app.emulateMobile()` at 390×844.

The floor is stated as a relationship rather than a length: **a child's mark must begin right of
its parent's text.** Measured directly as the tightest gap in the fixture between a parent row's
first text ink and a child row's leftmost mark ink, at each candidate step.

| Unit | Step | Desktop clearance | Mobile clearance |
| --- | ---: | ---: | ---: |
| `1.375rem` | 22px | +1.21px | **0.00px** |
| **`1.5rem`** | 24px | +3.21px | +2.00px |
| `1.625rem` | 26px | +5.21px | +4.00px |
| **`1.75rem`** | 28px | +7.21px | +6.00px |
| `2rem` | 32px | +11.21px | +10.00px |
| `2.5rem` | 40px | +19.21px | +18.00px |

Clearance is linear in the unit, so each column names its own floor: **20.79px on desktop, 22.0px
on mobile.** The difference is exactly the gutter's: 14px against 15.2px, from a checkbox Obsidian
sizes at 16px on desktop and `calc(16px * 1.15)` = 18.4px on mobile.

Two things in that table are worth keeping.

**The binding mark is ours, not the checkbox.** Every tightest gap was reported against a
block-marker icon, not against a task's checkbox — the icon is `0.85rem` centred on its column, so
6.79px of it falls left of that column, and it beats every native mark in the fixture. The
checkbox still sets the floor indirectly, through the gutter it widens.

**`1.375rem` is excluded by measurement, not by preference.** It sits exactly ON the mobile floor:
a child's mark begins where its parent's text does, which is the one arrangement the grid does not
survive. The ladder therefore starts at `1.5rem` — the pre-widening default, which clears both
floors — and the setting offers `1.5rem`, `1.75rem` (the desktop default), `2rem` and `2.5rem`.

**The mobile default is `1.5rem`.** On a 390px viewport the step is not a matter of taste: at
`1.75rem` the fixture's four-deep wrapped item takes six rows, at `1.5rem` five. The ladder still
reads as a ladder at the narrower step, and the row it gives back is real text.

`2.5rem` was rendered and read alongside the rest rather than assumed. On a desktop window a
four-deep list at that step spends real width on chrome — more than [the reading above](#what-was-measured-and-what-was-chosen)
found at `2rem` — but nothing about it is unsafe, and it is offered as a choice rather than
proposed as a default.
