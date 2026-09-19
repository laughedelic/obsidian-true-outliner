# Compared to Capacities

Capacities is an object-based note app.

- Every note has a type with properties.
- Daily notes are the front door.
- The editor is a block editor with an outliner mode that can be switched on.

Notes live in Capacities' cloud, with an explicit promise that they can be exported at any time.

Checked September 2026.

## What Capacities got right

Capacities gives notes a shape without a database UI, and it is honest about the way out.

- **Objects with properties, without a database UI.** A person, a book, a meeting each has its shape, and the shape is filled in while writing.
	- Obsidian's properties and Bases reach the same place from files.
- **Honest export.** The promise is written down and kept.
	- The whole space exports as markdown with front matter and human-readable names.
	- Links are rewritten to work locally, and media is included.
- **Backlinks with their path.** Nested backlinks can show the full path above them.

## Where it falls short

The working copy is in the cloud, and the outlining is a mode of a block editor.

- **Cloud only.** The export is good, and it is still an export.
	- The working copy is Capacities'.
	- Scheduled backups only run while the app is open.
	- Some formatting has been reported lost on page export.
- **Outlining is a mode.** Blocks indent, and children can collapse once a toggle style is chosen.
	- There is no zoom, and no node-level selection grammar across kinds.
	- The structure lives in the block tree rather than in the text.
- **Not a document's own structure.** As with Notion, a block is a child because it was placed there.
	- Markdown's headings and paragraphs carry no weight.

## What we take from it

Two convictions, one of which Obsidian settles for us:

- Structured notes and daily notes belong together.
- An export promise should be explicit.
	- Obsidian makes it moot, because there is nothing to export from.

## What we leave aside

Both are consequences of keeping notes as files:

- A hosted store.
- Objects as the primary unit.
	- A note is the unit, and its blocks are the tree.

## Head to head

| | Capacities | Obsidian + True Outliner |
| --- | --- | --- |
| Notes are plain files | –, exportable | ✓ |
| Nodes | typed objects with blocks | every markdown block |
| Subtree moves, selection by block | ✓ | ✓ |
| Zoom | – | ✓ |
| Fold, remembered | bullet toggle style | any node, per note |
| Backlinks with structure | path above | ancestors and children |
| Structured data | object types and properties | properties, Dataview, Bases |
| Offline | – | native |
| Price | free; Pro $9.99/mo | free |
