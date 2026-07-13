> **⚠ Paused for experiments, 2026-07-13.** This design was implemented three times and
> failed in real vault use — cascade/`!important` fights, em/rem unit bugs (marker size
> scaling with heading font-size), native list hanging-indent corruption, fold-indicator
> collisions. Full account:
> [docs/research/06-outline-decorations-postmortem.md](../../../docs/research/06-outline-decorations-postmortem.md).
>
> **D1, D2, and D4 below are void** — the CSS-custom-property/line-attribute mechanism they
> describe is exactly what broke, repeatedly. **Goals/Non-Goals and D3/D5/D6 still hold** —
> depth-from-tree-position, paragraph-only marker scope, and mode-gating are mechanism-
> agnostic and remain the target. Before writing a new mechanism, isolated prototyping
> experiments are running per
> [docs/research/07-decoration-experiments-plan.md](../../../docs/research/07-decoration-experiments-plan.md).
> Rewrite this file with validated decisions once they conclude — do not implement against
> D1/D2/D4 as they stand.

## Context

Outline mode's editing model (structural commands + keyboard grammar) is complete and
correct, but it is invisible: list items already render Obsidian's native bullet, so they
happen to look right, while heading and (especially) paragraph nodes render exactly like
stock markdown. The first dev-vault verification round hit this directly — flat,
paragraph-heavy documents give no visual signal that outline mode is even on, let alone
where node boundaries fall. This change adds a read-only CM6 decoration layer that makes
the parsed tree visible: depth-based indentation guides across all three depth encodings
(heading level, list indentation, paragraph adjacency), plus a leader marker for the one
node kind with no native leader (paragraphs).

The existing precedent to follow is `src/plugin/grammar.ts` + `src/plugin/keymap.ts`: a
pure module that computes a result from `(text, doc-position)` with no CM6 imports, and a
thin CM6 adapter that wires it into `registerEditorExtension`, gated by the same
`ModeSource`/`editorInfoField` pattern already used for the keyboard grammar and commands.
Decorations reuse this shape but produce a `DecorationSet` instead of a transaction.

## Goals / Non-Goals

**Goals:**
- Every node's tree depth is visible via an indentation guide, computed from its position
  in the parsed tree (not from raw markdown indentation/level), so heading subtrees, list
  nesting, and paragraph-adjacency children all read as one consistent hierarchy.
- Paragraph nodes — the only kind with zero native leader — get a synthetic marker so a
  flat sequence of paragraphs visibly reads as outline nodes.
- Decorations are strictly read-only: no document mutation, no cursor movement, no undo
  entries, ever.
- Same mode-gating guarantee as the rest of the plugin: off outline mode (or file has
  never been toggled on), the editor is byte-for-byte stock Obsidian; toggling applies
  immediately, no reload.
- Mobile-safe (CM6 `Decoration`/CSS only, no Node/Electron APIs) and acceptable
  performance on typical single-note documents.

**Non-Goals:**
- Fold chevrons or any fold state/persistence (separate later layer, per
  `docs/research/04-open-questions.md` Q4).
- Zoom/breadcrumbs, drag handles, node-selection highlight — all depend on layers not
  built yet (selection model, zoom).
- Interactivity on the decorations themselves (click-to-select, click-to-fold, hover
  affordances) — this change is passive chrome, not a new input surface.
- Configurable marker glyph/guide styling via a settings UI — v1 ships one fixed visual
  language; user CSS snippets remain the escape hatch, same as any other Obsidian styling.
- Reading (preview) view — untouched by construction; this plugin only registers CM6
  editor extensions, never a `MarkdownPostProcessor`.

## Decisions

### D1. Line decorations + CSS custom properties for depth, not per-depth classes
Each line belonging to a node gets a `Decoration.line` with an `attributes` style setting
a `--to-depth: N` CSS custom property; a single stylesheet rule uses `calc()` to derive
indentation/guide position from the variable. Alternative considered: a fixed set of
discrete depth classes (`.to-depth-0` … `.to-depth-10`). Rejected — nesting depth is
unbounded (deeply nested lists, multi-level heading trees), and a capped class set either
breaks at depth 11 or requires generating classes dynamically, which a single `calc()`
rule avoids entirely.

### D2. Guides and the paragraph marker are both pure line-attribute decorations (no widgets)
Both the indentation guide and the paragraph leader marker are implemented as
`Decoration.line` attributes (a CSS class + the depth variable) with the visible mark
drawn by a CSS `::before`/`background` rule, not `Decoration.widget`. Alternative
considered: `Decoration.widget` DOM nodes for the marker (more flexible if it ever needs
interactivity). Rejected for v1 — widgets carry DOM-node lifecycle cost recomputed on
every viewport update and buy nothing while the marker is non-interactive (a Non-Goal);
line attributes are cheaper and match how the guides already work, keeping one mechanism
for the whole layer. Revisit if a later change makes markers clickable.

### D3. Depth is derived by walking the parsed tree, not from source indentation/level
A node's depth is its distance from the document root in the `OutlineDoc` tree (root
children = depth 0), computed once per decoration pass by walking `doc.children`
recursively — the same walk shape as `startLine` in `grammar.ts`. This is what makes the
three depth encodings (heading level, list indent, paragraph adjacency) collapse into one
visual language: a level-3 heading nested two levels deep by tree position gets the same
guide depth as a twice-indented list item, regardless of how many `#` characters or spaces
are actually in the source.

### D4. Full-document recompute on every relevant transaction, no incremental diffing
The `ViewPlugin` recomputes the full `DecorationSet` from `parse(view.state.doc.toString())`
whenever `update.docChanged` (or the outline-mode gate flips), the same "reparse the whole
buffer" budget the keyboard grammar and structural commands already spend per keystroke
(editor-core design.md: "fine on normal notes," incremental parsing deferred to whenever
an enforcement layer needs per-transaction trees anyway). No new performance mechanism is
introduced; if large-note profiling ever shows a problem, CM6's viewport-restricted
decoration APIs are the documented escape hatch — not needed to start.

### D5. Marker scope: paragraphs only, not all kinds
Only paragraph nodes get a synthetic leader. List items keep Obsidian's native
bullet/number; headings keep native `#`/typography; atoms (code/table/callout/quote/
html/hr) already read as distinct blocks via their own borders/backgrounds. Alternative
considered: a uniform marker on every node kind regardless of existing chrome (simpler
rule, matches how Logseq/Workflowy draw a bullet on literally everything). Rejected for
v1 — it would double up on already-legible constructs (a dot next to a list bullet, a dot
next to a `#`) purely for uniformity, adding visual noise the dev-vault finding didn't ask
for; the finding was specifically about paragraphs being invisible. Easy to widen later if
real usage says the asymmetry itself is confusing.

### D6. Gating reuses the existing `ModeSource` contract
The decoration `ViewPlugin` takes the same `ModeSource` (`isOutline(path)`) the keyboard
grammar already depends on, checked via `editorInfoField` on every update — no new mode
plumbing. When the file isn't in outline mode, the plugin's `decorations` field is the
empty `DecorationSet`.

## Risks / Trade-offs

- **Full reparse per transaction on very large notes** → could add latency on pathological
  documents. Mitigation: same budget already accepted for grammar/commands; not a new
  risk this change introduces, and CM6 viewport-scoped decorations are a known escape
  hatch if profiling ever calls for it.
- **CSS guide alignment across themes/fonts** → indentation guides positioned in `em`/`ch`
  units can drift with unusual theme font metrics or RTL text. Mitigation: anchor to
  Obsidian's own CSS custom properties (e.g. list-indent variables) where available rather
  than hardcoded pixel values; verify visually in the dev-vault pass across at least the
  default light/dark themes.
- **Community CSS snippets/themes overriding our styling** → narrowly scoped, `to-`
  prefixed class names and no `!important`; document as a known limitation rather than
  fighting specificity wars.
- **Visual redundancy if obsidian-outliner/obsidian-zoom are also enabled** → already
  covered by the existing one-time coexistence warning Notice; no additional code-level
  guard needed.

## Migration Plan

Purely additive UI layer — no data model, no file content, no plugin-data schema changes.
Ships as a normal minor change: build, unit tests for the pure depth/marker computation,
e2e DOM-inspection coverage, manual dev-vault visual pass. No rollback concerns beyond
disabling the plugin, which already restores stock rendering.

## Open Questions

- Should indentation-guide spacing follow the user's actual list-indent settings (tab vs.
  space width) the way structural-operations already infers indentation strings from the
  document? Likely yes for visual consistency, but not blocking for spec-writing — an
  implementation detail to confirm against Obsidian's exposed CSS variables during task 2.
- Marker/guide interactivity (click-to-select, click-to-fold) is explicitly deferred; the
  node-selection and fold layers will need to decide whether they attach behavior to these
  same decorations or introduce their own.
