# Compared to Obsidian's outliner plugins

The closest comparison, because it is the same vault, the same editor and the same files. Four plugins add outlining to Obsidian today:

- **Outliner** and **Zoom** by vslinko.
- **Pro Outliner**, which merges the two and adds mirrors.
- **Workflowy-Style Outline**, which replaces the editor with its own view.

Checked September 2026.

## What they got right

Each of the four proved something we build on.

- **Outliner** proved that Tab, Enter and subtree moves on lists can be done inside Obsidian's own editor on public APIs, and kept it working for years.
	- 1.4 million downloads, releases through June 2026, fold shortcuts, drag and drop, sticky cursor, vertical guides.
	- It is the baseline any outliner in Obsidian is measured against, ours included.
- **Zoom** showed that hoisting a subtree is a CodeMirror decoration problem with a public-API answer.
	- Our zoom uses the same mechanism.
- **Pro Outliner** brought Workflowy's selection expansion to Obsidian, where a selection that crosses items grows to cover them whole, and added breadcrumbs to zoom.
	- Both are things we do too.
- **Workflowy-Style Outline** confirmed what people want inside a node: slash commands, link and tag menus, a mobile toolbar.
	- Its Alt-drag to create a block reference is a lovely gesture.

## Where they fall short

All four stop at lists, and none of them makes delete and paste respect the tree.

- **Lists only.** Every one of them treats a note as a list and the rest as text.
	- A heading is not a node, and a paragraph is not a node.
	- A note with sections, prose and lists, which is most notes, is an outline only in its bulleted parts.
	- Ours makes every block a node, because markdown already says how headings, paragraphs and lists nest.
- **Flat text with keys on top.** Outliner's own README lists "manipulation with multiple lines" as unsupported.
	- Selections are character ranges, so a select-and-delete across two items can leave half of one behind.
	- A move works only when the caret is where the plugin expects.
	- Nothing checks the result is still a tree.
	- Ours works on the tree for every gesture, including delete and paste, and refuses the operations markdown cannot express.
- **Scattered.** Outlining, zoom and structured backlinks are three plugins with three settings pages and their own key conflicts.
	- Zoom last shipped three years ago.
	- Ours is one plugin.
- **Metadata in the file.** Pro Outliner's mirrors and Workflowy-Style's references write `^block-id` markers into notes and repair them when they drift.
	- Ours writes nothing.
- **A second editor.** Workflowy-Style Outline replaces Obsidian's editor for a note, and its conversion is lossy.
	- Ordered lists become bullets, headings and paragraphs become opaque blocks, and blank lines are dropped.
	- Switching the view can rewrite the file.
	- Ours is a set of extensions inside the editor Obsidian ships.

## What we take from them

We take what people's hands already know, and the mechanisms that were proven to work:

- The keyboard grammar people already know from Outliner.
	- Tab and Shift+Tab move subtrees, Mod+Shift+Arrow moves siblings, Enter continues a list, Mod+A grows the selection.
	- The move hotkeys are the same on purpose.
- Zoom's mechanism.
- Pro Outliner's selection expansion, generalised to every node kind.

## What we leave aside

Anything that needs markers in the note or an editor of its own:

- Mirrors implemented through IDs written into notes.
- Drag and drop, for now.
	- It is on the roadmap, without file-side markers.
- A separate editor view.

## Head to head

| | Outliner | Zoom | Pro Outliner | Workflowy-Style | True Outliner |
| --- | --- | --- | --- | --- | --- |
| Nodes | list items | list items, headings | list items | list items | every block |
| Subtree indent and outdent | ✓ | – | ✓ | ✓ | ✓, any kind |
| Selection by node | – | – | expands to items | multi-select | ✓, escalates on any gesture |
| Delete and paste respect the tree | – | – | – | – | ✓ |
| Zoom with breadcrumbs | – | zoom | ✓ | ✓ | ✓, any node |
| Fold | Obsidian's, per device | – | Obsidian's | its own | any node, remembered per note |
| Backlinks with structure | – | – | – | – | ✓ |
| Writes into the file | nothing | nothing | `^id` markers | `^id` markers | nothing |
| Drag and drop | ✓ | – | ✓ | ✓ | not yet |
| Maintained | June 2026 | 2023 | Dec 2025 | 2026 | 2026 |

## Using both

Not at the same time: Outliner, Pro Outliner and True Outliner bind the same keys.

- The plugin shows a notice if it finds one of them enabled.
- The vault needs no change either way: disable one, enable the other, and the notes are untouched.
