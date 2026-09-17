# Compared to Workflowy and Dynalist

Workflowy is the outliner every other outliner is judged against, and Dynalist is the one Obsidian's makers built before they built Obsidian. Both are cloud outliners: one infinite tree, or documents of trees, in a database the company runs. Dotflowy, an alpha "open-source Workflowy alternative" from 2026, sits in the same family. Checked September 2026.

## What Workflowy got right

- **Editing feel.** Nearly flawless keyboard and selection mechanics: a subtree moves as one, a selection covers nodes, Enter and Tab never surprise. Every outliner since has copied the grammar, ours included.
- **Zoom as the model.** Every node is a place with a URL; the whole product is always zoomed into some part of one document. Zoom is not a feature there, it is the way of navigating.
- **Mirrors.** One bullet living in several places, edited in any of them.
- **Sync that just works, and one price.** Offline caches on every platform, a flat Pro tier, exports to OPML and markdown.

Dynalist added markdown-flavoured formatting, LaTeX, documents in folders and item backlinks, and then its makers left to build Obsidian. It has been in maintenance since 2020, with critical fixes only.

## Where they fall short

- **Not files.** The notes live in Workflowy's database. Export is clean for text but mirrors, backlinks, dates and node identity do not survive it, and there is no local folder to point another tool at. Obsidian's promise, and ours, is the opposite: the files are the notes.
- **Only bullets.** A Workflowy document is a tree of bullets and nothing else. Headings are a style; prose is a bullet. Notes written as documents, with sections and paragraphs, have no place in it.
- **Backlinks without children.** A bullet's references show where it is mentioned, with a breadcrumb, but not what sits under each mention.
- **Dynalist is frozen.** Its own makers say so, and chose a free-form editor for their next product. The gap between the two products is deliberate, and it is the gap this plugin fills.

## What we take from them

The selection model: Shift+Arrow grows a selection one node at a time, repeated Mod+A climbs the tree, a drag across a boundary snaps to whole nodes. Zoom with a trail. The insistence that interaction polish matters more than feature count.

## What we leave aside

A database as the source of truth. Mirrors, until they can exist without writing identifiers into notes. The single infinite document; a vault is many notes, and each is its own outline.

## Head to head

| | Workflowy | Dynalist | Obsidian + True Outliner |
| --- | --- | --- | --- |
| Notes are plain files | – | – | ✓ |
| Nodes | bullets | bullets | every markdown block |
| Subtree moves, selection by node, zoom, fold | ✓ | ✓ | ✓ |
| Mirrors | ✓ | – | not yet, and never via IDs in files |
| Backlinks with structure | breadcrumb only | list only | ancestors and children |
| Offline | cached | cached | native |
| Price | free to 100 nodes/month, then $6.99/mo | free, Pro $7.99/mo | free; Obsidian free for personal use |
| Status | active | maintenance since 2020 | early preview |

## Switching

Workflowy and Dynalist export OPML and markdown. Imported into a vault as nested lists, every document becomes an outline on arrival, and the sections and paragraphs written since become nodes too.
