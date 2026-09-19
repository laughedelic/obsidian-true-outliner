# Compared to Roam Research

Roam popularised block references, daily notes and structured backlinks, and its block-manipulation shortcuts remain among the tightest anywhere. It is a graph database in a browser, at $15 a month with no free tier, and development has slowed. Checked September 2026.

## What Roam got right

- **The block as the unit.** Every bullet is addressable, referenceable, embeddable. `((ref))` and `{{embed}}` made transclusion ordinary.
- **Linked references with structure.** A reference is shown with its breadcrumb and its children, grouped by page, filterable. This is the design our backlinks footer follows most closely.
- **Selection and moves.** Block multi-select, subtree moves, zoom, folding, all keyboard-first and all consistent.

## Where it falls short

- **The notes are on Roam's servers.** No local files; offline is not a strength; JSON is the only lossless export and markdown export turns references into `((uuid))` text. Leaving is a project.
- **Everything is a bullet.** Prose is a bullet, headings are bullet styles. A note is a tree of bullets or it is not a Roam note.
- **The price of the model.** $15 a month, slow development, weak mobile, large graphs slowing down, a small extension ecosystem next to Obsidian's.

## What we take from it

The backlinks design almost whole: grouped by note, the referencing node in its lineage with one level of children, sortable and filterable. The idea that a reference is that page's structure shown here, not a report about it.

## What we leave aside

The database. Block references as the primary mechanism; Obsidian's `^id` links exist and the footer lists them, but identity in our tree is positional and nothing is written to a note to make a reference work. Editable backlinks, which in Obsidian would need a second editor inside the footer; ours is read-only and one click from the source.

## Head to head

| | Roam Research | Obsidian + True Outliner |
| --- | --- | --- |
| Notes are plain files | – | ✓ |
| Nodes | bullets | every markdown block |
| Subtree moves, selection by node, zoom, fold | ✓ | ✓ |
| Block references and embeds | ✓ | Obsidian's `^id` links and embeds |
| Backlinks with structure | ✓, editable | ✓, read-only |
| Offline | limited | native |
| Price | $15/mo, no free tier | free |
| Extensions | Roam Depot | 4,000+ plugins and themes |

## Switching

Roam's JSON export is the faithful one; several community converters turn it into markdown with nested lists. References become links or text depending on the converter. Once in a vault the pages are outlines, and the daily notes are Obsidian's daily notes.
