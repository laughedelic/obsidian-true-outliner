## Why

A node's mark sits `0.825rem` — about 13px — from the start of its text. That distance is
`gutter - icon/2`, and neither term was ever derived: `MARKER_GUTTER_REM = 1.25` is a number
that worked, and everything since has been built to respect it. Read against Logseq or
Workflowy, the outline reads loose — the mark and the text it names are two things beside each
other rather than one row.

The gutter is not hard to change. It is the single number every kind's position is stated
from — block lines, atoms, native bullets, checkboxes, ordered numbers, and the backlinks
footer all derive from it, which is what the chrome contract is for. What is missing is a
statement of **what it has to be big enough for**. Without one, tightening it is guesswork, and
the first kind whose mark no longer fits will fail quietly: text a few pixels off its column,
which reads as a rendering bug rather than as a value chosen too small.

So this change is less about picking a smaller number than about deriving the number at all.

## What Changes

- **The gutter becomes derived, not chosen.** Its value SHALL be the greatest distance any
  qualifying mark's ink reaches right of the column, plus one stated visual gap. Four marks
  qualify — the synthetic block icon, an unordered bullet, a task checkbox, and a
  **single-digit** ordered number — because those are the marks this layer positions on the
  column whose width does not depend on their own content.

- **Multi-digit ordered numbers are excluded, deliberately.** `10. ` and `100. ` are wider than
  any gutter worth having, and the column requirement already permits a number wider than the
  gutter to lean right into its own text's space. Their rows' text therefore begins further
  right than their siblings', and that is accepted rather than corrected. Sizing the gutter for
  the rare case would loosen every ordinary row to spare an occasional one.

- **One measurement pass, both bundled themes.** Today's numbers exist but were taken in
  separate investigations under different rules — a checkbox recorded at 16px, `10. ` at 28px, a
  bullet-to-text gap at 17px against a task's 16.2px, a space's advance at 4.19px. They cannot
  be compared with each other, and the derivation needs them commensurable. Measured together
  or not at all.

- **Both surfaces, one rule.** The editor and the backlinks footer take the gutter from the same
  derivation applied to the marks each actually draws. The footer draws no native bullets,
  checkboxes or ordered markers (every footer row is a plain line) and its marks are smaller,
  so the derivation may yield a smaller gutter there. Whether it does is for the measurement to
  say, not for this proposal to assume — with one consequence to plan for: if the two surfaces
  end up with different gutters, `MARKER_LEFT_SHIFT_EXPR` must read the gutter as a custom
  property rather than spelling it as a literal, or the marker's centre drifts off its column
  by half the difference. That is the same trap already found and fixed for the icon size
  (`MARKER_ICON_VAR`), and it is silent in exactly the same way.

- **A wording correction, carried here because this change is the one that touches it.** The
  fixed-size requirement bans `em` outright, on the grounds that it would resolve against the
  line's own font size. The invariant it exists to protect is that a marker does not change size
  with the kind or heading level of the line it sits on — which is what should be stated. The
  footer already renders its marks at `0.8em` and satisfies that invariant, because no footer
  row carries heading typography (D18); under the current wording it is a violation on a
  technicality.

## Non-goals

- **Changing the unit.** `--to-decor-unit` (1.5rem, level to level) is independent of the
  gutter (mark to text). Indentation depth is not in scope, and the columns must not move.
- **Making the gap configurable.** One derived default. If it later wants a setting, that is a
  separate change with a settings surface to design.
- **Revisiting vertical alignment.** The per-kind vertical anchors and their recorded residuals
  stay exactly as they are.

## Capabilities

### Modified Capabilities

- `outline-decorations`: gains the rule that derives the marker gutter from the marks it must
  hold, states which marks qualify and why a multi-digit ordered number does not, and requires
  the derivation to be applied per surface. The fixed-size requirement is reworded to state the
  invariant it protects rather than banning a unit.

## Impact

- **Modified**: `src/plugin/chrome-tokens.ts` — the gutter stops being a number. It becomes a
  stated gap, a floor for the marks this layer draws itself, and a CSS expression that reads
  the theme's own `--checkbox-size` at render time. Eleven derivations in `styles.css` follow
  with no edits, on both surfaces, for every kind.
- **Fixed, as defects the derivation exposed**: Obsidian's own trailing margin on a task
  checkbox (a second answer to the question the gutter answers, inert only while the old gutter
  dominated it); the footer's own chrome reading the gutter through a stale literal, so its
  heading laid out on the old value while its rows took the new one; and a footer ordinal with
  no trailing space running flush into its own text once the slot narrowed.
- **Tests**: three e2e specs hard-coded the resolved 20px and now read the published property —
  `e2e/specs/50-decorations.e2e.ts`, `e2e/specs/51-guides-gradient.e2e.ts`,
  `e2e/specs/56-list-grid.e2e.ts`. A new spec, `e2e/specs/57-marker-gap.e2e.ts`, covers the
  derivation itself, and two cases in `e2e/specs/74-footer-chrome-pass.e2e.ts` cover the footer
  half.
- **Regenerated**: the screenshot corpus. The footer's structural baseline is unaffected — it
  records no pixels.

## Outcome

The proposal expected a single-digit ordered marker to be the binding constraint. The
measurement said otherwise, and the correction is worth recording because it changed the shape
of the answer rather than only its value.

**No mark is the binding one.** Two of the four vary, in different ways, and the derivation
had to be split accordingly:

- A **checkbox** is sized by the theme, and Obsidian resolves `--checkbox-size` per platform
  (16px desktop, 18.4px mobile). It is the widest mark on both, and knowable at render time —
  so it is a live term, not a recorded one. Frozen at the desktop value it left a mobile task's
  text off the shared column, which is exactly the quiet failure this change was written to
  prevent.
- A single-digit **ordered number** is drawn by the reader's font — about 2px wider on CI's
  Linux font than on macOS — and is not knowable before layout. It cannot be a term at all.
  What it gets instead is the floor its own box mechanism already imposed, which is what keeps
  it on the shared column.

So the gap did tighten on ordered lists, and the honest statement is narrower than the one this
proposal asked for: the stated gap is guaranteed for the marks this layer sizes, and the shared
column — not the distance — is what every other kind is promised.
