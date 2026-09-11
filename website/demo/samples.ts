/**
 * The note and the keystroke script the front page's live editor and the
 * playground run. Line numbers in a script are zero-based positions in the
 * note; a step that changes the line count places its later steps against
 * the note as it stands at that point.
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
