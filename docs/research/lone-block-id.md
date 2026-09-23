# Lone block ids: what they name, what an embed shows, and what separates them

A block id written on a line of its own — `^t1` under a table, rather than ` ^t1` at the end of a
line — is read by our parser as a paragraph of its own, a sibling of the block before it. Obsidian
never reads it that way: it attaches the id to a block before it. So a structural operation that
moves or deletes the block leaves the id behind, and every link to it starts naming whatever now
precedes it ([#207](https://github.com/laughedelic/obsidian-true-outliner/issues/207)).

This note records what a lone id names in Obsidian, what an embed of it shows, where that differs
from what the outline would call the identified node, which operations separate an id today, and
how far a plugin can control what an embed shows. It extends the seventeen shapes in
`docs/research/zoom-scoped-backlinks` ("What a block id names", on the `feat/zoom-scoped-backlinks`
branch, [#205](https://github.com/laughedelic/obsidian-true-outliner/pull/205)).

Measured 23 September 2026, Obsidian 1.13.7 (installer 1.5.8, Linux container), with the probes in
[`prototypes/lone-block-id-probe/`](prototypes/lone-block-id-probe/): `attachment-probe` reads
`CachedMetadata.blocks`, `embed-probe` renders `![[Note#^id]]` and reads what it shows, and
`ops-probe` runs our parser and operations on `main` at 48ecec3.

## What a lone id names

Each shape is a note of its own. "Names" is the range `CachedMetadata.blocks` gives the id.

| Shape | Names |
| --- | --- |
| heading, blank, `^h2` | the heading line |
| heading, `^h3` directly under | the heading line |
| `***`, blank, `^hr1` | the rule |
| `<div>html</div>`, blank, `^html1` | the html block |
| fence, `^code2` directly under | the fence |
| callout, `^c2` directly under | the callout, the id line included |
| table, two blank lines, `^t3` | the table |
| paragraph, two blank lines, `^p4` | the paragraph |
| table under a heading, blank, `^t6` | the table |
| table, blank, `^t4` followed by three spaces | **nothing** — not an id |
| table, blank, `^t5` with `More text.` directly under it | **nothing** — the two lines are one paragraph |
| paragraph, blank, `^y1`, blank, `^y2` | the paragraph, by `^y2`; `^y1` names nothing |
| `^first` as a note's first line | nothing |
| `- a`, `  - child`, blank, `  ^x1` | item `a`, its child included |
| `- a`, `  - child`, blank, `    ^x2` | `child` |
| `- a`, blank, `  ^x4`, blank, `- b` | item `a` |
| `- a`, blank, `  inner prose`, blank, `  ^x3` | item `a`, not the paragraph |
| `- a`, blank, a table indented under it, blank, `  ^x5` | item `a`, not the table |
| `- a`, blank, a fence indented under it, blank, `  ^x6` | item `a`, not the fence |
| `- a`, blank, `  > quoted`, `  ^x7` directly under | item `a`, not the quote |
| `- a`, `- b`, `^l3` directly under | item `b` |
| `Lead.`, `- a`, `- b`, `^l5` directly under | item `b` |
| `- a`, `- b`, `  - c`, blank, `^l4` | the whole list, `c` included |

Four findings:

- **Outside a list, a lone id names the block that ends right above it**, of every kind: paragraph,
  heading, table, quote, callout, fence, rule and html block. Blank lines between the block and the
  id are skipped, however many there are. A heading, a fence and a callout take the id even with no
  blank line between.
- **Inside a list item, a lone id names the item**, whatever sits between the item's line and the
  id — its child items, a paragraph, a table, a fence, a quote. Only an id indented to a nested
  item's own column names the nested item.
- **Directly under a list, with no blank line, a lone id names the last item** (a lazy continuation
  of it). After a blank line it names the whole list.
- **An id line has to be exact.** Trailing whitespace, or text on the line directly under it, and
  Obsidian registers no id at all. Of two lone ids in a row, only the second is registered.

## What an embed shows

Each shape embedded from a note of its own, `![[Embed target#^id]]`, read from the rendered embed.
Reading view and Live Preview showed the same text for every shape.

| Shape | The embed shows |
| --- | --- |
| `Some prose. ^p1` | the paragraph |
| paragraph, blank, `^p3` | the paragraph |
| table, blank, `^t1` | the table |
| `> quoted`, `^q2` directly under | the quote |
| callout, blank, `^c1` | the callout |
| fence, blank, `^code1` | the fence |
| `## Head ^h1`, then its section | the heading line only |
| `## Head`, blank, `^h2`, then its section | the heading line only |
| `- parent ^li1` with a child and a grandchild | the item, its child and grandchild |
| `Lead. ^lp` with a list under it | `Lead.` only |
| `- a`, `- b`, blank, `^l1` | the list |
| `Lead.`, `- a`, `- b`, `  - nested c`, blank, `^l2` | the list, without `Lead.` |
| `- a`, `- b`, `^l3` directly under | `b` |
| `- item a`, blank, `  ^under-a` | `item a` |
| `- a`, `  - child`, blank, `  ^x1` | `a` and `child` |
| `- a`, blank, `  inner prose`, blank, `  ^x3` | `a` and `inner prose` |
| `- a`, blank, a table under it, blank, `  ^x5` | `a` and the table |

An item's id names the item **with its children** in the embed. The metadata cache disagrees:
`CachedMetadata.blocks` gives `^li1` the item's own line only (`zoom-scoped-backlinks`), while the
post-processor's `getSectionInfo` over the embed reports all three lines and the embed renders
them. What a reader sees is the subtree, which is the outline's own reading of an item.

## Where the outline reads an anchor differently

The outline names nodes, and a node is its own lines plus its subtree. Obsidian names CommonMark
blocks: a list is a block, a heading is one line, and a list after a paragraph is a block of its
own rather than the paragraph's children (`docs/research/list-paragraph-mapping`). The two agree
wherever Obsidian's block is also one of our nodes, and differ in four shapes:

| Shape | Obsidian's embed | The outline's node |
| --- | --- | --- |
| `Lead.`, a list, blank, `^l2` | the list, without `Lead.` | `Lead.` and the list are one node; no node is the list alone |
| `Lead. ^lp` with a list under it | `Lead.` | `Lead.` with the list |
| `## Head ^h1`, or a lone id after a heading | the heading line | the heading's whole section |
| `- a`, `- b`, blank, `^l1` | the list | no node is the list; by position the id follows `b` |

The first and last are disagreements about WHICH node, and no node matches Obsidian's reading. The
middle two are disagreements about how MUCH of one node, and the node the id sits in is the right
one.

## Which operations separate a lone id today

`ops-probe` runs each operation on the node holding the named block and reports the content line
the id then follows. An operation keeps the id when that line still belongs to the named block; a
deletion keeps it when the id goes with the block. "Copy" is the node's subtree cover, which is
what a block selection selects and so what a copy or a cut takes.

| Shape | Move up | Move down | Indent | Outdent | Delete | Copy |
| --- | --- | --- | --- | --- | --- | --- |
| paragraph, blank, `^p3` | separated | separated | kept¹ | refused | left behind | outside |
| table, blank, `^t1` | separated | separated | refused | refused | left behind | outside |
| table, `^t2` directly under | separated | separated | refused | refused | left behind | outside |
| quote, `^q2` directly under | separated | separated | refused | refused | left behind | outside |
| callout, blank, `^c1` | separated | separated | refused | refused | left behind | outside |
| fence, blank, `^code1` | separated | separated | refused | refused | left behind | outside |
| `- a`, `- b`, blank, `^l1`, both items moved | separated | refused | refused | refused | left behind | outside |
| the same, `b` alone | kept | refused | kept | refused | left behind² | outside |
| `Lead.` and its list, blank, `^l2`, `Lead.` moved | separated | separated | refused | refused | left behind | outside |
| `- item a`, blank, `  ^under-a` | kept | kept | kept | refused | deleted with it | inside |

¹ The paragraph becomes `- Some prose.`, a one-item list the id then names.
² The list survives as `- a`; the id stays and the blank line above it goes with `b`, so the
result is `- a` with `^l1` directly under it, which Obsidian reads as naming item `a`.

Move, delete and copy separate the id in every shape where it follows a block at the same level.
The only shape that already keeps it is an id indented under an item, which the parser already
makes the item's child, so every subtree operation carries it. Drag is not an operation of ours:
a drag in the editor is a text selection.

## Two groups

The shapes fall into two groups by where the id sits relative to the node it names.

**Right after the node's own lines.** The id follows a node's own lines, blank lines skipped, and
Obsidian names that same node:

- a paragraph, table, quote, callout, fence, rule or html block at the top level or in a heading's
  section;
- a heading (Obsidian names the line, the outline the section — a difference in what an embed
  shows, not in which node);
- a list item, with the id indented to its content column directly after its own lines;
- the last item of a list, with the id directly under it at the list's column and no blank line.

Here the id can be part of the node the way an inline id is: the node's own span gains the blank
lines and the id line between its lines and its trailing gap, so the span stays contiguous, the
round trip stays span concatenation, and every operation that moves, deletes or copies the node
takes the id with it.

**Anywhere else.** The id comes after a node's subtree, or Obsidian's reading is not a node of
ours, or it is no id at all:

- after a list with a lead paragraph (`^l2`): Obsidian names the list alone, which is no node;
- after a top-level list (`^l1`), and after one whose last item has children (`^l4`): no node is
  the list;
- after an item's children, at the item's content column (`^x1`): Obsidian names the item with its
  children, which is the outline's own reading — but the id sits after the subtree, not after the
  item's own lines;
- after a paragraph, table, fence or quote inside an item (`^x3`, `^x5`, `^x6`, `^x7`): Obsidian
  names the item, while by position the id follows the inner block;
- the first of two lone ids in a row (`^y1`), and a lone id with nothing before it (`^first`):
  Obsidian registers no block for either;
- a line that looks like an id and is not one: trailing whitespace, or text directly under it.

Holding a second-group id inside a node would need a second span per node — one emitted after its
children — and every line-geometry walker and every "gap after this subtree" helper would have to
learn it. The alternative is to leave these ids as the paragraphs they parse as today and mark
them in outline mode, with corrections that move the id to a place in the first group.

## Controlling what an embed shows

`Plugin.registerMarkdownPostProcessor` runs over the content of an embed, in reading view and in
Live Preview alike, with `ctx.sourcePath` set to the EMBEDDED note. Replacing the element's
children in the post-processor replaced what both views showed.

What the public context lacks is which anchor the embed is showing. At the call the element is
not yet in the document, so it has no `.internal-embed` ancestor; one tick later it has, and that
ancestor's `src` attribute carries the subpath (`Embed target l2#^l2`). `getSectionInfo` answers
with lines RELATIVE to the embedded range — `0-2` for a table on lines 2–4 of its note — not the
note's own lines. The context also carries `containerEl`, `el`, `promises` and `replace`, none of
them in `obsidian.d.ts`; `containerEl` is already inside the embed at the call.

Following `[[Nav target#^nav]]` put the cursor on the list's first item, line 121, where
`Lead.` is line 120. `WorkspaceLeaf.openFile(file, { eState: { line: 120 } })` put it on
`Lead.` — so a link can be landed anywhere, but only where we open it. No public event reports a
link being followed, so a click we do not handle ourselves lands where Obsidian puts it.

The metadata cache cannot be changed, and everything built on it keeps Obsidian's reading: link
autocomplete, the backlinks pane, other plugins. Nor can anything change what a reader WITHOUT
the plugin sees. Hover previews, canvas embeds and Publish were not measured.

## The precedent for marking a reading

A list item with extra space after its marker is marked in outline mode
(`SURPLUS_MARKER_SPACE_CLASS` in `decorations.ts`): a mark decoration, a title saying what to do,
and a press on the mark that removes the run. It has one correction. A second-group id has one to
three — attach to the lead paragraph, attach to the last item, or leave it — so a press there has
to offer a choice rather than make one.

## Not measured

What Obsidian names for an inline id at the end of a paragraph or a table row INSIDE a list item;
an id after a nested quote, in a footnote, or after a math block; hover previews and canvas embeds;
the mobile app.
