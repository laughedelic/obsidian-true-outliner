# Decoration follow-ups: deferred ideas and known gaps

A parking lot for decoration-related improvements we have deliberately chosen **not** to
do yet. The decoration system (additive indentation + CSS-gradient guides + SVG icon
block markers) is hardened and production-ready as of the outline-decorations hardening
pass; the project's priority now is proving the rest of the roadmap's goals are
implementable, not polishing this one layer further. Items land here with enough
diagnosis that picking one up later doesn't require re-discovery; nothing here is
scheduled.

When an item graduates to real work, it should get its own openspec change (or fold into
one), not be patched ad hoc — several of these touch the model or are design decisions,
not bug fixes.

## Known gaps (diagnosed, deferred)

### Wiki-embed blocks bypass decoration entirely

Found in the 2026-07-20 personal-vault pass. A `![[Another note]]` line parses as a
**paragraph** (the parser has no embed concept), so while the cursor is on the line — a
plain `.cm-line` — it correctly renders as an indented paragraph with a paragraph marker.
When the cursor leaves, Obsidian replaces the line with an opaque
`.cm-embed-block.markdown-embed` widget: `MarginCompensation`'s broad
`WIDGET_ATOM_SELECTOR` does match it, but the line's fact says `kind: 'paragraph'`,
`isAtom: false`, so the code takes its cleanup branch and strips margin/marker/guides
from the frame — the embed sits flush left, outside the outline geometry. (The cleanup
branch's own comment assumed elements-without-atom-facts were a harmless no-op case,
citing inline image embeds; a full-line note embed is the case where it isn't.)

Fixing this is a **model decision first, mechanism second**: is an embed line its own
node kind (an atom — it can't have children by adjacency the way a paragraph can), or a
paragraph whose widget-rendered form the DOM patch should handle specially? Once decided,
the mechanism already exists — the widget-atom margin/marker/guide path applies almost
unchanged. Also needs: a fixture in the decoration corpus (none exercises embeds today),
e2e coverage for both cursor-on-line and widget states, and a decision on which marker
icon an embed gets.

### RTL-aware placement (openspec outline-decorations task 5.9)

The marker's `left`-shift assumes the line's first character renders at the physical
left; in RTL it renders at the right, so the icon lands on top of the text, and
indentation + guides sit on the physical left edge, detached from right-aligned text.
Full finding and screenshot evidence: the hardening pass's RTL e2e test
(`52-block-markers-icons.e2e.ts`) and tasks.md 5.9. **Deprioritized until there are real
users who need RTL** — the fix is direction-aware placement (per-line direction
detection, mirrored shift, and a design decision about which side the gutter/guides
belong on), not a patch.

## Deferred mechanisms (working today, better shapes known)

- **`forceRedraw` → a real refresh API.** The off/on mode-toggle hack for
  byte-identical-decoration settings changes stays because `app.workspace.updateOptions()`
  demonstrably fails that scenario (evaluated with evidence — see `forceRedraw`'s doc
  comment in `main.ts` and tasks.md 5.3). Worth re-evaluating if Obsidian ever ships an
  API that forces a view-plugin refresh, or if our extension moves to the
  swap-the-extension-array pattern that makes `updateOptions()` produce a real
  reconfigure diff.
- **Viewport-limited decoration building.** Facts build over the whole document; building
  only over `view.viewport` (rebuild on `docChanged || viewportChanged`) is the standard
  shape (obsidian-lapel demonstrates it) and becomes worthwhile for multi-thousand-line
  documents. CM6's incremental `syntaxTree` could also supply per-line *kind*
  classification with no separate reparse — though not our tree *depths* (tasks.md 5.4's
  closing note).

## Design ideas (not started, deliberately)

- **Shrinking only our own added list margin** — the standing open question from
  Experiment 1's review (list items sit visibly right of same-depth siblings due to
  Obsidian's native hang). Full framing, including the two known risks (clamping, and
  compensating from the list *root*'s hang, not per-item):
  [10-experiment-5-block-markers.md](10-experiment-5-block-markers.md#open-question-shrinking-only-our-own-added-list-margin).
  A design decision to surface deliberately, not implement in passing.
- **Per-level heading markers (H1–H6).** Validated in the wild by obsidian-lapel. Small
  under the current mechanism: thread the heading `level` through `LineDecorationFact`
  and branch `buildMarkerIcon` (or render a text label). Lapel's theming pattern is worth
  copying regardless: `data-level`/`data-kind` attributes plus CSS-custom-property
  indirection so themes/snippets can restyle markers without touching the plugin. See doc
  10's prior-art addendum.
- **Marker interactivity** — a node's marker as a click target for outline operations
  (change kind/level, fold, zoom, structural moves). The real-DOM marker mechanism was
  chosen partly to keep this possible. Two caveats recorded in doc 10's addendum:
  `MarkerWidget` currently sets `pointer-events: none` + `ignoreEvent() → true` (both
  need careful revisiting against CM6 focus/cursor handling), and lapel's menu
  positioning uses non-public API, so a public-API-only equivalent needs verifying first.
- **Configurable marker glyphs/guide styling** beyond the `markerVisibility` axis — user
  CSS snippets remain the intended escape hatch (design.md Non-Goals); revisit only on
  real demand.

## Verification-infrastructure ideas

- **Community-theme sweep as repeatable infrastructure.** The hardening pass probed
  Minimal/Catppuccin/Things via a throwaway spec (install theme into the sandboxed vault,
  screenshot fixtures, review by eye) — clean results, but the probe wasn't kept. If
  theme regressions ever become a recurring concern, that probe shape is the starting
  point; committing third-party theme CSS to the repo (licensing, size, staleness) is the
  main cost to weigh.
- **Consolidating per-experiment verification residue into `verification.md`** — the
  split noted in tasks.md 3.3 (each experiment doc carries its own results section)
  stays livable; consolidate only if navigating it proves hard in practice.
