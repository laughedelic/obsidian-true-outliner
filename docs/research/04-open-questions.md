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

### Verdicts from the mapping-core implementation (2026-07-12, `mapping-core` change)

Both provisional rules **held up** under property testing (byte-identity round-trip,
op-closure, inverse laws — thousands of generated cases). Findings to carry forward:

- **Attachment rule: KEEP.** Confirmed consequence: "list item as the sibling directly
  after a paragraph" is unrepresentable — the tree generator itself had to fold such
  shapes into children, which is the rule working as designed. Scope refinement
  discovered: in v1 the rule applies at *section level* (root/heading children); inside
  a list item's children, a paragraph and a following list parse as siblings under the
  item. Revisit whether nested paragraphs should also capture lists.
- **Context-determined encoding: KEEP.** Delivered exactly the promised laws: paragraph
  indent∘outdent restores the document byte-identically, and pure-list documents never
  flatten. The donor scan considers only paragraph/list-item siblings (headings/atoms
  are skipped) — heading nodes are never produced by re-encoding.
- **New rejection discovered — outdent out of a heading section.** Heading scope is
  positional in markdown: content placed "after the section" is still *in* the section,
  so brother→uncle for a direct child of a heading has no encoding → rejected
  (`not-expressible-under-target`). UX implication for the CM6 layer: outdent at
  section level needs affordance messaging (or a future "split section" op).
- **Reordering across the heading/content divide is rejected**, and heading swaps
  require equal levels — same positional-encoding reason.
- **Minimal-edit tradeoff**: indenting a paragraph into an existing child list keeps
  the old separator blank line with the untouched sibling (a loose list — same tree).
  Cosmetic; a "tidy gaps" pass could be a later opt-in.

### Dev-vault findings (2026-07-13, first manual verification round)

- **Indentation unit: RESOLVED (was an open design question).** Obsidian indents lists
  with tabs by default; synthesizing space-based indentation silently double-outdented
  tab lists (dedent overshoot swallowed whole tabs). Fix: a reparented node **adopts the
  destination's indentation string verbatim** — an existing sibling item's, else the
  parent's plus one unit inferred from the document (default two spaces). Plugin-side
  config passthrough of Obsidian's own indent settings remains a possible refinement.
- **Cross-parent heading moves**: moveUp/Down is same-parent sibling swap in v1, so a
  heading that is an only child rejects with no-sibling — surprising in practice.
  A "move into adjacent section" op is expressible (the heading must land AFTER the
  destination section's direct content, mirroring the indent op's before-first-subheading
  rule — this also keeps the destination's paragraphs out of the moved subtree).
  Candidate for the next structural change.
- **Visual layer is now the testability bottleneck**: with no bullets/indent chrome,
  outline mode is hard to verify by eye in flat documents. Decorations change moves up
  in priority.

### Verdict from the outline-decorations implementation (2026-07-13): FAILED

Three full redesign cycles, 198 unit tests, 33 e2e tests (all green), and multiple
screenshot-verification rounds later, the feature was still visibly broken in real vault
use — marker size scaling with heading font-size, inconsistent indentation, wrong
continuation-line indentation, markers overlapping native bullets, misplaced guide
lines. The CSS-override strategy (own `padding-left`/`text-indent`/`margin-left` via
`!important`) kept producing new regressions each time a prior one was patched, and the
testing approach (DOM-attribute assertions, narrow synthetic fixtures, tests updated to
match whatever the implementation currently did) gave false confidence at every stage.
Full account, root causes, and carried-forward technical findings:
[06-outline-decorations-postmortem.md](06-outline-decorations-postmortem.md). The
"visual layer is the testability bottleneck" problem above is **still open** — this
attempt did not resolve it.

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

## Q13. Parser: custom vs. remark/mdast/micromark ✅ DECIDED (2026-07-13): keep custom, revisit trigger defined

Re-examined design.md D1 against 2026 research before committing to the hand-rolled parser
long-term. **Verdict: keep it.** Findings:

- Obsidian's internal parser is an undocumented black box; the "remark-parse 8" claim
  circulating in the forums is unverified speculation, not a confirmed fact — there's nothing
  to "align with" even if we wanted to.
- `mdast-util-to-markdown` is documented as **not** round-trip-safe (confirmed upstream issue:
  parse→stringify can change AST structure on re-parse). Adopting it would directly break the
  byte-identity goal (design.md D1/D2) — the exact failure mode D1 already rejected it for.
- The OFM-extension remark plugin ecosystem (wikilinks, callouts, embeds, block-refs) is
  fragmented and often stale/single-maintainer; we'd hand-write most of it anyway — and we
  don't need it, since our model keeps all OFM constructs as opaque content inside block
  nodes (never inline-parsed).
- **Revisit trigger**: if corpus/property testing surfaces real CommonMark-dialect bugs our
  segmenter is structurally bad at (lazy continuation, nested list/blockquote edge cases),
  the upgrade path is **micromark's core tokenizer only** (not mdast/remark) as a
  boundary/offset oracle feeding our existing `OutlineNode`/encode/ops unchanged — this
  "tokenize with micromark, keep your own tree" pattern is exactly how `mdast-util-from-markdown`
  itself is built, so it's proven architecture, just not something to adopt preemptively.

## Q14. Transaction filter choke-point assumptions ✅ CONFIRMED (2026-07-20, `outline-selection-enforcement` Phase A)

Live evidence (`60-transaction-classification.e2e.ts`, real Obsidian via wdio-obsidian-service,
not a mock) for the five choke-point assumptions design.md's `transaction-classification`
capability rests its architecture on:

- **Mutation-path coverage**: typing, real clipboard paste (`navigator.clipboard` +
  Cmd/Ctrl+V), real mouse-drag selection (`browser.action('pointer')`, not
  `Editor.setSelection`), keyboard selection (Shift+Arrow), `setValue`-style programmatic
  replacement, and external `Vault.process` reconciliation were all driven through the
  ACTUAL registered `transactionFilter` and observed via the stats surface with their
  expected class. Find-and-replace (Obsidian's own search/replace UI panel) and
  cross-position drag-drop-to-reorder text were not separately automated — both are
  UI-panel/native-HTML5-DnD gestures WebDriver's Actions API doesn't reliably synthesize
  in this harness; flagged as a coverage gap for a future pass, not evidence of a problem.
- **Programmatic/remote detection**: `setValue` dispatches with no `userEvent` (as
  expected). External `Vault.process` reconciliation, however, dispatches a REAL
  transaction annotated `userEvent: "set"` — the original D3 hypothesis ("no
  distinguishing annotation") was wrong for this specific path. Before the classifier
  was tightened to recognize `"set"`, a reconciliation whose diff crossed multiple
  original nodes classified `boundary-crossing-edit` instead of `programmatic` — still
  safe (default-permit, nothing rewritten either way in this change) but it would have
  inflated the boundary-crossing counter Phase C needs as a USER-edit sizing metric.
  Fixed in `classify.ts`'s `isProgrammatic`. Separately: **undo does not dispatch
  through `transactionFilter` at all** — confirmed live, zero classifications recorded
  for an undo that reverted a real typed edit. Whatever mechanism Obsidian uses to
  restore prior editor state on undo bypasses CM6's transaction-filter pipeline
  entirely, which is an even stronger safety guarantee than "classified programmatic
  and passed through untouched": there is no transaction here to misclassify.
- **Nested-editor safety without DOM access**: confirmed live on the wide-table fixture
  (type a character inside an actively-edited cell) — zero `boundary-crossing-edit`
  classifications from the cell edit, and the outer note's own structure untouched.
  Degeneracy-by-construction (D6's primary hypothesis) holds; the `StateField` fallback
  flag was not needed.
- **Keystroke-latency budget**: on a synthetic ~1600-line stress note (400 sections,
  heading+paragraph pairs), driving 20 real typed edits and 10 real boundary-crossing
  mouse-drag selections through the live filter, every observed class's timing stayed
  well within budget — measured this session (dev hardware, not dedicated CI-class
  hardware; re-measure there before treating as final):

  | class             | count | median  | p95     | max     |
  |--------------------|------:|--------:|--------:|--------:|
  | programmatic       |    63 | ~0ms    | 0.60ms  | 0.70ms  |
  | selection-only     |    40 | ~0ms    | 0.20ms  | 0.20ms  |
  | within-node-edit   |    20 | ~0ms    | 0.10ms  | 0.10ms  |

  (budget: median ≤ 1ms, p95 ≤ 8ms — every number here is roughly an order of
  magnitude under budget). `boundary-crossing-edit`/`composition`/`plugin-own` had no
  samples in this run (the drives used were all within-node typing and boundary-
  crossing *selection*, not boundary-crossing *edits*). Full re-parse per `Text`
  identity (no incremental reuse) is sufficient at this note size — the D7 fallback is
  not needed.
- **IME non-interference**: not automatable — this harness (chromedriver via
  wdio-obsidian-service) has no reliable way to synthesize a genuine IME composition
  session (`compositionstart`/`compositionupdate`/`compositionend` with real native
  input) — so verified manually instead (2026-07-20, Chinese IME in the dev vault
  with per-transaction debug logging on): transactions during an active composition
  classify `composition`, and the commit transaction once a candidate character is
  selected classifies `programmatic`. Both are pass-through classes, so composition
  is untouched at every stage. The commit-as-`programmatic` detail is another
  instance of the userEvent-taxonomy finding above (a path arriving with a different
  annotation shape than assumed, resolving toward more safety, not less).

No finding blocked or reversed Phase B — both surprises (a path arriving WITH an
annotation the design assumed it wouldn't have, and a path not arriving as a
transaction at all) resolved toward MORE safety than the original hypothesis, not less,
which is exactly the shape default-permit is designed to tolerate.
