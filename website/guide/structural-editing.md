# Structural editing

In outline mode the keys that reshape a note act on **nodes**: a node and everything under it moves as one unit, a split produces two well-formed nodes, and an edit that would break the tree is either rewritten into the well-formed equivalent or refused. This page lists the rules. The [mapping page](./how-notes-become-outlines) explains why they are what they are.

Every operation is one undo step, however many lines it touched. Undo restores the note and the caret together.

## Indent and outdent

| Key | Command | Action |
| --- | --- | --- |
| **Tab** | Indent node | Move the node one level deeper |
| **Shift+Tab** | Outdent node | Move the node one level shallower |

The node is the one the caret is in, or every node covered by a [block selection](./selection-and-caret). Its whole subtree travels with it.

**Headings change level.** Tab on `## Budget` makes it `### Budget`, and every heading inside the section shifts one level too; the tree re-derives from the new levels. Shift+Tab does the reverse. A heading first consumes a skipped level (`### Monday` under `# Log` becomes `## Monday`, still inside `Log`) before it leaves its parent. Tab is refused at level 6 and Shift+Tab at level 1.

**Everything else moves between parents.**

- **Tab** makes the node the last child of its previous sibling. With no previous sibling there is nowhere to go and the key is refused (*Nothing above to indent under*).
- **Shift+Tab** makes the node the next sibling of its former parent. Any siblings that followed it under that parent become its own trailing children, because that is the only place markdown can put them. At the top level the key is refused (*Already at the top level*).

A moved node takes the encoding of its new neighbours: a paragraph indented under a paragraph becomes a list item, an item outdented to sit among paragraphs becomes a paragraph, an item that lands in a `1.` list is numbered for its place. Indentation is copied from the siblings at the destination, so a tab-indented note stays tab-indented and a space-indented one stays space-indented. Where there is nothing to copy from, Tab and Shift+Tab use Obsidian's **Indent using tabs** editor setting.

Two placements have no markdown encoding and are refused with *Markdown can't express that nesting here*: nesting something under an atom (a code block, table, callout, quote or `---`), and any move that would leave a list item directly after a paragraph at section level, which markdown would read as the paragraph adopting it.

## Move up and down

| Key | Command | Action |
| --- | --- | --- |
| **Mod+Shift+ArrowUp** | Move node up | Swap with the previous sibling |
| **Mod+Shift+ArrowDown** | Move node down | Swap with the next sibling |

A move swaps the node, subtree included, with its neighbour at the same level. Nothing changes level and nothing is re-encoded, except that a run of ordered items is renumbered. Heading sections swap whole. With no neighbour to swap with the key is refused (*Nothing above to move past*, *Nothing below to move past*).

A swap that would leave a section-level list item directly after a paragraph is refused (*Markdown would nest that under the paragraph instead*), whether it is the moved node or the displaced one that would end up there. Headings only swap with headings of the same level (*Sections only swap with same-level sections*).

These two commands ship with default hotkeys, matching the Outliner plugin and Logseq. Rebind or remove them under Settings → Hotkeys.

## Enter

Enter splits the node at the caret. Where the two halves land depends on where the caret is:

- **At the end of the content** → an empty position below. If the node has children, the new position is inside the node, before its first child; otherwise it is the node's next sibling. Enter at the end of a heading therefore opens a place for the section's first paragraph, and at the end of a heading whose children are list items it creates an empty first item.
- **At the start of the content**, including anywhere inside the marker → an empty position **above**, of the same kind, and the original keeps its children and its level. Enter before `# Hello` gives an empty `# ` line above an untouched `# Hello`; the title is never demoted into a paragraph.
- **In the middle** → the text after the caret becomes a new node. If the node has children, the new node is its first child; otherwise it is the next sibling of the same kind. On a heading the remainder becomes the heading's first child, as a paragraph.

Whitespace right after the split point is dropped. Splitting a task item carries the task box to the new item, unchecked. Splitting an ordered item renumbers the run.

Where the new empty node can be written as markdown, it is: an empty `- ` item in the list's own style, an empty `# ` heading. An empty paragraph has no markdown of its own, so there the caret lands on a blank line that is drawn as the paragraph it will become. Typing creates it; moving away, or pressing Backspace or Delete, removes the blank line again as if Enter had never been pressed. No stray blank lines are left behind.

**An empty list item** does not pile up blank bullets. Enter on an item with no text outdents it, exactly as Shift+Tab would. When it cannot outdent, because it is at the top level or directly under a heading, the marker is removed and the line becomes an empty paragraph. `- [ ]` with nothing after it counts as empty. An empty item that has children and cannot outdent is refused rather than orphaning them.

Enter inside an **atom** does what stock Obsidian does: a new line inside the code block, table or callout. On a `---` line it is refused (*This block can't be split here*).

With a **selection**, Enter first deletes it, character by character within one node or whole subtrees for a block selection, then splits at the caret.

## Shift+Enter

Shift+Enter continues the node instead of splitting it: a new line inside the same paragraph or item, indented to the item's content column so the tree reads it as a continuation and not as a child.

On a **heading**, Shift+Enter inserts a new sibling heading of the same level below the section, carrying whatever text followed the caret. It is the way to add the next section without leaving the current one's title.

## Editing across node boundaries

Ordinary typing inside a node is never touched: a `# ` typed at the start of a paragraph makes it a heading, a `- ` deleted from an item makes it a paragraph. The plugin only steps in when a single edit reaches across a boundary, and then it does one of three things.

**Deleting across nodes deletes whole subtrees.** A deletion whose range crosses a boundary, or exactly covers one or more nodes, removes every covered node together with its children and the blank lines it owns. Text typed over such a selection is inserted where the deletion happened. The caret lands at the end of the node above.

**Backspace and Delete at the edge of a node merge.** Backspace with the caret at the first character of a node's content joins the node onto the end of the nearest content above, even across a blank line, in one keystroke; the joined node's children are re-parented. Delete at the last character pulls the next node's content up. The caret lands at the join, so typing continues where the two texts meet. Where the two kinds cannot be joined, the key is refused: *These blocks can't be joined into one*, *Joining here would leave a node's children without a parent*, or *Nothing here to join with* at the very top of the note.

Backspace inside a marker (inside a heading's `#` run, inside a task's `[ ]`) is ordinary editing and is left alone.

**Pastes with structure land on a boundary.** Pasting or dropping text that parses as more than one block, or as one block with children, splices the parsed subtrees at the nearest node boundary and re-indents them to a valid depth there, keeping their own relative nesting. Pasting a single childless block or plain lines mid-paragraph is untouched. Pasting onto an empty node replaces it. Pasting text that cannot be expressed at the target, for example blocks inside a table, is refused (*Markdown can't express that content here*).

A refused edit leaves the document exactly as it was, adds nothing to the undo history, and shows the cue for a moment. A rewritten edit is one undo step that restores the original bytes.

## Cues

A refused operation shows a short notice for about a second and a half and changes nothing. One cue is shown per operation, not one per node, even when a block selection covers many. The full list of cues is in [Commands and keys](../reference/commands-and-keys#cues).

## Inside a zoom

While [zoomed in](./zoom), every operation is confined to the visible subtree. A split, move, indent or paste whose result would land outside it is refused with *That would move it outside the zoomed view*.
