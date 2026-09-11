# Compared to other outliners

True Outliner borrows freely from the outliners that came before it, and this page is honest about where it stands next to them. Two questions organise the comparison: where the notes live, and whether the structure is enforced.

## Where the notes live

Every outliner picks a source of truth, and the choice decides most of what follows.

| Source of truth | Apps | What it buys | What it costs |
| --- | --- | --- | --- |
| **A database** | Roam Research, Tana, Orca Note, Logseq DB | Stable node identity, block references, queries, mirrors come easily | The notes are only fully readable inside the app; export is an afterthought; the app's future is the notes' future |
| **Plain markdown files** | Logseq OG, outl, Obsidian | The notes outlive the app, work with every other tool, sync any way at all | Node identity, metadata and performance at scale are hard, and the temptation is to solve them by writing things into the files |

An Obsidian plugin does not get to choose: the markdown files in the vault are the source of truth, and any outliner that lives in Obsidian has to keep them clean. True Outliner's answer is to keep **nothing** in the files beyond what the structure already says: no IDs, no fold markers, no forced bullets. The tree is read from the markdown that is already there, and written back byte for byte.

## The reference apps

**[Workflowy](https://workflowy.com)** is the benchmark for editing feel: one infinite outline, always zoomed into some part of it, with keyboard and selection mechanics that every later outliner is judged against. True Outliner's selection model, its Select All ladder and its zoom are shaped by Workflowy's. Workflowy's notes live in its cloud, in its format.

**[Roam Research](https://roamresearch.com)** popularised block references, daily notes and structured backlinks, and its block-manipulation shortcuts remain among the tightest anywhere. The [structured backlinks footer](./backlinks) is a direct descendant of Roam's grouped, breadcrumbed, filterable references. Roam is a database in a browser.

**[Logseq](https://logseq.com)** proved that a true outliner can sit on top of markdown files, and paid for the details. To keep node identity it writes `id::` lines into the notes when a block is referenced, `collapsed::` when a block is folded, and a bullet on every line; files round-trip poorly with other tools, and a whole Obsidian plugin exists to clean Logseq artifacts out of shared vaults. After years on a database rewrite, Logseq split into two products in April 2026: the file-based version in maintenance, and a database-first successor. True Outliner keeps Logseq's ambition and drops the in-file metadata: fold state and everything else the outliner needs to remember will live in plugin data, never in the note.

**[Tana](https://tana.inc)** turns every node into a typed object with fields, which makes the outline queryable. It is a database, and in March 2026 it split too, keeping a standalone Tana Outliner for the people who came for the outlining. That audience is who True Outliner is for.

**[Orca Note](https://orca-studio.com/orcanote/)** is a local-first, block-based outliner with fine-grained bidirectional links, super tags, and a plugin API. Its notes live in its own database, and the free tier stops at a thousand blocks. It is the closest reference for what backlinks-with-structure should feel like.

**[outl](https://outl.app)** is the modern minimal answer: an open-source outliner where plain markdown is the source of truth and the sync identifiers live in a sidecar file, so the `.md` stays exactly what was written. That is the same instinct True Outliner runs on, applied inside Obsidian instead of in a new app.

**[Org-mode](https://orgmode.org)** is the oldest living relative. Its heading tree supports promote, demote, move, fold and narrow as first-class operations on a plain-text file, and `org-indent-mode` draws the hierarchy as indentation without touching the file. True Outliner's heading behaviour (Tab changes level, the subtree follows), its zoom (narrowing) and its outline grid are org-mode's ideas generalised to any markdown note. Where org-mode treats body text as the content of a heading, True Outliner makes every paragraph and list item a node of its own.

## Inside Obsidian

Obsidian's makers built Dynalist, one of the best outliners of its generation, and then chose a free-form editor for Obsidian. The gap is deliberate, and several plugins fill parts of it.

**[Outliner](https://github.com/vslinko/obsidian-outliner)** is the incumbent: move items with their children, indent and outdent, smarter Enter and Tab, folding shortcuts, drag and drop, indent guides, all on public APIs and maintained for years. What it does not do is enforce anything. Selections are raw text spans, its own README lists multi-line manipulation as unsupported, and a careless select-and-delete still shreds the structure. It also only knows about lists: headings and paragraphs are not part of its outline. **[Zoom](https://github.com/vslinko/obsidian-zoom)** by the same author adds hoisting for a list subtree and proved that zoom can be built on public APIs alone. **[Pro Outliner](https://github.com/mrkhachaturov/obsidian-pro-outliner)** merges the two and adds Workflowy-style selection expansion and mirrors. **[bullet](https://github.com/kdnk/obsidian-bullet)** is an actively maintained fork with vim integration.

**[Workflowy-style outline](https://github.com/springrain1/workflowy-style-outline)** takes the other road: a separate block editor that replaces Obsidian's for a note. It is feature-rich, but its conversion is lossy: ordered lists become bullets, headings and paragraphs are folded into opaque blobs, blank lines are dropped, and toggling a note in and out of the view can rewrite the file.

**[Influx](https://github.com/jensmtg/influx)**, **[Coalesce](https://github.com/bfloydd/coalesce)** and **[Better Search Views](https://github.com/ivan-lednev/better-search-views)** each show backlinks with more context than Obsidian's own pane, the last of them by patching Obsidian's internals and breaking periodically as a result.

What none of them provide, alone or together, is editing that works on the tree for every operation, node-level selection as the primary model, first-class headings and paragraphs, and one coherent product instead of an outliner plus a zoom plugin plus a backlinks plugin plus styling snippets, each with its own settings and conflicts.

## Feature by feature

What defines a true outliner, and where True Outliner stands today.

| Behaviour | True Outliner |
| --- | --- |
| Every block is a node; operations act on nodes and carry the subtree | ✓ Headings, paragraphs, list items, code, tables and callouts alike |
| Selection, paste and deletion respect node boundaries | ✓ On every edit |
| Enter, Shift+Enter, Tab, Shift+Tab, Backspace-at-start, empty-item outdent, move up and down | ✓ |
| Selection escalates to whole nodes; Select All climbs a ladder; block selections render as blocks | ✓ |
| Zoom into any node with breadcrumbs | ✓ Any node kind |
| Structured backlinks with ancestors and children | ✓ Read-only |
| Undo restores structure and caret together | ✓ |
| Multiline nodes and inline formatting | ✓ Obsidian's own editor |
| Fold any node, with persistent fold state | ✓ Every node with children; remembered per note in plugin data, never in the file |
| Drag and drop with depth indicators | Not yet |
| Block references and mirrors | Not yet; Obsidian's native block links work as usual |
| Search results with ancestor context | Not yet |
| Editable backlinks | Not yet |

Everything marked "not yet" is on the roadmap. The parts that exist are complete: there is no feature above that works only for lists, or only when the caret is in the right place.
