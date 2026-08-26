## Why

Press Enter on a bullet item in outline mode and the caret lands hard against the bullet,
about 16px left of where the first character will appear; the moment one is typed the caret
jumps right to meet it. Reported from manual testing, reproduced, and traced.

It is a regression from `lists-on-the-outline-grid` (archived 2026-08-25). Task 3.4 of that
change gave `.cm-formatting-list` `display: inline-block` and `min-width:
var(--to-marker-gutter)`, which is what makes an item's text column the gutter by
construction. That sizes the marker's BOX. CM6 measures a caret from the TEXT RUN inside it,
and the two are no longer the same thing: a bullet's `-` lives in a `width: 0`
`.list-bullet`, so the text of `- ` measures only its trailing space. On an item WITH content
the position resolves to the start of the following content span and lands correctly; on an
EMPTY item there is no following span, so the caret takes the end of the marker's text.

Measured (bundled theme, macOS, 16px root, unit 24px, gutter 20px), caret x against the
item's own text column:

| Empty item | Caret | Text column | Short by |
|---|---|---|---|
| `- ` | 4.19 | 20 | 15.81 |
| `- ` nested one level | 28.19 | 44 | 15.81 |
| `2. ` | 11.59 | 20 | 8.41 |
| `- [ ] ` | 11.42 | 20 | 8.58 |
| paragraph | 20 | 20 | — |

With `styles.css` from before that change, every kind's caret sat exactly on its marker box's
right edge, because without `min-width` the box WAS the text. Block lines are unaffected
throughout: their gutter is line padding, not a box inside the text run.

An empty item is not a rare state — it is what every Enter produces, and what deleting an
item's text leaves behind. It is also the one moment the caret is the only thing on the line,
so there is nothing else to read the column from.

The same keypress on a TASK item has a second defect, independent of geometry and older than
it. Enter on `- [x] done` writes `- [ ] ` and leaves the caret at the item's content start,
which is between `- ` and `[ ] `. Typing there produces `- foo[ ] ` — the continuation rule
writes a marker and then puts the caret in front of it, so using it destroys it.

## What Changes

- **An empty list item's caret sits on the item's own text column** — where its first
  character will land, for a bullet and for an ordered item, at every nesting depth. The
  marker's width has to be carried by an element the caret's own measurement crosses, rather
  than by the span around it; which element, per kind, is what this change settles.
- **A caret placed on an item whose whole content is a task marker lands after that marker.**
  Enter on a task item then leaves the caret where the text goes, so typing produces
  `- [ ] foo`. This is a placement rule only: `[ ]` stays ordinary content, still reachable,
  still where Home lands, and addressability is untouched — the question
  `enter-and-shift-enter-grammar` D5 held out of scope stays out of scope.
- **The text column, the marker column, the hanging indent and the wrapped-row column do not
  move.** They are correct today and `e2e/specs/56-list-grid.e2e.ts` asserts all four; this
  change is measured against them holding.

Non-goals, each for its own reason:

- **The raw-source jump on a task line.** With the caret on it, Obsidian renders `- [ ] ` as
  source with no `.task-list-label`, so the line's own text column IS 11.42 there and the
  caret agrees with it; the shift to 20 happens when the caret leaves and the checkbox
  renders. That is live preview expanding source on every task line, empty or not, and not
  something this layer introduced or can address from where it stands.
- **A marker wider than the gutter.** `10. ` measures 28px against a 20px gutter, so its own
  text already reaches past the text column and there is no gap to close. The wide-marker
  exception the grid states elsewhere covers the caret too.
- **The caret on a whitespace-only CONTINUATION line**, which `docs/research/12` records as
  still open. It is the same mechanism through a different element (`.cm-hmd-list-indent`, now
  carrying a stated width), so this change measures it and either closes it with the same
  lever or records the measurement — it does not carry a requirement of its own here.

## Capabilities

### New Capabilities

None. This corrects where an existing layer renders the caret and where an existing procedure
places it.

### Modified Capabilities

- `outline-decorations`: a new requirement puts the caret on the item's own text column. The
  existing column requirement states where a marker, a text column and a wrapped row land, all
  of which hold and none of which change; what no requirement states is that the caret agrees
  with the text column on an item that has no text yet.
- `caret-placement-policy`: "A caret's content start has one definition" gains the
  task-marker clause — where a placement would land inside a marker this grammar wrote,
  it lands after it instead.

## Impact

- `styles.css` — the list-grid section's marker rules. The width that makes the text column
  moves onto elements inside the marker's text run; the ordered marker's `transform` is
  re-examined, since it moves the measured run as well as the ink.
- `src/plugin/decorations.ts` — only if measurement shows a per-line measured value is needed
  for the ordered case; `MarginCompensation` already publishes `--to-space-advance` and
  `--to-chevron-dy` by the same route.
- `src/caret-policy.ts` — the task-marker clause, applied where the procedure resolves a
  content start, not at any one call site.
- `tests/caret-placement.test.ts` — the new placement rule, and the non-task cases pinned
  unchanged.
- `e2e/specs/56-list-grid.e2e.ts` — caret geometry for an empty item at each kind and depth,
  alongside the four columns it already guards.
- `e2e/specs/30-keyboard-grammar.e2e.ts` — Enter on a task item, then a character, yields
  `- [ ] foo`.
- No change to the document model, the parse, or anything written to disk beyond where a
  caret sits.
