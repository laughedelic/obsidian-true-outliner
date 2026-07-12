# Open Questions & Decisions

Alignment log for pre-planning decisions. ✅ = decided, ❓ = open.
Three alignment rounds on 2026-07-12; all pre-planning questions are now decided except Q10
(explicitly post-v1).

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

### Q2 follow-ups (the mapping algebra) ✅ DECIDED (2026-07-12, second alignment)

**The unifying principle** (governs all structural ops):

> Every structural op either writes the **minimal markdown encoding of the new tree**, or —
> when no encoding exists — is **rejected with gentle feedback**. Never hidden state, never
> lossy conversion.

**The two-regime algebra** (third alignment refinement):

```
HEADINGS         Tab/S-Tab = level ± 1 (org-mode promote/demote), whole
                 subtree shifts; the tree re-derives from levels; reject
                 only at the h1/h6 bounds.
EVERYTHING ELSE  Tab/S-Tab = reparent (child-of-previous-sibling /
                 brother→uncle); encoding recomputed from the new context.
ALWAYS           minimal encoding or reject; no hidden state.
```

1. **Paragraph under paragraph** ✅ *provisional*: a list following a paragraph is that
   paragraph's **children** in outline mode. So indenting paragraph B under paragraph A turns
   B into a list item after A; A stays an intact paragraph. Top-level paragraphs are never
   auto-converted — a flat document just becomes a long flat list of nodes when toggled.
   *Marked provisional*: revisit after the first prototype; may become configurable.
   *Alternatives considered and rejected*: (a) lists attach only to headings, never
   paragraphs — makes paragraph-with-children inexpressible, killing the indent-under-
   paragraph op entirely; (b) sentinel syntax (e.g. a paragraph ending in `:` claims the
   following list) — magic content-sniffing, fails isomorphism. Adjacency-as-parenthood is
   the only lossless way to give paragraphs children; the heading/paragraph asymmetry is
   markdown's (headings *scope* what follows; paragraphs merely *precede* it).
2. **Heading nodes** ✅: Tab/Shift+Tab = **level ± 1** (org-mode promote/demote semantics),
   the whole subtree's headings shift with it (marker-only edits; `[[note#Heading]]` anchors
   are text-based and survive). Rejected only at the bounds (no h0, no h7). **Skipped levels**
   (h1 → h3) are preserved; tree depth = tree position, not raw level; outdenting a
   skip-leveled heading first normalizes the level (### → ## under an h1: level changes,
   hierarchy doesn't), then the next outdent changes hierarchy — and symmetrically, Tab on a
   heading may create a skip (a "styling-only" edit where the node's tree position is
   unchanged and only the visible level marker deepens). Accepted consequence, same as org.
3. **Context-determined encoding on reparent** ✅ *provisional*: a reparented node's encoding
   is a pure function of its new surroundings — it takes the type of its nearest preceding
   sibling under the new parent (fallback: following sibling; no siblings: paragraph under a
   heading/root, list item under anything else). Consequences: paragraph → indent → outdent
   round-trips back to a paragraph (new sibling is a paragraph), while outdenting inside a
   100%-nested-list document keeps everything list items (all neighbors are list items) — no
   flattening, and no hidden per-node memory of original types.
4. **Mixed containment** ✅: a list item can never contain a heading — under the two-regime
   algebra no op can even attempt it (headings move by level, not by reparenting), so this
   holds by construction rather than by rejection.
5. **Leaf-only blocks** ✅: code fences, tables, callouts, quotes are movable/indentable
   **atoms**; internal content is not outline-structured.
6. **Toggle persistence** ✅: remembered per note in the **plugin data store** (consistent
   with Q3 — files stay clean; frontmatter would pollute content for a pure UI mode).

See [05-org-mode-comparison.md](05-org-mode-comparison.md) for where this algebra aligns
with and diverges from org-mode, the closest living reference system.

## Q3. Node identity & metadata storage ✅ DECIDED

Native `^block-id` **on demand** (only when a node is actually referenced); collapse state in
the **plugin data store**; files stay clean. Multiline nodes as standard markdown continuation
lines (to be specced in detail).

## Q4. MVP cut ✅ DECIDED: small, solid core

v1 = the enforced core editor (grammar + node selection + structure invariants) built on an
architecture that keeps every later layer open (fold persistence, zoom, structured backlinks,
refs/mirrors, drag-and-drop, search). Layers land one at a time on top of the stable core.

**Refinement (second alignment)**: the core implements the **universal block-tree model from
day 1** — headings + paragraphs + lists as nodes, per Q2. The MVP is smaller in *features*
(minimal chrome, no zoom/backlinks/DnD yet), not in *model*. Retrofitting the tree model onto
a list-only core later would risk a rewrite.

## Q5. Relationship to existing plugins ✅ DECIDED: build fresh

Build fresh — Q2's universal mapping needs a tree-model core that the list-only engines don't
have. Use obsidian-outliner / zoom / pro-outliner as proof-of-primitive references; borrow
patterns with MIT attribution where genuinely useful. Coexistence: detect obsidian-outliner /
obsidian-zoom at load and show a one-time warning notice.

## Q6. Interop & degradation guarantees ✅ CONFIRMED as hard requirements

Files remain plain markdown, fully usable with the plugin disabled/uninstalled; no gratuitous
rewriting of untouched lines (whitespace, bullets, mtimes); other-tool edits (sync, mobile
without plugin, scripts) never corrupt anything on re-open. To be written into the project
spec as invariants.

## Q7. Mobile support ✅ DECIDED: mobile-safe, desktop-tested

Hard rules from day 1: no Node/Electron APIs, `isMobile`-aware, CM6/DOM only (the editor-
centric architecture already guarantees this). Test/polish desktop only for v1.0; declare
mobile support in a v1.x milestone after real-device testing.

## Q8. Vim mode ✅ DECIDED: out of scope for v1

The only known path is the undocumented `window.CodeMirrorAdapter.Vim` hack, which fails the
perfect-scorecard bar. Document as a known limitation.

## Q9. Node content richness ✅ DECIDED: plain content in v1

Checkboxes/tasks are plain content in v1 — preserved perfectly (isomorphism guarantees it),
no special node state or UX. First-class task states are a clean later layer.

## Q10. Backlinks pane placement ❓ (post-v1)

Our structured backlinks as: a sidebar pane (like core backlinks), an in-document footer
section (like influx/Logseq), or both? Replace-core-pane is off the table (private APIs).

## Q11. Undo/redo scope ✅ DECIDED: CM6-native undo for v1

With deliberate transaction grouping (`userEvent` annotations) so one structural op = one undo
step. View-state restoration (fold/zoom/focus) is a later enhancement layer.

## Q12. Name & positioning ✅ DECIDED: working name stays; final name at submission

"True Outliner" as working name; decide the final name at directory-submission time.
Differentiator statement: *any note is an outline — enforced structure, node selection,
isomorphic markdown mapping — one coherent plugin*.
