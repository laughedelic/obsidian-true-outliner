# Open Questions & Decisions

Alignment log for pre-planning decisions. ✅ = decided (2026-07-12), ❓ = open.

## Q1. Architecture path ✅ DECIDED: editor-centric (Option A/C)

CM6 extensions in the standard markdown view + our own side panes. 100% public API.
See [03-obsidian-api-feasibility.md](03-obsidian-api-feasibility.md).

## Q2. Scope of "outline mode" ✅ DECIDED: universal isomorphic outline view

Neither per-file opt-in nor vault-wide enforcement. The owner's framing (near-verbatim):

> The outliner experience is all about the **editor UI, not the content under it**. Any "flat"
> markdown note actually has structure: a hierarchy implied by headings of different levels,
> each paragraph is a separate node, lists are natural outliner subtrees. Any existing markdown
> note can be transformed into an outline by mapping that hierarchical structure onto the tree,
> providing the same editing experience as for a nested bullet-list outline. A UI toggle turns
> any note into an outline (no change for list-only content), and back. **This has to be an
> isomorphic transformation.**

Implications:

- The document model is the **full markdown block tree**: heading nodes (level = depth
  anchor), block nodes (paragraph, code fence, quote, table, …), and list-item nodes —
  not just lists. Obsidian's `CachedMetadata` (`sections` + `headings` + `listItems`) already
  parses exactly this tree — see the feasibility addendum.
- The toggle is a **view/UI mode change, never a content rewrite**. For a pure-list note the
  outline view is visually identical to today's list editing.
- **Isomorphism = lossless round-trip**: md → tree → md must be identity; every structural
  operation in outline mode must produce a tree that maps back to valid, natural markdown.
- "Both without compromises": flat-markdown notes keep full outliner features *through the
  mapping*, instead of losing them (obsidian-outliner's model) or being forced into bullets
  (Logseq's model).

### Q2 follow-ups (the mapping algebra) ❓ — to resolve in the explore/design phase

The isomorphism constraint creates a node-type algebra whose edges need explicit rules:

1. **Paragraph under paragraph**: markdown cannot nest a paragraph under a paragraph. When the
   user indents paragraph B under paragraph A, do we (a) auto-convert both to list items,
   (b) disallow with feedback, (c) convert A to a heading? (Any auto-convert rule must itself
   round-trip.)
2. **Heading nodes**: does indent/outdent on a heading node change its level (h2 ↔ h3)?
   How are skipped levels (h1 → h3) and content-before-first-heading represented in the tree?
   What happens when indenting would exceed h6?
3. **Mixed containment**: a heading's children = its paragraphs/lists/sub-headings. A list item
   cannot contain a heading in markdown — the algebra must forbid or remap such operations.
4. **Leaf-only blocks**: code fences, tables, callouts, quotes — movable/indentable as atoms,
   internal content not outline-structured. Confirm.
5. **Toggle persistence**: is outline-mode-per-note remembered (plugin data? frontmatter?) or
   session-only?

## Q3. Node identity & metadata storage ✅ DECIDED

Native `^block-id` **on demand** (only when a node is actually referenced); collapse state in
the **plugin data store**; files stay clean. Multiline nodes as standard markdown continuation
lines (to be specced in detail).

## Q4. MVP cut ✅ DECIDED: small, solid core

v1 = the enforced core editor (grammar + node selection + structure invariants) built on an
architecture that keeps every later layer open (fold persistence, zoom, structured backlinks,
refs/mirrors, drag-and-drop, search). Layers land one at a time on top of the stable core.

## Q5. Relationship to existing plugins ❓

- Build fresh vs fork/vendor parts of obsidian-outliner / zoom / pro-outliner (all MIT)?
  (Note: the universal-mapping vision from Q2 makes their list-only engines a weaker fit as a
  foundation than they looked pre-decision.)
- Coexistence policy: detect and warn when obsidian-outliner/zoom are enabled simultaneously?

## Q6. Interop & degradation guarantees ❓

Confirm these as hard requirements: files remain plain markdown, fully usable with the plugin
disabled/uninstalled; no gratuitous rewriting of untouched lines (whitespace, bullets, mtimes);
other-tool edits (sync, mobile without plugin, scripts) never corrupt anything on re-open.
(Q2's isomorphism decision strongly implies "yes" to all — needs explicit confirmation.)

## Q7. Mobile support ❓

In scope from day 1 (constrains APIs and testing), or desktop-first with mobile as a milestone?

## Q8. Vim mode ❓

The TUI prototype is vim-flavored; obsidian-outliner's vim integration uses the undocumented
`window.CodeMirrorAdapter.Vim`. Support Obsidian vim-mode users (may need that same hack —
tension with the clean-API bar), or explicitly out of scope for v1?

## Q9. Node content richness ❓

Partially subsumed by Q2 (every markdown block type is a node). Remaining: are checkboxes/tasks
first-class node states in v1, or plain content?

## Q10. Backlinks pane placement ❓ (post-v1)

Our structured backlinks as: a sidebar pane (like core backlinks), an in-document footer
section (like influx/Logseq), or both? Replace-core-pane is off the table (private APIs).

## Q11. Undo/redo scope ❓

CM6 gives text-level undo for free. The TUI prototype specs structure-aware undo with focus/
fold/zoom restoration. Is CM6-native undo acceptable for v1 (with careful transaction grouping),
with view-state restoration as an enhancement?

## Q12. Name & positioning ❓

"True Outliner" as working name? Positioning vs obsidian-outliner in the directory (the
guidelines discourage duplicative plugins — our differentiator statement should be crisp:
*any note is an outline — enforced structure, node selection, isomorphic markdown mapping —
one coherent plugin*).
