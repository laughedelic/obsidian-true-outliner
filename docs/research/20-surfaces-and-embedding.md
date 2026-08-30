# Surfaces: where the outline can be drawn, and what each way costs

The outline chrome was built for one surface — the Live Preview editor. The backlinks footer
made it two, and that is what turned "how do we draw a row" from an implementation detail into
an architectural question. This doc records the answer, the two surfaces still unbuilt (reading
mode, and an editable mirrors view), and the one technique that would give perfect fidelity at a
price the project has publicly promised not to pay.

Written after `backlinks-footer` landed, from measurements taken during it. The spike series
itself is [19-backlinks-footer-spikes.md](19-backlinks-footer-spikes.md); the design decisions
behind the backlinks layer are [18-structured-backlinks.md](18-structured-backlinks.md).

## Why the editor's decorations were not readily reusable

Worth stating plainly, because the effort of the second surface is otherwise surprising: **the
outline chrome is not a renderer.** It is an overlay on someone else's DOM. Three consequences,
all of which cost real work on the footer:

1. **There was never a "render an outline row" function to call.** CodeMirror builds the
   `.cm-line` elements from the document; our code annotates them with a class, a handful of
   custom properties and one inline widget, and `styles.css` does every offset from there. A
   second surface can either receive the same annotations — which is what `chrome-line.ts` now
   makes possible — or build a renderer that never existed.
2. **Part of the chrome is measured, not computed.** Obsidian's native padding, the fold
   chevron's vertical delta, the accent's stop point: read live, per line, because no CSS
   expression for them exists (docs/research/14, finding 5, and 16 on list geometry). Those
   measurements are driven by a `ViewPlugin` on CM6's update cycle. A surface with no editor
   behind it gets none of them, and has to either not need them or measure its own.
3. **The content arrives from a different renderer.** The editor decorates SOURCE TEXT; the
   footer renders through `MarkdownRenderer.render`, which is the READING-MODE renderer. That
   difference is the subject of the next section, and it is where every footer defect lived.

None of this was wasted. The extraction that fixed the footer's alignment also fixed the
editor's: the marker had been sitting ~4.4px above its text on both surfaces, and one edit
corrected both (19, S4).

## The two renderers, and the seam between them

| | Live Preview editor | `MarkdownRenderer.render` (reading mode) |
| --- | --- | --- |
| Unit | one `.cm-line` per source line | a document: `<p>`, `<ul><li>`, `<h1>`, `<blockquote>`, `<table>` |
| Whitespace | `pre-wrap` — every space is a character the reader typed | collapsing, block-context rules |
| List markers | literal characters in the source, styled by HyperMD classes | real `<ul>`/`<ol>` with the platform's own numbering and indentation |
| Depth | expressed only by our own rules | expressed by the renderer too, in its own units |
| Classes available | `HyperMD-list-line`, `cm-formatting-*`, our own | semantic tags only |

**The footer is reading-mode content inside editor-mode chrome.** Every defect found while
building it sat exactly on that seam, and reads as a small CSS bug until traced:

- `<li>` margins and the renderer's own indentation, layered on top of ours.
- The newline inside a rendered `<li>` becoming a HARD BREAK under CodeMirror's inherited
  `pre-wrap`, then a visible SPACE once that was corrected — 3.6px of it.
- An `<ol>`'s number discarded when the wrapper is unwrapped.
- Atoms (quote, callout, table) arriving as genuine blocks rather than as lines.

This is the useful reframing: those are not footer polish. They are **the reading-mode rendering
problem**, being solved in the surface where it is cheapest to iterate.

## Surface 3 — reading mode

Not free, and not a separate rendering logic either. The pure half is already shared:
`decorate(doc)` and `computeLineGuides(doc)` work on any parsed tree (proven on foreign trees in
19, S3), `chrome-line.ts` holds the class-and-property contract, `buildMarkerIcon` draws the
notation, and the `styles.css` layout rules already take more than one selector.

What is missing is the **join**: mapping a rendered block back to the tree node it came from.
The public hook exists.

```ts
plugin.registerMarkdownPostProcessor((el, ctx) => {
  const info = ctx.getSectionInfo(el);   // { text, lineStart, lineEnd } | null
  // …find the node whose lines contain lineStart, then applyLineChrome(el, …)
});
```

`MarkdownPostProcessorContext.getSectionInfo` is public and documented (obsidian.d.ts, marked
`@public`), with an explicit contract that it may return `null` and must be called immediately
before use. The file's tree is already available: `parse()` plus the `SourceTreeCache` the
backlink index uses.

Known unknowns, to be spiked rather than assumed:

- **Granularity.** A post-processor is handed a top-level block. A whole `<ul>` arrives as one
  element, so per-item chrome means walking into it and deriving each item's line from the
  list's own range — the section info is not per-`<li>`.
- **`null` returns.** The API documents them "in many circumstances"; which circumstances, and
  what the fallback is, decides whether the surface can be complete or only best-effort.
- **Re-render cadence.** Reading mode re-renders sections independently; the chrome has to
  survive that without a `MutationObserver`, for the reason recorded in
  [11-decoration-lessons.md](11-decoration-lessons.md).
- **Guides across blocks.** A guide is continuous down a subtree; in reading mode consecutive
  siblings are separate post-processor calls with no shared box to paint in.

## Surface 4 — embedded real editors (mirrors)

**Recorded, not proposed.** Editing in the backlinks view ("mirrors") is deliberately out of
scope; this section exists so the option is not re-derived from scratch when it is picked up.

### Correction to S6

Spike S6 concluded that mounting an editor per group "loses Live Preview *and* our decorations".
That verdict is **true of what was built and false of the technique it appears to rule out.**
S6's apparatus was a bare `new EditorView({ state, extensions })` with `editorInfoField` seeded
by hand — a CodeMirror instance, not an Obsidian view. Live Preview is Obsidian's view layer, so
a bare editor renders source; and our extensions never attached because Obsidian never attached
them.

Mounting a **real `WorkspaceLeaf` holding a real `MarkdownView`** is a different thing entirely.
There, the outline chrome appears with no work at all: it is the editor.

### The technique

Established prior art, in descending order of relevance:
[obsidian-hover-editor](https://github.com/nothingislost/obsidian-hover-editor) (MIT, the
original), Daily Notes Editor, and
[obsidian-continuous-journal](https://github.com/laughedelic/obsidian-continuous-journal), whose
`src/embed.ts` is the most compact readable version and is the one measured here.

The shape: construct a detached `WorkspaceSplit`, root it at the real `rootSplit` by overriding
its `getRoot`/`getContainer`, create a leaf in it, open the file in `source` mode, then lift the
leaf's `containerEl` out of the split shell into the host element so it sizes to its content.
Leaves are pinned so links open elsewhere rather than hijacking the host.

Public API it uses, no issue: `Workspace.createLeafInParent`, `WorkspaceLeaf.openFile`,
`isDeferred` / `loadIfDeferred` (needed since 1.7, which defers background leaves),
`setPinned`.

Non-public surface it depends on — eight touchpoints:

| Touchpoint | Why |
| --- | --- |
| `new WorkspaceSplit(ws, dir)` | the class is exported but constructing one is not part of the contract |
| `split.getRoot` / `getContainer` overridden | make a detached split resolve to the real workspace |
| `leaf.containerEl` | to lift the leaf's element out of the split shell |
| `leaf.parentLeaf` | invented field, linking an embedded leaf to its host |
| `workspace.activeEditor` | so editor commands target the note under the cursor |
| `view.editMode` | the same, from the host view's side |
| `workspace.recordMostRecentOpenedFile` | suppress quick-switcher pollution while hydrating |
| `Vault.getConfig` | read appearance settings |

Plus five `monkey-around` prototype patches: `Workspace.setActiveLeaf`,
`Workspace.getActiveViewOfType`, `WorkspaceLeaf.getRoot`, `.setPinned`, `.openFile` — the last
temporarily patching `Workspace.trigger` to swallow `file-open` so the file explorer does not
track notes preloading below the viewport.

The hygiene is good: all of it in one module, with the lineage credited, so API breakage stays
localized. That is the right shape for this technique if it is ever adopted.

### Why it is not the answer for the footer

Two reasons, independent of the API question:

1. **Wrong granularity.** An embedded leaf shows a WHOLE note. The footer shows a projection —
   matches, their ancestors, one level of descendants, with unbranching lineage collapsed. Getting
   that from an embedded editor means hiding everything else with block-replace decorations
   inside each instance, which is a second, harder rendering problem stacked on the first.
2. **Wrong cost model.** One editor per referencing note. The hub fixture is 120 notes and 400
   references; the prior-art plugins carry tens of whole notes with virtualisation, and their
   subject is a timeline of daily notes, not fragments of an unbounded set.

### Why it is the strongest candidate for mirrors

Every property that makes it wrong for the footer is irrelevant or inverted for mirrors: few
nodes rather than many, editing as the entire point rather than out of scope, and fidelity
mandatory rather than approximated. Nothing else known gives real editing of another note's node
inside our surface.

### The constraint that decides it

`README.md` states, as one of the project's headline claims:

> Public APIs only: built on Obsidian's documented editor and plugin APIs, no monkey-patching
> private internals, so it stays compatible and passes the community plugin safety bar honestly.

[03-obsidian-api-feasibility.md](03-obsidian-api-feasibility.md) records that the community
policies do not *explicitly* ban private-API use, but that monkey-patching internals is what
review flags. So this is not a matter of taste to be settled in passing — adopting the technique
means either revising that promise or scoping it (for example, to an optional feature that
degrades to read-only when the internals move). That is a product decision, and it belongs to
whoever picks mirrors up, not to the implementation.

## Where this leaves the order of work

1. ~~**Finish the three kind items in the footer**~~ — **done.** Atoms now take the editor's
   absolute marker mechanism (`markerAnchorLeftExpr`, moved into `chrome-line.ts`), a heading's
   size is carried by the row rather than its text, and an ordered item's number is read off the
   source line and right-anchored in the gutter. Written up in 19, S4. Everything learned there
   applies to reading mode unchanged — that was the point of doing it here.
2. **Reading mode** is then mostly the `getSectionInfo` join plus the four unknowns above.
3. **Mirrors** reopens with the embedded-leaf technique as a named candidate, where the
   private-API question is decided on its own merits for a feature that actually needs it.
