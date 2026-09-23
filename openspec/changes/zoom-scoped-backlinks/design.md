## Context

The footer decides which groups exist in one pure pass over the index's summaries
(`src/plugin/footer-filter.ts`: `filterSources`, `axesOf`, `orderAndCap`), before any source note
is read, and repeats the per-reference half after placement (`admitReferences`). The zoom scope
lives in the editor: one mapped anchor position (`zoom-state.ts`), from which `zoomScope(state)`
derives the root, its cover and its trail against the live parse (`zoom-scope.ts`,
`src/zoom.ts`). The footer widget knows only the note's path — `BacklinksFooterWidget.eq` compares
nothing else — so today a zoom moves where the widget mounts (`contentEndAnchor`) and changes
nothing it renders.

A reference records its kind, its line and its link as written (`BacklinkReference.original`),
but not the subpath it addresses. Our tree does not model block ids at all.

`docs/research/zoom-scoped-backlinks` holds the measurements this design rests on: which block
Obsidian names for each `^id` shape and where our parser puts the same text, what a heading subpath
resolves to, the metadata cache's lag behind the editor, the resolver accepting a cache we build,
and the six ways of offering the choice.

## Goals / Non-Goals

**Goals:**

- One definition of where a subpath lands: Obsidian's resolution rules, over the anchors of the
  document the reader is looking at.
- The answer decided in the summary pass, so the cap's "never read" property and the progressive
  paint are untouched.
- The pure controls model extended by one field, unit-testable with plain sets, and no Obsidian
  or CodeMirror reaching into it.

**Non-Goals:**

- A block-id model in the tree. Anchors are derived on demand and not stored on nodes.
- Any change to what the footer renders inside a group, to the sort, or to the caps themselves.
- Resolving links for navigation. Clicking a row still opens the source through
  `workspace.openLinkText`, as today.

## Decisions

### D1. The answer is a field of the controls, applied at the head of every pass

`ControlsState` gains `scope: ReadonlySet<string> | null`: the subpaths the answer in force
admits, spelled as the index reports them, or `null` for Whole note and for no zoom. A reference
is in scope when `scope` is `null`, or when it reports a subpath that `scope` contains.
`filterSources`, `presentValues` and `admitReferences` each narrow their reference list by that
test before doing anything else, so totals, offered axis values, the cap budget and the placed
rows all describe the scoped set without a second copy of the rule.

A set of subpaths rather than a predicate keeps the module pure and its tests plain data. It also
makes the one expensive question — where does each subpath land — the plugin layer's, answered
once per distinct subpath per render (D3), not once per reference.

*Alternative:* narrow `SourceRefs.refs` in the plugin layer before the pure pass. Rejected because
`admitReferences` reads `PlacedSource.references`, which `place()` builds from the index and not
from `SourceRefs`, so the scope would need applying twice by hand — the duplication
`search-hits-and-footer-content-filter` D5 removed for the kind axis.

*Alternative:* a fourth axis beside kind, folder and tag, or an extension of the kind axis
(options B and C in the research note). Rejected: an axis is a focus-on multi-selection that admits
everything when empty, and the answer is exclusive, defaults to something narrower than everything
while zoomed, and must survive Reset.

### D2. Anchors are derived from the live document, and Obsidian resolves subpaths against them

`src/anchors.ts` exports `anchorsOf(doc: OutlineDoc)`, returning every heading and block id in
document order, each with the start line Obsidian gives it and the id of the node it belongs to.
The attribution is the rule `docs/research/zoom-scoped-backlinks` derives from its seventeen
shapes; the spec states it as "An anchor belongs to the node where what it names begins". A
heading's text is its line after the marker, with closing hashes removed and trimmed, or the first
line of a setext heading. A block id is `^` followed by letters, digits and dashes, ending a line
after whitespace or standing alone on it.

The plugin layer assembles those anchors into a `CachedMetadata` holding only `headings` and
`blocks` — block keys lower-cased, since the resolver matched `#^XYZ` to the key `xyz` — and asks
`resolveSubpath` where each subpath lands. The resolved start line is mapped back to the anchor
that starts there, and so to its node.

Derived over the WHOLE document, not only the zoomed cover: an id on the line after a zoomed table
lies outside the cover and still names the table, and a duplicate heading above the zoom decides
where `#Duplicate` lands.

Memoized per `EditorState` in a `WeakMap`, like `parsedDoc` and `zoomScope`.

The attribution rule exists because our parser reads a lone id line as a paragraph of its own
([#207](https://github.com/laughedelic/obsidian-true-outliner/issues/207)). This change stacks on
the fix for that issue; once the lone line belongs to the node it names, the rule reduces to "an id
belongs to the node holding its line", with the whole-list case the only one left to state.

*Alternative:* resolve against the note's own `getFileCache`. One source of truth and no rule of
our own, but its lines run about two seconds behind the editor after every edit (research note,
"How far the metadata runs behind the editor"), and during that window a deletion inside the
zoomed view drops anchors near its end out of the answer. Rejected for that window. It remains the
fallback if the resolver ever stops accepting a partial cache.

*Alternative:* match subpaths ourselves. Rejected: case folding, `stripHeading`'s punctuation,
nested paths that skip levels and first-of-duplicates are all Obsidian's undocumented behaviour,
and a copy of them would be a second answer to where a link goes.

### D3. Membership is by owning node, and the zoom's classification is one object

`src/plugin/footer-scope.ts` exports `zoomAnswerFor(state)`, memoized per `EditorState`. For an
active zoom it returns: which answers are available (an anchor owned by the root; an anchor owned
by any node in the root's subtree), the root's label, and `classify(subpath)` →
`'node' | 'below' | 'outside'` — `node` when the anchor the subpath lands on belongs to the root,
`below` when it belongs to a descendant, `outside` otherwise, including a subpath that lands on
nothing. With no zoom it returns `null`.

The classification itself is pure and lives in `src/anchors.ts` beside `anchorsOf`, taking the
resolver as a function from subpath to start line; `footer-scope.ts` only supplies
`resolveSubpath`, the zoom scope and the memo. That keeps every rule this change adds reachable
from the unit suite, which cannot import `obsidian`.

The controller turns that into D1's set at render time: it collects the distinct subpaths among
the note's references from the summaries, classifies each once, and keeps those the answer in
force admits. `below` admits `node` and `below`; `node` admits `node`.

Subtree membership is "the owning node is the root or has it as an ancestor", tested by the
owning node's start line falling inside the scope's cover — the same `Cover` every zoom clamp
compares against, so there is no second notion of "inside the zoom".

### D4. The scope reaches the footer through the widget, which updates in place

`BacklinksFooterWidget` gains the zoom answer object, and `eq` compares the path and the object's
KEY: the root's path and label, and every anchor's identity (heading text or block id) with its
membership, in document order. Line numbers are left out, so an edit that shifts lines without
changing any anchor or membership does not touch the footer. When the key differs, `updateDOM`
hands the new object to the widget's existing controller, which re-renders into the same element —
the footer keeps its focus handling, its scroll position and its controller, which is what
`liveControllers` exists to keep unique per editor.

*Alternative:* the controller reads the scope from the view on each render. Rejected: a render
triggered by `repaintFooters` has no transaction, and would need the view to ask for its current
state; the widget already sits in the one place CodeMirror hands a new state to.

### D5. The answer in force: a remembered choice, narrowed to what the zoom offers

`ViewState` gains `scopeAnswer: 'node' | 'below' | 'note'`, default `'below'`, kept and pruned with
the rest of the per-note state (not persisted). The answer in force is the choice if available,
otherwise the next wider available one — `node` → `below` → `note`. The choice itself is only
written by the menu and the empty state's action, so a fallback never overwrites it.

### D6. The header control is option A, built from the sort menu's parts

While zoomed, `renderHeader` replaces the title text with "Backlinks to" and a scope button; the
totals follow it as today. The button carries a glyph for the answer in force (a filled dot for
This node, a dot with two branches for This node and below, the page for Whole note), the root's
label — `lineageSegment`, which the footer's lineage rows and zoom's crumbs already share — or the note's
name, and "and below" for the middle answer. The container query that already swaps the title's
long and short forms drops "Backlinks to" and "and below" in the narrow form and truncates the
label, keeping the glyph.

The menu is `renderSortControl`'s shape: a caption, `menuitemradio` entries, the chosen one set in
weight rather than marked with a box. `OpenPopover` gains `'scope'`, so the one-popover rule and
the outside-press dismissal cover it with no new code. Each entry's count comes from running the
summary pass once per answer — the pass is pure and reads no file — or, with a term active, from
`admitReferences` over the sources already placed for the counts. An unavailable entry is
disabled, with "Nothing here has a heading or block id to link to" as its second line.

The drawn comparison of this and the five alternatives is in the research note; option A is the
one that keeps the header's totals describing a named answer and leaves the filter model's
semantics alone.

### D7. An empty answer is its own state, not the dormant footer

When the answer in force admits nothing and the note has summaries, `paint` renders the header
(count zero), one line — "Nothing links to this part of the note." — and a button, "Show the N
references to the whole note", that writes `scopeAnswer = 'note'`. N is the Whole note entry's
count from D6. The dormant footer stays reserved for a note with no summaries at all.

### D8. Selections are pruned against the note, and offered against the answer

`pruneDeadSelections` runs against the axes of the UNSCOPED reference set, so a folder or tag that
only whole-note references carry is not deleted by zooming in. The values a facet offers come from
the scoped set, plus any selected value it lacks, listed with a count of zero — the rule that a
selected value always stays listed, extended from the find box to the answer.

### D9. Agreement with Obsidian is checked in the instance, not argued

An e2e case opens every fixture note carrying headings or block ids, waits for the metadata to
settle, and compares each `getFileCache` heading and block start line with the start line
`anchorsOf` gives the same id, over the note's text. The probe corpus from the research note
becomes a fixture for it. This is what stands between the attribution rule and a shape nobody
probed.

## Risks / Trade-offs

- [A block-id shape outside the probe gets a different start line from ours] → the reference is
  counted under the wrong answer while its navigation, which is Obsidian's, is still right. The
  agreement case (D9) runs over every fixture, and the research note lists the shapes that were
  not probed.
- [`resolveSubpath` accepting a partial cache is measured, not documented] → the e2e scenarios for
  case, nested paths and duplicates go through it on every run, so a release that reads another
  field fails them; D2's rejected alternative is the fallback.
- [Typing inside a heading in the zoomed view changes the key on every keystroke] → one footer
  repaint per keystroke. `docs/research/backlinks-footer-spikes` S5 puts a hub note's placement at
  about 2 ms with a warm tree cache, and trees are cached; re-measured in the apply phase against
  the hub fixture before accepting it.
- [An id naming a whole list belongs to the list's first item] → zoomed into that first item, This
  node admits references to the whole list. The id names a range no single node of ours spans, and
  the first item is where that range begins; recorded rather than special-cased.
- [Two panes on one note share the chosen answer] → view state is keyed by path, as the filters
  are; each pane still classifies against its own zoom.

## Migration Plan

None. Nothing is persisted, no setting is added, and with no zoom active the footer takes the same
path as today (`scope: null`). Reverting the change restores the note-wide footer while zoomed.

## Open Questions

- Which node owns an id naming a whole list is decided by the fix for #207; the spec's first-item
  reading is what this change assumes until then.
