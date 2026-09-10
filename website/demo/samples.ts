/**
 * The notes and keystroke scripts the landing page and the guide pages run in
 * their live editors. Line numbers in a script are zero-based positions in
 * the note it runs against; a script that changes the line count places its
 * later steps against the note as it stands at that point.
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

/** The front page's opening tour: one pass through the gestures. */
export const TOUR: ScriptStep[] = [
  { cursor: [16, 12] },
  { key: 'Tab', shift: true, label: '⇧Tab  outdent, the sibling below becomes a child' },
  { pause: 500 },
  { key: 'Tab', label: 'Tab  indent, the subtree comes along' },
  { pause: 400 },
  { cursor: [15, 6] },
  { key: 'ArrowDown', shift: true, label: '⇧↓  select the node' },
  { key: 'ArrowDown', shift: true, label: '⇧↓  and the next one' },
  { key: 'a', mod: true, label: '⌘A  the whole list' },
  { key: 'a', mod: true, label: '⌘A  the whole section' },
  { cursor: [8, 15] },
  { key: 'Enter', label: '↵  split an item; the list renumbers' },
  { pause: 400 },
  { cursor: [4, 3] },
  { click: 'marker', line: 4, label: 'click a marker to zoom in' },
  { pause: 1800 },
  { zoom: 'out', label: 'and back out' },
  { pause: 600 },
  { outline: false, label: 'outline mode off: the same markdown, stock Obsidian' },
  { pause: 1800 },
  { outline: true, label: 'outline mode on' },
];

export const MOVE_SCRIPT: ScriptStep[] = [
  { cursor: [16, 12] },
  { key: 'Tab', shift: true, label: '⇧Tab' },
  { pause: 500 },
  { key: 'Tab', label: 'Tab' },
  { pause: 500 },
  { cursor: [11, 5] },
  { key: 'ArrowUp', mod: true, shift: true, label: '⌘⇧↑  move the section up' },
  { pause: 700 },
  { key: 'ArrowDown', mod: true, shift: true, label: '⌘⇧↓  and back' },
  { pause: 500 },
  { key: 'Tab', label: 'Tab on a heading: one level deeper, the section with it' },
  { pause: 700 },
  { key: 'Tab', shift: true, label: '⇧Tab' },
];

export const SPLIT_SCRIPT: ScriptStep[] = [
  { cursor: [8, 15] },
  { key: 'Enter', label: '↵  split mid-item' },
  { pause: 500 },
  { cursor: [10, 11] },
  { key: 'Enter', label: '↵  at the end: a new item' },
  { type: 'counters last' },
  { key: 'Enter', label: '↵  again' },
  { key: 'Enter', label: '↵  on an empty item: leave the list' },
  { type: 'Measured after the cabinets go in.' },
  { pause: 600 },
  { cursor: [13, 0] },
  { key: 'Backspace', label: '⌫  at the first character: join with the node above' },
];

export const SELECT_SCRIPT: ScriptStep[] = [
  { cursor: [15, 6] },
  { key: 'ArrowDown', shift: true, label: '⇧↓  one node' },
  { key: 'ArrowDown', shift: true, label: '⇧↓  two' },
  { key: 'ArrowUp', shift: true, label: '⇧↑  back to one' },
  { pause: 400 },
  { key: 'a', mod: true, label: '⌘A  the item' },
  { key: 'a', mod: true, label: '⌘A  the list' },
  { key: 'a', mod: true, label: '⌘A  the section' },
  { key: 'a', mod: true, label: '⌘A  the note' },
  { pause: 500 },
  { select: [[16, 5], [17, 8]] },
  { pause: 200, label: 'a drag across two items snaps to both' },
  { pause: 900 },
];

export const ZOOM_SCRIPT: ScriptStep[] = [
  { cursor: [11, 3] },
  { click: 'marker', line: 11, label: 'click the marker beside Materials' },
  { pause: 900 },
  { cursor: [3, 8] },
  { key: 'Tab', label: 'Tab still works inside the zoom' },
  { pause: 700 },
  { key: 'Tab', shift: true, label: '⇧Tab' },
  { pause: 600 },
  { zoom: 'out', label: 'zoom out' },
];

export const TOGGLE_SCRIPT: ScriptStep[] = [
  { pause: 600 },
  { outline: false, label: 'outline mode off' },
  { pause: 1800 },
  { outline: true, label: 'outline mode on' },
  { pause: 1200 },
];

export const MIXED = `# Trail race training

Twelve weeks to the Ridge 30K. The plan is in three blocks, each one ending in a long run on the course.

## Block 1 · base

Easy volume, one strides session a week.

- Mon: rest
- Tue: 45 min easy + 6 × 20 s strides
- Thu: 60 min hills
	- keep the effort conversational on the climbs
	- walk the steepest pitch, no ego
- Sat: long run, 90 min

> [!tip] Fuel on every long run, even the short ones.

## Block 2 · strength

- [ ] book the physio
- [x] new shoes broken in

\`\`\`
week  Mon  Tue  Thu  Sat
5     -    45   60   100
6     -    50   65   110
\`\`\`
`;

export const GRID_SCRIPT: ScriptStep[] = [
  { cursor: [2, 10] },
  { pause: 900 },
  { cursor: [10, 5] },
  { pause: 900 },
  { cursor: [11, 10] },
  { pause: 900 },
  { cursor: [17, 8] },
  { pause: 900 },
  { cursor: [21, 5] },
  { pause: 900 },
];
