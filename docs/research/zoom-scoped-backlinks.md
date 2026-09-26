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

The same reading separates an id from its block under a move — extracted to
[#207](https://github.com/laughedelic/obsidian-true-outliner/issues/207).

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

## The same attribution on the tree #208 builds

`fix/lone-block-id-travels-with-its-node`
([#208](https://github.com/laughedelic/obsidian-true-outliner/pull/208)) makes a lone id part of
the node it names wherever Obsidian names one of our nodes (`OutlineNode.blockId`), and leaves
every other lone id a paragraph that `misplacedBlockIds` reads for us: the item it names, the
whole list, nothing, or not an id. `docs/research/lone-block-id` measures 50 more shapes, and one
of its findings reaches past lone ids: no id, inline or lone, names a block inside a list item —
each names the item.

[`prototypes/zoom-anchors-probe/attribution-on-attached-ids.ts.txt`](prototypes/zoom-anchors-probe/attribution-on-attached-ids.ts.txt)
states the attribution on that tree and runs it over the shapes of both notes, 68 shapes holding
69 ids, against the start line Obsidian's metadata gave each. An id belongs to the node holding it
— on one of its lines, or attached — with four exceptions, each of which the prototype can leave
out:

| Part of the rule | Ids that go wrong without it |
| --- | --- |
| an id held by anything but a list item, inside a list item, belongs to the nearest item | 3 (`^x8`, `^x9`, `^x10`) |
| a misplaced id belongs to what `misplacedBlockIds` reads it as: the item, the list's first item, or no node | 18 |
| a misplaced id with a block directly under it names its own line, so its own paragraph | 6 (`^id3`, `^f1`, `^f6`, `^f7`, `^f11`, `^f12`) |
| the last of a run of lone ids, which neither attaches nor is marked, is read as if the others were absent | 1 (`^y2`) |

With all four, 68 of 69 agree. The one that does not is `^f15`: `Lead.`, blank, `^f15` with a
table directly under it. Obsidian reads the id's line as part of the table and registers no id;
our parser reads it as a paragraph above the table, and #208 reads it as an id naming only its own
line. A link to `^f15` then counts for that paragraph, where Obsidian's own link goes nowhere.

So on #208's tree the walk to "the block before" described above is no longer ours to make: what
the tree does not settle, the misplaced-id reading does, and the rule of our own shrinks to the
list-item lift and the run.

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

## The control in the real footer

A on desktop is chosen; D, icon-only, is the candidate for phone width. Both were then put into the
real footer:
[`prototypes/zoom-scope-control-probe/scope-control-capture.e2e.ts.txt`](prototypes/zoom-scope-control-probe/scope-control-capture.e2e.ts.txt)
zooms into `## Current sprint` of a note with five linking sources and rewrites the footer's own
header into each variant — A's chip and menu under several names for the answers, D's segments
with two icon sets — in Obsidian 1.13.7, dark and light, on desktop and under the app's own mobile
emulation. The screenshots are on the same canvas.

| Variant | Footer | Measured |
| --- | --- | --- |
| A, the root's name: "Current sprint and below" | 604 px | chip 225 px; header one row |
| A, a 78-character root name, label capped at 16rem | 604 px | 39% of the label shown |
| A, "this node and below" / "this node and its children" | 604 px | chip 190 / 229 px |
| A, "this subtree" / "this branch" | 604 px | chip 130 / 125 px |
| A's menu, the three names with counts | 604 px | 192–234 × 104 px |
| A, "Backlinks to" and "this node and below", the chip shrinking first | 330 px | 38% of the label shown ("this n…") |
| A, "Backlinks" and the same chip | 330 px | 51% shown |
| A, the chip's glyph alone | 330 px | 40 × 18 px |
| D, three icons, the header's own button size | 330 px | 20 × 20 px each; header one row |
| D at a touch size, 2.2em | 330 px | 28 × 28 px each; header 32 px tall |
| D with a count in each segment | 330 px | 36, 36 and 45 × 20 px |

Every desktop variant keeps the header on one row. At phone width A's words do not survive: with
the chip allowed to shrink before the title, its label keeps a third to a half of itself, and
a label cut mid-word names nothing. D's segments are the size of the filter and sort buttons
beside them (20 px under emulation) and keep the row intact. With the chosen segment marked by
the hover fill alone, the mark is a faint square that is easy to miss in both themes; in the
accent colour the chosen one is the first thing seen. Both icon sets keep their shape at 20 px:
Lucide's `circle-dot`, `list-tree` and `file-text`, and a set drawn from the outline's own
bullets — a dot, a dot over nested dots, a page.

Every size here is below the 44 px touch target of the platform guidelines, as the header's
existing buttons already are. Emulation is not a device: the app's mobile font sizes and
safe-area insets on a phone, and what a tap on a 20 px segment feels like, were not measured.

### The chosen look

From those shots the answers were named This node, This branch and Whole note; the chip names the
answer in the header's regular weight rather than the root in semibold; the menu lost its "backlinks
to" caption, which repeated the words before the chip; D with counts was taken for the narrow form;
and the chip, the menu and the segments share one set of glyphs — `list-tree` for This branch,
`file-text` for Whole note, and for This node a mark of focus rather than `circle-dot`. The same
probe, run with `PROBE_SET=chosen`, measured that look with four candidates for the node's glyph:
Lucide's `crosshair`, `locate-fixed` and `focus`, and a drawn focus-center, a dot inside four
corner brackets.

| Variant | Footer | Measured |
| --- | --- | --- |
| chip "this branch", regular weight | 604 px | 115 px (125 px in semibold) |
| chip "the whole note" / "this node" | 604 px | 139 / 102 px |
| the menu without its caption | 604 px | 192 × 79 px (104 px tall with it) |
| segments with counts, the chosen one in the accent colour | 330 px | 36, 36 and 45 × 20 px; header one row |

The four node glyphs measure alike and all keep their shape at 20 px in both themes. With counts in
the segments, the compact totals beside them repeat the reference count of the answer in force; only
their note count is new there.

`locate-fixed` was taken for This node. On desktop it read smaller than in the segments, and the
probe's glyph sizes say why: the chip and the menu borrow the filter row's mark, `0.85em` of a
smaller font, so the chip drew it at 11 px and the menu at 10.2 px, where the segments draw
`1.1em` of `--font-ui-smaller` — 13.2 px on desktop, 14.1 px under mobile emulation. Given that one
size, `calc(var(--font-ui-smaller) * 1.1)`, the chip and the menu draw every glyph at 13.2 px; the
chip grows by 2 px (104 px for "this node", 117 px for "this branch") and the menu not at all.
