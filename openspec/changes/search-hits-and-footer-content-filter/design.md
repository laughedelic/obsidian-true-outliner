## Context

The footer's controls run in one pure pass over the index's SUMMARIES — path, count, mtime,
tags — before any source note is read: `footer-filter.ts` admits groups, sorts them, applies the
overall cap, and only then does `FooterController.fillGroup` call `place()` for each admitted
group and `buildRows` for its tree (`backlinks-footer.ts`, `render` and `fillGroup`). The term
lives in that pass and matches the note name because that is all the pass can see. The kind axis
is the one control applied twice: once to the counts upstream, once again inside `fillGroup`
because `place()` knows nothing of the controls.

The row model already computes exactly the content a reader sees: `buildRows` emits the lineage
rows, the match rows and one level of descendants, with fold counts for what it withholds
(`footer-model.ts`). `project.ts` states in its header that filtered search is its intended
second consumer, and `docs/research/18` D17 says to share the algebra and not the renderer.

The measurements this design rests on are in `docs/research/19` (S5: placement cost) and
`docs/research/31` (parse-and-match cost; the plan naming this change as the foundation for the
palette and the in-note filter).

## Goals / Non-Goals

**Goals:**

- One matcher module that every search surface reads, so "what does a query mean" is decided
  once and grows in one place.
- The term answered against the content the footer renders, and nothing the footer hides.
- No change to what the footer does while the term is empty: the pre-placement pass, the cap's
  "never read" property, the progressive paint all stay exactly as they are.

**Non-Goals:**

- Any change to the axes, the sort, or the caps themselves.
- Extracting the footer's renderer into a shared module. `search-palette` does that, on top of
  this change, when it has a second consumer for it.
- A debounce on the field. The measured cost does not need one, and the existing focus-restoring
  full re-render is the mechanism the field already uses.

## Decisions

### D1. The term is evaluated after placement, before the cap

While a term is active the pipeline becomes: axes admit groups from summaries → every admitted
group is PLACED → the term admits references within each placed group → groups with no admitted
reference drop → sort → cap → render. While the term is empty the pipeline is unchanged, so the
cap's guarantee that an excluded note is never read holds exactly as before, and the spec states
it that way.

Alternative: answer the term from the summaries by adding reference context to the index. Rejected
because it would duplicate `place()`'s work at index-build time for every reference in the vault,
to serve a field most readers never type in; S5 shows placement on demand is cheap enough that
the honest design is to pay it when asked.

Alternative: apply the term inside `fillGroup` only, leaving the counts and the cap to the
pre-placement pass. Rejected because the header would then report counts the body contradicts
— the requirement that totals follow the filter is the one this would break.

### D2. What "content the footer shows" means, stated on the tree, not on the rows

A reference at node N matches the term when the term occurs in any of: N's own text, the first
line of each ancestor of N, the own text of each child of N, the source note's name. A property
reference matches on its original text. Nothing deeper, because the footer folds it.

Defined on the tree rather than by scanning `buildRows`' output so it is a pure function of
`(doc, nodeId, term)` — `referenceMatches` in `src/search.ts` — unit-testable without the row
model, and reusable by the palette for its own "why is this hit here" later. It is deliberately
the same set of nodes `buildRows` puts on screen for a match at N; a test holds the two together.

Ancestors contribute their FIRST line only, because that is what a lineage segment shows (D5 in
`docs/research/18`). Children contribute their whole own text, because a child row renders it.

### D3. The matcher is a module in the mapping core with one grammar

`src/search.ts`, beside `project.ts`, exporting: `matchesText(text, query)` — the grammar;
`matchNodes(doc, query)` — the ids of nodes whose own text matches, for the palette and the
in-note filter; `referenceMatches(doc, nodeId, query)` — D2. The grammar today is a trimmed,
case-insensitive literal substring; an empty query matches everything.

Everything later — word splitting, quoted phrases, exclusion, fuzziness — changes
`matchesText` and nothing else, and every surface follows. `docs/research/31`'s survey records
what it costs when surfaces disagree about a query.

### D4. The row model carries a hit, and a hit may carry a backlink kind

`FooterRow`'s `isReference` becomes `isHit`; `referenceKind` stays as the optional
backlink-specific annotation; `buildRows`' `refOf` accessor becomes `hitOf`, returning the
content reference `nodeContent` already accepts (`{ line?, text? }`) plus the optional kind. The
footer passes what it passes today; a search backend passes a hit with no kind. The kind axis,
the embed tag and the property rows stay backlink concerns, read from the annotation where it is
present.

A rename rather than a second row type, because the rows are the same rows: the palette prototype
rendered `buildRows`' output unchanged (`docs/research/31`), and what it lacked was only a name
that did not say "reference".

### D5. Admission within a placed group is one pure function, used for kind and term alike

`fillGroup` today re-applies the kind axis by hand. The term needs the same treatment, and both
need to agree with the count the header reports. One function in `footer-filter.ts`,
`admitReferences(placed, controls)`, returns the references a placed group admits, and both the
term-active render pass (for counts and the cap) and `fillGroup` (for rows) call it. Two call
sites, one rule.

### D6. Matches are marked after rendering, by walking text nodes

Row content is Obsidian's rendered markdown, so the term cannot be marked in the source string
without breaking links and formatting. After `renderInline` resolves, the row's text nodes are
walked and each occurrence is wrapped in a `<mark class="to-match">`; an author's `==highlight==`
renders as a bare `<mark>`, and the class keeps the two distinguishable in the stylesheet. The
prototype in `docs/research/prototypes/search-palette/` carries a working version of the walk.

Marking happens only while a term is active, on rows the term admitted, so an empty term costs
nothing and clears everything by the next render.

## Risks / Trade-offs

- [The header's totals are no longer instant while a term is active — they wait for placement]
  → The wait is S5's ~2ms for a hub note with a warm tree cache. The cold case is the first
  keystroke after load, bounded by the note's source count, and the existing generation guard
  discards a stale pass if the reader types on. The header shows the previous totals until the
  new ones land rather than a skeleton, per D11 in `docs/research/18`.
- [Placing every axis-admitted source for a hub note on every keystroke] → Trees are cached by
  mtime in `SourceTreeCache`; `place()` re-runs only the line-to-node lookup. If a real vault
  shows it, a debounce is a one-line addition; it is not added on speculation.
- [The `isReference` → `isHit` rename touches every footer test and the conformance matrix's
  `is-reference` class] → The DOM class is kept as `is-hit` with the same meaning; the e2e specs
  that read it are updated in the same change and listed in tasks.
- [Two definitions of "what is visible" — D2's on the tree and `buildRows`' on the rows — could
  drift] → One unit test builds rows for a match and asserts the set of texts D2 searches equals
  the set of texts the rows carry, so a change to either fails it.

## Open Questions

None that change the specs or the tasks. Whether the term should ALSO match content the footer
folds — trading D2's "what you see is what matches" for recall — is a product question to revisit
once the palette exists and readers have both surfaces.
