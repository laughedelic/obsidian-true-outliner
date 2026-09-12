## 1. The net first

- [ ] 1.1 Capture a baseline of what the decoration layer puts in the DOM for the e2e corpus: for
  every rendered line, every `to-*` class, every `--to-*` inline custom property, every `data-*`
  attribute and the plugin's widgets present — collected by prefix, so the whole plugin-owned
  contract is in it (design D5) — under each `markerHighlight` and `guideHighlight` state and
  with a fold open and closed. Keep it as a probe spec in the decorations group, run once against
  the current build to record the baseline under `e2e/baselines/`, and asserted against the build
  from then on. Negative control: change one guide layer's width in `guideBackground` — the
  baseline comparison must fail.
- [ ] 1.2 Add to `54-widget-rendered-lines.e2e.ts` the case the proposal names: a widget line and
  a plain line at the same depth carry the same accent classes under every `markerHighlight`
  state, with the caret on each in turn. Negative control: disable the accent toggle in the
  widget path — the case must fail.

## 2. The builder

- [ ] 2.1 Add `LineRender` and `renderInputs(state, modes)` to `src/plugin/decorations.ts` beside
  the trail cache, built from `factsFor`, `visibilityContext`, `positionTrail`, the hover field and
  `foldedChrome`, cached per state and keyed on the settings it reads (design D2). Verify with
  `npm run build` and the unit suite; nothing reads it yet.
- [ ] 2.2 Switch `computeDecorations` to the builder: `lineDecoration` and `gapLineDecoration`
  take a record (design D3), and the fold-count widget is emitted where the record says. Verify
  the decorations and folding groups narrow, and the baseline from 1.1. Negative control: drop
  the folded-tail field from the record — `93-fold-chrome` must fail.
- [ ] 2.3 Switch `MarginCompensation.apply` to the builder: the guide background, the accent
  classes via `markerClasses`, and the folded treatment come from the widget line's record. Verify
  `54-widget-rendered-lines`, `52-block-markers-icons` and the baseline. Negative control: read the
  record for the wrong line number — the baseline comparison must fail on every widget line.
- [ ] 2.4 Remove the consumers' remaining direct calls to `drawnGuideDepths`, `litGuideOn`,
  `guideBackground` and `markerClasses` (design D4) and confirm by grep that the builder is their
  only caller.

## 3. Rendered behaviour

- [ ] 3.1 Run the decorations, position-indicators, folding and clipboard (zoom) groups narrow and
  confirm no existing case regresses; push, and read CI's sweep.
- [ ] 3.2 A manual pass on the real vault: a note with a table, a callout, an embed and a folded
  heading, with the caret moved through each under every indicator setting, comparing against the
  same note on `main`. While there, measure whether a widget-rendered line can be a foldable
  node (a whole-line embed with a list attached), and what fold chrome it carries on `main`; if
  it can and carries none, record that in docs/research/decoration-follow-ups with the
  measurement, as a gap this change preserves rather than closes.

## 4. Landing

- [ ] 4.1 Update docs/research/hot-file-seams: seam 3's row records what landed, and the
  re-measuring section is the test of it.
- [ ] 4.2 Archive the change on this branch.
- [ ] 4.3 No version bump: nothing shipped changes.
- [ ] 4.4 `openspec validate decoration-line-inputs --strict`.
