# Block-selection chrome on a list-item root: where its left edge went

Measured 12 September 2026 against `ebac7e7`, Obsidian 1.13 under the e2e harness.

`escalated-selection-decoration` states that a block selection's left edge sits one level
shallower than the covered root's own column — the column the root's parent draws its guide at.
The report from real-vault use: on a list item the edge runs all the way to the view edge, over
every guide, full width.

## The reproduction

```
# H

- a
  - b
    - c
  - d
- e
```

Cursor in `b`, Mod-A twice. The selection is `b`'s subtree (`b` and `c`); the chrome starts left
of `H`'s guide, at the content area's edge.

| line | `--to-selected-left` as emitted | resolved `::before` left | edge lands at |
| --- | --- | --- | --- |
| `  - b` (root) | `calc(calc(calc(1 * unit) - unit) - (calc(1 * unit)))` | −32 px | the content area's left edge |
| `    - c` | the same | −32 px | the same |

Without the heading — `- a` at the top level, `b` selected — the variable reads
`calc(calc(0px - unit) - (0px))`: again one unit past the origin, again the view edge.
Rooting the selection at `c` gives the same edge as rooting it at `b`. The edge does not move
with the root's depth at all.

## The mechanism

The root target has two branches. Every non-list kind takes `(depth − 1) × unit`. A list item
takes its own box shift less one unit, and a list item's box shift is `supplementalDepth × unit`,
where `supplementalDepth` is the depth of the LIST'S ROOT ITEM — the same value for every item in
one list (`decorate.ts`). So every root in a list anchors one level out from the top of its
list, and a nested bullet reaches past its own ancestors' guides. A top-level bullet is right by
coincidence: its own depth and its list's root depth are both 0.

The branch dates from the change that introduced the chrome, when list indentation was left to
Obsidian and a list item had no column on the outline grid. `lists-on-the-outline-grid` put list
items on the same `depth × unit` grid as every other kind and gave list-item ancestors guides;
the guide layer on the same lines already draws `b`'s parent guide at `depth × unit`. The chrome
branch was not revisited.

The e2e suite never made a list item a cover root — every root is a heading or a paragraph — and
its mixed-depth case explains why in a comment that states the retired premise: "a list item's
own additive shift is 0 … a pure-list mixed-depth cover anchors identically either way and would
prove nothing".

## What follows

One formula for every kind, `(depth − 1) × unit`, is the fix: the per-line subtraction of the
line's own box shift already handles a list line's box being shifted by the list root's depth.
For the fixture above that puts `b`'s edge at `a`'s guide, `c`'s at `b`'s, and a top-level
bullet's one unit out from the origin, like a top-level heading's. Nothing changes for a
non-list root, and nothing changes for the descendants' side of the formula.
