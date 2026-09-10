# Zoom

Zoom shows one node and its subtree as if it were the whole note. Everything outside it disappears from view, a breadcrumb trail above the content says where the view is, and editing works exactly as before, confined to what is visible. It is the outliner gesture for "let me focus on this section" or "hoist this item", and it works on any node: a heading with its section, a list item with its children, a lone paragraph.

Zoom is a view state, not an edit. It never changes the note, and it is never saved: closing the tab or switching to another note forgets it.

## Zooming in

| How | Where |
| --- | --- |
| **Click the node's marker** | The icon in the gutter beside a heading or paragraph, or a list item's bullet or number |
| **Zoom in to node** | Command palette, or the editor's right-click menu |
| A hotkey | None is assigned by default; every plausible one is already taken by Obsidian or a common plugin. Assign one under Settings → Hotkeys |

A click on a marker only zooms: it does not move the caret, start a selection or fold. Holding a modifier (Mod, Shift, Alt) while clicking leaves the click to Obsidian, so link-following and multi-caret gestures keep working. Task items are the one exception: their mark is Obsidian's own checkbox, which keeps doing what a checkbox does, so a task is zoomed from the command, the menu or a hotkey.

With the caret in a node, the command zooms into that node. With a selection covering several nodes, it zooms into the first one.

<Clip name="zoom-in-out" caption="A click on a heading's marker zooms to its section, a click on a bullet zooms to that item, and the commands step back out." />

## While zoomed

- **The trail.** Above the content, in the note's own text size: the note's name, then each ancestor of the zoomed node from the outermost inward. Each crumb shows that ancestor's marker and its text, rendered live, with heading `#`, quote `>` and task boxes stripped. Clicking an ancestor re-zooms to it. Clicking the note's name, or the small marker at the start of the trail, zooms all the way out.
- **Depth restarts.** The zoomed node sits at the left edge and its children one level in, with guides drawn from there, so a deeply nested item reads like a top-level one.
- **Editing is confined.** The caret, Shift+Arrow, Select All and every structural key stay inside the visible subtree. A split, move, outdent or paste whose result would fall outside it is refused with *That would move it outside the zoomed view*. Clicking below the last visible line puts the caret on the last visible line, not on hidden text.
- **The view starts at the top**, with the editor focused and the caret where it was if that is still visible, otherwise on the zoomed node. A folded subtree is unfolded when it becomes the zoom root; folds elsewhere are left alone.
- **The backlinks footer** keeps rendering under the zoomed content.

<Shot name="zoom" alt="The Materials section zoomed in, with the breadcrumb trail above it" caption="Zoomed into Materials: the trail names the note and the heading above, and the section sits at the left edge." />

## Zooming out

| How | Effect |
| --- | --- |
| **Zoom out one level** (command) | The parent becomes the zoom root. From a top-level node it clears the zoom. |
| **Zoom out fully** (command, or the right-click menu while zoomed) | Back to the whole note. |
| Click the note's name in the trail | Same as Zoom out fully. |
| Click an ancestor in the trail | Zoom to that ancestor. |

Zooming out scrolls the node that was just left back into view.

## When zoom clears itself

Zoom clears on its own in three situations, so the view never shows something that is no longer true:

- The zoomed node and its whole subtree are deleted.
- A change that did not come from this editor's keyboard, such as an undo, sync from another device, an edit in another pane or in another app, puts content outside the zoomed subtree.
- Outline mode is switched off in that tab.
