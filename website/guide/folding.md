# Folding

Any node with children folds: a heading with its section, a list item with its nested items, a paragraph with the list it adopted. A folded node hides exactly its subtree and says how much it hides. Folds follow their node when it moves, open when something inside them changes, and are remembered per note without a byte written to the file.

Obsidian's own folding works on headings and list items. Outline mode uses the same underlying mechanism and Obsidian's own chevron, but on the outline's tree, so the rule is the same for every kind of block.

## Folding a node

| How | What |
| --- | --- |
| **Mod+Alt+ArrowUp**, **Fold node** | Fold the node at the caret |
| **Mod+Alt+ArrowDown**, **Unfold node** | Unfold it |
| **Mod+Alt+Period**, **Toggle fold** | Fold or unfold it |
| **Click the chevron** on the node's marker | Toggle it, as in stock Obsidian |
| **Click a guide line** | Fold every child under that guide that has children, or unfold them all if every one is already folded |

From a caret inside a leaf, the commands act on the nearest ancestor that has children, because "collapse this branch" from inside a leaf means the branch the leaf is in. The three default hotkeys were chosen because Obsidian binds nothing to them; rebind them under Settings → Hotkeys. Mod+Alt+ArrowLeft and ArrowRight are Obsidian's own back and forward, which is worth knowing when reaching for the neighbours.

Clicking a guide is the gesture for reading one branch: collapse everything beside it with one click, and open it all again with another.

## The whole note

Four commands in the palette, without default hotkeys: **Fold all nodes**, **Unfold all nodes**, **Fold one level more** and **Fold one level less**. The last two walk the outline's depth in either direction, folding the deepest level still open or unfolding the shallowest level folded. While [zoomed in](./zoom), all four act inside the zoom only.

## What a fold looks like

A folded node keeps its place and its marker; the marker is drawn in a solid weight, and the number of hidden descendants, not just direct children, follows the node's text. Nothing else appears, and nothing moves. The caret never lands inside hidden content: motion keys step over a folded subtree, and a click on it lands on the folded node.

## Folds follow their content

- **Moving a folded node** with Tab, Shift+Tab or the move commands keeps it folded. The fold belongs to the node, not to a line number.
- **Editing inside a folded node** opens the fold, whether the edit is typed, synced from another device or an undo. What was hidden is hidden no longer.
- **Undo** does not fold or unfold on its own, since a fold changes no text. Undoing a move puts the same hidden lines back, and the fold comes back with them.
- **Enter at the end of a folded node** creates the next sibling after the whole hidden subtree, with the fold intact. Enter anywhere else in its text opens the fold first, so the split is visible.
- **Zooming into a folded node** unfolds it, since a zoom root with nothing under it would be empty.

## Remembered per note

With **Remember folds** on (the default), a note reopens with the nodes that were folded when it was left. The state lives in Obsidian's workspace data, the same place Obsidian keeps its own folds, and never in the note: a file is byte-identical however much of it is folded, and reads the same without the plugin. Turn the setting off to open every note fully expanded.

## In the backlinks footer

A reference row in the [structured backlinks](./backlinks) footer folds and unfolds with the same chevron, both ways. That is a control on the footer's own display; it does not touch the source note's folds.
