# Zoom-scoped backlinks: what an anchor names, and how the footer can say which part it answers for

`docs/research/structured-backlinks` D13 deferred node-level references into zoom: "once a node
can be zoomed into, the same footer renders below it scoped to that node". `backlinks-footer`
still promises the opposite while zoomed — the footer "SHALL keep answering for the NOTE" until
the filter model grows a scope. This note records what that scope has to agree with before it can
be designed: what Obsidian says a heading or block link addresses, how our own tree places the
same text, how far Obsidian's metadata runs behind the editor, and what the reader can be offered
to choose between.

Every figure below is from one of two probes, kept beside this note:
[`prototypes/zoom-anchors-probe/zoom-anchors-probe.e2e.ts.txt`](prototypes/zoom-anchors-probe/zoom-anchors-probe.e2e.ts.txt)
(Obsidian 1.13.7, installer 1.5.8, Linux, run through the narrow e2e harness) and
[`prototypes/zoom-anchors-probe/parser-shapes.ts.txt`](prototypes/zoom-anchors-probe/parser-shapes.ts.txt)
(our `parse()` on the same shapes). Each file says how to re-run it.

## What a block id names

Obsidian's `CachedMetadata.blocks` records, for each `^id`, the range of the block the id names.
`resolveSubpath(cache, '#^id')` returns that same range. Our parser puts the id's TEXT in some
node; the question is whether that node is the one Obsidian names.

| Shape | Obsidian names (lines) | Our node holding the `^id` text | Same node? |
| --- | --- | --- | --- |
| paragraph ending ` ^p1` | the paragraph | the paragraph | yes |
| `^p2` on the line directly under a paragraph | the paragraph, both lines | the paragraph (a second line of it) | yes |
| `^p3` after a blank line under a paragraph | the paragraph above | a paragraph of its own | **no** |
| list item ending ` ^li1`, with children | the item's own line, not its children | the item | yes |
| nested item ending ` ^li2` | that item's own line | that item | yes |
| two-line item, id on the continuation | the item, both lines | the item | yes |
| heading `## Head with id ^h1` | the heading line | the heading | yes |
| table, blank line, `^t1` | the table | a paragraph after the table | **no** |
| table, `^t2` directly under it | the table | a paragraph after the table | **no** |
| quote, `^q2` directly under it | the quote plus the id line | a paragraph after the quote | **no** |
| quote line ending ` ^qa` | the quote | the quote | yes |
| callout, blank line, `^c1` | the callout | a paragraph after the callout | **no** |
| callout body line ending ` ^cb` | the whole callout | the callout | yes |
| code fence, blank line, `^code1` | the fence | a paragraph after the fence | **no** |
| two items, blank line, `^l1` at column 0 | **the whole list**, both items | a paragraph after the list | **no** |
| nested list, blank line, `^l2` at column 0 | the whole list, nested items included | a paragraph after the list | **no** |
| `^under-a` indented under an item, after a blank line | that item, the id line included | a paragraph CHILD of the item | **no** |

Nine of the seventeen shapes disagree. Every disagreement is a lone `^id` line — a line holding
nothing else — which our parser, reasonably, reads as a paragraph of its own. Obsidian never does:
it attaches a lone id to the block before it. Two findings follow.

**A lone id line names the block that ends immediately before it** — the table, fence, callout or
paragraph above, blank lines skipped. When that block is a list, the id names the whole list, not
its last item. When the lone id line is indented inside a list item, it names that item.

**The tree cannot find "the block before" by looking at siblings.** Our parser attaches a list to
the paragraph above it (`docs/research/list-paragraph-mapping`, Q34), so in the `^l2` shape the
list's items are children of the paragraph `Lead.`, and the id paragraph's previous sibling is
`Lead.` rather than any list item. The block before an id line is reached through the node that
owns the previous content line — `nested c` there — walking up through list-item ancestors to the
outermost item, then back to the first item of that run. Stated that way, the rule gives
Obsidian's start line for all seventeen shapes.

A table row ending in an id, an id after a nested quote, an id inside a footnote or an HTML block
were not probed.

**What a block link does, as against what the cache says.** The cache's ranges were checked
against behaviour by a second probe,
[`prototypes/zoom-anchors-probe/anchor-use-probe.e2e.ts.txt`](prototypes/zoom-anchors-probe/anchor-use-probe.e2e.ts.txt):
fourteen shapes, each under its own heading, embedded from another note and followed with
`openLinkText`, in reading view and in the editing view with outline mode off and on. Every embed
rendered the block the cache names — the table for `^t1`, `^t2` and an id ending a table row, the
whole list for `^l1` — and every navigation that landed put the view on that block's first line.
Two navigations (`^t2`, `^q2`, outline mode off) opened the note at its top on one run and landed
correctly on the other; they are not counted either way. A report from use says an id after a
table cannot be referenced; the conditions it was seen under are not yet known, and until they are
reproduced the table rows above rest on this probe alone.

## What a heading subpath matches

`resolveSubpath(cache, '#…')` against a note with eight headings, two of them duplicates:

| Subpath | Resolves to |
| --- | --- |
| `#Current sprint`, `#current sprint` | `## Current sprint` — case is ignored |
| `#Top#Current sprint` | the same — a parent path |
| `#Top#Child: with colon` | `### Child: with colon`, two levels down — the path need not be adjacent |
| `#Child with colon`, `#Child  with colon` | the same — the colon is dropped and runs of spaces collapse, as `stripHeading` does |
| `#Emph bold and Other link` | `## Emph *bold* and [[Other]] link` — markup is stripped |
| `#Duplicate` | the FIRST of two `## Duplicate` headings |
| `#Head with id ^h1` | the heading whose text includes the id; `#Head with id` resolves to nothing |
| `#With #tag inside` | nothing — the `#` splits the subpath into a path |
| `#Nope`, `#^missing` | nothing |

`HeadingCache.heading` is the line's text after its marker, trimmed, closing `##` removed, the
first line of a setext heading, and inline markup left as written. The matching rules are
Obsidian's own and not documented: case folding, `stripHeading`'s punctuation, nested paths, the
first of two duplicates. A second implementation of them would be a second answer to "where does
this link go", able to disagree with the link's own navigation.

## How far the metadata runs behind the editor

Five edits in an open, outline-mode note, each appending a paragraph carrying a fresh id, timed
until `getFileCache(file).blocks` reported the id: 2010, 2010, 2013, 2014 and 2017 ms. In all five
the cache updated in the same 25 ms poll as `vault.cachedRead` first returned the new text — so
the lag is Obsidian's save debounce, and the cache follows the file on disk, not the editor.

For a scope computed from the cache that is a two-second window after every edit in which the
cache's line numbers and the live document's disagree. The zoom boundary refuses edits outside the
scope (`outline-zoom`, "An operation whose result would leave the zoom scope is rejected"), so
this view's own edits never move the scope's first line; but a deletion inside the scope moves
every later anchor up while the cache still holds the old lines, and anchors near the scope's end
fall outside it until the next save. The footer repaints on every `metadataCache` `changed` event
(`main.ts`), so the answer corrects itself — two seconds after it was wrong.

## A resolver fed a cache of our own

`resolveSubpath` is typed to take a `CachedMetadata`, every field of which is optional. Handed an
object holding only `headings` and `blocks`, built by hand with invented positions, it answered
eight of eight queries by the same rules as against the real cache: `#Alpha one` and
`#alpha: one` both found `Alpha: one`; `#Alpha: one#Beta` found the nested `Beta`; `#^XYZ` found
block `xyz`; a duplicate heading resolved to its first occurrence; unknown ids and headings
resolved to nothing.

So the matching rules can stay Obsidian's while the LINES come from the live document: derive the
headings and block ids from our parse of what the editor holds, give them the start lines the
attribution rule above assigns, and ask `resolveSubpath` where each subpath lands. That removes
the two-second window. What it costs is the attribution rule and the heading-text extraction as
code of our own, which have to agree with Obsidian's cache whenever the note is saved — a claim a
test can check directly, since both answers are available in the same instance.

## Offering the reader a choice

With the anchors located, three answers are possible while zoomed: references to the zoom root
itself, references to anything in the zoomed view, and references to the note as a whole — which
is what the footer shows today. We drew the ways of offering that choice at the footer's own
geometry, in a dark theme, over one zoomed note (`## Current sprint`, two block ids beneath it;
2, 4 and 12 references for the three answers):

- **A. The header names the scope.** "Backlinks to ‹Current sprint and below›", where the
  bracketed part is a control opening a radio menu in the sort menu's own shape: This node, This
  node and below, Whole note, each with its count. The totals beside it are that answer's totals.
  Always visible while zoomed; filters and Reset keep their current meaning. Costs one control in
  the header and a compact form at phone width, where the chip keeps its mark and the node's name
  and drops "Backlinks to".
- **B. A scope facet in the filter row**, beside kind, folder and tag. Keeps narrowing in one
  place, but the row is hidden by default, so a zoom silently changes what the footer answers. A
  scope is exclusive and has a default that depends on the zoom, where the axes are focus-on
  multi-selections that admit everything when empty; Reset would have to decide whether it clears
  the scope, and the funnel's active dot would light on every zoom.
- **C. The kind facet carries the scope**, Anchor splitting into "to this node", "to anything in
  view" and "elsewhere". No new control, and Anchor already means "points at a node inside the
  note". But kind is multi-select and scope is not; Note and Property never address a node, so
  under a scope they read zero or contradict it; it deepens the two-axes-in-one flattening D14
  already records; and it is hidden behind the filter toggle like B.
- **D. A segmented control in the header** — Node, Below, Note, with counts. One click between
  answers and all three counts at once, but three buttons in a row whose job is to state counts,
  three marks that are hard to tell apart at 12 px, no room at phone width, and the node itself is
  never named.
- **E. The zoom trail carries the scope**, as a control at the end of the breadcrumb. Not drawn:
  the trail is at the top of the view and the footer at the bottom, so the control and the answer
  it changes are never on screen together once the zoomed content is longer than the viewport.
- **F. No control.** The footer answers for the zoomed view whenever it holds an anchor, and the
  header says so in words. Nothing to build or learn; no node-only answer, and the whole note is
  reachable only by zooming out.

A is the one that keeps the header telling the truth about its counts and leaves the filter model
alone. F is A without the menu, and is the natural first cut if the menu is deferred.

Two states come with any of them. A zoomed view holding an anchor that nothing links to has an
answer of zero, which reads best as one quiet line and an action that widens to the note. A
zoomed view holding no anchor at all — no heading, no block id — has nothing that could be linked
to, so a narrower answer is empty by construction; there the footer answers for the note, as it
does today, and the control says why the narrower answers are unavailable.

The drawn comparison lives on a design canvas linked from the change's pull request; the options
and their trade-offs are recorded here so the decision does not depend on the drawing staying
reachable.
