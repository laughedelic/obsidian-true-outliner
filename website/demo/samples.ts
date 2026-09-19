/**
 * The notes and keystroke sequences the front page's gallery and the
 * playground run. Line numbers in a sequence are zero-based positions in the
 * note it runs against; a step that changes the line count places its later
 * steps against the note as it stands at that point.
 */

import type { ScriptStep } from './editor';

export const KITCHEN = `# Kitchen renovation

The 2026 project. Sarah leads design, I lead logistics, [[Tomás Rivera|Tomás]] leads kibitzing.

## Plan

1. demolition weekend (booked: August 1–2)
2. electrics and plumbing rough-in
3. floor patch, then tile
4. cabinets

## Materials

- tile: reclaimed terracotta, 1962 ✅
- paint: "cloud" (which is also "oat milk")
- handles: undecided
	- brass ages well but shows prints
	- steel matches the range
- [ ] call the tiler about **Monday**
- [x] measure the alcove

> The best kitchens look inevitable, not designed.
`;

/** A focused sequence: one gesture family, one short explanation. */
export interface DemoSequence {
  id: string;
  title: string;
  /** One or two sentences beside the editor while it plays. */
  blurb: string;
  /** The keys it shows, for the index. */
  keys: string[];
  /** Where the guide says more. */
  link: string;
  doc?: string;
  steps: ScriptStep[];
}

export const SEQUENCES: DemoSequence[] = [
  {
    id: 'outline',
    title: 'Any note is an outline',
    blurb:
      'Headings, paragraphs and lists sit on one grid, each with a marker for its kind and a guide down to its children. The caret’s place in the tree is always visible.',
    keys: ['↑', '↓'],
    link: '/guide/appearance',
    steps: [
      { cursor: [2, 12] },
      { pause: 900, label: 'a paragraph under the title' },
      { cursor: [8, 6] },
      { pause: 900, label: 'an item in the plan' },
      { cursor: [16, 8] },
      { pause: 900, label: 'a nested item: its ancestors light up' },
      { cursor: [21, 6] },
      { pause: 900, label: 'a quote is a node too' },
    ],
  },
  {
    id: 'move',
    title: 'Move whole subtrees',
    blurb:
      'Tab and Shift+Tab move a node with everything under it, wherever the caret is. A heading takes its section along; a moved node takes the markdown of its new neighbours.',
    keys: ['Tab', '⇧Tab', '⌘⇧↑', '⌘⇧↓'],
    link: '/guide/structural-editing',
    steps: [
      { cursor: [16, 12] },
      { key: 'Tab', shift: true, label: '⇧Tab  outdent; the sibling below becomes a child' },
      { pause: 500 },
      { key: 'Tab', label: 'Tab  indent; the subtree comes along' },
      { pause: 500 },
      { cursor: [11, 5] },
      { key: 'ArrowUp', mod: true, shift: true, label: '⌘⇧↑  the whole section moves up' },
      { pause: 700 },
      { key: 'ArrowDown', mod: true, shift: true, label: '⌘⇧↓  and back' },
      { pause: 400 },
      { key: 'Tab', label: 'Tab on a heading: one level deeper, section and all' },
      { pause: 800 },
      { key: 'Tab', shift: true, label: '⇧Tab' },
    ],
  },
  {
    id: 'split',
    title: 'Split, continue, join',
    blurb:
      'Enter splits a node where the caret is and lists renumber. Enter on an empty item walks out of the list. Backspace at a node’s first character joins it onto the one above.',
    keys: ['↵', '⇧↵', '⌫'],
    link: '/guide/structural-editing#enter',
    steps: [
      { cursor: [8, 15] },
      { key: 'Enter', label: '↵  split mid-item; the list renumbers' },
      { pause: 500 },
      { cursor: [10, 11] },
      { key: 'Enter', label: '↵  at the end: a new item' },
      { type: 'counters last' },
      { key: 'Enter', label: '↵' },
      { key: 'Enter', label: '↵  on an empty item: leave the list' },
      { type: 'Measured after the cabinets go in.' },
      { pause: 700 },
      { cursor: [13, 0] },
      { key: 'Backspace', label: '⌫  at the first character: join with the node above' },
      { pause: 600 },
    ],
  },
  {
    id: 'select',
    title: 'Select by node',
    blurb:
      'Shift+Arrow grows a selection one node at a time. Mod+A climbs from the text to the subtree to the list to the note. A drag across a boundary snaps to whole nodes.',
    keys: ['⇧↓', '⇧↑', '⌘A'],
    link: '/guide/selection-and-caret',
    steps: [
      { cursor: [15, 6] },
      { key: 'ArrowDown', shift: true, label: '⇧↓  the node, children included' },
      { key: 'ArrowDown', shift: true, label: '⇧↓  and the next one' },
      { key: 'ArrowUp', shift: true, label: '⇧↑  back to one' },
      { pause: 400 },
      { key: 'a', mod: true, label: '⌘A  the item’s text' },
      { key: 'a', mod: true, label: '⌘A  its subtree' },
      { key: 'a', mod: true, label: '⌘A  the whole list' },
      { key: 'a', mod: true, label: '⌘A  the section' },
      { pause: 500 },
      { select: [[16, 5], [17, 8]], label: 'a drag across two items snaps to both' },
      { pause: 1200 },
    ],
  },
  {
    id: 'fold',
    title: 'Fold any branch',
    blurb:
      'Every node with children folds, headings, items and paragraphs alike, and says how much it hides. A fold follows its node when it moves and opens when something inside changes.',
    keys: ['⌘⌥↑', '⌘⌥↓', '⌘⌥.'],
    link: '/guide/folding',
    steps: [
      { cursor: [16, 8] },
      { fold: 'fold', label: '⌘⌥↑  fold the branch the caret is in' },
      { pause: 900 },
      { cursor: [11, 5] },
      { fold: 'fold', label: '⌘⌥↑  fold the section' },
      { pause: 900 },
      { key: 'ArrowUp', mod: true, shift: true, label: '⌘⇧↑  move it, folded' },
      { pause: 900 },
      { fold: 'unfold', label: '⌘⌥↓  unfold' },
      { pause: 500 },
      { key: 'ArrowDown', mod: true, shift: true, label: '⌘⇧↓' },
      { foldAll: 'fold', label: 'Fold all' },
      { pause: 900 },
      { foldAll: 'unfold', label: 'Unfold all' },
    ],
  },
  {
    id: 'zoom',
    title: 'Zoom into anything',
    blurb:
      'A click on a marker shows one node and its subtree as if it were the whole note, with a trail back out. Editing inside is confined to what is visible.',
    keys: ['click a marker'],
    link: '/guide/zoom',
    steps: [
      { cursor: [11, 3] },
      { click: 'marker', line: 11, label: 'click the marker beside Materials' },
      { pause: 1000 },
      { cursor: [3, 8] },
      { key: 'Tab', label: 'Tab still works inside the zoom' },
      { pause: 600 },
      { key: 'Tab', shift: true, label: '⇧Tab' },
      { pause: 700 },
      { zoom: 'out', label: 'and out again' },
      { pause: 600 },
    ],
  },
  {
    id: 'markdown',
    title: 'The file stays markdown',
    blurb:
      'Switch outline mode off and the note is stock Obsidian. Nothing was written to the file that the structure did not already say: no identifiers, no fold state, no forced bullets.',
    keys: ['toggle'],
    link: '/guide/how-notes-become-outlines',
    steps: [
      { pause: 500 },
      { outline: false, label: 'outline mode off: the same markdown, as Obsidian shows it' },
      { pause: 2200 },
      { outline: true, label: 'outline mode on' },
      { pause: 1200 },
    ],
  },
];

/** The playground's single long pass, for a page with one editor. */
export const TOUR: ScriptStep[] = SEQUENCES.flatMap((s) => [{ reset: true } as ScriptStep, ...s.steps, { pause: 800 }]);
