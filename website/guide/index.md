# Introduction

True Outliner turns any Obsidian note into an outline: a tree of nodes that can be indented, moved, split, zoomed into and selected as whole units, with every operation working on the tree rather than on lines of text. The file on disk stays plain markdown.

::: warning Early preview
True Outliner is under active development. It is usable today and every feature on this site is real, but the plugin is not yet in Obsidian's community plugin directory, defaults may still change, and a few rough edges are listed under [known limitations](../reference/limitations). Keep backups of anything irreplaceable, as with any plugin that edits notes.
:::

## The idea

Dedicated outliners such as Workflowy, Roam, Logseq and Tana share one invariant: the document is a **tree of nodes**, and every operation, whether typing, selecting, deleting, moving or pasting, respects node boundaries. The structure cannot be malformed by a careless keystroke.

Obsidian's markdown lists have no such invariant. Plugins that add outliner keybindings work on flat text, so the structure is only as safe as the caret's position: a Backspace at the wrong column merges two items, a paste lands half a subtree at the wrong depth, a drag leaves children orphaned.

True Outliner brings the enforced-tree invariant to Obsidian without leaving markdown behind:

- **Any note is an outline.** Every note already has a block structure: headings, paragraphs, list items, code blocks, tables. That structure maps losslessly onto a node tree, so nothing has to be converted and no note is "an outliner note". The tree view is a way of looking at the notes that already exist.
- **Editing works on the tree.** Indent, outdent, move, split, merge, delete and paste all go through the tree: a node carries its children, a selection covers whole nodes, and an edit that would leave children without a parent or text outside the tree is rewritten into the well-formed equivalent or refused with a short cue.
- **The file stays clean.** No front matter, IDs or hidden metadata are needed to make the outliner work. Parsing a note and encoding it back is byte-identical, and every structural edit resolves to the smallest diff that expresses it. Notes keep working with every other tool, plugin and sync method.
- **Public APIs only.** The plugin is built on Obsidian's documented editor and plugin APIs, with no patching of private internals.

## What it looks like

In outline mode a note is drawn on a single indentation grid. Every node kind steps right by the same amount per level, guide lines connect each node to its ancestors, and a small marker in the gutter names each node's kind. The caret only ever sits on content, never on a blank line or a list marker. Tab and Shift+Tab move whole subtrees; Enter splits a node into two; Shift+Arrow grows a selection one node at a time; any node with children folds, and a fold follows the node when it moves; a click on a marker zooms into that node. Below the note, every reference to it from elsewhere in the vault is listed in the tree of the note it came from.

Switch outline mode off and the note is stock Obsidian again, byte for byte.

## Where it works

- Obsidian **1.5.0 or later**, desktop and mobile.
- **Live Preview and source mode.** Reading view renders exactly as Obsidian does; there is no outline chrome there.
- Every markdown note, in any folder, without any preparation.

## Reading this guide

The [Getting started](./getting-started) page covers the first five minutes. [How a note becomes an outline](./how-notes-become-outlines) explains the mapping the rest of the plugin is built on, and is worth reading once because it answers most "why did it do that?" questions. The remaining guide pages each take one feature. The reference section lists every setting, command, key and CSS variable.
