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
  Fixed in `classify.ts`'s `isProgrammatic`. Separately: **on desktop, undo does not
  dispatch through `transactionFilter` at all** — confirmed live, zero classifications
  recorded for an undo that reverted a real typed edit. Whatever mechanism Obsidian
  uses to restore prior editor state on undo bypasses CM6's transaction-filter
  pipeline entirely, which is an even stronger safety guarantee than "classified
  programmatic and passed through untouched": there is no transaction here to
  misclassify. Caveat found later on the mobile-emulation run: the bypass is
  platform-dependent — under macOS `emulateMobile` the undo DOES arrive as a real
  transaction (Linux CI emulation bypasses like desktop). Safe either way — an
  arriving undo carries the history userEvent and classifies `programmatic` — but the
  "never reaches the filter" form is a desktop observation, not a portable invariant;
  the e2e test asserts the portable half (never an enforced edit class) everywhere and
  the stronger bypass form on desktop only.
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

## Q15. Node-edit-enforcement implementation findings ✅ RECORDED (2026-07-20, `outline-edit-enforcement` Phase C)

Findings from implementing and evidence-testing the verdict layer (`src/enforce.ts`) and
its three new ops (`deleteSubtrees`, `mergeNodes`, `insertSubtrees`). None reversed the
design; two required a real (documented) extension to `classify.ts` beyond what D1/D3
assumed, and two were implementation bugs caught by property/e2e tests before shipping —
recorded per the series' "the finding gets recorded and the classifier tightened"
discipline (Q14's own precedent).

- **`classify.ts` needed two new facts it didn't have, both filed as optional fields on
  `ChangedLineSpan` so every pre-Phase-C call site is unaffected.**
  1. *Single-newline boundary deletions degenerate to one line.* A literal one-character
     Backspace/Delete that removes exactly the separator between two nodes has
     `fromLine === toLine` under the existing `Math.max(fromA, toA - 1)` convention —
     removing one character can't span two lines by that formula's own (correct, for
     ordinary edits) logic. Left alone, this means the D4 merge/veto scenarios could
     never reach `boundary-crossing-edit` at all. Fixed by a `deletesLineBoundary` fact
     the CM6 adapter computes from the true character offsets; classify.ts checks the
     identity of `fromLine` against `fromLine + 1` only when this bit is set. Existing
     classify.test.ts behavior is unaffected (the field defaults to `undefined`).
  2. *A multi-block paste at a bare cursor never crosses a boundary by span either* — a
     pure insertion's OLD-document span is always the single line it lands on, insertion
     or not. Fixed the same way: an optional `insertedText` fact, checked only for pure
     insertions landing on a real node's line, via `parse(insertedText).children.length
     > 1`. Both extensions are additive to the classification taxonomy, not changes to
     its six-class order — the transaction-classification delta's own framing survives
     unmodified.
- **The per-kind merge table's paragraph←paragraph row is real but organically
  unreachable as an enforced REWRITE.** Two sibling paragraph nodes can never have a
  zero-gap adjacency in a validly-parsed document — the segmenter always folds two
  ungapped text lines into one paragraph already (this is why `arbTree()`'s generator
  never produces that adjacency either). So a live Backspace sequence on two typed
  paragraphs never reaches `mergeNodes`: the first press shrinks the gap (a safe native
  `pass`, verified via `isSingleSeparatorMerge`'s trailing-gap check), and by the second
  the buffer already reparses as one node — an ordinary `within-node-edit`. The
  byte-level RESULT is identical either way (two Backspaces still correctly join the
  text), just via native reparse rather than an explicit rewrite. Verified live in
  `62-outline-edit-enforcement.e2e.ts`. The row stays in the merge table (and its own
  property/unit tests) because `mergeNodes` is a general pure op exercised directly, and
  because a non-organic zero-gap state could in principle arrive via some other route
  the table should still handle correctly if it ever does.
- **Structural-paste threshold**: "more than one top-level parsed block" is the line
  between `pass` (single block, or a whole one-node subtree copy with its own nested
  children) and `rewrite` (splice at the boundary). Matches D5's conservative bias — no
  real-vault evidence yet to tighten it further (task 5.2/5.3's own job once a manual
  pass runs).
- **Two implementation bugs caught before shipping, both from the same root cause**
  (`ops.ts`'s `finalize` always returns a FRESH `parse()` of the final text, so `OpOutput
  .doc`'s node ids never match the ids of the surgery tree that produced it — every
  existing op sidesteps this by only ever using `finalize`'s own pre-computed cursor,
  never re-deriving a position from `.doc` by id afterward):
  1. *Type-over cursor placement.* Naively reusing `insertSubtrees`'s own cursor
     (content-START of the first inserted node — correct for one-shot structural
     commands like indent/outdent) put a follow-up type-over keystroke BEFORE what was
     just typed, reversing character order. Fixed by computing the end of the inserted
     run by LINE position and sibling offset from the first block (`endOfInsertedRun`),
     not by id.
  2. *Stale survivor id.* `composeTypeOver` looked up the deletion's surviving neighbor
     by its PRE-deletion id in `deleteSubtrees`'s POST-reparse tree — always missed,
     vetoing every type-over that had a real neighbor (`node-not-found`). Fixed by
     re-resolving the survivor via `nodeAtLine` at the deletion's own returned cursor
     line (stable across reparse) instead of by id. Both caught by the e2e evidence
     suite before either shipped; a dedicated unit regression test now guards each
     (`tests/enforce.test.ts`).
- **Automation-gap retry, find-and-replace panel: automatable after all, and a sharper
  finding than Phase A's hedge.** Phase A declared the panel a WebDriver-gesture gap
  without attempting it. Renewed attempt: the panel (`editor:open-search-replace`) is
  plain DOM — find/replace `<input>`s and a "Replace all" button, all reachable via
  ordinary WebDriver interaction. A within-node replace-all is now real automated
  coverage (`62-outline-edit-enforcement.e2e.ts`). A genuine cross-node-boundary MATCH,
  however, is inexpressible in this Obsidian version's panel independent of any harness
  limitation: there is no regex toggle, and the find field can't hold a literal newline
  (Enter is bound to find-next). Carried as a manual-pass note, not a WebDriver gap.
- **Automation-gap retry, HTML5 drag-drop: still infeasible, confirmed the prior
  finding.** No W3C Actions API primitive fires HTML5 `DragEvent`s, and CM6 only
  presents drop targets inside a live contentEditable surface WebDriver can't script a
  drag payload into. Same native limitation `13-selection-follow-ups.md` already
  recorded for widget-interior drag-selection. Carried as a scripted manual-pass
  scenario (below).
- **Performance**: the enforced path's first real per-verdict timing samples (dev
  hardware, ~2000-line stress note, `62-outline-edit-enforcement.e2e.ts`'s perf
  scenario, two measured rounds after a warm-up round) stayed within the existing
  budget (median ≤ 1ms, p95 ≤ 8ms) across `pass`/`rewrite` verdicts on boundary
  deletions, list-item merges, and structural pastes — confirming Phase A's ~10×
  headroom claim extends to the rewrite path, which may parse the deleted/inserted
  content twice (once for the cover, once for the pasted-block parse).
- **Trailing-gap deletion becoming user-visible**: confirmed working as designed
  (`deleteSubtrees` unit/property tests, D3) — not separately re-verified live beyond
  the evidence suite; visual gap treatment stays out of scope per the standing
  docs/research/12 parking-lot rule.

### Manual-pass scenarios still to record (task 5.2)

- HTML5 drag-drop of a block-level selection onto a mid-paragraph position: expected
  (per design) to splice at the nearest boundary like a structural paste; needs a human
  pass in the dev vault since it can't be scripted.
- Cross-boundary find-and-replace: not just unautomated but structurally inexpressible
  in the panel (see above) — record whether users organically hit this via multi-line
  regex-mode plugins (Obsidian core has none) or third-party search plugins, which
  would use a different (unaudited) code path.
- General veto-frequency and paste-heuristic-misfire feel on organic editing, per
  design.md's risk register — this change's actual real-vault gate.

## Q16. First real-vault manual pass — chrome-transparency amendment ✅ RESOLVED (2026-07-21)

The first real-vault pass of `outline-edit-enforcement` surfaced four symptoms that
turned out to be one systemic gap, not four independent bugs:

- A paragraph selection with a child list, or a selected heading with its own
  subtree, hit "Nothing to act on" on Backspace/Delete — a genuine implementation bug
  (below), not the systemic issue.
- Backspace at a node's first character did nothing useful across a real blank-line
  gap — it took one keystroke per gap line before anything merged.
- Backspace at a list item's content start ate the marker's trailing space instead of
  merging, corrupting the item into a stray paragraph fragment.
- Enter mid-text in a node WITH children created the remainder as a sibling PAST the
  whole subtree — visually jumping over the children instead of landing next to the
  split point.

**Diagnosis**: the verdict layer recognized intent from raw markdown-character-space
edit shapes, while the user acts in outline-content-space (nodes and the adjacency
between their CONTENTS, chrome invisible). The two coincide for whole-subtree
deletions and multi-block pastes (why those worked correctly in evidence-suite
testing) and diverge everywhere chrome — gap lines, list markers — sits between the
cursor and the content boundary. Trailing-gap ownership is correct for STORAGE (byte
fidelity) but had leaked into user-facing EDITING semantics — exactly the shape this
series' own document (docs/research/13) flagged as a recurring theme across
selection enforcement and now edit enforcement.

**Resolution** — a new principle (chrome transparency, D9) plus two rule amendments,
implemented and re-verified in the same session (all deltas amended, code revised,
full suite green twice, mobile-emulation confirmed):

- **D10, content-adjacent merges**: recognition is now cursor-derived, not just
  edit-shape-derived — the pre-edit main-selection position distinguishes "Backspace
  at a node's content start reaching into chrome" (merge intent, whatever the gap
  width) from "cursor left on a blank gap line, editing the gap" (stays native — the
  deliberate escape hatch). The merge table gained cross-kind joins (list item into
  its parent paragraph and vice versa — the common real case), children re-parenting
  instead of rejecting, and single-line heading absorption (a markdown heading has no
  continuation lines, so multi-line content still rejects).
- **D11, content-adjacent split**: `splitNode` on a node WITH children now lands the
  remainder as the new FIRST CHILD, matching where the split point actually is.

**A separate, real implementation bug** (not the chrome-transparency issue, though
surfaced by the same test): the deletion cover computation
(`siblingCoverIds`/`enforce.ts`) mishandled the case where one end of a range is an
ANCESTOR of the other (a single node selected together with its own subtree) —
escalate.ts's own scope resolution already had this fallback (the scope is one level
above the shallower node), `enforce.ts` didn't mirror it, so the cover came back
empty and the deletion vetoed as "Nothing to act on." Sibling-subtree selections
(paths diverging before either ends) masked it in prior testing. Fixed with
unit + e2e regressions.

**Harness note**: a mobile-emulation-only failure surfaced in the direct-CM6-dispatch
selection helper (`dispatchSelectOnlyRanges`) immediately followed by a keypress —
the dispatched selection didn't survive to the Backspace event under mobile Chrome
emulation specifically (`Editor.setSelection` immediately followed by a keypress
works fine on both platforms). Not a product bug; the affected e2e scenario now uses
`setSelection` instead, which is also a MORE representative test of the D3
stale-selection path.

**Not filed here**: a pre-existing decoration bug (paragraphs with 1–3 leading spaces
render badly misaligned) was also found during this pass. It touches no file this
change owns and was spun off as its own task, not folded into node-edit-enforcement's
scope.

## Q17. Third manual pass — two pre-existing gaps surfaced, pending a decision (2026-07-21)

The third real-vault pass of `outline-edit-enforcement` surfaced one clean fix (D14,
below) and two findings that trace back to operations that PREDATE this change
entirely — `outdent` (mapping-core, Q2) and heading Enter-handling
(outline-keyboard-grammar) — confirmed real via direct testing. Both were held
pending an explicit decision per the project's "measure twice" discipline for
foundational, wide-blast-radius changes, and have since been fixed in their own
dedicated changes (`fix-outdent-following-siblings`, `heading-enter-splits-paragraph`).

- **Structural paste onto an empty anchor now replaces it (D14, implemented).** A
  freshly-created empty list item (e.g. right after Enter) used to sit stranded next
  to a pasted multi-block sequence instead of being consumed by it. Fixed by
  detecting the empty-anchor case and routing through the same delete-then-splice
  composition the type-over path already uses (`deleteAndSplice`, shared between
  `composeTypeOver` and `computePasteVerdict`).
- **`outdent` drops a node's following siblings instead of re-parenting them under
  it — CONFIRMED, pre-existing, not a Phase C regression. FIXED** (change
  `fix-outdent-following-siblings`, 2026-07-23). Direct test: outdenting
  the middle item of `- p\n\t- x\n\t- y\n\t- z\n` (outdenting `x`) used to produce
  `- p\n\t- y\n\t- z\n\n- x` — `x` jumped to AFTER the entire `p` section (past `y`
  and `z`, its own former following siblings), rather than becoming `p`'s immediate
  next sibling with `y`/`z` re-parented under it. This was the CURRENT, ALREADY-SHIPPED
  behavior of the core `outdent` operation from `mapping-core` (Q2) — no existing
  test in `ops.test.ts`/`closure.test.ts` ever covered "outdenting a node with
  following siblings under the same parent," so the gap shipped unnoticed until this
  change's merge→split→outdent interaction surfaced it in practice (merging a node
  with children into a predecessor, then splitting the predecessor again, then trying
  to outdent the split-off remainder no longer restores the original sibling
  structure — the re-parented children stay with the merged node instead of
  following the split-off node back out). Fixed to match Logseq's outdent
  semantics ("outdent in place"): a node's FOLLOWING siblings (under the same
  parent, after the outdented node) now re-parent as the outdented node's OWN
  children (appended after any children it already had), rather than staying with
  the original parent — `outdent(...)` in [src/ops.ts](../../src/ops.ts) now
  truncates `parent`'s remaining children at the outdented node's index and
  re-encodes the removed tail via the same context-determined encoding rule used
  for the outdented node itself. This was NOT scoped to node-edit-enforcement — it
  changed core `outdent` behavior for every existing scenario with following
  siblings, well beyond what D10/D11 touch — see
  `openspec/changes/fix-outdent-following-siblings/` (proposal/design/specs/tasks)
  for the full rationale and regression coverage
  (`tests/ops.test.ts`, `tests/closure.test.ts`).
- **Heading Enter inserts a blank line rather than splitting into a new paragraph —
  pre-existing, predates this change. FIXED** (change `heading-enter-splits-paragraph`,
  2026-07-24). Confirmed via `grammar.ts`'s `'split'` case for `node.kind === 'heading'`:
  Enter ANYWHERE in a heading's text (not just at its end) ignored the cursor's actual
  position within the line and inserted one blank line after the heading's own line,
  requiring a subsequent keystroke to materialize a child paragraph — it did not split
  the heading's text at the cursor into a genuine new paragraph node the way
  paragraphs/list-items do via `splitNode`. This was the ORIGINAL outline-keyboard-grammar
  design (predates outline-edit-enforcement entirely), not something D11 touched. Resolved
  by extending `splitNode` to accept headings: mid-text Enter now truncates the heading
  and lands the remainder as a new first-child paragraph (per the same content-adjacent
  split rule paragraphs/list-items already use — a heading's only possible SIBLING is
  another heading, so a plain-text split remainder can only ever be a child).
  Cursor-at-end now reuses the shared gap-widen mechanism instead of a one-off insertion,
  which adds one more blank line than before in that case — a deliberate, documented
  trade-off (see the change's design.md D2) rather than a special-cased byte-for-byte
  match. Implementation also surfaced and fixed two latent gaps in the shared
  content-adjacent-split code the heading case was the first to reach: a missing
  blank-line separator when the split-off remainder and an existing paragraph-kind child
  would otherwise merge on re-parse, and a terminal-trailing-gap-ownership transfer for a
  childless split node that was also the document's last node. The two-regime algebra's
  heading/content asymmetry (Q2) is untouched — this only concerns Enter/split, not
  Tab/Shift+Tab level-shift. See `openspec/changes/heading-enter-splits-paragraph/` for
  full rationale and regression coverage (`tests/split.test.ts`, `tests/grammar.test.ts`,
  `e2e/specs/30-keyboard-grammar.e2e.ts`). Two further findings from real testing of this
  fix, both folded into the same change: (1) mid-title splitting of a SETEXT heading
  (underlined `===`/`---`) was initially broken — the underline got swept into the
  split-off remainder's own lines instead of staying with the truncated heading, so
  re-parsing reinterpreted the whole result as one multi-line setext heading, silently
  undoing the split; not caught by the property-test suite, since `arbTree()` never
  generates setext headings. (2) `mergeNodes` was found to unconditionally discard a
  heading's own trailing gap in favor of whatever the absorbed node's gap happened to be
  — merging a list item into a heading and then splitting back out left the heading's
  original blank-line gap gone, with whatever followed sticking directly to it. Root
  cause predates this change (it's in `mergeNodes`, not in the new split logic) but was
  only surfaced by testing this feature; fixed by preferring whichever of the two gaps is
  longer when the absorbing node is a heading.
- **Filed but explicitly NOT for near-term action** (per the user's own framing):
  whether heading `#` markers should get the same direct-edit-prohibition list
  markers now have (D13) — raised as a "think about it, don't act on it" idea. Not
  recorded as a task; revisit only if raised again with a concrete proposal.

## Q18. Fourth manual pass — single-node paste re-indentation fixed; two redo-cursor reports not reproduced (2026-07-22)

- **Structural paste, single-node-with-children copy — CONFIRMED and FIXED (D15).**
  Copying a whole subtree rooted at ONE node (e.g. one list item with a nested
  child) and pasting it elsewhere: (a) never even reached the rewrite path — both
  `isMultiBlockInsertion` (classify.ts) and `computePasteVerdict`'s own gate
  required strictly more than one top-level parsed block, so a single node with
  children fell through to a raw, untouched character-level insertion, landing
  with its ORIGINAL literal indentation regardless of the target depth; and (b)
  once that gate is fixed, the existing `reencodeForDestination`/`shiftSubtree`
  re-indent path expresses a depth change as a flat numeric column delta added as
  SPACES, so a tab-indented subtree's deeper descendants ended up mixing the
  original tabs with newly-inserted spaces — same width, wrong characters, visibly
  inconsistent. Root-caused via direct reasoning about `shiftLine`'s delta>0 branch
  (`' '.repeat(delta)`, unconditionally spaces) before writing any test, then
  confirmed by writing exactly this scenario as a unit test. Both fixed: a shared
  `isStructuralBlockSequence` predicate (one node with children counts, matching
  the multi-node case already handled correctly) and a new
  `reindentSubtreeVerbatim` (swaps the top node's own leading-whitespace PREFIX for
  the destination's indent text, preserving each descendant's original relative
  indent string beyond that prefix verbatim — can't introduce a unit mismatch,
  since nothing new is synthesized). Scoped to `insertSubtrees`'s no-kind-
  conversion case only; `indent`/`outdent` (single-level, same-document moves)
  keep the original numeric-delta path unchanged.
- **Redo cursor after a merge, and delete→undo→redo cursor landing on chrome — NOT
  REPRODUCED despite genuine effort.** Five varied e2e scenarios attempted for the
  merge/redo report (list-item merge, paragraph-across-gap merge, cross-kind merge
  with re-parented children, three consecutive undo/redo cycles) — every one
  restored the exact join-point cursor on redo, matching the original merge's own
  cursor exactly. Three varied scenarios for the delete→undo→redo report (doc-start
  escalated-selection deletion, mid-list escalated-selection deletion) — every one
  landed redo's cursor at the correct survivor content-start, never on chrome.
  Recorded rather than silently dropped: this may be a real bug in a shape not yet
  tried (a specific platform's redo keybinding, an intermediate action between
  undo and redo, real touch/manual-interaction timing), or it may already be
  resolved by an earlier fix this session — more specific repro steps requested
  from the user before spending further effort guessing at shapes.

## Q19. Fifth manual pass — paste-depth root cause found and fixed; redo-cursor mechanism understood but still unreproduced (2026-07-22)

- **Paste "resets to original depth at +2 or more" — root cause confirmed via a
  real-vault repro note, fixed (D16).** The user's own "Paste bug repro.md" gave
  the exact input/action/observed-output triple: pasting a copied subtree into an
  EMPTY list item that has no siblings at all (the sole child under "plus two
  levels", depth 3) produced the pasted content as new TOP-LEVEL nodes, discarding
  the target depth entirely. Traced precisely: this specific shape (empty anchor,
  zero siblings) routes through `deleteAndSplice`'s `insertAsOnlyChildren`
  fallback — the ONE splice path D15 didn't touch, because D15's own regression
  tests all used anchors with at least one real sibling. `insertAsOnlyChildren`
  spliced the parsed blocks in completely unindented; on re-parse, unindented list
  markers pop out to whatever shallower scope (often top-level) their raw
  indentation implies. Confirmed byte-for-byte against the repro note's own
  "Expected outcome" before and after the fix. Extracted the shared
  `reencodeBlocksForDestination` (ops.ts) so `insertSubtrees` and
  `insertAsOnlyChildren` can no longer drift apart on this rule — the second
  instance this change has hit of "one correct call site, one silently-stale
  duplicate" (the first was D15's own detection-gate split between classify.ts
  and enforce.ts).
- **Redo-cursor-after-merge — mechanism now understood precisely, but still not
  reproduced.** ⚠️ **The mechanism description below is WRONG — corrected in Q21.**
  Specifically, the claim that the redo event's `startSelection` is "the selection
  active at the moment the undo transaction was built" describes only the LAST
  fallback in `HistoryState.pop()`'s expression; the branch that actually applies
  maps the pre-edit cursor forward through the op's own changes. Reasoning from the
  wrong premise led this entry to conclude our cursor "should" be restored and to
  hunt for an external cause, and led Q20 to conclude the cause sat outside this
  change's code entirely. Left in place unedited as the record of what was believed
  at the time; read Q21 for what is actually true.
  Read the actual `@codemirror/commands` `history.ts` source (via
  targeted fetches of the upstream file) to understand exactly how CM6 restores
  selection on redo, rather than continue guessing from behavior alone:
  - Undo pops the "done" stack's event and dispatches `changes: event.changes⁻¹`,
    `selection: event.startSelection` (the selection captured when the ORIGINAL
    edit was first made, i.e. the pre-edit cursor) — this matches the user's own
    observation ("undo → cursor at start of paragraph B") exactly.
  - That SAME undo dispatch also pushes a new event onto the "undone" stack,
    whose OWN `startSelection` is set to the selection that was active AT THE
    MOMENT THE UNDO TRANSACTION ITSELF WAS BUILT — i.e., `tr.startState
    .selection` right before undo fires, which (absent any intervening change)
    should be exactly our rewrite's own explicit join-point cursor.
  - Redo later pops that "undone" event and restores ITS `startSelection`
    directly — no position-remapping. So in the ordinary case, redo SHOULD
    restore our exact rewrite cursor, and every automated repro (7+ variants:
    list-item merge, paragraph-across-gap merge, cross-kind merge with
    re-parented children, repeated undo/redo cycles, the user's LITERAL
    "paragraph A"/"paragraph B" content with zero-pause and paused cursor
    checks) confirms exactly that.
  - **Empirically confirmed undo/redo NEVER reach `transactionFilter` at all**:
    driving the exact repro and reading `stats.snapshot().counts` before/after
    each step shows the `programmatic` counter never increments for either undo
    or redo (matching the pre-existing Phase A finding that desktop undo bypasses
    the filter — now confirmed to hold for redo too). This means our own
    rewrite/clamp/escalation code cannot be directly responsible for a wrong
    redo cursor: the transaction never runs through it. Whatever selects the
    (allegedly wrong) cursor on redo happens entirely inside CM6/Obsidian's own
    history mechanism, which our plugin has no path to influence.
  - **Working hypothesis**: something in the real environment inserts an
    intervening selection change between the rewrite and pressing undo — even
    one invisible to the user (e.g. a real mouse click's coordinate-derived
    selection differing subtly from a programmatic one, a decoration-triggered
    view update, or another community plugin) — which becomes what "the moment
    undo runs" captures, and that's what redo later restores instead of our
    rewrite's own cursor.
  - **Next diagnostic steps, offered to the user rather than guessed further**:
    reproduce in a vault with ONLY true-outliner enabled (isolates other
    community plugins as a cause); report the exact Obsidian version and any
    non-default editor settings (e.g. Strict line breaks, Vim mode); note whether
    the initial cursor placement in step 1 is via mouse click or keyboard, since
    that's the one variable this session's repro attempts couldn't fully match
    (all used a programmatic `setCursor`, not a real click).

## Q20. Redo-cursor bug spun out to a separate investigation (2026-07-23)

Follow-up manual testing showed the redo-cursor symptom is broader than Q19's
mechanism write-up anticipated: the cursor has been observed landing not just on
the next (gap) line after a merge, but past the end of the current subtree
entirely on redo — more than one wrong-landing shape, not a single off-by-one.
This rules out a narrow fix scoped to `outline-edit-enforcement` and confirms Q19's
own conclusion that the cause sits outside this change's code paths (undo/redo
never reach `transactionFilter`).

Decision: this is carried forward as its own investigation, out of scope for
`outline-edit-enforcement`'s closure — this change ships without a fix or further
diagnosis for it. Q19's mechanism research (CM6 `history.ts` selection-restoration
semantics, the empirical `programmatic`-counter proof) and its diagnostic asks
(isolated vault, Obsidian version, non-default settings, mouse-vs-keyboard cursor
placement) remain the starting point whenever that investigation picks up.

**RESOLVED in Q21 (2026-07-25)** — root cause found, partially fixed. Q20's own
instinct that "more than one wrong-landing shape" ruled out a narrow fix was right
about the symptom and wrong about the conclusion: the shapes are one mechanism whose
error scales with how much the op rewrote.

## Q21. Redo-cursor root cause: a CM6 history regression meeting our whole-region rewrites ✅ ROOT-CAUSED; minimal changesets close it except one narrow, CM6-inherent residual (2026-07-26)

Change: `fix-redo-cursor-after-structural-ops`.

### The mechanism (corrects Q19)

`@codemirror/commands`' `HistoryState.pop()` picks the cursor redo restores as:

```js
event.selectionsAfter[0] || event.startSelection.map(event.changes.invertedDesc, 1)
```

A document-changing transaction is recorded via `addChanges`, never `addSelection` —
they are mutually exclusive in the history field — so **a structural op's own resulting
cursor is never recorded**, `selectionsAfter` stays empty, and the mapping branch runs.
Our dispatches are whole-region line replacements, so the pre-edit cursor sits INSIDE
the replaced range, and such a position maps (assoc = 1) to the **end of the entire
inserted block**. The error's magnitude therefore scales with the rewrite's scope —
which is exactly why Q20 saw several different wrong landings and inferred several
different causes.

### It is an upstream regression, version-gated

Bisected against the real package: **≤ 6.10.1 correct, ≥ 6.10.2 buggy**. 6.10.2's
changelog: *"Move the selection to a less surprising place when undoing, moving the
selection, redoing, then undoing again."* — a fix for a different scenario that added
the mapping fallback and regressed ours.

### Why three reports never reproduced in the harness

Two independent maskers, either alone sufficient:

1. **Any** selection-only transaction landing between the op and the undo populates
   `selectionsAfter[0]` with the correct cursor. A single stray cursor touch (a
   `setCursor`/focus helper in a test) hides it completely.
2. The e2e harness ran the newest **stable** Obsidian (1.12.7), which bundles a CM6
   older than 6.10.2 — the reporter was on a 1.13.3 Catalyst beta. Automated and
   manual testing were running different editor cores. Confirmed by instrumenting
   `EditorView.update` in the live app: exactly three transactions occur (op, undo,
   redo), nothing intervenes, and redo still restored the correct cursor there.

The harness now prefers `latest-beta` when available (`obsidianBetaAvailable()`,
falling back to `latest`), so this class of skew stops being invisible.

### What was fixed, and what was not

**Fixed**: the first redo after any structural op restores that op's own cursor, by
re-asserting the cursor in a following selection-only transaction so history records it
(`src/plugin/history-cursor.ts`). Version-independent — `selectionsAfter[0]` is
preferred by both the old and new `pop()`.

**NOT fixed — known, accepted limitation**: `undo → redo → undo` still lands on a
mapped position (the end of the rewritten region in the pre-op document). This is a
structural limit, not an implementation gap: the event a second undo reads its restore
position from is created on the history's **undone** branch, and `addSelection` only
ever writes to the **done** branch, so no selection transaction can reach it. Pinned by
tests in `tests/history-cursor.test.ts` so a future "the cursor still jumps" report is
recognized as this known gap.

### The real fix, deferred to its own change

Stop emitting whole-region replacements. With **minimal, per-line character-level
changes**, the mapped position IS the semantically correct one in both directions at
any depth, and no recording mechanism is needed at all — verified standalone across
undo/redo/undo/redo cycles for merge, indent, and outdent. It belongs against
`editsToChanges` (`src/plugin/dispatch.ts`), shared by the grammar, the enforcement
rewrites, and the palette commands. It also subsumes the cursor-placement complaint
below.

### Also found, not fixed here

- **Structural ops reset the cursor to the node's content start** even with no
  undo/redo involved (`ops.ts`'s `finalize` convention, surfaced by real-vault Tab
  testing). With minimal ChangeSets, simply not setting an explicit cursor for
  indent/outdent would preserve the user's column naturally — so this is best decided
  as part of that change rather than separately.

### Update: `minimal-changesets-for-structural-ops` implemented — the "at any depth" claim above was too strong

Implementing the deferred fix (`minimal-changesets-for-structural-ops`) confirmed most
of the above but found the "at any depth, no recording needed" claim overstated in one
case, caught by property-testing against a real `EditorState` + real
`@codemirror/commands` `history()` (`tests/minimal-change-history.test.ts`):

- **Indent** is a pure insertion and is exactly correct at any undo/redo depth, fully
  confirmed. Also: relying on CM6's own *default* selection mapping (no explicit
  `selection` at all) turned out to be insufficient even for indent's first redo — CM6's
  live-dispatch default assoc (`-1`) disagrees with the assoc `1` its history redo
  restore hardcodes, whenever the cursor sits exactly at an insertion boundary (e.g. Tab
  at a line's very start). The fix computes that same assoc-`1` mapping explicitly
  (`dispatch.ts`'s `mapCursorForward`) and states it, rather than omitting it.
- **Outdent** (the only op whose cursor is DERIVED BY MAPPING and whose change set also
  deletes — merge and subtree deletion delete too, but choose their cursor rather than
  mapping it) is correct at any depth *except* when the pre-op cursor sat at or inside
  the specific span being deleted (the removed marker/indentation — never the node's real content). CodeMirror
  itself collapses such a position to the deleted span's start when computing the live
  result, and a later undo-of-a-redo can only reconstruct from that already-collapsed
  value — CM6's own hardcoded restore formula for that case lands one character off,
  regardless of what this plugin dispatches. This is the SAME class of structural limit
  the "NOT fixed" section above described (an event only the history's undone branch
  holds, unreachable by anything we can record or map), now narrowed to one specific
  cursor position rather than every structural op.
- Before `content-space-caret` landed, the practical path to that residual was Home
  placing the cursor at absolute line start before Shift+Tab. The now-landed,
  independent change closes that gesture path by making the marker prefix
  unaddressable. A narrower window remains for positions its published jurisdiction
  deliberately passes through, including `plugin-own`/`composition` transactions.

Pinned as an executable "known residual" test (not just this note) in
`tests/minimal-change-history.test.ts`, per this file's own convention.

### Method note worth carrying forward

The root cause was settled in minutes by a **plain unit test running a real
`EditorState` with the real history extension** — no Obsidian, no WebDriver — after two
rounds of e2e guessing failed. For any question that is purely about CM6 semantics,
reach for that first. The same technique bisected the upstream version boundary.

Equally important: the e2e tests for this fix were written, passed, and only THEN
checked for whether they could fail at all. They could not. Always verify a regression
test fails for the right reason before trusting it — this bug survived three reports on
exactly that kind of false confidence.

## Q22. `fix-orphan-gap-on-node-deletion` D1: layer choice measured — classification, not geometry (2026-07-25)

Change: `fix-orphan-gap-on-node-deletion`.

Task 1's job was to measure, not prefer: design D1 asked whether Option B (move
`subtreeCoverEnd`'s end past the owned gap, so an escalated cover naturally spans a
boundary) is a one-position adjustment or a redefinition of the cover, by clearing the
three collisions it names.

1. **The `ch: 0` convention survives.** Moving the end to the NEXT line's start (`{line:
   currentEnd.line + 1, ch: 0}`) keeps `ch: 0` — still independent of that next line's
   stored content, for the same reason the current convention is: `ch` is 0 either way.
   No collision here; this alone would have been a one-position adjustment.
2. **`coveredSubtreeRoots`'s match does NOT survive untouched.** Its test is
   `posEqual(lo, cover.start) && !posBefore(hi, cover.end)`. Moving `cover.end` moves
   what counts as an exact cover for EVERY caller of `subtreeCoverOf`/`coveredSubtreeRoots`
   — not just this change's new deletion check. That's the selection chrome's own bounds
   (`escalated-selection-decoration`), `select-all-ladder.ts`'s rung geometry, and the
   not-yet-built `selection-as-subtree-set`'s geometry, all keyed off the same function.
   This is a redefinition, not a local adjustment: it changes what "the cover" means
   everywhere, not just at the one call site this bug is in.
3. **The document's last node genuinely has no next line to point at.** Confirmed
   against the parse model directly (`model.ts`'s "segmentation is total" invariant,
   `OutlineDoc.preamble` + node spans covering every line with nothing after): for the
   doc's final node, `subtreeCoverEnd`'s current value already IS the document's last
   line. Option B's "next line" doesn't exist there — it would need a real end-of-document
   sentinel, a special case Option A never needs because it never moves the geometry.

**Decision: Option A (classification) owns the fix.** Collision 2 alone is decisive —
it's exactly the wide blast radius design.md's Option B risk section predicted
(`node-selection-enforcement`'s committed scenarios, `tests/escalate.test.ts`, the
selection chrome, and `selection-as-subtree-set`'s not-yet-written geometry), and
collision 3 adds a real edge case Option B would have to invent a new convention for.
Option A's own cost — "exactly covers a subtree" becoming a second place that computes
cover geometry — is fully mitigated by calling `coveredSubtreeRoots` directly rather
than re-deriving it (avoiding the Q18/Q19 duplication hazard by construction).

Implementation: `classify.ts` gains a check that a change's true old-document range
(not the `toA - 1`-blind `ChangedLineSpan.toLine`, which is exactly the mechanism this
bug lives in — a new `rangeEnd` fact carries the untruncated end position) matches
`coveredSubtreeRoots(doc, range)`, folded into the same `other`-shapes bucket as the
existing chrome-boundary and multi-block-insertion checks. `escalate.ts` is untouched —
no geometry moved, so `selection-as-subtree-set` starts from the same ground this
change found it on.

## Q23. `fix-orphan-gap-on-node-deletion` real-vault manual pass (2026-07-25)

Change: `fix-orphan-gap-on-node-deletion`.

Task 5's real-vault pass: exact-cover deletion of every node kind on real notes
(`Notes/Edge Case Zoo.md`'s atoms and heading section, `Projects/Kitchen
Renovation.md`'s nested list item), via a disposable scripted e2e pass (built,
run, and removed — not kept as permanent regression coverage, since it's coupled
to fixture content and duplicates what the permanent suite in
`62-outline-edit-enforcement.e2e.ts` already covers structurally).

**Clean on every kind tried:** a code fence, a table, a callout, a whole heading
section containing all three as children, a nested nested-list item on a real
project note, and a tight (no-gap) list item — every one of these, exactly
selected and deleted, left no orphan blank line and no leftover structure. Two
script bugs surfaced along the way (selecting one line too far, into the *next*
node's own start instead of stopping at the exact cover's true end) and were
corrected rather than being implementation bugs — both reproduced identically
against a direct `computeVerdict` call, confirming the escalation math, not the
fix, was what my test scripts got wrong.

**Real finding, not a regression: ordered-list item deletion is unenforced
whenever Obsidian's own live renumbering fires.** Deleting an ordered-list item
that has FOLLOWING siblings triggers Obsidian's own built-in list-renumbering as
a SEPARATE change within the SAME transaction — confirmed by intercepting
`EditorView.dispatch` directly (not guesswork): deleting item 2 of "1. first / 2.
second / 3. third" produces TWO change ranges in one transaction, `{delete "2.
second"}` and `{"3. " → "2. "}` (the marker rewrite, `insert` non-empty). D3
("do not widen beyond exact covers") and D2's multi-range rule ("require every
range to be an exact cover for the structural path") both correctly decline this
shape — one range isn't a pure deletion — so the WHOLE transaction passes
natively, leaving a blank line where the deleted item's text used to be (native
Backspace empties the line; it doesn't remove it). **This is unchanged from
before this change**: the old `collectEditFact`'s single-range restriction
rejected the same two-range transaction the same way, for the same reason.
Deleting the LAST ordered item (nothing following to renumber, so Obsidian never
fires the second range) already gets this fix's full benefit — confirmed
directly, single range, `rewrite` verdict, clean result.

**Follow-up worth carrying forward, not done here:** a multi-range rule that
tolerates "one exact-cover pure-deletion range, plus any number of ranges that
are ONLY an ordered-list marker's own number/delimiter changing" would close this
gap without widening D3's "exact covers only" principle in spirit — the marker
rewrite carries no content, just Obsidian's own renumbering side effect. Not
attempted here: out of this change's scope (D3 draws the line at exact covers,
and this shape is a different, adjacent one), and needs its own measurement of
how reliably that marker-rewrite shape can be recognized (e.g., is it always
exactly `digits+delimiter+space` with the same start offset as the old marker,
across every list style this plugin supports).

## Q24. `content-space-caret` implementation findings (2026-07-25)

Change: `content-space-caret`. Tasks 0.5/0.6/1/6 measured against real Obsidian
(1.12.7 desktop, via the e2e harness's WebDriver session — no beta was cached and no
Catalyst credentials were available in this environment, so task 0.6's "re-run against
`latest-beta`" degraded to the harness's own documented `latest`-stable fallback;
whoever next has beta access should re-run `e2e/specs/65-content-space-caret.e2e.ts`
and `66-content-space-caret-manual-pass.e2e.ts` against it once available, per Q21's own
lesson about editor-core skew).

### 0.5: Home's `Prec.highest` binding wins the key cleanly — with one unrelated artifact to not mistake for it

Binding Home and pressing it once lands the caret exactly at content start, and it
holds after a settle delay. One thing very nearly reads as a double-fire but isn't:
**any** real-keyboard-driven selection change in this Obsidian version is followed
roughly 10ms later by a second, unrelated `programmatic` transaction (confirmed
independent of this change — reproduced with a key our handler *declines*, letting 100%
stock CM6 handle it, and it still shows up). It never moves the caret. Counting
`stats.recent` entries is therefore the WRONG test for "did Home only fire once" (it
will always read 2, before or after this change); checking the caret's final, settled
position is the right one.

### 1: the vertical-motion prototype surfaced a real coordinate-space bug, then a real (small, environment-dependent) drift

Two rounds of building the "continue past a gap" mechanism, both instructive:

1. **First attempt** (chaining `view.moveVertically` off its own previous result to
   skip further blank lines) drifted a column when the chase bounced off a node shorter
   than the goal column. Root cause, isolated with a plain in-app script rather than
   guessed: an explicit `SelectionRange.goalColumn` does **not** survive a real
   `view.dispatch()` — it reads back `undefined` immediately after, even though the
   field exists and is documented as exactly this kind of persistent hint. Native arrow
   keys avoid this because `@codemirror/commands`' own cursor commands track
   continuation through a separate, view-scoped mechanism outside CM6 state — since
   this handler intercepts the key itself instead of delegating to those commands, it
   needed the same kind of memory itself (`keymap.ts`'s `verticalGoalColumn` WeakMap,
   keyed by view and by the exact head it last dispatched, so an interruption — a
   click, typing, anything else — is correctly treated as a fresh press).
2. **Second attempt** (multiplying `view.defaultLineHeight` by a line count to jump N
   lines in one `moveVertically` call) measured wrong the moment a target line rendered
   TALLER than a plain paragraph line — a fenced code block's or table's row is not the
   same height as `defaultLineHeight` in Live Preview, so a flat per-line pixel jump
   over- or under-shoots past it. Fixed by not guessing distance at all: which raw
   document LINE is next is already known exactly from the parsed tree (skip lines that
   resolve to a node's own trailing gap, stop at the first that doesn't), so only the
   FINAL column resolution needs real coordinates, and only for that one line's own
   actual rendered block (`view.lineBlockAt`) — which is correct regardless of any
   other line's height.
   - This surfaced a second, sharper bug on the way: `view.lineBlockAt`'s `top`/`height`
     are DOCUMENT-relative ("relative to the top of the document" per its own doc
     comment), while `coordsAtPos`/`posAtCoords` are viewport-relative — mixing them
     directly resolves to a Y coordinate far outside the actual line, landing wherever
     the viewport's own top happened to be (this is what produced the earlier "lands at
     column 0 inside a code fence" symptom). `view.documentTop` is the conversion CM6
     itself documents for this exact pairing; the fix is one line
     (`y = view.documentTop + block.top + block.height / 2`).
3. **The remaining, accepted drift**: even with the above fixed, chasing a goal column
   through a node SHORTER than that column (A2's "Hi" scenario) can still land one
   character off on the far side, under this test environment's font. The goal column
   is a pixel offset, not a character count, and re-deriving a character position from
   that SAME pixel offset on a DIFFERENT line — after the short node forced a
   character-boundary landing partway through — can disagree by a character when the
   two lines' glyphs don't render at quite the same average width (a non-monospace
   font, or subtle per-character metric differences). The direct, no-bounce cases
   (crossing exactly one gap, landing at a document edge, clamping onto a marker line)
   all land pixel-exact; only the bounce-through-a-shorter-node case carries this
   reservation — examples.md's own A2 entry already flagged exactly this risk before
   implementation, "carried on precedent... not from a felt problem." Recorded as
   measured, not fixed further: reaching for pixel-perfect precision here would mean
   replicating `@codemirror/commands`' own internal (unexported) column-tracking state,
   which is out of proportion to how rarely a goal column both exceeds a node's own
   width AND needs to survive past it.

### 6: node kinds outside the fixtures — two genuine (pre-existing, not introduced) Obsidian quirks, both handled correctly by declining

- **A table row is its own nested CM6 editor** in Live Preview (matches
  `60-transaction-classification.e2e.ts`'s existing "nested per-cell table editor"
  coverage): `moveToLineBoundary` inside one resolves to the WIDGET's own boundary
  rather than the specific raw markdown line the cursor sits on, and this is true
  **off-mode too** — 100% native, nothing to do with this plugin. Confirmed on-mode
  behavior matches off-mode exactly for Home, End, and ArrowLeft on a table row; no
  code change was needed, only test assertions that check PARITY with off-mode rather
  than assuming plain-line semantics for a widget-rendered node.
- Fenced code blocks, callouts (blockquotes), and horizontal rules all behave as
  ordinary content per D8 with no special-casing needed: motion moves line to line at
  column 0 (or crosses at the node boundary the same as any other node pair), and only
  each node's own trailing gap is skipped.

### Escape (6.4), re-measured against this implementation

D6's measurement reproduces: on a forward two-node cover the first Escape changes
nothing and the second collapses to the head edge, landing on a gap-line position —
which the placement resolver (`resolvePlacement`) now redirects to the covered node's
content end, exactly as D2 predicted it would without needing Escape bound at all.

## Q25. `content-space-caret` real-user manual pass: four real regressions found and fixed (2026-07-26)

The user ran the shipped implementation by hand in their own real vault (not this
project's own e2e fixtures) and found four problems Q24's own testing had missed. All
four are now fixed, with regression coverage added; this entry records what was
actually wrong and why Q22's own "measured" pass didn't catch it.

### 1. Vertical motion: wrap-awareness was broken by the SAME fix that fixed it

The user's own report: column tracking felt "inconsistent," and specifically, a
soft-wrapped row (under "readable line length") sometimes jumped to the node above
instead of moving within the node. Root cause: `makeVerticalHandler`'s design (Q22
already fixed one bug here — a document-relative/viewport-relative coordinate mixup)
still computed the target LINE by raw document line-number arithmetic, which is
correct for gap-skipping but wrong for staying within a soft-wrapped logical line —
a wrapped paragraph is ONE raw line spanning several visual rows, and raw-line
arithmetic always jumps a whole line, skipping the wrap entirely. Q22's own
fixtures never exercised a genuinely long, wrapping paragraph, so this shipped
unnoticed.

**Fix**: trust `view.moveVertically`'s own single default-distance step ONLY when it
stays on the SAME raw line (the wrap case, where its geometry is authoritative);
when it crosses to a different raw line, don't trust ITS OWN landing line at all —
walk raw lines deterministically from the line adjacent to the ORIGINAL position
instead (measured separately: `moveVertically`'s single step can overshoot multiple
rows of a widget-rendered multi-row block like a table, so trusting its cross-line
jump distance is unsound generally, not just for wraps).

### 2. Home/End: a continuation line that itself wraps needs a THIRD rung

Q22's own C4/C5 tests used SHORT continuation lines (Shift+Enter, no further
wrapping) and passed. A continuation line long enough to ALSO soft-wrap on its own
revealed that `view.moveToLineBoundary(sel, forward, true)` (the wrap-aware row
boundary) does not itself escalate through MULTIPLE wrap points on repeated calls
from an already-at-boundary position — it returns the SAME position again. The
two-rung ladder (row, then node) silently skipped the continuation line's own true
start when the "row" rung got stuck mid-wrap.

**Fix**: `nextHomeEndRung` (`src/caret.ts`) generalized from two fixed rungs to an
ORDERED LIST, searching for where the current position sits in the list (not just
"first rung not equal to current") and advancing to the next distinct one. The
adapter now computes THREE rungs: visual row (`includeWrap: true`), the raw line's
own true boundary (`includeWrap: false`), then the node boundary — the middle rung
collapses away for free (via the same dedup) whenever the raw line doesn't itself
wrap, which is why the common case was never affected.

### 3. Table gap reachability: confirmed as the already-documented accepted case, not a new bug

Exiting a table's own nested CM6 editor via arrow keys triggers Obsidian's own
focus hand-off back to the outer editor, which dispatches with no `userEvent`
(`programmatic`, confirmed via `stats.recent`) — this is the EXACT scenario D2's own
"a programmatic placement is not corrected... the next user motion normalizes it"
already names, just triggered by a source (nested-editor exit) the original
examples.md didn't happen to enumerate. Verified the self-correction holds. No code
change; added regression coverage.

### 4. Checkbox list items: content-boundary decision, plus a real double-dispatch bug

Asked the user whether `- [ ] text`'s checkbox+brackets should be treated as chrome
(matching native Obsidian's own task-list Home, which skips to column 6) or as
ordinary content (matching this project's existing `contentColumnCh`, which only
ever recognized the bare `- ` marker). Decided: **treat checkboxes as ordinary list
items, unchanged** — no new chrome category, no special-casing in editing or
structural ops; explicitly out of scope for this change. `contentColumnCh` needed
no change.

What DID need a fix: our own dispatch lands correctly on content start, and
Obsidian core then moves the caret back to column 0 — onto the `- ` marker, the
exact position this change makes non-addressable. Affects every motion handler
that can land on a list item's content start (Home, and any node-boundary
crossing), not just Home specifically.

**Root cause, captured with a `cm.dispatch` monkey-patch that recorded a STACK
TRACE per call** (the earlier round of this investigation recorded only that a
second dispatch existed, which is what sent it down a blind alley):

```
#1 ours:      head 10 → 2   scrollIntoView, no userEvent   at dispatchCursor (plugin:true-outliner)
#2 Obsidian:  head 2 → 0    no annotations, selection-only  at app://obsidian.md/app.js:1:2836482
```

The second dispatch is Obsidian's own checkbox-widget mount. It carries **no
`userEvent` at all**, and `isProgrammatic` (`src/classify.ts`) claims every
`userEvent`-less transaction *before* the `selection-only` test — so the
transaction filter, the one layer that sees every selection change regardless of
origin, waved it straight through. The addressable-position invariant had a hole
exactly where any foreign, unannotated cursor move lands.

**Fix**: `resolveForeignCursors` (`src/plugin/transaction-filter.ts`) — a new
filter branch for `programmatic` + no `userEvent` + no changes. Narrow in two
deliberate ways, both load-bearing:

- **Empty ranges only.** A non-empty programmatic selection stays exempt,
  preserving node-selection-enforcement's accepted `programmatic` case (workspace
  restore, a nested editor's focus hand-off).
- **The marker half of placement resolution only** (`resolveMarkerPlacement`,
  `src/caret.ts`), never the gap half. D2 deliberately scopes gap-line resolution
  to real user gestures, and `62-outline-edit-enforcement` asserts it directly ("a
  PROGRAMMATIC gap-line placement is untouched"). The marker clamp carries no such
  limit — it predates this change as node-edit-enforcement's `clampCursorToContent`
  (D13) and has always applied to any cursor from any source. Applying the FULL
  resolver here broke five tests across four spec files; the marker/gap split is
  what makes the fix correct rather than merely passing.

That split is also what keeps the branch safe inside a nested per-cell table
editor. `transactionFilter` is state-level and therefore **cannot** run
decorations.ts's `isNestedEditor` DOM-ancestry check — `editorInfoField` resolves
to the same outer `MarkdownView` for both, so state alone cannot tell them apart.
A cell's own tiny document is plain text with no marker to clamp, so marker-only
resolution is inert there by construction rather than by a guard we can't write.

Verified idempotent (`resolveMarkerPlacement` maps an already-addressable position
to itself), so the appended correction reports no change on re-entry and the filter
self-terminates. Measured after the fix: Obsidian still dispatches its `head → 0`,
and the filter rewrites it in flight (`headBefore: 2 → headAfter: 2`) — one
correction, no loop, no fight.

**Method note — the blind alley this replaced.** The first attempt at this bug was
`dispatchCursorRobust`: dispatch, then re-assert the position on a later animation
frame. It went through three timing variants (one frame → ten → back to one) and
never worked. Widened, it silently reverted a genuinely later *real user click*
back to the stale keyboard target; narrowed, it did not reliably win at all. The
lesson is not about the frame count: re-asserting a position after the fact is a
race against an unknown writer, and the fact that it needed tuning at all was the
signal to go find the writer instead. One stack trace ended an hour of tuning.
Deleted; `dispatchCursor` is now a plain dispatch.

### A fifth thing, found while chasing the above, worth naming on its own

Entering a table via vertical motion (crossing from outside) does not reliably land
on the SPECIFIC row this plugin computes and dispatches — Obsidian's table widget
claims the position through the same nested-editor hand-off as finding 3 and can
re-map it to a different row of the same table (measured: consistently the data
row, regardless of whether the dispatched target was the header row). This is
outside the plugin's jurisdiction for the same reason finding 3 is (design.md:
"Motion commands must not fire in nested editors" — entering one is this boundary
from the other side). The guarantee this feature actually owns — never landing on
the surrounding GAP — still holds and is what the regression tests check; which row
of the table's own nested editor Obsidian chooses to focus does not.

### Method note: this session's own test harness usage corrupted its shared fixture vault

While chasing finding 1, an ad hoc debug script set `readableLineLength: true` via
`app.vault.setConfig` directly against the live test instance — and it persisted to
the git-tracked `test-vault/.obsidian/app.json` on disk, silently active for every
subsequent run until noticed and reverted (`git checkout -- test-vault/`).
`obsidianPage.resetVault()` does not revert `.obsidian/` config, only vault
content. One real fixture note (`Projects/Aurora Dashboard.md`) also got its table
reformatted by Obsidian's own live-preview auto-alignment as a side effect of some
interaction, and `test-vault/.obsidian/plugins/true-outliner/data.json`'s
`outlinePaths` had accumulated entries from unrelated sessions. Worth remembering
for whoever next reaches for `app.vault.setConfig` in a throwaway debug script
against this harness: it isn't as throwaway as it looks.

## Q26. `content-space-caret` second real-vault pass: the Home ladder had a rung too many (2026-07-26)

Change: `content-space-caret`. The user ran the rebased build by hand. Most motion behaved as
specified; the checkbox fix (Q25) held. Two things did not.

### Home/End: the third rung came out, and it was never asked for

Reported: on a multi-line block, the second Home stays on the line instead of reaching the block's
start. Q25's own round had "fixed" a neighboring case by adding a THIRD rung to the ladder — visual
row, then the RAW LINE's own start, then the node — on the strength of a measurement of one shape:
a continuation line long enough to wrap on its own, where the second press otherwise jumped
straight past that line's start.

That rung was an inference, not a request. The original report only ever asked for row → node.
Measured cost of keeping it, with a probe that logged the resolved rungs at every press:

```
paragraph, 2 real lines, 2nd wraps, caret mid last visual row
  3-rung: 1:182 → 1:161 → 1:0 → 0:0     three presses to reach the block
  2-rung: 1:182 → 1:161 → 0:0           two
```

Both ladders are correct; the three-rung one just costs an extra press to reach the block, for a
stop that is not structural — a raw line boundary inside a node is an artifact of where the text
happens to be hard-wrapped. Removed, on the user's call.

**A correction worth recording, because it nearly went into the code as fact.** The first draft of
this removal justified itself with a stronger claim: that on a SINGLE-line node the raw-line and
node rungs dedup together, so the three-rung ladder ended at the raw line and stranded the caret,
never reaching the block. That is wrong. Replaying `nextHomeEndRung`'s dedup-and-advance directly
against both rung lists shows the single-line case behaving identically under both:

```
single-line node whose one line wraps (node start == raw line start)
  3-rung: 0:90 → 0:64 → 0:0 → noop
  2-rung: 0:90 → 0:64 → 0:0 → noop
```

The comments and tests asserting the stranding mechanism were rewritten before landing. The reason
to remove the rung is the press count, nothing more.

**What the "third Home stays there" report most likely is.** For a one-line node, the node boundary
IS that line's own start, so the ladder legitimately ends after two steps — there is no block start
above to climb to. "It won't go to the beginning of the block" and "it is already at the beginning
of the block" are the same observable state. A genuine two-line node reaches its block start
correctly, measured above, both before and after this change. If the report survives the two-rung
build, the next thing to capture is the exact note content, since the parse shape — one two-line
node vs. two one-line nodes — is what decides the expected behavior.

### Table exit: parked, see docs/research/13

Exiting a table's nested editor lands on the surrounding gap for one press. Root-caused to
Obsidian's own `placeCursorAround` hand-off, which our keymap never sees; the filter could rewrite
it but is deliberately scoped away from programmatic gap placements (Q25's narrowing, which five
tests depend on). Full trace and what picking it up would involve: docs/research/13, "Parked:
exiting a table's nested editor lands the caret on a gap line".

### Method note: a full e2e run still dirties the fixture vault

Q25 recorded one instance of this (a debug script's `app.vault.setConfig` persisting to
`test-vault/.obsidian/app.json`, plus Obsidian's own table auto-alignment reformatting a fixture
note). It is not a one-off. A single clean full-suite run, starting from a verified-clean
`test-vault/`, produced:

- `.obsidian/app.json` gaining `"readableLineLength": false` — benign in value (it is the default)
  but still drift, and the same key an earlier session accidentally left set to `true`, silently
  changing what every subsequent run measured.
- `.obsidian/community-plugins.json` and the plugin's own `data.json` (`outlinePaths` accumulating).
- **`Journal/2026-07-07.md` gaining two hard line breaks mid-paragraph.** No spec references this
  note by name; it is reached through restored workspace state, so a keypress intended for a test's
  own scratch note landed in a real fixture. This is the dangerous one: it silently changes the
  parse shape (one paragraph becomes a two-line node) of a file other tests read.

`obsidianPage.resetVault()` restores vault CONTENT but not `.obsidian/` config, and does not help
at all for drift that happens mid-run. Until something enforces this, `git status test-vault/`
after every e2e run is not optional — and a `git diff --exit-code test-vault/` gate after the e2e
job would turn a silent measurement corruption into a build failure.

### Follow-up on the same report: verified fixed, plus the parse shape that mimics it

The user re-reported after the two-rung change with an exact reproduction: a node of two raw lines
where the second soft-wraps, caret on the last visual row. Home should walk visual row → block
start; it was walking visual row → raw line start → nothing.

Re-measured against the two-rung build, driving real keys and logging the resolved rungs at every
press, with Obsidian's "readable line length" both ON and OFF (the one environment difference not
previously covered — the fixture vault is resettable, so setting it is fine):

```
PARA readable=on   1:143 → 1:77 (visual row) → 0:0 (block start) → stays
LIST readable=on   1:143 → 1:79             → 0:2               → stays
End  readable=on   0:0   → 0:14 (line end)  → 1:149 (block end) → stays
PARA readable=off  identical
```

Correct in every case, and the readable-line-length setting makes no difference. Note that the
reported "second press lands on the raw line start" is the *signature of the three-rung ladder* —
the two-rung build cannot produce it — so that report was against the pre-removal build.

**But there is a real shape that produces the same symptom on any build, and it is a parse
question, not a caret one.** A list item whose continuation line is NOT indented parses as two
separate single-line nodes:

```
'- paragraph text' + '  second line here'   → ONE node   (two lines)
'- paragraph text' + 'second line here'     → TWO nodes  (one line each)
```

For a caret on the second one, its own line start IS its block start, so Home stopping there is
correct — there is nothing above to climb to. "Home won't cross the hard break" and "these are two
blocks, not one" are the same observation. Both shapes are now pinned as e2e C9/C10 so the
distinction stays visible. Whether an unindented lazy continuation *should* parse as one node is a
separate question for the parser, not for this change.

### UNRESOLVED: the multiline Home report persists on Obsidian 1.13, not reproducible on 1.12.7

Closing state, recorded rather than fixed, at the user's call.

The user re-tested the two-rung build on **Obsidian 1.13** and sees no change: Home still stops at
the raw line's start and never reaches the block. The e2e harness runs **1.12.7** (`browserVersion`
resolves to `latest`, and `latest-beta` needs Catalyst credentials this environment does not have —
see the same limitation recorded for task 0.6), and on 1.12.7 the scenario is correct, verified with
real keys, readable line length both on and off. So this is a genuine version gap the harness cannot
currently close, and it must not be recorded as fixed.

**What the user's own observations rule out.** The obvious hypothesis — that our `Prec.highest` Home
binding stops winning the key on 1.13, leaving pure native behavior (visual row → raw line → stop,
which is exactly what native CM6 does) — is contradicted by their checkbox result in the same
session: first Home to column 6, second to column 2. Column 2 is OUR content boundary for `- [ ] `
(this change treats checkbox syntax as content, Q25); native Obsidian's task-aware Home stops at 6
and has no reason to continue to 2. So our handler IS running on 1.13, and it is producing rung 1 =
6, rung 2 = 2. The ladder works there.

**What that leaves.** If our handler runs and the second press lands on the RAW LINE start, then
`nodeContentStart` is returning that line — which means the node begins on that line, i.e. the
user's two lines parse as TWO nodes rather than one. That is the C10 shape, and it is the one
explanation consistent with every observation in this thread, including "same happens in a multiline
list element" and the symmetric End behavior. It also explains why nothing changed when the rung
came out: with two nodes both ladders stop in the same place, correctly.

**The cheap diagnostic, for whoever picks this up.** The plugin already renders a block marker per
node. Count the markers on the offending block: two markers means two nodes and the caret behavior
is correct-by-parse, and the real question moves to the parser (should an unindented lazy
continuation join the preceding node?). One marker means a genuine 1.13 regression in the ladder,
and the next step is `moveToLineBoundary(sel, false, true)`'s return value on 1.13 — the probe in
this session logged exactly that per press and can be re-run once 1.13 is installable.

**Harness follow-up.** Re-run `e2e/specs/65-content-space-caret.e2e.ts` (C9 and C10 specifically)
against 1.13 as soon as it is reachable. Those two tests were written to make this exact
distinction visible, and they are the ones that would fail if the ladder is genuinely broken there.

### RESOLVED, by simplifying the design rather than debugging it: Home/End became one rung

The user re-confirmed on 1.13 that the ladder still sticks mid-paragraph on the second press, and
called it: *"maybe a more intuitive UX would be to have a single Home press go straight to the
beginning of the raw line and just stay there. 1 rung, no smartness. predictable and clear to the
user."* Implemented as stated.

`Home` now moves to the content start of the raw line the caret is already on, `End` to that line's
end, and a further press does nothing. Neither crosses a line break. Neither consults rendered
geometry — `view.moveToLineBoundary` is gone from the handler, and the target is computed from the
parsed line alone.

**Why this is the right close, not a retreat.** The ladder was revised three times in this change
(row→node, then row→raw-line→node, then row→node again) and each revision fixed the shape it was
measured against while breaking or annoying another. The reason is structural, not a matter of
picking better rungs: an escalating Home makes one keypress mean different things depending on
state the user cannot see — where the previous press left the caret, and where the renderer chose
to wrap. That is the same class of hidden-state guessing this whole change exists to remove from
caret motion, so it was never going to come out right by ranking rungs more cleverly.

It also retires the 1.13 divergence recorded above as a class of bug rather than an instance. The
one-rung rule has no geometry in it, so it cannot resolve differently across Obsidian versions,
window widths, or the "readable line length" setting. The unresolved entry above stands as the
record of what was observed, but there is nothing left for it to affect.

**What this gives up, on purpose.** Home no longer reaches a multi-line block's own start. That is
a genuine convenience lost. It should return as its OWN motion with its own binding, where it is a
discoverable command rather than a second hidden meaning for the most-pressed key in the editor.
Recorded as a follow-up in `docs/research/13`.

`nextHomeEndRung` and its tests were deleted with the ladder — it had no other caller. Spec, design
D5, and its own "Open Questions" entry are updated; e2e C4/C5/C7/C9 rewritten to pin one-rung
behavior (including explicitly that Home does NOT stop at a visual row start, the thing the ladder
used to do first).

## Q27. The Home/End rabbit hole: three rewrites of code that was never running (2026-07-26)

Change: `content-space-caret`. Recorded at length because the failure was not in the caret logic at
all — it was in the loop used to evaluate it, and it cost several sessions.

### What was actually wrong

Home and End were **never routed to this plugin's keymap** on the reporter's Obsidian (1.13.3).
Left/Right/Up/Down and Tab all arrive and are consumed — measured, `N/N` on every one — while Home
never appears at all. Something upstream claims it before CM6 dispatches to our `Prec.highest`
keymap. On the 1.12.7 the harness runs, our binding wins the key and 31 e2e tests pass.

So every Home/End implementation in this change — three rungs, two rungs, one rung — was dead code
from the reporter's point of view. What they were watching throughout was stock CodeMirror:
visual row, then raw line, then stop. It never changed because nothing we changed was reachable.

### Why it took so long to see, which is the part worth keeping

**The invariance was the evidence, and it was read as noise.** Three mutually incompatible
implementations cannot produce identical behavior. The first "no change" report was already proof
that the code path was not live. It was instead treated as proof the logic was subtly wrong, and
the logic was rewritten. Twice more.

**Every hypothesis fit, which should itself have been the alarm.** Parse shape (two nodes vs one),
an Obsidian 1.13 difference in `moveToLineBoundary`, the "readable line length" setting — each was
coherent and each was consistent with every observation. They were consistent because *"the code
is not running"* is consistent with everything. When successive hypotheses all fit and none
predicts anything new, the premise is wrong, not the details.

**Correct-looking outcomes were miscounted as evidence.** The checkbox result (first Home to column
6, second to column 2) was used to rule out the keybinding hypothesis, on the reasoning that column
2 is our content boundary and native Home has no reason to go there. Wrong: native Home goes to 6,
a second native press goes to 0, and the transaction filter then clamps 0 to 2 because the marker is
not addressable. The same applies to every other behavior reported as working — gap lines
unreachable, markers unreachable, arrows skipping gaps. **All of it is reproducible by native motion
plus the filter correcting afterward.** None of it was evidence the keymap ran.

**And the harness could not have caught it.** Measured directly, by unbinding Home entirely and
re-running the suite: **five of eight Home outcome tests still passed** — C1, C2, C4, C6, C10,
including the most basic ones — because the filter reproduces those caret positions on its own. The
tests asserted where the caret ended up, and where the caret ends up is not evidence about which
mechanism put it there.

### What was changed so this class of bug is visible next time

- **Keymap liveness is now asserted, not assumed.** A dev-build probe counts, per key, what CM6
  routed to us (`invoked`) and what we consumed, exposed on the plugin for e2e and shown live in the
  dev status bar. Two new tests in `65-content-space-caret.e2e.ts` assert the mechanism. Verified by
  negative control: with Home unbound they fail while the outcome tests pass.
- **The probe wraps handlers OUTSIDE the outline-mode gate**, so "invoked but declined" stays
  distinguishable from "never invoked". Those need different fixes.
- **Tab is probed alongside the motion keys** as the control: it shares the keymap, so it separates
  "this keymap is dead" from "this one key is intercepted". That distinction is what finally located
  the bug.
- **The build stamp is baked into the bundle** (`virtual:build-stamp`), not written into
  manifest.json. Obsidian caches the manifest at plugin-scan time and never re-reads it on reload,
  so a manifest-borne stamp froze on a days-old commit while the code kept changing — a stamp that
  lies is worse than none. A constant compiled into the bundle cannot disagree with the bundle.
- **The dev loop actually delivers.** `vault:install` symlinked into the vault, and Obsidian's
  watcher only sees paths inside it, so a rebuild produced no vault-visible change and hot reload
  could never fire (measured: the symlink's own mtime does not move when its target is rewritten).
  Install now copies, and every esbuild watch rebuild installs, so editing a file reaches the
  running app unattended.
- **The Obsidian version is announced loudly, and the fallback names itself as a fallback.**
  `OBSIDIAN_VERSION` pins an exact build. Q21 lost three rounds to a silent version mismatch and
  this lost several more; a buried one-line "Running: obsidian vX" was not enough to make anyone
  check.
- **Fixture drift is reported and reset after every e2e run** (`scripts/check-vault-drift.mjs`). A
  full suite reliably mutates `test-vault/`, including a Journal note gaining hard line breaks —
  which changes that fixture's parse shape, so later tests measure something different with nothing
  failing.

### Still open

Why 1.13 does not route Home/End to a `Prec.highest` CM6 keymap, and how to claim the key there
(an Obsidian command with a default hotkey is the most idiomatic candidate; a capture-phase DOM
handler the blunt one). Reproducing it needs 1.13 in the harness, which needs Catalyst credentials
since every 1.13.x is insider-only — verified against upstream `obsidian-versions.json`, not just
the local cache. The caret logic itself is not implicated: it is pure, unit-tested, and correct on
the version the harness can reach.

### Q27 follow-up: the harness now runs 1.13.3, and it moves the Home diagnosis

Two caches were in play, which is why the first attempt failed. `obsidian-launcher`'s CLI defaults
to `~/.obsidian-cache`; this harness hardcoded a repo-local `.obsidian-cache`. So a download that
SUCCEEDED landed where the harness never looks, and the service then tried to fetch the version
itself, hit the insider-only gate, and reported "Obsidian Insiders account is required" — a cache
path problem presented as a credentials problem. Fixed three ways: one resolved `cacheDir` shared by
the availability probe, the service and a new `obsidian:fetch` script; `OBSIDIAN_CACHE` honored so a
machine-wide cache works; and `assertCached` fails fast naming the real cause, including "it IS
cached at <the launcher's default>" when that is the actual mistake.

**With 1.13.3 actually running, the keymap liveness tests PASS.** Home is routed to this plugin's
keymap and consumed, on the same version where the reporter sees it never arrive. So the
interception is NOT a 1.13 platform change, which was the standing hypothesis. It is specific to the
reporter's environment or to how the keypress itself is produced.

### RESOLVED: they were two different keys the whole time

The reporter checked which physical keys they had actually been pressing, and that ended it:

- **fn+Left IS `Home`.** It appears in the probe, our handler runs, and it goes straight to the raw
  line's content start. That is the one-rung implementation behaving exactly as specified.
- **cmd+Left is NOT `Home`.** It is `Mod-ArrowLeft`, a key this plugin does not bind at all, so it
  never appears in the probe and never reaches our keymap. Its behavior — visible line start, then
  content start, then absolute line start — is native macOS/CodeMirror, which this change never
  touched.

Every escalating ladder reported through this whole investigation was **cmd+Left's native ladder**.
The reporter had always assumed cmd+Left was Home and had never pressed fn+Left. So all three of our
implementations were simultaneously correct and irrelevant: correct on the key they were bound to,
irrelevant to the key being pressed.

This is also the one detail that never fit any of our hypotheses. The report was consistently
"first the visual line start, then the raw line start, then it stops" — a shape our two-rung ladder
could produce but our one-rung one could not, and which persisted verbatim across builds that had no
rungs left at all. It was never ours to produce.

**Correcting this document's own earlier speculation:** the paragraph previously here blamed "the
input path", guessing that macOS might deliver fn+Left as a native text-editing command rather than
a plain `Home` keydown. That was wrong, and it was another instance of the pattern this entry is
about — a plausible mechanism invented to explain evidence, in place of a measurement. The
measurement was one keypress and the reporter made it.

**And running 1.13.3 immediately earned its keep**, independent of Home: two tests fail there and
pass on 1.12.7 — `F2` (motion across a heading's gap, off by one column) and `D8` (a horizontal
rule's own line). Both are real behavioral differences in the version users are actually on, and
both were invisible for as long as the harness could only reach stable. A third, `C5`, failed once
with a caret column past the end of its own document (ch 81 on a 24-char line) and passed on
re-run — the shape of content bleeding between tests, worth its own look.

### What cmd+Left tells us about the architecture (and why NOT to "fix" it)

Worth recording, because it looked like a loose end and is actually a validation.

cmd+Left never lands on chrome, even though nothing binds it. Native cmd+Left's final rung IS
column 0 — inside a `- ` marker — but it arrives as an ordinary selection change, classifies
`selection-only`, and `resolvePlacement` clamps it off the marker. That is precisely the job D2
exists to do. Measured on a checkbox item, the two keys expose the two layers cleanly:

| key | path | result |
|---|---|---|
| cmd+Left | native → col 6 (Obsidian's task-aware stop); native → col 0; **filter rewrites 0 → 2** | 6, then 2 |
| fn+Left (`Home`) | our keymap handler → `contentBoundaryCh` | 2, one press |

So the two layers do genuinely different jobs, and both work:

- **The transaction filter guarantees the INVARIANT** — no caret rests on chrome, whatever moved it,
  including keys we never bound and never will.
- **The keymap provides INTENTIONAL motion** for the keys it binds, computing content-space targets
  directly instead of correcting afterward.

The decision (reporter's call) is to leave cmd+Left alone: it is not broken, it is being corrected,
and binding `Mod-ArrowLeft` would override a native ladder some users prefer for no invariant gain.
The consequence to keep in mind is that the plugin's headline caret guarantee reaches the common
macOS keystroke through the filter rather than through designed motion — which is a fine outcome, but
it means the Home/End design work governs a key many Mac users never press.

### Harness lessons this adds

- **The probe only reports keys we bind**, so it is blind to the actual failure here: "you are
  pressing a key we do not bind." cmd+Left's ABSENCE from the readout was the decisive clue and was
  visible only because the reporter thought to try both keys. A dev-mode raw-keydown log (`key`,
  `code`, modifiers, `defaultPrevented`) would have said "you pressed Mod-ArrowLeft, we bind Home" on
  the first press. Filed as a follow-up.
- **`browser.keys()` can only exercise keys someone thought to send.** The suite never pressed
  cmd+Left, so it had nothing to say about the behavior actually being reported. Coverage of a
  keymap is bounded by imagination, not by the keymap.
- **Ask which physical key, first.** Several sessions turned on an unstated assumption about what
  "Home" meant. The cheapest possible question — "which keys are you pressing?" — was never asked.

### Postscript: the "flaky" table-cell tests were never flaky

Two nested-editor tests (`53-decoration-contracts`, `60-transaction-classification`) failed
intermittently across this whole change and were repeatedly written off as flake — including by
explicit test: making an unrelated code change inert and reproducing the failure, which correctly
showed the failure was not caused by that change, and was then over-read as "therefore
environmental".

They were deterministic all along. Both clicked `.markdown-source-view .cm-table-widget td`, which is
NOT scoped to the active editor, so it matched the first table cell in the document — potentially in
a different, inactive workspace leaf left open by an earlier test. An element in a hidden pane is
never interactable, so whether the test passed depended on leftover workspace layout, which looks
exactly like flake from the outside. The error message had been saying so the entire time: the cell it
found contained text from a different fixture note than the test had just created (`Tab inside`,
`timestamp-first (current)`, `Option`), which nobody read closely because the failure was already
filed as noise.

Fixed with a `clickTableCell()` helper scoped to `.workspace-leaf.mod-active`, targeting
`td .table-cell-wrapper`. Both constraints in that selector are load-bearing and were found by
getting them wrong first: the bare `<td>` is a poor click target because Obsidian overlays a
`.table-row-drag-handle` inside it (on a one-character column it covers most of the box), while
`.table-cell-wrapper` without the `td` also matches `<th>` and silently clicks the HEADER row — the
nested editor mounts fine and the test then types into the wrong cell, which surfaced as
`expected "word!" received "a!"`. Verified across three consecutive runs of the pair and two full
suites.

The lesson is the same one this entry keeps producing: "intermittent" is a hypothesis, not a
diagnosis. Ruling out one cause is not the same as establishing the cause, and an error message
describing content from the wrong note was concrete evidence available from the first failure.

### CI postscript: two assertions encoded font metrics as contract

PR #31's first CI run failed on one test, on both desktop and mobile emulation, while the same
commit was green locally. `F2` ("motion across a heading's gap behaves like any other node pair")
asserted an exact landing column of `ch: 5` after ArrowDown from inside an `# h1` into body text.

Vertical motion preserves the caret's horizontal PIXEL position, as native CM6 does. Crossing from a
large font into a small one therefore lands at whatever CHARACTER column happens to sit under that
x — which is a font metric, not a behavior. Same code, three answers:

```
ch 5  macOS   1.12.7
ch 6  macOS   1.13.3
ch 7  linux   1.12.7   (CI, desktop and mobile emulation alike)
```

The assertion had quietly promoted one machine's font rendering to the contract. `D8`'s horizontal
rule test had the same shape: `---` is three characters, the line renders as a widget rather than
text, and the preserved x resolved to `ch 0` on 1.12.7 and `ch 3` on 1.13.3 — both perfectly valid
positions on that line.

Both now assert what their names claim — that the GAP is skipped and the caret lands on the right
LINE — with the column bounded to the line rather than pinned to a number, and the measured
per-platform values recorded in the test so nobody "tightens" them back later.

The general rule this yields: **after motion that preserves a pixel position, assert the line and a
column RANGE, never an exact column, whenever the source and target render in different fonts or one
of them is widget-rendered.** Exact columns remain right for same-font motion, which is why the
whole A-series (paragraph to paragraph) is unaffected and stayed green everywhere.

Worth noting what caught this: not local runs, which were green on two Obsidian versions, but a
different OS. The version axis had been the focus all session; the platform axis was the one that
mattered here.

## Q28. What eight rounds of automated review found in `content-space-caret` (2026-07-26)

Recorded because most of these defects existed only in commit messages, and the branch's
history was condensed for merge. Kept short: one line of mechanism per finding, grouped by what
they teach rather than by round.

### Defects in shipped behavior

- **Motion handlers fired inside nested per-cell table editors.** `registerEditorExtension`
  installs the keymap in every CM6 instance and `editorInfoField` resolves a cell to the same
  host file, so the outline-mode gate accepted it. Measured with the keymap probe: Home, Right
  and ArrowDown all `1/1` with focus inside `.cm-embed-block`. The **transaction filter** had
  the same hole, and a cell reading `word` could not expose it — a cell whose text starts with
  `- ` parses as a list item, and stock motion inside it was clamped off that "marker".
- **Horizontal motion stepped into the middle of a grapheme.** `ch ± 1` is a UTF-16 code UNIT:
  on `a😀b`, Right from after `a` landed between the surrogate halves.
- **And ignored bidi.** Logical order is not visual order; in an RTL run ArrowRight moved the
  wrong way. Note the LTR/RTL flip lives in CM6's COMMANDS, not in `moveByChar` — delegating
  without the flip changed nothing at all.
- **Any bound motion key destroyed a multi-cursor selection.** Handlers planned from
  `selection.main` while the dispatch replaced the whole selection: every non-main range
  vanished, with no undo entry, since a selection change is not a document change.
- **Home/End consumed the key and did nothing on a programmatic gap-line caret**, which D2
  deliberately leaves in place. `planHorizontal` declined there too, and native motion on the
  first line of a multi-line gap moved the caret OPPOSITE the key pressed once the filter
  resolved it back.
- **A document-edge press relied on the filter.** Declining looked like a no-op but stepped onto
  the trailing gap line for the filter to undo — the post-hoc correction this change exists to
  remove. A `'noop'` sentinel the handler consumes replaced it; the preamble case must still
  decline, which is a distinction easy to flatten.

### Defects in the tooling built to support it

- **Release builds shipped the dev status bar and keymap probe.** The gate was opt-OUT via a
  flag nothing set — and could not set, since releases run through an external reusable
  workflow. Inverted to opt-in.
- **Release builds also wrote into the dev vault**, and could fail merely because `test-vault`
  was absent, once one-shot install failures started failing the build.
- **The drift checker could destroy uncommitted fixture work** (it reverted every dirty path),
  then — snapshot-based — still lost pre-existing DELETIONS, and passed untracked paths to
  `git checkout`, which cannot restore them and exits non-zero. It also read C-quoted porcelain
  paths, so a non-ASCII fixture this repo ships (`Notes/Reading – …`) produced an escaped name
  and broke cleanup.
- **Two stamps per build**, so the reported clock never matched the bundle's; and the manifest
  stamp froze because Obsidian caches manifests at plugin-scan time.
- **The wrong-cache diagnostic skipped itself** in the situation it was written for.

### The pattern worth keeping

Three consecutive rounds caught the same shape: a condition widened to admit an edge case
silently admitted something else. Whitespace-after-marker made optional swallowed continuation
punctuation; a one-frame re-assert widened to ten frames reverted a real click; `'noop'` for
"no previous node" broke entry into the preamble.

And three tests written to prove a fix could not fail — a liveness loop asserting `invoked` but
not `consumed`, a nested-editor test using a cell that could not reach the bug, an RTL test
asserting only that two keys disagreed. Every time the negative control was run it found
something; every vacuous test was one where it was skipped.

## Q29. Undo/redo is the one transaction the enforcement funnel cannot reach (2026-07-27, `minimal-changesets-for-structural-ops` real-vault pass)

A real-vault pass on the rebased branch found the caret parked on a gap line after
undo→redo of a block deletion. Three reports, one root cause, plus two pre-existing
issues surfaced alongside it.

### `filter: false` — measured, not inferred

`@codemirror/commands`' `HistoryState.pop()` dispatches with `filter: false`, and CM6's
own `resolveTransaction` honours that by skipping `filterTransaction` entirely. **No
`EditorState.transactionFilter` observes an undo or a redo** — ours included. Every other
caret-placement path (click, collapse, foreign unannotated dispatch) funnels through
`transaction-filter.ts`; history provably cannot, so it needs a view-level observer of its
own. This is worth carrying forward as a general fact about the funnel, not a detail of
this fix: any invariant enforced only in the filter has a hole exactly the shape of
undo/redo.

### Why the caret needed resolving at all

A document-changing transaction's own selection is never recorded in CM6 history
(`addChanges` and `addSelection` are mutually exclusive), so redo does not replay the
cursor an operation chose — it recomputes one by mapping the pre-operation selection
forward. For an INSERTION that mapping is the right answer, which is why indent/outdent
need nothing here: `dispatch.ts`'s `mapCursorForward` deliberately computes the same
assoc-1 mapping history will, so the two agree by construction (Q21's update).

For a DELETION it is not, and cannot be. Every position inside the deleted span collapses
to the seam, and the seam between two nodes is a gap line — non-addressable under
`content-space-caret`. Measured on `# Heading` / blank / `last paragraph`, deleting the
paragraph:

```
after delete : {line 0, ch 2}  addressable
after undo   : {line 3, ch 0}  (selection restore — a cover's head sits on the gap it owns)
after redo   : {line 1, ch 0}  NOT addressable   <- the blank line
```

Stable at every depth. This change's own premise — "minimal changes make the mapped
position semantically correct" — holds for insertions and is false for deletions, where
there is no correct mapping because the cursor is a *choice*. The design said exactly that
about deletions (D4) and then removed the mechanism carrying the choice through redo
anyway.

### Fix: resolve, don't record

`src/plugin/history-caret.ts` observes undo/redo at the view level and runs the caret
through `resolvePlacement` — the mechanism this codebase already names for "a position
produced by something with no direction," which an undo-restored caret is by construction.

Resolution over recording, deliberately. Recording is what `structural-history-integration`
did originally and it fixes only the FIRST redo (Q21); resolution is depth-independent
because it reads only the caret and the document it landed in. Measured across four
undo/redo cycles: addressable every time, same position every time, no drift.

Only EMPTY ranges. Undo restoring a real selection is restoring the selection the user
had, and a subtree cover legitimately ends on the gap line it owns — collapsing that would
corrupt the range the user is about to act on.

The correction carries `addToHistory: false`: placement resolution is not a user selection
action, and recording it would push a selection step onto the undo stack, so a second
Cmd+Z would undo the correction instead of the edit below it.

### Two pre-existing issues surfaced by the same pass

Both trace to `ops.ts`'s deletion cursor, which this change never touched, so both
reproduce on `main`. Parked in `docs/research/13`.

- **The caret's landing after a delete alternates between the next node and the previous
  one.** `deleteSubtreeGroups` picks `survivorAfter ?? survivorBefore ?? parent` and
  `finalize` puts the caret at that survivor's content START. Deliberate, but it reads as
  arbitrary, and it disagrees with what placement resolution computes for the same seam
  (the gap owner's content END) — so the caret still shifts once across undo→redo even
  with the resolver in place.
- **Deleting a node that follows a table lands the caret inside the table**, because the
  survivor IS the table and its content start is the table's first source line. Obsidian
  mounts the nested per-cell editor and takes focus; Cmd+Z then hits the cell's own empty
  history while the host's event still points back inside the table, so undo appears dead
  and moving the caret out does not help.

### Follow-on: the mapped position is a selection HEAD, not necessarily a caret (2026-07-27)

A second real-vault pass, after Q29's resolver landed, found Tab on a BLOCK-SELECTED
paragraph dispatching a caret onto a gap line. The column-preserving mapping this change
introduced maps `selection.main.head` forward, and that head is a caret only when the
selection is empty. With a block selection it is the cover's END — and a subtree cover ends
on the trailing gap line it owns, so mapping it forward faithfully produced another gap
position.

Fixed in `grammar.ts`'s `planFromOp`: use the mapped position only when it is
caret-addressable, else fall back to the operation's own cursor (the pre-change behaviour).

Testing the RESULT's addressability rather than the INPUT's emptiness was deliberate, and
is the more useful shape: it states the invariant that actually matters ("never dispatch a
caret onto a non-addressable position"), needs nothing threaded from the CM6 adapter, and
also catches a genuine caret that a programmatic placement had already parked somewhere
non-addressable — which an emptiness test would miss.

Worth generalising from Q29 plus this: **every position this plugin dispatches as a caret
needs to be addressable, and the places that produce one are not all obvious.** So far:
the grammar's mapped cursor (here), the enforcement rewrites' `verdict.cursor`, the ops'
own `finalize` convention, and whatever CM6 history recomputes (Q29). The invariant is
cheap to assert at each dispatch site and expensive to discover from a real vault.

### The same hole, for SELECTIONS rather than carets

`filter: false` is not specific to the caret. Undo and redo restore the pre-operation
SELECTION mapped forward through the operation's changes, and the escalation filter never
sees that either — so a restored block selection need not still be a forest of whole
subtrees. Observed in the same pass: redoing an indent of a block-selected paragraph
restored a range covering only the content within the new list item, which correctly loses
its block chrome because it genuinely is not a cover any more.

Left unfixed deliberately. `history-caret.ts` resolves carets only; collapsing or reshaping
a restored SELECTION would change the range the user is about to act on, and the right
answer depends on decisions two open changes own. Cross-referenced into both rather than
settled here: `selection-as-subtree-set` (its downward-closure invariant holds for every
selection the FILTER produced, which is not every selection that can exist) and
`node-selection-extension` (whose stateless walk derives its anchor from the assumption
that the current selection is a cover — the sharper stake, and where the question is
filed).

### Follow-on: addressability is not enough — reordering needs the recorder back (2026-07-28, PR #32 review)

Automated review caught what the real-vault passes had not: **redo after a MOVE put the
caret on the wrong node**, every time, at every depth. Measured on `- a` / `- b`, moving
`- b` up with the caret inside it:

```
no recorder:   op="- b"  u1="- b"  r1="- a"  u2="- b"  r2="- a"   <- redo always wrong
with recorder: op="- b"  u1="- b"  r1="- b"  u2="- a"  r2="- b"   <- redo always right
```

The resolver could never have caught this. It asks "may the caret be here?", and after a
reorder the mapped position is a real content position in the sibling that swapped in —
perfectly legal, entirely wrong. Q29's fix addressed carets landing somewhere ILLEGAL;
this is a caret landing somewhere legal but not where the operation put it.

So `SemanticCursorRecorder` reinstates the mechanism `fix-redo-cursor-after-structural-ops`
introduced and this change had removed wholesale — but scoped, which is the part worth
carrying forward. The dividing line is whether an operation's cursor is a FUNCTION of the
pre-operation caret or a CHOICE:

- **Function** (indent, outdent): the cursor IS `mapCursorForward`'s result, which is what
  history recomputes on redo. They agree by construction, need no recording, and are
  correct at any depth — the property test still shows that.
- **Choice** (move, split, merge, paste, structural delete): mapping cannot reproduce a
  join point or a moved node's new home. These need the recording.

D5's reasoning was right about indent/outdent and over-generalised from them. The
correction is the scope, not the mechanism.

The Q21 trade-off returns for the recorded operations only, and was re-measured rather
than assumed: recording fixes redo at EVERY depth, and costs the second undo, which
restores the recorded cursor instead of the pre-operation one (the event a second undo
reads from lives on history's undone branch, which `addSelection` never reaches). A redo
landing on the wrong node every single time is the worse of the two, so the trade is
taken deliberately. Note this also corrects Q21's own framing: recording does not "fix
only the first redo" — it fixes all of them; what it cannot fix is the second undo.

Both halves coexisted in `src/plugin/history-caret.ts` for one iteration — the recorder
making the caret the RIGHT one for our own operations, the resolver making it a LEGAL one
for everything else.

**The resolver was then removed** (2026-07-28). Once the recorder was back it had nothing
left to do: measured across delete (last and middle node), move, merge and split, every
undo/redo at every depth already left an addressable caret before it ran. It had been
built to fix a symptom caused by deleting the recorder in the first place, and no
reachable case was ever found that needed it. Keeping unproven machinery in the part of
the codebase with the most owners of caret placement was the worse trade; if such a case
appears it is cheap to reinstate, with the test that finds it.

So there is no view-level addressability correction for foreign undo/redo today. That is
consistent with `content-space-caret`'s own jurisdiction rule, which passes
`programmatic`-class placements through until the next user gesture.

### Follow-on: the guarantee had to be restated, not just the mechanism (2026-07-28, PR #32 review)

Reinstating the recorder changed what can be promised, and the specs kept claiming the
stronger version for a round. Corrected to say it precisely, because the shape is
genuinely two-sided now:

- **Redo is exact at any depth**, for every structural operation — by construction for
  the mapping-derived ones, by recording for the rest.
- **The second undo is not exact**, in two different ways: recorded operations restore
  the recorded cursor rather than the pre-operation one, and mapping-derived operations
  can land a character off when the caret sat inside a deleted span.

Worth carrying forward: when a fix swaps one mechanism for two, the guarantee usually
stops being expressible as a single sentence, and the honest version names which
mechanism covers which case. The requirement is now organised that way — "Redo restores
… at any depth" states the split explicitly, and "Known limitation" has a paragraph per
cause instead of one blended claim.

Also from the same round: `hasSemanticCursor` had no direct test. The move and delete
history tests build the re-assertion themselves from a boolean, so they would have
stayed green if the predicate had dropped `move.structure` or started including
indent/outdent — the exact "test that cannot fail for the right reason" shape Q28
catalogues. Now covered directly, including prefix matching and a set-membership
assertion that fails if the two userEvent lists drift apart; negative-controlled in both
directions.

### Follow-on: recording became a property of the DISPATCH (2026-07-29, `caret-placement-policy`)

The scoping above — `SEMANTIC_CURSOR_USER_EVENTS`, the plugin-own set minus indent/outdent
— was right about which OPERATIONS choose a cursor and wrong about the axis. One operation
can do both: indent dispatches the mapped position most of the time, and its own cursor
when the mapped one would not be addressable. Keyed per operation, that second dispatch went
unrecorded, so a redo recomputed the mapped position and put the caret back on a gap line.
Documented as a known limitation at the time; closed now.

The rule is now derived rather than declared (`src/plugin/record-decision.ts`):

```js
tr.startState.selection.map(tr.changes, 1).eq(tr.newSelection)   // → no recording needed
```

`assoc = 1` is not a preference — it is the association `@codemirror/commands` hardcodes in
its redo restore, so this asks CM6's own mapping the exact question that matters: *is the
dispatched selection what redo would recompute?* It preserves the guarantee the old set
existed for — redo is exact wherever the list made it exact — closes the fallback case, and
cannot drift from the dispatch sites because there is no list to maintain.

Worth stating precisely, because the first version of this note got it wrong: the new rule
is not set-equal to the old one, it records strictly FEWER transactions. A chosen position
sometimes coincides with the mapped one — splitting `- alpha beta` before `beta` inserts
`\n- ` at the caret, and assoc=1 maps that caret onto the new item's content start, the
split's own anchor (measured: both offset 11). The name-based list recorded that anyway;
recording it buys nothing and costs second-undo precision, so skipping it is the rule
working, not a regression.

Two things this depends on, both now executable rather than prose:

- **`mapCursorForward` equals CM6's `mapPos(_, 1)`.** The dispatch sites COMPUTE the caret
  with the former while the recorder compares against the latter; if they diverged, ordinary
  indents would start being recorded and silently inherit the second-undo cost. Property-tested
  over generated trees in `tests/minimal-change-history.test.ts`; negative-controlled by
  flipping the assoc to -1, which fails it.
- **The predicate itself.** Previously the history tests built the re-assertion from a
  boolean, so they stayed green whether or not the predicate selected the right dispatches —
  the Q28 shape. Now tested directly in `tests/history-caret.test.ts`. The sharpest negative
  control: reinstating the old per-operation rule fails exactly ONE test, the indent-fallback
  case, which is precisely the gap the new rule closes.

Method note worth carrying forward, from the same session: a property test written over
`arbTree()` to assert "no caret lands inside a focus-capturing node" PASSED with the guard
deliberately disabled — `arbTree()` generates no tables, so that half of the property was
vacuous. Q28's catalogue gains another entry: a property test can be vacuous in one CONJUNCT
while the others carry it, and the only way to see it is to disable each mechanism separately
rather than the feature as a whole. Fixed by splicing a table into the generated document.

## Q30. `selection-as-subtree-set` implementation findings (2026-07-31)

Four findings from implementing the forest span. The first is the one that mattered.

### The design's own equivalence claim was false, and only one kind of test could see it

D2 originally gave two forms for the cover's end and called them equivalent: "the end of
`lastNode`'s own subtree cover", and "the document-order run closed under descendants". They
diverge whenever an ANCESTOR of `lastNode` begins inside the span. With

```
- P            - S
  - c1           - t1
  - c2           - t2
```

a drag from inside `c2` to inside `t1` ends at `t1` under the first form — a span containing
all of `S`'s line while excluding `t2`. That is a node selected without its whole subtree: the
exact violation the change exists to forbid, reachable by an ordinary drag, and it would orphan
`t2` on deletion.

The correct end bound is the subtree end of the OUTERMOST ancestor-or-self of `lastNode` whose
own start is at or after the span's start. An earlier draft had considered and REJECTED that
wording, for "making the two ends asymmetric and silently swallowing later siblings at the
end." Both objections are true and both are the point: the asymmetry is inherent to preorder
(ancestors precede their descendants, so only the end side can have one inside the span), and
the swallowed siblings are required by downward closure.

**What let it survive review**: every OTHER property holds under the wrong form. Expand-only,
orientation preservation, idempotence, the ch-boundary property — all of them pass. So does
every existing unit test, because the plain sibling case and the crossing-out-of-a-scope case
agree under both forms. The only test that separates them is downward closure stated directly,
and `tests/escalate.test.ts` had no such property: the old invariant lived in ONE unit test and
implicitly inside `siblingRunCover`. Adding the property was what turned an argument into a
check, and it was verified by negative control (revert the end bound, watch four tests fail).

Generalizing: when a change replaces an invariant, the question is not "do the tests still
pass" but "which test would fail if the NEW invariant were stated wrong." If the answer is
none, that test does not exist yet.

### A property can be exercised once in 302 cases and still pass

The gate enumeration below was first written as "pick two random lines, build the deletion span,
assert the cover is single-rooted." It passed. It also reached its assertion exactly once in
302 generated cases — every other case was filtered out before the assert. Rewritten to
enumerate REAL cover shapes (every node's own subtree cover, every node pair's forest cover) it
reaches 452, and it now carries an explicit coverage counter that fails if that number
collapses. Q28's vacuity catalogue gains a third shape: not a vacuous conjunct (Q29's table
case), but a vacuous *filter* — the guard that makes a property well-formed is also what can
make it measure nothing.

### The classification gate did NOT widen, contrary to the design

`classify.ts`'s `isExactSubtreeCoverDeletion` reads `coveredSubtreeRoots`, so making the cover
forest-aware looked like it must widen that gate — filed as a risk to measure. It does not.
The gate is only consulted when no span crosses a boundary by line identity, i.e. every line
the change touched belongs to one node, and a range shaped that way cannot reach a multi-root
cover's end. Mixed-depth deletions are classified by the ordinary line-identity test instead,
well before the gate. The gate remains what it was built for: the single-node cover whose
trailing newline the span convention is blind to.

The prediction was wrong in the safe direction, but it was wrong, and the reason is worth
keeping: "this function feeds that predicate, so the predicate widens" ignores whether the
predicate is REACHABLE with the new inputs.

### Two things needed no code at all

`reencodeBlocksForDestination` already satisfied D3's root normalization — it maps each block
through `reindentSubtreeVerbatim`, which swaps that block's own top-level whitespace for the
destination indent INDEPENDENTLY, so roots from different source depths land as siblings by
construction. And `deleteSubtreeGroups` already accepted exactly the shape a forest decomposes
into (one contiguous sibling run per parent), so structural deletion needed grouping, not new
machinery. Both were tasks written as "extend X"; both turned out to be "measure X, then pin it
with a test." Worth checking for before writing the extension.

### Still open

A TYPE-OVER of a mixed-depth cover is unmodeled — `deleteAndSplice` splices into the single gap
a deletion left, and a forest leaves one gap per parent. Implemented as a conservative `PASS`.
It wants a judgement about what users expect, not more measurement.
