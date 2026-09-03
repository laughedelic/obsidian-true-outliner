## 1. Widen the default

- [x] 1.1 Set `--to-decor-unit` to `1.75rem` in its single `styles.css` declaration. No other
      rule changes: every column on both surfaces derives from this one
- [x] 1.2 Confirm the gutter is untouched — a mark's distance from its own text is derived from
      the marks it holds (docs/research/21) and must not move with the unit

## 2. Make the adjustment supported rather than incidental

- [x] 2.1 Delete `DECOR_UNIT_REM` and `DECOR_UNIT_CSS`. They are the unit's value as a JS number
      and string, unused; the first caller to reach for one would position something an
      override cannot move
- [x] 2.2 Confirm `UNIT_EXPR` is the only route JS has to the unit, and that it carries no
      literal fallback — a fallback is the same second copy in a different shape

## 3. Verification

- [x] 3.1 `56-list-grid.e2e.ts` spells `UNIT = 24`. Read the published value instead, the same
      treatment the gutter got — a spelled value asserts the number the file was written
      against rather than that a level steps by the unit
- [x] 3.2 New spec: apply an override the way a snippet would and assert both surfaces follow —
      every depth's column, marker and text at the overridden step, on the editor and the
      footer. Assert the relationship to the published unit, never a pixel
- [x] 3.3 Cover what must NOT move: with the unit overridden, each row's text still begins the
      same distance after its own mark. The gutter is not the unit's business
- [x] 3.4 Negative-control 3.2 by pinning a layer to a literal unit, and confirm it fails. An
      override test that passes with a layer left behind is measuring nothing
- [x] 3.5 Confirm the existing marker-gap and guide specs pass unchanged at the new default
- [x] 3.6 Regenerate the screenshot corpus and read it, both themes, both surfaces

## 4. Close-out

- [x] 4.1 Record the widening and the override contract in `docs/research/`, including the
      candidates that were measured and rejected
- [x] 4.2 `openspec validate outline-unit-width --strict`
