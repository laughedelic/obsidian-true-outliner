# Where we stand

Every outliner and every note app makes two choices before any feature: where the notes live, and what counts as a node. The pages in this section take one app at a time, and this page is the map.

Each page says four things about its app:

- What it got right.
- Where it falls short for someone who wants outlining on plain files.
- What we took from it.
- What we leave aside.

## The two choices

Each choice has a small number of answers, and every app in this section picked one of them.

- **Where the notes live.** In a database the app owns, or in files the person owns.
	- A database: Roam, Tana, Notion, Logseq DB, Orca Note, Workflowy, Dynalist, Capacities, Reflect.
		- It makes node identity, references and queries easy.
		- It makes the notes only fully readable inside the app.
	- Files: Obsidian, Logseq OG, outl, Octarine.
		- They make the notes outlive the app and work with every other tool.
		- They make identity and metadata hard, which is where the temptation to write things into the files comes from.
- **What counts as a node.** Everything, nothing, or blocks with types.
	- In an outliner everything is a bullet: Workflowy, Roam, Logseq, Tana, outl and Obsidian's outliner plugins all work on list items and nothing else.
	- In a document editor nothing is a node: Obsidian, Octarine, Reflect edit text.
	- Notion, Anytype and Capacities have blocks with types, but blocks that nest by being dragged, not by what the text says.

True Outliner takes the file side of the first choice without compromise, and answers the second differently from everyone: **every block in a markdown note is a node**, heading, paragraph, list item, code, table and callout alike, because markdown already says how they nest.

- Headings nest by level.
- List items nest by indentation.
- A paragraph owns the list under it.

Nothing has to be written into the file to have a tree, so nothing is.

## Obsidian plus the plugin, as one product

The comparison is not the plugin against Roam; it is Obsidian with the plugin against Roam. That is the point of building it as a view rather than as an app:

- **File over app.** The notes are plain markdown in a folder, synced any way at all, opened by any tool, readable in fifty years.
	- It is Obsidian's core promise, kept, because the outliner adds no format of its own.
- **No lock-in and no special syntax.** Turn the plugin off and the note is what it was.
	- There are no `id::` lines, no fold markers, no forced bullets, no metadata block, no export step.
- **Everything Obsidian already does.** Links, backlinks, search, graph, properties, Dataview, templates, publish, canvas, sync, four thousand plugins and themes, desktop and mobile.
	- An outliner built as its own app has to rebuild each of those; one built as a view inherits them.
- **A true outliner all the same.** Nothing of the outliner is given up for the files.
	- Subtree moves wherever the caret is.
	- Selection by node.
	- Fold and zoom on any node.
	- Structured backlinks.
	- A keyboard grammar for Enter and Tab that respects the tree.
	- Enforcement of node boundaries on delete and paste.

The cost of that position is real, and the pages below name it where it applies:

- Node identity is positional, so block references and mirrors are Obsidian's `^id` links rather than a first-class node feature.
- Drag and drop is not built yet.
- The tree is the one markdown can express, which rules out a few arrangements a database would allow.

## At a glance

| | Notes are plain files | Nothing written into files | Nodes beyond bullets | Subtree moves | Selection by node | Zoom | Fold, remembered | Backlinks with structure | Refs and mirrors |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Obsidian + True Outliner** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | via `^id` |
| Obsidian + [Outliner plugin](./obsidian-plugins) | ✓ | ✓ | – | ✓ | – | separate plugin | per device | – | via `^id` |
| [Logseq OG](./logseq) | ✓ | `id::`, `collapsed::` | – | ✓ | ✓ | ✓ | in the file | ✓ | ✓ |
| [Logseq DB](./logseq) | database | – | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| [Workflowy](./workflowy) | cloud | – | – | ✓ | ✓ | ✓ | ✓ | partial | mirrors |
| [Roam](./roam) | cloud | – | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| [Tana Outliner](./tana) | cloud | – | – | ✓ | ✓ | ✓ | ✓ | ✓ | references |
| [outl](./outl) | ✓ | sidecar file | – | ✓ | partial | ? | ✓ | ✓ | ✓ |
| [Orca Note](./orca-note) | local database | – | partial | ✓ | ✓ | ? | ✓ | ✓ | ✓ |
| [Thymer](./thymer) | cloud, mirror planned | – | partial | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| [Notion](./notion) | cloud | – | blocks | ✓ | ✓ | – | partial | partial | synced blocks |
| [Capacities](./capacities) | cloud | – | blocks | ✓ | ✓ | – | partial | ✓ | partial |
| [Anytype](./anytype) | local, encrypted store | – | blocks | ✓ | ✓ | – | partial | partial | partial |
| [Reflect](./reflect) | cloud, encrypted | – | – | ✓ | ? | – | partial | ✓ | – |
| [Org-mode](./org-mode) | ✓ | fold state in file | headings | ✓ | – | narrowing | ✓ | – | ✓ |

"?" marks what we could not confirm. Each page carries its sources and the date it was checked.

## What we took, in one line each

The pages carry the detail; this is the short form.

- From **Workflowy**: the editing feel, the zoom, the idea that every node is a place.
- From **Roam**: structured backlinks, grouped and filterable, each reference in its tree.
- From **Logseq**: the ambition of a true outliner on markdown files, and the lesson of what not to write into them.
- From **Tana**: that the outliner audience is loyal and distinct from the AI-workspace audience.
- From **outl**: the stance that the markdown seen is the markdown written.
- From **org-mode**: promote and demote on headings, narrowing, and drawing hierarchy without touching the file.
- From **Obsidian's Outliner plugin**: proof that Tab and Enter on lists can be done on public APIs, and the list of what flat text cannot do.
