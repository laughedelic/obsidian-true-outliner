# Compared to Logseq

Logseq is the existence proof and the cautionary tale: it showed that a true outliner can run on markdown files, and in 2026 it stopped. The file-based app became **Logseq OG**, frozen at 1.0.0 in April 2026 with security fixes only, and development moved to a database-first **Logseq** (2.0 beta, July 2026) whose SQLite store is canonical and whose files, where they exist, are a one-way export. Checked September 2026.

## What Logseq got right

- **Roam's model, free and local.** Block references, embeds, daily journals, linked references with breadcrumbs and children, on files a person owns, under an open-source licence, with a large plugin ecosystem. For years it was the answer to "Roam, but mine".
- **Selection and moves by block.** A selection covers blocks; a move takes the subtree; Enter and Tab do what an outliner does. The keyboard grammar is what we aim at.
- **Linked references done properly.** Each reference shown in its tree, grouped by page, filterable. Our backlinks footer is a descendant.

## Where it falls short

- **The files paid for the tree.** To keep block identity across edits and devices, Logseq OG writes `id:: <uuid>` into a note the moment a block is referenced, `collapsed:: true` when it is folded, and a bullet on every line. A note opened anywhere else carries that. The request to keep `collapsed::` out of files was closed; a whole Obsidian plugin exists to clean Logseq artefacts out of shared vaults. Ours keeps identity positional and fold state in plugin data, and writes nothing.
- **Everything is a bullet.** A heading in Logseq is a bullet with a heading property; prose is a bullet. Markdown written elsewhere reads as one flat list. Ours takes headings, paragraphs and lists as they are.
- **The file-based version is over.** Logseq's own team concluded that markdown-as-database, as they had built it, was a dead end, and the successor's export is "standard markdown, no block properties", one way. Whatever a Logseq DB graph becomes, it is not the files.
- **Sync and data loss.** File-based sync had a history of edits not reaching disk; the database beta carries an explicit data-loss warning; sync is a paid tier with the price unannounced. Obsidian's vault syncs by whatever already syncs a folder.

## What we take from it

The whole ambition: a true outliner whose source of truth is markdown a person owns. The linked-references design. The lesson, learned by watching, that node identity must not be bought with metadata in the file.

## What we leave aside

Bullet-only documents. Properties as `key:: value` lines in the note. Fold state in the file. A database behind the files.

## Head to head

| | Logseq OG | Logseq DB | Obsidian + True Outliner |
| --- | --- | --- | --- |
| Notes are plain files | ✓ | export only | ✓ |
| What the outliner writes into them | `id::`, `collapsed::`, bullets | n/a | nothing |
| Headings and paragraphs as nodes | bullets with properties | bullets with properties | ✓ |
| Subtree moves, selection by node, zoom, fold | ✓ | ✓ | ✓ |
| Backlinks with structure | ✓ | ✓ | ✓ |
| Block references and embeds | ✓, writes `id::` | ✓ | Obsidian's `^id` links |
| Sync | file sync, paid Logseq Sync | paid, unannounced | any folder sync, or Obsidian Sync |
| Status | maintenance only | beta | early preview |
| Licence | AGPL-3.0 | AGPL-3.0 | MIT plugin on closed-source Obsidian |

## Switching

A Logseq OG graph is markdown. The `id::` and `collapsed::` lines and the property blocks come along; Obsidian shows them as text. Removing them is a find-and-replace or a cleanup plugin, and after that the notes are ordinary notes and every one of them is an outline.
