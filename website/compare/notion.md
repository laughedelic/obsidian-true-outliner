# Compared to Notion

Notion is the block editor most people have used: pages of nested blocks, databases with views, and collaboration for teams, on Notion's servers. It is not an outliner, but its blocks nest and move, and it is where many people first met the idea of a document as a tree of movable parts.

Checked September 2026.

## What Notion got right

Notion taught a wide audience to think of a document as blocks.

- **Blocks that move.** Tab nests a block under the one above and its children follow; a block can be selected, dragged, turned into a page.
	- The mental model of a document as parts, not lines, is Notion's gift to everyone after it.
- **Synced blocks.** One block in several pages, edited in any.
- **Databases in the document.** Structure and prose in one place, which Obsidian answers with properties, Dataview and Bases.

## Where it falls short

The notes are not files, the nesting is not in the text, and the editor is not an outliner.

- **The notes are Notion's.** There are no local files.
	- Offline is a cache of recently opened pages, with edits on stale pages at risk.
	- A workspace export can take a day, and its links expire in a week.
	- Markdown export flattens nested blocks and callouts imperfectly.
	- Obsidian's promise, and ours, is the reverse.
- **Nesting by drag, not by text.** A Notion block is a child because it was dragged there.
	- In markdown a block is a child because of what the text says.
	- That is what lets any tool read the structure, and lets this plugin add none of its own.
- **Not an outliner.** The outliner's tools are missing or partial.
	- No zoom.
	- No node-level keyboard grammar for Enter and Tab across kinds.
	- Folding only inside toggle blocks.
	- Backlinks as a list at the top of a page, without children.
- **Pricing drift.** AI moved into the $18–20 Business tier in early 2026; the free tier is for individuals who do not need much.

## What we take from it

The block as the unit a person thinks in, and the expectation that every block can be selected and moved as one thing.

## What we leave aside

Three things that come with a hosted block database:

- A hosted store.
- Nesting that lives in a database rather than in the text.
- Collaboration as the reason for the product.

## Head to head

| | Notion | Obsidian + True Outliner |
| --- | --- | --- |
| Notes are plain files | – | ✓ |
| Nodes | typed blocks | every markdown block |
| Subtree moves | ✓ | ✓ |
| Selection by node | ✓ | ✓ |
| Zoom | –, turn into page | ✓ |
| Fold, remembered | toggle blocks | any node, per note |
| Backlinks with structure | list at page top | ancestors and children |
| Synced blocks | ✓ | Obsidian's embeds |
| Offline | cached pages | native |
| Price | free; Plus $10/user/mo | free |
