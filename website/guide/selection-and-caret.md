# Selection and the caret

In outline mode the caret lives in **content space**: the characters that belong to nodes. Blank lines, list markers and the indentation before them are chrome, and the caret never stops on them. Selections follow the same rule: a selection either lives inside one node, or it covers whole nodes. There is no in-between, which is what makes a deletion safe.

## Where the caret can go

- **Arrow left and right** skip over markers and blank lines. Pressing Left at the first character of a list item lands at the end of the previous node's content, not on the bullet. Inside a line, movement is the native one, including right-to-left text and multi-character glyphs.
- **Arrow up and down** move by visual line, keep the goal column, and cross a blank line in one press instead of stopping on it.
- **Home** and **End** move to the start and end of the current line's content. On a wrapped line they move within the raw line, in one step, with no further escalation on a second press.
- **A click** on a blank line or on a marker lands on the nearest content: a blank line belongs to the node above it, a marker to the line it starts.
- **Inside an atom** (code block, table, callout) the caret is native.

Outside outline mode every one of these is byte-for-byte native.

## Selections snap to nodes

A selection made inside one node, by mouse or keyboard, is a normal character selection and is left alone.

A selection that reaches across a node boundary, or into a node's trailing blank lines, **escalates**: it grows outward until it covers whole subtrees. Escalation only ever grows the selection, never shrinks it, and keeps its direction, so Shift+Arrow keeps working from the same anchor. It applies to every way a selection can be made, including a mouse drag, a double-click and a programmatic selection, and to every range of a multi-range selection.

A selection that covers whole nodes is drawn as a **block**: one shaded band per covered subtree, anchored one level in from the covered root's column, instead of the native per-character highlight. That is the signal that Tab, Shift+Tab, the move commands, Delete and Cut will act on those nodes as units.

## Growing a selection one node at a time

| Key | Action |
| --- | --- |
| **Shift+ArrowDown** | Extend the selection to cover the next node |
| **Shift+ArrowUp** | Extend the selection to cover the previous node |

Inside a single node, Shift+Arrow is the ordinary character-wise extension. The first press that would leave the node instead covers the whole node, and every further press adds or removes one node's cover. The sequence is symmetric: pressing the opposite direction shrinks the selection again along the same path.

## Progressive Select All

**Mod+A** climbs a ladder rather than selecting the whole note at once. Each press selects the next larger unit that contains the current selection:

1. The node's own content. For a list item this excludes the marker.
2. The node with its whole subtree and the blank lines it owns.
3. The run of siblings at that level.
4. The parent's subtree and its siblings, and so on outward, one ancestor per press.
5. The whole outline.
6. Native Select All, which also takes front matter.

The ladder is derived from the current selection alone, so it works after a click, after Shift+Arrow, and after undo, and it never remembers a previous press. With several carets, each range climbs its own ladder.

## Where selection and structure meet

- **Tab, Shift+Tab, Move up and Move down** act on every subtree a block selection covers, in one transaction, and the selection survives as the cover of the moved nodes. Upward and downward selections produce the same result. A group operation is accepted whole or refused whole, with one cue.
- **Delete, Backspace, Cut and typing** over a block selection remove every covered subtree with its blank lines, as one undo step. See [editing across node boundaries](./structural-editing#editing-across-node-boundaries).
- **Enter** over a selection removes it first, then splits.
- **Zoom in** with a selection zooms into the first covered root.

## Multiple carets

The structural keys and the content-space motion keys decline when there is more than one caret, and the native behaviour runs instead. Shift+Arrow extension and Mod+A handle every range. Most other things, including escalation and block rendering, work per range.
