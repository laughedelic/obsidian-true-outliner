# Compared to outl

outl is the app whose stance is closest to ours: an open-source outliner in which plain markdown is the source of truth and nothing is written into the files to keep the tree. Its identifiers live in a sidecar next to each note, a tree CRDT syncs devices peer to peer, and an MCP server hands the notes to a language model. It is in beta, terminal-first, with desktop and mobile clients following. Checked September 2026.

## What outl got right

- **The markdown seen is the markdown written.** No `id::` lines, no HTML comments, no front matter added for the app's sake. Block identity lives in a `.outl` sidecar file and is re-attached after outside edits by matching content. It is the same instinct this plugin runs on.
- **Sync with guarantees.** A tree CRDT with the properties written down: same operations, same tree, in any order, without silent loss. Peer to peer, no account.
- **Fold state out of the file.** Folds live in the operation log, not in the note.
- **Honest comparison pages.** Its "vs" pages say what Roam, Logseq and Obsidian got right before saying what they did not. This section is written in the same spirit.

## Where it falls short

- **Everything is a bullet.** outl's format is an unordered list; headings and paragraphs are not nodes. An Obsidian vault of ordinary notes, with sections and prose, does not fit its tree. Ours takes every block as the markdown says it nests.
- **Its own app.** outl is a new editor, TUI first, with a GUI and mobile clients in beta. Everything Obsidian already has, links, search, properties, canvas, four thousand plugins, would be rebuilt or done without. Ours is a view inside the editor people already use.
- **Sidecars and references.** The `.outl` file beside each note and the `((blk-…))` reference syntax are outl-specific; the markdown is clean, the folder is not quite.
- **Early.** A small project with one maintainer and a beta on every platform.

## What we take from it

The stance, stated as plainly as outl states it: the markdown is the note, and the outliner adds nothing to it. The fold-state-out-of-the-file rule. The comparison format.

## What we leave aside

A separate app. Sidecar files; our identity is positional and needs no file at all. Peer-to-peer sync, because a vault syncs by whatever syncs a folder, and Obsidian Sync exists for those who want it.

## Head to head

| | outl | Obsidian + True Outliner |
| --- | --- | --- |
| Notes are plain files | ✓ | ✓ |
| What the outliner writes | a `.outl` sidecar per note | nothing |
| Nodes | bullets | every markdown block |
| Subtree moves, fold, backlinks with context | ✓ | ✓ |
| Selection by node, zoom | partial, unconfirmed | ✓ |
| Block references and embeds | `((blk-id))`, `!((blk-id))` | Obsidian's `^id` links and embeds |
| Sync | peer-to-peer CRDT | any folder sync, or Obsidian Sync |
| Platforms | TUI; macOS, iOS, Android in beta | everywhere Obsidian runs |
| Licence | MIT | MIT plugin on closed-source Obsidian |

## Using both

An outl workspace is a folder of markdown, and so is a vault. outl reads a vault as bullet lists; True Outliner reads an outl workspace as notes whose lists are outlines and whose sidecars are extra files. The two are not in conflict on disk, only in which one holds the keyboard.
