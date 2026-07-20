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

### Layer configurability: everything optional except indentation

Make most of the decoration system configurable and optional. Indentation is the one
essential layer (though its **unit size should be configurable** — today it's the fixed
`--to-decor-unit` fallback of 1.5rem); everything else should be independently
switchable without breaking the indentation underneath:

- **Guide lines and marker icons toggleable separately** — each layer off entirely, with
  the others unaffected. (The gutter-reservation question resurfaces here: today the
  marker gutter is reserved unconditionally so `markerVisibility` never reflows text;
  turning icons off *as a layer* could legitimately drop the gutter too — a different
  contract than hiding some icons, worth deciding explicitly.)
- **Which icons to show, and their style** — extend the existing `markerVisibility` axis
  toward per-kind selection, style variants, and possibly **custom icons per node kind**.
  Folds in the per-level heading markers idea (H1–H6, validated in the wild by
  obsidian-lapel): thread the heading `level` through `LineDecorationFact` and branch
  `buildMarkerIcon` (or render a text label). Lapel's theming pattern is worth copying
  regardless of the built-in visuals: `data-kind`/`data-level` attributes plus
  CSS-custom-property indirection, so themes/snippets can restyle markers without
  touching the plugin.
- **A simpler, consistent bullet-style marker set as an opt-in** — one uniform mark for
  every kind, closer to a traditional outliner's look. (Experiment 5b's uniform dot lost
  the head-to-head as the *default*, but as an opt-in preset under the 5a mechanism it's
  just an icon-set swap, none of 5b's positioning machinery.)

User CSS snippets remain the escape hatch for anything finer-grained than whatever
settings surface we commit to (design.md Non-Goals) — the settings axis should stay
small and opinionated rather than mirror every CSS knob.

### Marker/guide interactions (hover and click)

Concrete interaction ideas on top of the existing "marker as a click target" direction:

- **Hover on a marker → highlight its guide line** (cheap visual affordance connecting
  the crown to its subtree).
- **Click on a marker → zoom into that node** (depends on zoom functionality existing —
  a separate feature, not a decoration change).
- **Click on a guide → zoom into, or fold, the whole subtree** — which of the two should
  be configurable.

The standing caveats from doc 10's addendum still gate all of these: `MarkerWidget`
currently sets `pointer-events: none` + `ignoreEvent() → true` (both need careful
revisiting against CM6 focus/cursor handling), guides are `pointer-events: none`
pseudo-elements today (a click target needs a real hit area), and lapel's menu
positioning uses non-public API, so a public-API-only equivalent needs verifying first.

### Outline decorations in reading mode

Today outline mode only renders in Live Preview — the plugin registers CM6 editor
extensions exclusively, and design.md lists reading view as untouched-by-construction.
Making outline mode toggleable **independently of the edit/reading mode** would make the
plugin useful as a pure reading aid (explicit document structure) even before any
editing features matter to a user. This is a genuinely new mechanism, not a port: reading
view renders through a `MarkdownPostProcessor` pipeline, not CM6, so none of the
decoration plumbing (facts → decorations/DOM patches) carries over directly — only the
pure `decorate()`/`computeLineGuides()` layer does.

### Other design ideas

- **Shrinking only our own added list margin** — the standing open question from
  Experiment 1's review (list items sit visibly right of same-depth siblings due to
  Obsidian's native hang). Full framing, including the two known risks (clamping, and
  compensating from the list *root*'s hang, not per-item):
  [10-experiment-5-block-markers.md](10-experiment-5-block-markers.md#open-question-shrinking-only-our-own-added-list-margin).
  A design decision to surface deliberately, not implement in passing.
- **Native list decoration experiments** — beyond the margin question above: spacing,
  alignment, and bullet-marker style for lists could all be revisited. Not important
  now; native list rendering is deliberately untouched today (the additive-only
  discipline), so any change here needs the same experiment-and-look rigor the original
  series used.
- **Collapsing gap lines.** Blank separator lines between paragraphs/headings/blocks are
  fully preserved today; once the outline structure is explicit, they're arguably
  redundant, and hiding/collapsing them (as a **configurable option**) would tighten the
  outline view. Needs investigation of whether CM6 line-hiding (replace decorations over
  blank lines) coexists with editing on those positions, and interacts with the guide
  continuity work (`computeLineGuides` deliberately covers gap lines — collapsed gaps
  change that geometry).
- **Preserve the viewport position when toggling outline mode.** In a long document,
  toggling outline mode on or off currently jumps the view to the top — the user loses
  their place exactly when comparing the two renderings. Best effort, on some consistent
  logic: the cursor is a natural anchor in edit mode (reading mode, if it ever gets
  outline rendering, needs a different one). Collapsing gap lines (above) would make
  exact restoration harder — the anchor logic should be chosen to degrade gracefully
  rather than promise pixel fidelity.

### Vertical-alignment polish (minor, recorded from real-vault use)

The table and callout icons currently flex-center vertically within the widget's full
box; for consistency with everything else (markers otherwise track the first text row)
they should stick near the **top** of the block instead. The code-block icon could also
come down slightly (it sits a touch too high at the top). Cosmetic only, low stakes —
bundled with the next deliberate decoration pass rather than done ad hoc.

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
