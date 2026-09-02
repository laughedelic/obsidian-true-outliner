## 1. Measure, before choosing anything

> The whole change rests on this. Today's figures — a checkbox at 16px, `10. ` at 28px, a
> bullet-to-text gap of 17px against a task's 16.2px, a space's advance of 4.19px — come from
> separate investigations under rules that have since changed. They are not commensurable, and
> a gutter derived from a mix of them would be a guess wearing a measurement's clothes.

- [x] 1.1 Write a throwaway e2e probe that reports, for one fixture carrying all four marks at
      the same depth: each mark's ink extent right of its own column, the column itself, and
      where the row's text begins. Both bundled themes, and the two `--to-space-advance` cases
      (one-space and tab/multi-space markers)
- [x] 1.2 Record the same four for the backlinks footer, whose marks are `0.8em` and whose rows
      draw no native bullet, checkbox or ordered marker
- [x] 1.3 Write the figures into `docs/research/` as one table with one date on it, so the next
      person is not merging passes again
- [x] 1.4 Decide the stated visual gap from those figures and say why in the same place. This is
      the one number chosen rather than derived, and it should be argued for once

## 2. Derive and apply

- [x] 2.1 Set `MARKER_GUTTER_REM` from the derivation. If it lands at or above today's 1.25rem,
      stop and re-read the proposal — the honest outcome is that ordered lists bound the gap and
      it cannot tighten much
- [x] 2.2 Confirm the eleven `styles.css` derivations follow with no edits. Any rule needing a
      hand-adjustment is a rule that had the old value baked into it, and is a defect this change
      should fix rather than route around
- [x] 2.3 Check the derived gutter against `--to-space-advance`: the native bullet and task label
      are padded to `gutter - one space`, so a gutter near a space's own advance drives that
      padding to zero and inverts the mechanism
- [x] 2.4 Decide, from 1.2, whether the footer takes its own gutter. If it does, make
      `MARKER_LEFT_SHIFT_EXPR` read the gutter from the custom property — the same fix already
      applied to the icon size (`MARKER_ICON_VAR`), and silent in the same way if skipped

## 3. Verification

- [x] 3.1 Update the three specs that hard-code the resolved 20px:
      `e2e/specs/50-decorations.e2e.ts`, `e2e/specs/51-guides-gradient.e2e.ts`,
      `e2e/specs/56-list-grid.e2e.ts`. Prefer deriving the expectation from the published
      property over restating a new literal
- [x] 3.2 New spec for the derivation itself: all four marks at one depth share a text column,
      and each one's text begins the same distance after its own mark's ink. Assert the
      relationship, never a pixel width — CI's font is not a developer's
- [x] 3.3 Cover the multi-digit exception: `1.` and `10.` share a left edge, the wide one's text
      starts further right, and neither number overlaps its own text
- [x] 3.4 Negative-control 3.2 by reverting the constant, and confirm it fails. A gap test that
      passes at both values is measuring nothing
- [x] 3.5 Confirm the columns did not move: the existing guide and marker-column specs pass
      unchanged, which is what separates a gutter change from an indentation change
- [x] 3.6 Regenerate the screenshot corpus and read it, both themes, both surfaces

## 4. Close-out

- [x] 4.1 Record the derivation in `docs/research/` as a decision, including the marks that did
      not qualify and why
- [x] 4.2 `openspec validate marker-text-gap --strict`
