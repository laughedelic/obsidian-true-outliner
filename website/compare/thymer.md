# Compared to Thymer

Thymer calls itself the IDE for tasks, notes and planning: an outliner that is also a long-form editor.

- Transclusions, backreferences and queries.
- Split panes and a command palette.
- JavaScript plugins.
- End-to-end encrypted collaboration.
- A promised two-way "markdown mirror" of the workspace on disk.

It is in alpha with no beta date and no announced price.

Checked September 2026.

## What Thymer got right

Thymer treats outlining and writing as one surface, and it plans for the day a person leaves.

- **Keyboard first, outliner and document at once.** Thymer treats the outliner and the long-form editor as one surface rather than a mode, which is what this plugin does with headings and paragraphs.
- **An honest eject story.** Few cloud apps say out loud that leaving should be easy.
	- Self-hosting as a single file.
	- An "ejectable" sync server.
	- A mirror of the workspace as plain markdown, with properties as front matter.
- **Plugins and an MCP server from the alpha.**

## Where it falls short

The plain files are not there yet, and everything else is new and unfinished.

- **The mirror is a promise.** The workspace is a cloud store, encrypted and cached offline.
	- The markdown on disk is a projection that was still on a waitlist when checked, and a projection is not the source.
	- In a vault the file is the note.
- **Alpha.** No beta, no price, a licence unstated.
	- Notes in an alpha's format wait on that alpha.
- **Its own everything.** A new editor, a new sync, a new plugin system, all to be rebuilt to Obsidian's level.

## What we take from it

Two convictions:

- A keyboard-driven outliner and a writing editor are one tool.
- The plain-files story is table stakes, not a feature.

## What we leave aside

A store with a mirror. Obsidian's vault is already the mirror, with nothing behind it.

## Head to head

| | Thymer | Obsidian + True Outliner |
| --- | --- | --- |
| Notes are plain files | mirror planned | ✓ |
| Nodes | blocks and outline items | every markdown block |
| Subtree moves, selection by node, zoom, fold | ✓ | ✓ |
| Transclusion | ✓ | Obsidian's embeds |
| Backlinks with structure | ✓ | ✓ |
| Collaboration | ✓, encrypted | not built in; Obsidian Sync or a shared folder |
| Plugins | JavaScript | Obsidian's 4,000+ |
| Status | alpha | early preview |
