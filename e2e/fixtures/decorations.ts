/**
 * Shared fixture corpus for outline-decorations experiments — see
 * docs/research/07-decoration-experiments-plan.md. Every experiment screenshots ALL of
 * these on every change, not just the fixture for whatever it's currently fixing (the
 * postmortem's #2 false-confidence finding: fixes were checked only against the
 * scenario they targeted, not a growing regression corpus).
 */

export const FLAT_NOTE = 'Scratch/decorations-flat.md';
// The original motivating bug: at depth 0 everywhere, indentation alone conveys nothing —
// this fixture is the crux test for whether dropping the marker (experiment 1) still
// reads as "outline mode is on."
export const FLAT_MD = 'First thought.\n\nSecond thought.\n\nThird thought.\n';

export const MIXED_NOTE = 'Scratch/decorations-mixed.md';
export const MIXED_MD = [
  '# Top',
  '',
  '## Mid',
  '',
  '- item',
  '  - nested item',
  '',
  'Parent para.',
  '- Child para as list item.',
  '',
  '```js',
  'code line',
  '```',
  '',
].join('\n');

export const CHECKBOX_NOTE = 'Scratch/decorations-checkbox.md';
// The exact shape that broke in the field during attempt 3: a checkbox list under a
// plain top-level paragraph, mixed checked/unchecked items.
export const CHECKBOX_MD = [
  'Errands before the heat sets in.',
  '',
  '- [x] picked up paint samples',
  '- [x] returned the library book',
  "- [ ] drop off the drill at Tom's",
  '',
].join('\n');

export const HEADING_THEN_LIST_NOTE = 'Scratch/decorations-heading-then-list.md';
// Isolates the additive-margin hypothesis: a list directly under a heading, no
// intervening paragraph, so native list rendering (which knows nothing about heading
// ancestors) must be supplemented by the heading's depth contribution alone.
export const HEADING_THEN_LIST_MD = [
  '# Section',
  '',
  '- top item',
  '  - nested item',
  '    - deeply nested item',
  '',
].join('\n');

export const MULTILINE_NOTE = 'Scratch/decorations-multiline.md';
// Continuation lines (Shift+Enter) — never actually screenshotted during attempt 3,
// despite being asserted correct in code and in the unit tests' line-fact computation.
export const MULTILINE_MD = [
  'A paragraph that keeps going',
  'onto a second visual line via a soft break.',
  '',
  '- A list item that also',
  '  keeps going onto a second line.',
  '',
].join('\n');

export const WIDE_NUMBERING_NOTE = 'Scratch/decorations-wide-numbering.md';
// Crosses a digit-width boundary (9 -> 10) to catch any supplemental indentation
// clashing with native ordered-marker width variance.
export const WIDE_NUMBERING_MD = [
  '1. one',
  '2. two',
  '3. three',
  '4. four',
  '5. five',
  '6. six',
  '7. seven',
  '8. eight',
  '9. nine',
  '10. ten',
  '',
].join('\n');

export const DEEP_NESTING_NOTE = 'Scratch/decorations-deep-nesting.md';
export const DEEP_NESTING_MD = [
  '- level 1 (bullet)',
  '  1. level 2 (ordered)',
  '     - level 3 (bullet)',
  '       1. level 4 (ordered)',
  '',
].join('\n');

export const WIDGET_ATOMS_NOTE = 'Scratch/decorations-widget-atoms.md';
// Obsidian renders these four atom kinds as opaque replacement widgets in
// Live Preview (`.cm-embed-block`, or `.hr` for the rule) rather than a
// plain `.cm-line` — a `Decoration.line` targeting that line has no effect
// at all, confirmed live. Caught in real vault use (table, callout) after
// Experiment 1 first shipped; code/quote render as plain lines and were
// already covered by MIXED_MD. Fixed via decorations.ts's companion
// ViewPlugin that patches these widgets' margin-left directly.
export const WIDGET_ATOMS_MD = [
  '# Section',
  '',
  '| a | b |',
  '| --- | --- |',
  '| 1 | 2 |',
  '',
  '> [!note] Title',
  '> body',
  '',
  '---',
  '',
  '<div>raw html block</div>',
  '',
].join('\n');

export const WIDE_TABLE_NOTE = 'Scratch/decorations-wide-table.md';
// A table wide enough to genuinely need its own horizontal scroll (15
// columns of unwrappable content) — isolates the specific real-vault
// finding from Experiment 2b: a guide painted inside the table widget's
// own box conflicts with that box's native overflow-x:auto (whichever
// mechanism owns the guide there must not silently break the table's own
// scroll, e.g. by forcing `overflow: visible` on the wrong element).
const WIDE_TABLE_COLS = Array.from({ length: 15 }, (_, i) => `column-number-${i}`);
export const WIDE_TABLE_MD = [
  '# Section',
  '',
  `| ${WIDE_TABLE_COLS.join(' | ')} |`,
  `| ${WIDE_TABLE_COLS.map(() => '---').join(' | ')} |`,
  `| ${WIDE_TABLE_COLS.map((_, i) => `unbreakable-value-${i}-xxxxxxxxxxxxxxxxxxxxxxx`).join(' | ')} |`,
  '',
  'A paragraph right after the table, to see if the table pushes into it.',
  '',
].join('\n');

export interface DecorationFixture {
  readonly note: string;
  readonly md: string;
  readonly label: string;
}

export const ALL_DECORATION_FIXTURES: readonly DecorationFixture[] = [
  { note: FLAT_NOTE, md: FLAT_MD, label: 'flat' },
  { note: MIXED_NOTE, md: MIXED_MD, label: 'mixed' },
  { note: CHECKBOX_NOTE, md: CHECKBOX_MD, label: 'checkbox-task' },
  { note: HEADING_THEN_LIST_NOTE, md: HEADING_THEN_LIST_MD, label: 'heading-then-list' },
  { note: MULTILINE_NOTE, md: MULTILINE_MD, label: 'multiline-continuation' },
  { note: WIDE_NUMBERING_NOTE, md: WIDE_NUMBERING_MD, label: 'wide-numbering' },
  { note: DEEP_NESTING_NOTE, md: DEEP_NESTING_MD, label: 'deep-nesting' },
  { note: WIDGET_ATOMS_NOTE, md: WIDGET_ATOMS_MD, label: 'widget-atoms' },
  { note: WIDE_TABLE_NOTE, md: WIDE_TABLE_MD, label: 'wide-table' },
];
