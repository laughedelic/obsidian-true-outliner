# Compared to Anytype

Anytype is a local-first, end-to-end encrypted "knowledge operating system": objects with types and relations, a Notion-like block editor, and peer-to-peer sync with an optional self-hosted node. Its data is on the device, in an encrypted store of its own. Checked September 2026.

## What Anytype got right

- **Local first, for real.** The data is on the device, encrypted, synced device to device without an account that owns it. The sync libraries are MIT.
- **Types and relations as a graph.** Objects, relations between them, sets and collections: a data model, not just pages.
- **Self-hosting** for the sync node, for those who want their own infrastructure.

## Where it falls short

- **Local, but not files.** The store is Anytype's own format; markdown and JSON are exports, and the object graph flattens on the way out. Local-first and file-over-app are not the same promise.
- **A block editor, not an outliner.** Blocks indent and drag, toggles fold, but there is no zoom, no node-level grammar for Enter and Tab across kinds, and structure lives in the block tree rather than the text.
- **Source available, not open.** The client is under a source-available licence, which limits independent audit of the code that handles the encryption.

## What we take from it

Seriousness about where data lives and who can read it. Obsidian's answer is simpler: the files are on disk, readable by anything, and the vault syncs by whatever syncs a folder.

## What we leave aside

A private store, encrypted or not. Objects as the primary unit.

## Head to head

| | Anytype | Obsidian + True Outliner |
| --- | --- | --- |
| Notes are plain files | –, local encrypted store | ✓ |
| Nodes | typed objects with blocks | every markdown block |
| Subtree moves, selection by block | ✓ | ✓ |
| Zoom | – | ✓ |
| Fold, remembered | toggle blocks | any node, per note |
| Backlinks with structure | per object | ancestors and children |
| Sync | peer to peer, self-hostable node | any folder sync, or Obsidian Sync |
| Source | source-available client, MIT sync | MIT plugin on closed-source Obsidian |
| Price | free app; paid backup and sync tiers | free |
