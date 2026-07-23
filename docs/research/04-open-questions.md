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
(outline-keyboard-grammar) — confirmed real via direct testing, not yet fixed pending
an explicit decision (holding per the project's "measure twice" discipline for
foundational, wide-blast-radius changes).

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
  pre-existing, predates this change.** Confirmed via `grammar.ts`'s `'split'` case
  for `node.kind === 'heading'`: Enter ANYWHERE in a heading's text (not just at its
  end) ignores the cursor's actual position within the line and inserts one blank
  line after the heading's own line, requiring a subsequent keystroke to materialize
  a child paragraph — it does not split the heading's text at the cursor into a
  genuine new paragraph node the way paragraphs/list-items do via `splitNode`. This
  is the ORIGINAL outline-keyboard-grammar design (predates outline-edit-enforcement
  entirely), not something D11 touched. Whether to change it — split heading text at
  the cursor into a real paragraph node instead — is a foundational grammar decision
  with its own trade-offs (the two-regime algebra's heading/content asymmetry is a
  core, deliberate design choice from Q2). Holding for an explicit decision
  (tasks.md 8.3).
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
  reproduced.** Read the actual `@codemirror/commands` `history.ts` source (via
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
