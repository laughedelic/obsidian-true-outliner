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

**Measured 8 September 2026**, Obsidian 1.13.7, bundled theme, 16px root font. Desktop is the
1024×800 window the e2e harness runs; mobile is the same build under `app.emulateMobile()` at
390×844.

The floor is stated as a relationship rather than a length: **a child's mark must begin right of
its parent's text.** Measured directly as the gap between a parent row's first text ink and a
child row's leftmost mark ink, over a fixture whose every row is rendered at once (see the
correction below for why that matters):

```
# Section
- [ ] a task
	- [x] a done subtask
		- a plain child
```

| Unit | Step | Desktop clearance | Mobile clearance |
| --- | ---: | ---: | ---: |
| `1.5rem` | 24px | +2.0px | **−0.4px** |
| **`1.625rem`** | 26px | +4.0px | +1.6px |
| **`1.75rem`** | 28px | +6.0px | +3.6px |
| `2rem` | 32px | +10.0px | +7.6px |

Clearance is linear in the unit, so each column names its own floor: **22.0px on desktop, 24.4px
on mobile.** The binding mark is a task's **checkbox** — Obsidian sizes it 16px on desktop and
`calc(16px * 1.15)` = 18.4px on mobile, and it is centred on its own column, so half of it falls
left of that column and the gutter that holds it is 1.2px wider on mobile as well.

**The ladder is therefore `1.625rem` (compact), `1.75rem` (standard, the desktop default), `2rem`
(roomy) and `2.5rem` (wide), with `1.625rem` as the mobile default.** `1.5rem` — the
pre-widening default, and the obvious bottom rung — is excluded: on mobile a nested task's
checkbox begins 0.4px LEFT of its parent's text, which is the one arrangement this grid does not
survive. The rung set is uniform across device classes rather than per-class, so a preset means
one step everywhere and only the DEFAULT differs.

`2.5rem` was rendered and read rather than assumed. On a desktop window a four-deep list at that
step spends real width on chrome — more than [the reading above](#what-was-measured-and-what-was-chosen)
found at `2rem` — but nothing about it is unsafe, and it is offered as a choice rather than
proposed as a default.

On a 390px viewport the narrower default is not a matter of taste: the fixture corpus's four-deep
wrapped item takes one row fewer at the compact step than at the standard one, and the ladder
still reads as a ladder.

### The correction: a long fixture measures only its viewport

The first pass at this table reported floors of 20.79px and 22.0px, bound by our own block-marker
icon rather than by a checkbox, and concluded that `1.5rem` cleared both. It was measured over
`Notes/List decoration demo.md`, which carries a task list precisely so that the widest mark is in
the sample.

It was not in the sample. CodeMirror renders the viewport, not the document, and that fixture's
task section sits below the fold — so the probe swept every rendered row, found no checkbox among
them, and reported the tightest pair it could see. The number was true of what it measured and
false of the question it was asked.

Caught by the e2e case that now holds this floor permanently, which failed on the mobile run at
the rung the first pass had endorsed. Two things follow, both cheap: measure a floor over a
fixture short enough to render whole, and state the assertion as a relationship the test can
re-derive on each device class rather than as a number recorded once.
