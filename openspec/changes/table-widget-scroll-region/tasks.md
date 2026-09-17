## 1. The rule

- [ ] 1.1 Replace the `.table-wrapper` rule in `styles/10-editor.css` with the reservation (D1,
      D2): `overflow: auto hidden` unconditionally, and `padding: var(--table-drag-handle-size)`,
      the matching negative `margin` and `max-width: calc(100% + 2 * var(--table-drag-handle-size))`
      on a `:not(.is-loading)` widget, on the same three-class gate the rule already carries (D4).
      Verify against the figures in [docs/research/table-scroll-region](../../../docs/research/table-scroll-region.md): a fitting table's scroll
      region 0/0, no scrollbars, widget height back to its stock value
- [ ] 1.2 Add the two add-button rules (D3) on the same gate — the native near inset released to
      `auto`, the far-edge logical inset set, the cross-axis offset pushed in by one reservation
      and the cross-axis length pulled back by two. Verify from the computed insets that the
      far-edge inset actually landed (the note's third dead end looks identical in the
      stylesheet), and that each button's size and its offset from the table match the
      outline-mode-off values in the note's reservation table
- [ ] 1.3 Rewrite the rule's doc comment: the four pieces of chrome and what each is anchored to,
      why the tight box could not hold them, why the near inset has to be released, and what the
      `auto hidden` pairing is and is not doing. Leave the account of why the scroll moved to the
      wrapper at all (Experiment 2b finding 4) in place above it

## 2. E2E coverage

- [ ] 2.1 In `e2e/specs/51-guides-gradient.e2e.ts`, add a case for the fitting table (the
      `widget-atoms` fixture) asserting the wrapper's scroll region equals its client box on both
      axes and that no scrollbar takes space. Negative control: revert 1.1 and the case fails
      with 16 px on each axis
- [ ] 2.2 Extend the same case to the chrome, comparing outline mode on against outline mode off
      on one note: the add-row button, the add-column button and both drag handles keep their
      size and their offset from the table, and none is outside the scrollport. Negative control:
      drop 1.2's cross-axis corrections and the buttons' offsets diverge by one reservation; drop
      1.1's padding and the drag handles read 13 px outside
- [ ] 2.3 Extend the existing wide-table case: the wrapper's scroll region equals its client
      height and no vertical scrollbar takes width, while the existing horizontal assertions still
      hold. This one has no negative control and D2 says why — with the reservation in place the
      unpaired form measures identically, so the assertion pins the reservation, not the pairing.
      Its control is 1.1's: revert the padding and the case fails with 16 px of vertical region
- [ ] 2.4 Assert what the reservation could have flipped and did not: `outer.scrollWidth ===
      outer.clientWidth`, which `51-guides-gradient` already pins and which the reservation brings
      from 16 px of slack a side to zero. The note measures it holding at four widths, fractional
      ones included; this keeps it pinned. Negative control: widen `max-width` past the
      reservation and the outer overflows
- [ ] 2.5 Run both groups narrow, desktop and mobile — the reservation resolves to a different
      length on each (`--size-4-4` against `--size-4-6`), and mobile is where the drag handles
      matter most, so it is not a duplicate run: `npm run test:e2e:narrow -- 51-guides-gradient`
      and the same with `--mobile`. On mobile, 2.2's handle half needs the row or column marked
      active, since `.is-mobile` hides a resting handle

## 3. Manual pass

- [ ] 3.1 Install to the test vault (`npm run vault:install`) and check `Notes/Edge Case Zoo` in
      outline mode: the reported table scrolls on neither axis, and the note's other atoms are
      unchanged
- [ ] 3.2 On a genuinely wide table, drag the horizontal scrollbar and trackpad-scroll it: the
      table scrolls, the note does not, and the guide and the marker stay put — the manual check
      that caught the Experiment 2b regression this rule came from
- [ ] 3.3 Hover a table's rows and columns: both drag handles appear and drag, and both add
      buttons add a row and a column. Click each of the four bands around the table and confirm
      what focuses or selects, since the band's owner changes with this rule (Risks). Check one
      table in each bundled theme
- [ ] 3.4 Check a table in a note with an RTL first line, confirming D3's logical insets put the
      add-column button on the inline-far side rather than over the table

## 4. Land

- [ ] 4.1 `npm run lint`, `npm test`, `npm run build`, `npm run build:e2e`
- [ ] 4.2 Sync the delta spec into `openspec/specs/outline-decorations/spec.md`, then
      `openspec validate --specs --strict`
- [ ] 4.3 `npm version patch`, and confirm `test-vault` carries no drift
      (`node scripts/check-vault-drift.mjs`)
- [ ] 4.4 `openspec validate table-widget-scroll-region --strict`
