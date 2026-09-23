## Why

While zoomed, the backlinks footer still shows every reference to the note. A reader who zoomed
into one node to work on it gets the mentions of every other part of the note too, and has to pick
out by eye the few that point at what they are looking at. `docs/research/structured-backlinks`
D13 deferred exactly this — "zoom carries the footer" — until a node could be zoomed into and the
footer had a controls model to put a scope in. Both exist now, and `backlinks-footer` records the
narrowing as belonging "with the footer's filter model".

What a heading or block link addresses, and how that has to be located in our tree, is measured in
`docs/research/zoom-scoped-backlinks`: which block Obsidian says a `^id` names, what a heading
subpath matches, and how far Obsidian's metadata runs behind the editor.

## What Changes

- **While zoomed, the footer answers for the zoomed view.** By default it shows only the
  references whose heading or block subpath lands on the zoom root or on a node below it. A link to
  the note as a whole is not a reference to a node, and is left out of that answer.
- **Three answers, chosen from the header.** This node, This node and below, Whole note. The
  header reads "Backlinks to ‹Current sprint and below›"; the bracketed part is a control opening a
  menu of the three, each with the count it would show, and the totals beside it are that answer's.
  The choice is kept per note like the footer's other view state. This is option A of the six in
  `docs/research/zoom-scoped-backlinks`; the others are recorded there with their trade-offs.
- **A view with nothing to link to answers for the note.** When neither the zoom root nor anything
  below it carries a heading or a block id, the narrower answers are empty by construction; the
  footer answers for the note, as it does today, and the menu says why the other two are
  unavailable.
- **An empty answer says so.** A view that has anchors but no references to them shows one quiet
  line and an action that widens to the whole note, rather than the dormant "no linked references"
  footer, which would say the note has none.
- **Obsidian decides where a subpath lands; the live document decides where the anchors are.** The
  headings and block ids are derived from the note as the editor holds it and handed to Obsidian's
  own `resolveSubpath`, so case, punctuation, nested heading paths and duplicate headings resolve as
  Obsidian's links do, and an edit in the zoomed view changes the answer without waiting for a save.
- **The index reports each reference's subpath**, from the metadata it already reads.
- **The answer is the footer's subject, not a filter.** It is applied before the axes, the search
  term, the sort and the caps, so the totals, the axes' offered values and the cap budget all
  describe it. The filter affordance does not report it, Reset does not clear it, and it is decided
  without reading any source note.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `backlink-index`: a reference reports the subpath it addresses, for every kind that can carry
  one.
- `backlink-filtering`: gains the zoom scope — the three answers and what each admits, where an
  anchor belongs in the tree, and the scope's place ahead of every filter.
- `backlinks-footer`: the zoom requirement changes from "keeps answering for the note" to "answers
  for the selected answer"; the header names the answer in force and offers the other two; an empty
  answer gets its own state.

## Non-goals

- References from inside the note to its own headings or blocks (`[[#Heading]]`). The index does
  not report a note's links to itself, and this change leaves that alone.
- The count decoration on an anchor in the editor, D13's second half.
- Grouping the scoped footer by the anchor each reference targets, or marking the target on each
  row.
- Answers wider than the zoom root and narrower than the note — an ancestor's section, a ladder of
  scopes.
- A setting for the default answer. The in-footer choice comes first; a default is chosen once it
  has been used.
- A node scope without zoom — by caret, or in a sidebar pane.
- Block-id shapes outside the probe (a table row ending in an id, footnotes, HTML blocks) beyond
  what the agreement check in the tasks covers.
- Reading mode.

## Impact

- **New**: `src/anchors.ts` — the headings and block ids of a parsed document, each with the node
  it belongs to and the start line Obsidian gives it. `src/plugin/footer-scope.ts` — the answers
  for one zoom: which anchors are in view, which subpaths each answer admits, which answers are
  available.
- **Modified**: `src/plugin/backlink-index.ts` (the subpath on a reference),
  `src/plugin/footer-filter.ts` (the scope in the controls, applied first),
  `src/plugin/backlinks-footer.ts` (the widget carries the scope; the header control, its menu and
  the empty state), `styles/20-backlinks-footer.css`.
- **Tests**: `tests/anchors.test.ts`, `tests/footer-filter.test.ts`, a new
  `e2e/specs/77-footer-zoom-scope.e2e.ts` and its fixtures under `test-vault/Backlinks/`.
- **Docs**: `docs/research/structured-backlinks` D13 gains a pointer to this change.

## Sequencing

Stacks on the fix for [#207](https://github.com/laughedelic/obsidian-true-outliner/issues/207),
which makes a lone `^id` line part of the node it names. This change reads what that fix adds:
with it, where an id belongs follows from which node holds its line, and D2's attribution rule
shrinks to the whole-list case.

At the file level the code also overlaps the open draft `feat/search-palette`
([#95](https://github.com/laughedelic/obsidian-true-outliner/pull/95)), which edits
`backlinks-footer.ts`, `backlink-index.ts` and `footer-model.ts`; this change reads nothing it adds.
`feat/drag-nodes-with-a-drop-preview` ([#124](https://github.com/laughedelic/obsidian-true-outliner/pull/124)),
the other overlap, has landed on `main`.
