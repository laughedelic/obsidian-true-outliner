# Compared to Orca Note

Orca Note is a desktop outliner built to be good at outlining and long-form writing at once: block-level bidirectional links, super tags, queries, a whiteboard, a mind map, a plugin API, an MCP server and a CLI, from the author of many Logseq plugins. Notes stay on the device in Orca's own store; there is no sync, and the free tier stops at a thousand blocks. Checked September 2026.

## What Orca Note got right

- **Outlining and prose together.** Orca set out to be an outliner that does not punish long-form writing, which is the same tension this plugin resolves from the other side.
- **Fine-grained references.** Block-level links and a block graph; the closest reference for what backlinks-with-structure should feel like on a desktop.
- **Extensible from the start.** A plugin API, MCP and a CLI at version one, and releases every few weeks.

## Where it falls short

- **A local database, not files.** The notes are on the device but in Orca's format; markdown is an export, with resources included only since April 2026. The app is closed source, whatever a public repository of issues suggests.
- **No sync.** Paid plans allow three devices, and moving between them is the person's problem.
- **Still bullets first.** Long-form is supported inside the outliner's model rather than the other way round: headings and paragraphs do not become nodes of an existing document.
- **A thousand blocks.** The free tier is a demo; the licence is cheap, but it is a purchase for the format.

## What we take from it

The conviction that outlining and writing are one activity, and that a reference ought to show the tree around it.

## What we leave aside

A private store. A separate app.

## Head to head

| | Orca Note | Obsidian + True Outliner |
| --- | --- | --- |
| Notes are plain files | –, local database | ✓ |
| Nodes | blocks | every markdown block |
| Subtree moves, backlinks with structure, references | ✓ | ✓, references via `^id` |
| Zoom, fold, selection by node | unconfirmed | ✓ |
| Sync | none | any folder sync |
| Platforms | Windows, macOS, Linux, Android | everywhere Obsidian runs |
| Price | free to 1,000 blocks; $39.99/yr or $99.99 once | free |
| Source | closed | MIT plugin on closed-source Obsidian |
