## Why

Outline mode currently renders structure that is *static*: indentation, guides, and block
markers all describe the document, and none of them describe where the user is in it. In a
deep tree that is exactly the information that goes missing — a cursor several levels down
gives no visual answer to "what is this under?" without scrolling up and counting
indentation. Logseq's bullet-threading (the `logseq-plugin-bullet-threading` /
`logseq-dev-theme` pair) and the recurring Obsidian forum requests for the same effect are
the evidence that this is a real, felt gap in outliners of this class, not a decoration
nicety.

The decoration system is hardened and its follow-up parking lot
(`docs/research/12-decoration-follow-ups.md`) already carries the adjacent ideas — "hover on
a marker → highlight its guide line", layer configurability — with the standing instruction
that graduating one means giving it its own change rather than patching it in. This change
graduates the current-position family of them.

## What Changes

- A new **position-indicator decoration layer**, driven by the primary cursor's position in
  the parsed tree rather than by the document alone: it recomputes on selection changes, not
  only document changes.
- **Current-node emphasis**: the node containing the cursor renders its marker (our synthetic
  block marker, or a list item's native bullet) in an accent treatment.
- **Ancestor emphasis**, in two escalating shapes:
  - *full* — every guide belonging to a strict ancestor of the current node renders in the
    accent treatment along its whole length, leaving non-ancestor guides untouched;
  - *lineage* — only the part of each ancestor's guide that leads to the caret (from the row
    after that ancestor's own rows down to where the next level begins), and/or an accent on
    every ancestor's own marker, so the accented run reads as the route from the outline root to
    the current node rather than as a set of full-height ancestor guides. Started as a port of
    Logseq's bullet-threading and dropped its horizontal elbows after seeing them in a real note:
    a marker sits ON its own guide column, so an elbow arriving at the next level ran through the
    very icon it was reaching for. The accented ancestor marker is the junction instead.
- **Two independent three-state settings** covering the three features — `guideHighlight`
  (`off` / `full` / `lineage`) and `markerHighlight` (`off` / `current` / `lineage`). Splitting
  them along guides-vs-markers rather than bundling styles makes every combination reachable,
  including markers-only, which is the only rendering that says anything inside a plain list.
  Defaults are `full` guides and `current` markers. Both are purely decorative — no document
  mutation, no cursor movement, no history entries, and no effect on layout geometry
  (indentation, gutters, and text position are byte-identical whichever way they are set). The
  accent is drawn at the same 1px weight as an unaccented guide, so it reads as a change of
  colour rather than of weight.
- Behavior in **pure lists** (no non-list ancestor anywhere) is part of the deliverable, not
  an exclusion: that is where an outliner spends most of its time, and Obsidian's own native
  list guides/bullets are the elements the layer accents there, since our own guide layer
  deliberately draws nothing.
- Findings and screenshots land in a new `docs/research/14-experiment-position-indicators.md`,
  matching the experiment-then-codify discipline the other decoration layers followed.

## Capabilities

### New Capabilities

- `hierarchy-position-indicators`: cursor-derived decoration showing where the caret sits in
  the tree — current-node marker emphasis, ancestor-guide emphasis, and an ancestor route —
  independently configurable, all strictly read-only rendering.

### Modified Capabilities

- `outline-decorations`: the "A pure list renders byte-identical to outline-mode-off"
  requirement is scoped explicitly to the base layers (indentation, guides, markers) so it
  stays a hard invariant for them, while allowing the new opt-in, cursor-derived layer to
  accent native list chrome when a user turns it on. No base-layer behavior changes.

## Impact

- **Code**: `src/plugin/decorate.ts` (a new pure per-line/per-node fact for the cursor's
  ancestor chain, alongside `decorate()`/`computeLineGuides()`); `src/plugin/decorations.ts`
  (a new ViewPlugin in `decorationsExtension`, plus `MarginCompensation` handling for
  widget-replaced atoms); `styles.css` (accent rules keyed off new classes/custom
  properties); `src/plugin/mode-registry.ts` and `src/plugin/main.ts` (two persisted
  settings and their setting-tab controls).
- **Tests**: new `tests/decorate.test.ts` coverage for the pure fact; new e2e spec alongside
  `e2e/specs/51-guides-gradient.e2e.ts` / `52-block-markers-icons.e2e.ts`; the existing
  decoration contracts in `e2e/specs/53-decoration-contracts.e2e.ts` gain a purely-decorative
  assertion. Because two of the three features ship **on** by default, the existing guide and
  marker e2e specs are re-checked against the new default rendering and pinned to an explicit
  setting where their assertions would otherwise become ambiguous.
- **Docs**: new `docs/research/14-experiment-position-indicators.md`; the corresponding
  entries in `docs/research/12-decoration-follow-ups.md` are marked as graduated.
- **Not affected**: the parser, the transaction filter, the editing grammar, node selection,
  and reading view. No new dependencies; public Obsidian/CM6 APIs only.
- **Risk concentrated in one place**: accenting *native* list bullets and indent guides means
  touching DOM we do not own (`.list-bullet::after`, `.cm-indent::before`) — theme-dependent,
  and the reason the change carries an explicit experiment phase before codification.
