# Commands and keys

## Commands

All commands are in the command palette under the **True Outliner** prefix. Except for the toggle, they appear only while the active tab is in outline mode. Assign hotkeys under **Settings → Hotkeys**.

| Command | Default hotkey | What it does |
| --- | --- | --- |
| **Toggle outline mode** | none | Switch the active tab between outline mode and stock Obsidian. Available in any view mode. |
| **Indent node** | none | Move the node at the caret, or every node a block selection covers, one level deeper. Same as Tab. |
| **Outdent node** | none | Move it one level shallower. Same as Shift+Tab. |
| **Move node up** | Mod+Shift+ArrowUp | Swap the node, subtree included, with its previous sibling. |
| **Move node down** | Mod+Shift+ArrowDown | Swap it with its next sibling. |
| **Zoom in to node** | none | Show only the node at the caret, or the first node of a selection, with a breadcrumb trail. |
| **Zoom out one level** | none | Make the zoomed node's parent the zoom root. Only while zoomed. |
| **Zoom out fully** | none | Return to the whole note. Only while zoomed. |
| **Debug: print transaction classification stats** | none | Print diagnostic counters to the developer console. For bug reports. |

**Mod** is Cmd on macOS and Ctrl elsewhere.

## Keys in outline mode

These bindings are part of outline mode and are not rebindable; switch outline mode off to get the native keys back. They apply in Live Preview and source mode, and step aside inside a table cell's editor and when there is more than one caret.

| Key | Action |
| --- | --- |
| **Tab** | Indent the node, or every node a block selection covers |
| **Shift+Tab** | Outdent it |
| **Enter** | Split the node at the caret; on an empty list item, outdent it or leave the list |
| **Shift+Enter** | New line inside the same node; on a heading, a new sibling heading below the section |
| **Mod+A** | Select more: node content, then subtree, then siblings, then each ancestor, then the whole note |
| **Shift+ArrowUp** / **Shift+ArrowDown** | Extend or shrink the selection by one node |
| **ArrowUp** / **ArrowDown** | Move by line, skipping blank lines |
| **ArrowLeft** / **ArrowRight** | Move by character, skipping markers and blank lines |
| **Home** / **End** | Start or end of the current line's content |
| **Backspace** at a node's first character | Join the node onto the content above |
| **Delete** at a node's last character | Pull the next node's content up |
| **Backspace** / **Delete** on an empty position just created by Enter or Shift+Enter | Remove it again |

## Mouse

| Gesture | Action |
| --- | --- |
| **Click a marker** (gutter icon, bullet or number) | Zoom into that node |
| **Click a breadcrumb** in the zoom trail | Zoom to that ancestor; the note's name zooms out fully |
| **Click the backlinks header** | Fold or unfold the footer |
| **Click a backlink row** | Open the source note at that node; Mod+click opens it in a new pane |
| **Right-click the editor** | Enable/Disable outline mode, Zoom in to node, Zoom out fully |
| **Click the ribbon icon** or **status bar chip** | Toggle outline mode |

## Cues

A refused operation shows one of these for about a second and a half, and changes nothing.

| Cue | When |
| --- | --- |
| *No outline node at the cursor.* | The caret is in front matter or somewhere no node owns |
| *Can't outdent past heading level 1.* / *Can't indent past heading level 6.* | A heading at the bound |
| *Nothing above to indent under.* | Tab on a first sibling |
| *Already at the top level.* | Shift+Tab at the top level |
| *Nothing above to move past.* / *Nothing below to move past.* | Move with no sibling in that direction |
| *Markdown can't express that nesting here.* | The destination is inside an atom, or has no encoding |
| *Sections only swap with same-level sections.* | Moving a heading past a heading of another level |
| *Moving works within one level — this selection spans several.* | A block selection across levels was moved |
| *Markdown would nest that under the paragraph instead.* | A move that would leave a list item directly after a paragraph |
| *This block can't be split here.* | Enter on a `---` line or a setext underline |
| *Nothing to act on.* | The selection covers nothing |
| *Can't remove a partial selection — select whole nodes.* | A deletion that cannot be resolved to whole nodes |
| *Nothing here to join with.* | Backspace at the start of the first node |
| *Joining here would leave a node's children without a parent.* | A merge that would orphan children |
| *These blocks can't be joined into one.* | Backspace between two kinds that cannot merge |
| *Markdown can't express that content here.* | A paste whose content has no encoding at the target |
| *Only an empty list item can be unwrapped.* | Enter on an empty item with children that cannot outdent |
| *That would move it outside the zoomed view.* | Any operation whose result would leave the zoom scope |
