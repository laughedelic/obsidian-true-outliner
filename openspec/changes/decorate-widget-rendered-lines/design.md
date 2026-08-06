## Context

See proposal.md — Why, for the motivation and the diagnosis this builds on.

The relevant current state, all in `src/plugin/decorations.ts`:

- `WIDGET_ATOM_SELECTOR = '.cm-embed-block, .cm-line.hr'` enumerates the CSS classes the
  atom kinds happen to carry. Measured (tasks.md — Findings): it matches all four atom kinds
  correctly and **zero** elements in an embed fixture — an embed renders as
  `internal-embed markdown-embed inline-embed`, with no `cm-embed-block` class. The selector
  is also queried **unscoped** over `contentDOM`, so it would match a nested
  `.cm-embed-block` inside a rendered `.cm-line` as readily as a line-level one; its comment
  treats that over-matching as harmless because the `else` branch merely clears styles.
- `MarginCompensation.apply()` branches on `fact?.isAtom`. The `if` computes an
  atom-specific shift (`max(0px, depth × unit − nativePaddingLeft) + gutter`) and applies
  margin, marker, guides, and selection chrome. The `else` strips all of it.
- `styles.css` already scopes every widget rule with the **direct-child combinator**:
  `.cm-content > .cm-embed-block.to-decor-guides`, `.cm-content > [contenteditable='false']
  .to-decor-marker`, `.cm-content > .cm-embed-block.to-decor-node-selected`. The stylesheet
  therefore already encodes "a line-level widget is a direct child of `.cm-content`" — the
  JS query is the only place that lost that distinction.
- `LineDecorationFact` already carries everything a generalized patch needs (`depth`,
  `kind`, `isFirstLine`, `isAtom`, `isListItem`, `supplementalDepth`, `hasChildren`). No new
  fact field is required.
- `shouldShowMarker(fact, visibility)` answers the visibility-setting question only. First-
  line and list-item eligibility are the **caller's** job — today the widget branch gets
  away with skipping both checks because an atom's widget maps to its first line and an atom
  is never a list item. Neither holds once the branch admits other kinds.

## Goals / Non-Goals

**Goals:**

- One predicate, structural rather than kind-based, decides which elements the DOM-patch
  loop owns.
- One shared shift formula serves every kind the loop can now encounter, so the widget path
  and the plain-line path cannot drift apart per kind — the same discipline the existing
  code already applies between a widget's margin and its marker's target column.
- A widget-rendered line lands in the same outline geometry as a plain-rendered sibling at
  the same tree depth.

**Non-Goals:**

- No embed-specific detection (`.markdown-embed`, `![[…]]` matching) anywhere. The whole
  point is that embeds stop being a special case; a fix keyed to them would leave the same
  bug for the next widget-rendered kind.
- No change to the parser, model, encoder, or any structural-operation/enforcement module.
- No new marker icon, and no per-kind icon work — the embed follows its node's kind. The
  parking lot's icon/style ideas stay parked.
- Not addressing vertical geometry (an embed's own block height, spacing above/below) or the
  Minimal-theme `max-width` overflow, which is its own parked entry.

## Decisions

### D1: Ownership is decided by DOM position, not by CSS class or node kind

Select **direct children of `contentDOM` that are not plain `.cm-line`s**, plus
`:scope > .cm-line.hr` (widget-rendered despite carrying `cm-line`), minus CodeMirror's own
scaffolding — `.cm-gap` (viewport-virtualization placeholders, genuinely direct children in
a large document) and `.cm-widgetBuffer`.

An element that stands in for a whole editor line is a direct child of `.cm-content`; a
widget rendered *inside* a line is not. Measurement confirmed both halves: the two
widget-replaced embeds are direct children resolving to the right lines via `posAtDOM`,
while a list-item embed and an inline embed leave their host `.cm-line` intact with the
embed nested inside — and those two placements are already decorated correctly today,
precisely because the nested element is not a direct child.

Chosen over the alternatives because it names no vendor class at all. The measurement
killed the original plan of scoping the existing selector: `.cm-embed-block` never matches
an embed, so scoping alone would have been a no-op, and *adding* `.markdown-embed` to the
enumeration would violate the no-embed-specific-detection Non-Goal and leave the next
widget-rendered kind broken in exactly the same way. The stylesheet already asserts this
same structural invariant through its `.cm-content > …` combinators, so the JS and CSS agree
by construction rather than by coincidence.

- *Alternative — enumerate more classes (`.cm-embed-block, .markdown-embed, .cm-line.hr`):*
  the smallest diff, and the one the original design implied. Rejected: it re-commits the
  exact mistake being fixed — a class list that happens to cover today's kinds — and this
  change exists because that list silently stopped being complete.
- *Alternative — `el.parentElement?.closest('.cm-line') === null`:* survives CM6 someday
  wrapping widgets in an intermediate element, which the direct-child test would not. But it
  would then disagree with the stylesheet, which still selects on `>` — the patch would
  apply and the CSS would not. A single structural test that fails loudly (no decoration at
  all, caught by every existing widget-atom e2e) beats two that silently diverge.
- *Alternative — compare `posAtDOM(el)` against the line's own span:* infers a DOM fact from
  document positions. More moving parts, and it still needs a DOM check to reject a nested
  widget whose position lies inside the same line.

The exclusion list is the one place this predicate can rot: an unknown future direct child
of `contentDOM` would be claimed and patched. That failure is visible (a stray element
shifted right by a line's indentation) rather than silent, which is the trade being made
against an allowlist that goes stale invisibly — the failure mode this change is fixing.

### D2: One shift formula, parameterized by the fact

Extract the shift expression the widget branch currently inlines into a single function of
`(fact, nativePaddingLeft)`:

- depth term: `supplementalDepth` when `fact.isListItem`, `depth` otherwise — the same split
  `decorate.ts` already documents and the plain-line path already applies via
  `--to-supp-depth` / `--to-depth`;
- gutter term: `0px` for a list-item line (native bullet only), `MARKER_GUTTER_CSS`
  otherwise, unconditionally — the reserved gutter must not depend on `markerVisibility`,
  same invariant as today;
- native-padding subtraction and the `max(0px, …)` clamp: unchanged, and still read live.

For an atom this reduces to the exact expression in the code today, so the atom path is
provably unchanged — the point of extracting rather than adding a parallel branch. Every
downstream consumer (`applyWidgetMarker`'s target column, `--to-own-shift` for guides,
`--to-selected-left`) keeps deriving from this one expression, preserving the existing
"never let the marker and the margin compute their column separately" rule.

### D3: Marker eligibility gains the two checks the atom-only branch could omit

The widget branch must now gate on `fact.isFirstLine && !fact.isListItem` before consulting
`shouldShowMarker`. Rather than duplicating that test, hoist the full eligibility question
into one predicate used by both the plain-line marker path and the widget path, so "list
items never get a synthetic marker" and "markers only on first lines" have a single
enforcement point.

`shouldShowMarker`'s `'headings-and-paragraphs'` case (`!fact.isAtom`) already yields the
right answer for a widget-rendered paragraph, and needs no change.

### D4: The cleanup branch narrows to "no line-level decoration state"

After D1 the loop only sees line-level widgets, so the `else` is reached only when the line
has no fact at all. Keep it — as a genuine defensive no-op, with its comment corrected to
say so — rather than deleting it: `posAtDOM` can transiently resolve against a stale
document during a view update, and leaving a patch behind in that case is worse than
clearing it. `clearAll()` (outline mode off, or plugin destroy) is unaffected and keeps its
unscoped query, since it must reach anything a previous scoped pass may have patched.

### D5: Verification is measurement-first and negative-controlled

The four placements (whole-paragraph line, one line of a multi-line node, list-item line,
inline among other text) were asserted from live DOM before any code change, which is what
caught both false premises (tasks.md — Findings). Each new e2e assertion is run with the fix
disabled first, to confirm it actually fails — the existing widget-atom tests would
otherwise keep passing and mask a no-op change.

The load-bearing assertion is **same-depth sibling alignment**: compare the widget-rendered
embed's resolved left edge against a plain paragraph at the same tree depth in the same
fixture, and its marker column against that sibling's. This replaces the design's original
cursor-on-equals-cursor-off formulation, which measurement showed is not observable: a
whole-line embed stays a widget with the cursor anywhere on it, so there is no plain-line
rendering of the same line to compare against. Comparing siblings still avoids hardcoded
pixel values, and asserts the property that actually matters — the embed sits in the
outline geometry — rather than a self-consistency that would also hold if both states were
equally wrong.

## Risks / Trade-offs

- **An embed's subtree is Obsidian-rendered and can re-render asynchronously (the embedded
  note loads, or is edited elsewhere), dropping or duplicating the prepended marker.** This
  is a genuinely new exposure: the existing widget atoms are CM6-owned subtrees that are
  never re-diffed, which is the stated basis for the sanctioned injection site's safety.
  → Prepend into the outer `.cm-embed-block` wrapper, never into inner embed content; keep
  the existing kind/position idempotence guard; and add an e2e that forces an embed
  re-render (edit the embedded note, or toggle the containing note's mode) and asserts
  exactly one marker survives. If a re-render does drop the marker with no CM6 update to
  re-trigger `docViewUpdate`, the fallback is to accept correction on the next editor update
  rather than to introduce an observer — an observer on Obsidian-owned subtrees is the kind
  of coupling this plugin's public-API-only discipline avoids.
- **Widening the loop's predicate admits inputs the atom-only branch never saw.** A
  widget-rendered list-item line, a continuation line, a depth-0 line: each takes a
  different arm of the shared formula. → The formula is derived once (D2) and asserted per
  placement (D5); the atom reduction is checked explicitly so the existing atom behavior is
  demonstrably byte-identical, not merely believed to be.
- **`nativeMarginBasePx()` and `nativeContentRightPx()` pick a reference line by excluding
  our own patched classes.** Measured clean: a line-level widget is not a `.cm-line` at all,
  so it is already excluded from those selectors and cannot contaminate the reading. A
  document whose only plain lines are widget-rendered still falls back to the existing
  graceful-degradation path.
- **The direct-child predicate couples the JS to CM6's current widget-mounting shape.** →
  Accepted deliberately (D1): the stylesheet already carries the same coupling, and the
  failure mode is loud and covered by existing tests.

## Open Questions

- Whether an embed whose source note is missing (`![[Nonexistent]]`) renders as a widget at
  all, or stays a plain line. Safely deferrable: either way the predicate routes it
  correctly — it only determines whether that case is worth its own fixture entry.
