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
];
