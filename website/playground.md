---
title: Playground
sidebar: false
---

<script setup>
const doc = `# Kitchen renovation

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

const script = [
  { cursor: [17, 10] },
  { say: 'Shift+Tab outdents the item; its sibling follows as a child' },
  { key: 'Tab', shift: true },
  { key: 'Tab' },
  { cursor: [9, 21] },
  { key: 'Enter' },
  { type: 'and grout' },
  { cursor: [15, 4] },
  { key: 'ArrowDown', shift: true },
  { key: 'ArrowDown', shift: true },
  { key: 'a', mod: true },
  { key: 'a', mod: true },
  { cursor: [4, 3] },
  { click: 'marker', line: 4 },
  { pause: 1200 },
];
</script>

# Playground

<OutlineDemo :doc="doc" :script="script" source caption="A live editor running the plugin's own extensions." hint="Try <kbd>Tab</kbd>, <kbd>Enter</kbd>, <kbd>⇧↓</kbd>, <kbd>⌘A</kbd>, or click a marker." />
