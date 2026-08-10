## Why

A `![[Another note]]` line is never part of the outline. Obsidian renders it as an opaque
`internal-embed markdown-embed` element in place of the line, and the decoration layer
misses it entirely: it sits flush left with no indentation, no marker, no guides, and no
selection chrome, while every sibling around it is decorated normally. Found in the
2026-07-20 personal-vault pass; parked in
[docs/research/12-decoration-follow-ups.md](../../../docs/research/12-decoration-follow-ups.md).

The measurement pass (tasks.md — Findings) corrected that entry's diagnosis on two points.
The entry assumed the DOM-patch loop's broad `WIDGET_ATOM_SELECTOR` matched the embed and
then discarded it via the `fact.isAtom` cleanup branch; measured on Obsidian 1.13.4 the
selector matches **zero** elements in an embed fixture, because the embed carries no
`cm-embed-block` class at all — the loop never visits it. The entry also assumed the line
reverts to a decorated plain `.cm-line` while the cursor is on it; measured, it stays a
widget with the cursor anywhere on the line. The bug is therefore simpler and more absolute
than recorded: the embed is not decorated in any state.

The root cause is broader than embeds, and shows up twice over. The DOM-patch loop asks
*what kind of node is this?* — first by enumerating the CSS classes the atom kinds happen
to carry (`WIDGET_ATOM_SELECTOR`), then by gating on `fact.isAtom` — when the only thing
that matters is *did Obsidian replace this line with an opaque element, so the declarative
decoration never landed?* Those questions coincide for tables, callouts, HTML blocks, and
horizontal rules, which is why both gates have held so far. An embed is the first case
where they come apart — and it will not be the last, because an embed is not a node kind at
all. It is a rendering phenomenon that can appear on a paragraph line, on one line of a
multi-line node, inside a list item, or inline among other text, with the node model
correctly seeing a paragraph or a list item in every one of those cases.

## What Changes

- **Line-level widgets are selected structurally, not by class enumeration.** The loop
  claims every direct child of the editor's content element that is not a plain `.cm-line`
  (plus `.cm-line.hr`, which is widget-rendered despite carrying `cm-line`), excluding
  CodeMirror's own scaffolding. That reaches embeds and the atom kinds alike without naming
  either, and it is the same structural fact the stylesheet already asserts through its
  `.cm-content > …` child combinators.
- **The DOM-patch path is applied by rendered form, not by node kind.** A widget that
  stands in for a whole editor line receives that line's own indentation contribution,
  marker, guides, and selection chrome, computed from the line's existing decoration fact
  — whatever kind that fact reports. A widget nested *inside* a rendered `.cm-line` (an
  inline embed among text, an embed inside a list item) is left alone: its host line is a
  real `.cm-line` that already received its decoration declaratively, and patching the
  nested element too would double-shift it. Structural selection gives this for free —
  a nested widget is not a direct child.
- **A widget-rendered line's marker follows its node's kind**: a widget-rendered paragraph
  gets the paragraph marker, a widget-rendered list-item line gets none (native bullet
  only), a continuation line gets none. No new marker vocabulary, and no embed-specific
  icon — an embed line is decorated as exactly what it parses as.
- **No model change.** `NodeKind` gains no `embed` member, the parser is untouched, and
  `encode(parse(md))` byte-identity is unaffected. An embed line stays whatever it parses
  as.
- **New verification.** An embed fixture in the decoration corpus (none exercises embeds
  today), covering all four placements an embed can occupy, with a same-depth plain sibling
  in each case so alignment is asserted by comparison rather than against a hardcoded pixel
  value.

Not breaking: every currently-correct rendering is preserved, and this adds decoration
where there was none.

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
  (tables, callouts, raw HTML, horizontal rules)". A widget-rendered line gets no selection
  chrome for the same reason it gets no margin, and the requirement needs the same
  generalization.

## Impact

- `src/plugin/decorations.ts` — `WIDGET_ATOM_SELECTOR` (widened from a class enumeration to
  a structural predicate) and the `MarginCompensation.apply()` widget loop: the
  `fact?.isAtom` gate, its cleanup `else`, and the shift/marker/guide/chrome expressions
  inside it, which today assume every patched element is an atom.
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
