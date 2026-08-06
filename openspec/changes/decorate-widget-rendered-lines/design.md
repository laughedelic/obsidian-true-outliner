## Context

See proposal.md — Why, for the motivation and the diagnosis this builds on.

The relevant current state, all in `src/plugin/decorations.ts`:

- `WIDGET_ATOM_SELECTOR = '.cm-embed-block, .cm-line.hr'` is queried **unscoped** over
  `contentDOM`, so it matches nested `.cm-embed-block`s inside a rendered `.cm-line` as well
  as line-level ones. Its own comment treats that over-matching as harmless, because the
  loop's `else` branch merely clears styles on them.
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
- The cursor-on and cursor-off renderings of the same line become indistinguishable in
  horizontal geometry, marker, guides, and selection chrome.

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

### D1: Ownership is decided by DOM position, not by node kind

Scope the query to direct children of `contentDOM`:
`:scope > .cm-embed-block, :scope > .cm-line.hr`. An element that stands in for a whole
editor line is a direct child of `.cm-content`; a widget rendered *inside* a line is not.

Chosen over the alternatives because the stylesheet already asserts exactly this invariant
via `>` combinators in every widget rule — the JS and CSS end up agreeing by construction
instead of by coincidence, and the nested-widget exclusion the spec now requires becomes
structural rather than a guard someone can forget.

- *Alternative — `el.parentElement?.closest('.cm-line') === null`:* survives CM6 someday
  wrapping widgets in an intermediate element, which the direct-child test would not. But it
  would then disagree with the stylesheet, which would still be selecting on `>` — the patch
  would apply and the CSS would not. If CM6 ever changes that shape, both must move
  together; a single structural test that fails loudly (no decoration at all, caught by
  every existing widget-atom e2e) is preferable to two that silently diverge.
- *Alternative — compare `posAtDOM(el)` against the line's own span:* infers a DOM fact from
  document positions. More moving parts, and it still needs a DOM check to reject a nested
  widget whose position lies inside the same line.

**This must be measured, not assumed** — task 1 confirms live, for each of the four
placements an embed can occupy, whether its rendered element is a direct child of
`.cm-content`. If a placement turns out not to be, the finding changes which branch handles
it, not the predicate.

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
inline among other text) are asserted from live DOM before any code changes, so the fix is
built against measured behavior rather than an assumed DOM shape. Each new e2e assertion is
run with the fix disabled first, to confirm it actually fails — the existing widget-atom
tests would otherwise keep passing and mask a no-op change.

The load-bearing assertion is **cursor-on equals cursor-off**: measure the line's resolved
horizontal geometry and marker presence with the cursor on it, move the cursor away, and
assert they match. That asserts the mechanism's actual contract rather than a hardcoded
pixel value that could be right for the wrong reason.

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
  our own patched classes.** A line-level `.cm-embed-block` is not a `.cm-line`, so it is
  already excluded from those selectors and cannot contaminate the reading. → Confirm in the
  measurement task rather than assume; a document whose only plain lines are widget-rendered
  falls back to the existing graceful-degradation path.
- **The direct-child predicate couples the JS to CM6's current widget-mounting shape.** →
  Accepted deliberately (D1): the stylesheet already carries the same coupling, and the
  failure mode is loud and covered by existing tests.

## Open Questions

- Whether an embed whose source note is missing (`![[Nonexistent]]`) renders as a widget at
  all, or stays a plain line. Safely deferrable: either way the predicate routes it
  correctly — it only determines whether that case is worth its own fixture entry.
