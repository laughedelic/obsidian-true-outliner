## Why

A `![[Another note]]` line drops out of the outline entirely the moment the cursor leaves
it. With the cursor on the line it is a plain `.cm-line` and renders correctly — indented,
with a paragraph marker and its ancestors' guides. When the cursor leaves, Obsidian
replaces the line with an opaque `.cm-embed-block.markdown-embed` widget, and the
decoration layer's DOM-patch loop — which gates on `fact.isAtom` — takes its *cleanup*
branch instead, stripping margin, marker, guides, and selection chrome. The embed snaps
flush left, outside the outline geometry, and the same block visibly changes structure
depending on where the caret happens to be. Found in the 2026-07-20 personal-vault pass;
diagnosed and parked in
[docs/research/12-decoration-follow-ups.md](../../../docs/research/12-decoration-follow-ups.md).

The root cause is broader than embeds. `fact.isAtom` is the wrong predicate: it asks *what
kind of node is this?* when the only thing that matters is *did Obsidian replace this line
with an opaque widget, so the declarative decoration never landed?* Those two questions
happen to coincide for tables, callouts, HTML blocks, and horizontal rules, which is why
the gate has held so far. An embed is the first case where they come apart — and it will
not be the last, because an embed is not a node kind at all. It is a rendering phenomenon
that can appear on a paragraph line, on one line of a multi-line node, inside a list item,
or inline among other text, with the node model correctly seeing a paragraph or a list item
in every one of those cases.

## What Changes

- **The DOM-patch path is selected by rendered form, not by node kind.** A widget that
  stands in for a whole editor line receives that line's own indentation contribution,
  marker, guides, and selection chrome, computed from the line's existing decoration fact
  — whatever kind that fact reports. A widget nested *inside* a rendered `.cm-line` (an
  inline image embed among text, an embed inside a list item) is left alone: its host line
  is a real `.cm-line` that already received its decoration declaratively, and patching the
  nested element too would double-shift it.
- **The cleanup branch narrows to its true no-op case.** Today it fires for every widget
  whose line's fact is not an atom — which is exactly the bug. After this change it fires
  only for widgets that genuinely carry no line-level decoration state.
- **A widget-rendered line's marker follows its node's kind**, the same marker the line
  already shows with the cursor on it. A widget-rendered paragraph gets the paragraph
  marker; a widget-rendered list-item line gets none (native bullet only); a continuation
  line gets none. No new marker vocabulary, and no embed-specific icon: the whole point is
  that the cursor-on and cursor-off renderings stop disagreeing.
- **No model change.** `NodeKind` gains no `embed` member, the parser is untouched, and
  `encode(parse(md))` byte-identity is unaffected. An embed line stays whatever it parses
  as.
- **New verification.** An embed fixture in the decoration corpus (none exercises embeds
  today) plus e2e coverage of both the cursor-on-line and widget states, across the
  placements an embed can actually occupy.

Not breaking: every currently-correct rendering is preserved, and this adds decoration
where decoration was previously stripped.

## Capabilities

### New Capabilities

None. This corrects and generalizes existing decoration requirements rather than
introducing a new capability.

### Modified Capabilities

- `outline-decorations`: two requirements state the mechanism in terms of node kind, and
  both become false under a widget-rendered paragraph. "Additive-only indentation, native
  list rendering untouched" says headings and paragraphs take their contribution via
  `padding-left`; a widget-rendered paragraph must take it via `margin-left`, since padding
  never moves an opaque widget's own box. "Widget-replaced atoms receive indentation and
  markers via direct DOM patching" scopes that whole path to "tables, callouts, raw HTML
  blocks, and horizontal rules" — an enumeration of kinds that is not the real class. Both
  are restated in terms of rendered form, with the nested-widget exclusion made explicit.
- `escalated-selection-decoration`: "Chrome composes with existing decorations without
  displacing them" likewise scopes the DOM-patch path to "widget-replaced atom lines
  (tables, callouts, raw HTML, horizontal rules)". Selection chrome on a widget-rendered
  line is stripped by the same wrong branch, and the requirement needs the same
  generalization.

## Impact

- `src/plugin/decorations.ts` — `WIDGET_ATOM_SELECTOR` and the `MarginCompensation.apply()`
  widget loop: the `fact?.isAtom` gate, its cleanup `else`, and the shift/marker/guide/
  chrome expressions inside it, which today assume every patched element is an atom. The
  loop's line resolution (`posAtDOM`) and the new line-level-vs-nested discrimination are
  the load-bearing pieces.
- `src/plugin/decorate.ts` — read-only in the expected shape: `LineDecorationFact` already
  carries `kind`, `depth`, `isFirstLine`, `isListItem`, and `supplementalDepth`, which is
  everything the generalized patch needs. `isAtom` stays on the fact (it still selects
  padding vs. margin for plain lines); it just stops being the widget loop's gate.
- `e2e/fixtures` and `e2e/specs/50-decorations.e2e.ts`, `51-guides-gradient.e2e.ts`,
  `52-block-markers-icons.e2e.ts`, `63-selection-visual-treatment.e2e.ts` — a new embed
  fixture and coverage for the widget/cursor-on states.
- `docs/research/12-decoration-follow-ups.md` — the "Wiki-embed blocks bypass decoration
  entirely" entry graduates out of the parking lot.
- No change to `src/parse.ts`, `src/model.ts`, `src/encode.ts`, or any structural-operation
  or enforcement module.
