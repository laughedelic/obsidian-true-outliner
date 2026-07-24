## Context

Enter is handled by `grammar.ts`'s `planKey` (`key === 'split'`). For every splittable
kind it calls `splitNode(doc, node.id, cursor, fallbackIndentUnit)` (`src/ops.ts:500`),
which slices the node's text at the cursor and produces two real nodes. Headings are
special-cased instead: `planKey` never reaches `splitNode` for a heading — it calls
`insertionPlan(lines, { line: cursor.line, ch: line.length }, '\n', ...)`
(`grammar.ts:148-154`), which hardcodes the insertion point to the END of the cursor's
own line, discarding `cursor.ch` entirely, and inserts a single blank line. `splitNode`
itself still has an explicit guard rejecting headings
(`if (node.kind !== 'paragraph' && node.kind !== 'list-item') return reject('cannot-split')`,
`src/ops.ts:509`).

Q17 confirmed this live: Enter anywhere in a heading's text produces the same one-line
insertion regardless of cursor position. It is the original `outline-keyboard-grammar`
design (predates `outline-edit-enforcement` and its D9-D16 chrome-transparency
amendments entirely) — not a regression from that series, but the same class of gap
those amendments fixed for paragraphs/list-items: a structural editing gesture whose
recognition doesn't track the actual cursor position in content space.

The two-regime algebra (Q2) governs Tab/Shift+Tab: headings promote/demote by LEVEL,
everything else reparents. That rule is about indent/outdent, not about Enter — Enter
has always been "split the node's text at the cursor" for every OTHER kind, and this
change brings headings into that same regime rather than touching level-shift at all.

`splitNode` already has a "node WITH children" branch (`src/ops.ts:532-573`, added
2026-07-21 for D11, content-adjacent split) that lands the split remainder as the new
FIRST CHILD rather than a sibling past the whole subtree. That branch calls
`encodingKindAtDestination({ parentKind: node.kind, precedingSiblings: [],
followingSiblings: node.children })` (`src/rules.ts:28`) to decide the new child's kind.
Read closely, that function is already heading-ready: when `parentKind === 'heading'`
and no paragraph/list-item donor is found among the children, it falls back to
`'paragraph'` (`src/rules.ts:43-45`) — a case written for exactly this scenario, since a
heading's children can themselves start with another heading (a subsection), which the
donor scan correctly skips.

## Goals / Non-Goals

**Goals:**
- Enter mid-text in a heading splits the heading's title at the cursor: the heading
  keeps the text before the cursor (same level, marker, setext-ness); the text after the
  cursor becomes a new paragraph, landing as the heading's new first child.
- Enter at the heading's end keeps today's exact behavior (blank-gap-then-materialize) —
  zero behavior change for the most common case.
- The fix lands entirely inside `splitNode` + the `grammar.ts` `split` case; no change to
  `outline-edit-enforcement`'s verdict layer, `classify.ts`, or any transaction-filter
  choke point, since Enter's plan already goes through `planFromOp`/`splitNode` for every
  other kind and this just removes the heading carve-out.

**Non-Goals:**
- No change to heading Tab/Shift+Tab (level-shift) or any other part of the two-regime
  algebra.
- No change to whether heading `#` markers get direct-edit protection (D13's deferred
  item) — markers stay directly editable, `contentColumnCh`'s existing heading-marker
  regex (`^[ \t]*(?:...)?(?:#{1,6}[ \t]+)?`) already clamps split positions to after the
  marker, same as it does for list markers and paragraph indentation.
- No change to Shift+Enter/`continue` on headings (`insertionPlan` stays for that path).
- Not attempting to make setext-underline-line Enter do anything smarter than reject —
  out of scope for this decision, the underline is not text.

## Decisions

### D1. Heading split always yields a CHILD, never a sibling

Unlike paragraph/list-item (which yield a sibling when childless, a first-child when not),
a heading split ALWAYS routes through the children-branch, regardless of whether
`node.children.length` is 0. Rationale: per Q2's mixed-containment rule, a heading's only
possible SIBLING is another heading — you cannot express "sibling of a heading" via a
plain-text split (that would require synthesizing a new heading marker/level from
nothing, which is exactly the "sentinel syntax" / magic-content-sniffing failure mode Q2
already rejected for a different case). The only encoding that exists for split-off
heading text is a child. This is not a special case bolted onto the existing branch — it
naturally falls out of `encodingKindAtDestination`'s existing `parentKind === 'heading'`
fallback (see Context), so the fix is: extend the branch's guard from
`node.children.length > 0` to `node.children.length > 0 || node.kind === 'heading'`,
and extend the initial kind guard to accept `heading`.

**Alternative considered and rejected**: keep Enter always inserting a blank line for
headings (today's behavior) — rejected because it's the exact defect Q17 flags: Enter's
whole point is "split text at the cursor," and headings are the only kind where it
doesn't. Keeping the special case means heading text can never be split without a
separate manual retype.

**Alternative considered and rejected**: make heading Enter promote the remainder to a
new heading (deeper level) instead of a paragraph — rejected because it would silently
manufacture heading structure from a keystroke never touching a `#` character, which
directly conflicts with Q2's "never hidden state, never lossy conversion" and "isomorphic
transformation" governing principles, and has no analog in what Enter does for any other
kind.

### D2. Cursor-at-end path reuses the shared gap-widen mechanism (revised — NOT byte-identical)

When the remainder is empty (cursor at the heading's end, or only trailing whitespace),
the fix falls into the SAME `emptyRemainder && childKind === 'paragraph'` fallthrough
already used for top-level empty-paragraph splits (`src/ops.ts`) — widen the node's own
`trailingGap` by two blank lines, cursor lands on the first one, guaranteeing blank
separation on both sides regardless of what gap already existed. For headings this means
widening the HEADING's own `trailingGap` (not a sibling's) — the model supports this
directly: `encode.ts` emits `node.lines, node.trailingGap, then children` in that order,
so a heading's `trailingGap` already renders BETWEEN the heading line and its first child
(this is how `"# Head\n\nBody.\n"` parses today: the blank line is the heading's own
`trailingGap`, with `Body.` as its child).

**Correction from the original draft of this decision**: this was first written assuming
"byte-identical output to today's shipped behavior for cursor-at-end." Verified false once
implemented and tested. Today's heading Enter (`insertionPlan`) blindly inserts exactly
ONE blank line regardless of what followed. The shared gap-widen mechanism always adds
TWO new blanks on top of whatever gap already existed (`trailingGap: ['', '',
...n.trailingGap]`) — for `"# Head\n\nBody.\n"` (heading already had a one-blank-line gap
before its `Body.` child), Enter at the heading's end now produces `"# Head\n\n\n\nBody.\n"`
(three blank lines) instead of the old `"# Head\n\n\nBody.\n"` (two blank lines); a
childless heading with nothing following goes from one inserted blank to two. This is a
real, minor, user-visible difference — one or two extra blank lines materialize before the
cursor on Enter-at-heading-end — not the no-op this decision originally claimed.

Accepted as-is rather than special-cased back to the old blank-line count: forcing exact
byte parity with the old ad hoc `insertionPlan` insertion would mean re-introducing a
heading-specific exception into the very code path this change exists to unify, which
defeats the point. The extra blank line(s) are the same "minimal-edit tradeoff" the project
already accepts elsewhere (`docs/research/04-open-questions.md` Q2's loose-list precedent)
in exchange for reusing already-vetted, invariant-preserving shared logic instead of a
one-off insertion that never reasoned about gap ownership at all.

### D3. Paragraph-adjacency separator fix, bundled

The children-branch, as it exists today, does not insert a separating blank line between
the new `lower` node and the (previously-first, now-second) existing child. This is safe
for the shipped `list-item` case (list items self-delimit via their marker — two adjacent
`- ` lines never merge). It is NOT safe when `childKind` resolves to `'paragraph'` and the
existing first child is ALSO a paragraph: CommonMark merges adjacent non-blank same-level
lines into one paragraph, so `lower` and the old first child would silently fuse into a
single node on re-parse, discarding the split.

This exact shape — a paragraph-kind parent's existing children starting with a
paragraph-kind node — cannot happen for non-heading parents in the current model: Q2's
context-determined-encoding rule means paragraph-under-paragraph always encodes as a
LIST ITEM, never a bare paragraph (`docs/research/04-open-questions.md` Q2, "indenting
paragraph B under paragraph A turns B into a list item"). So this is a latent gap in the
2026-07-21 children-branch code, unreachable until now — but it is the PRIMARY case for
headings, since "heading directly followed by a paragraph" (no intervening list) is
completely ordinary markdown.

Fix: when `childKind === 'paragraph'` and `node.children.length > 0` and the existing
first child (`node.children[0]`) is ALSO kind `'paragraph'`, set `lower.trailingGap =
['']` (one blank separator) before splicing. No separator is needed when the next
existing child is `list-item` (self-delimiting), `heading` (ATX/setext headings are
recognized without a preceding blank line), or an atom (atoms are block-start
constructs). Traced through a concrete example (`# Head` split mid-word with an existing
`Body.` paragraph child): produces `# H\n\nead\n\nBody.\n`, which re-parses as
`heading("H") → [paragraph("ead"), paragraph("Body.")]` — both preserved as distinct
nodes, matching the split's intent.

This is scoped narrowly (only the `paragraph`-into-`paragraph` adjacency); it does not
attempt a general "does kind X need a blank line before kind Y" helper, since no other
combination is reachable today.

### D3b. Terminal trailing-gap transfer (found during implementation, not in the original draft)

A second, related gap surfaced only once implemented and tested against a childless
heading at the very end of a document (`"# Hello world\n"`, no children, split mid-text):
the heading's OWN `trailingGap` — which for a childless, doc-final node is really the
file's own trailing-newline representation, not an interior gap — stayed attached to
`upper` (the truncated heading) via the object spread, landing it BETWEEN the heading and
`lower` and leaving nothing to represent the file's end after `lower`. Root cause: this
is the first time the children-branch runs on a node that is childless AND was the
document's own terminal node — previously (pre-heading) the branch only ran when
`node.children.length > 0`, so the split node was never the doc's last node (something
in its own subtree always was, and kept its own correct trailing gap independently).

Fix: when `node.children.length === 0` going into this branch (only reachable for
headings), `lower`'s `trailingGap` inherits `node`'s original `trailingGap`, and `upper`'s
own `trailingGap` is cleared to `[]` — the terminal-position role moves with the new
terminal node, mirroring the existing `subtreeFinalNode`/`stripFinalGap` treatment the
sibling-split path already applies for the analogous reason. Confirmed via
`splitOk`'s round-trip assertion (`applyEdits(...edits) === encode(result.doc)`) passing
for the childless-heading-at-EOF case in `tests/split.test.ts`.

### D4. Setext heading splits (underline rejects; title split needed a real fix, not just a guard)

`splitNode`'s existing `lineIndex` bounds check (`position.line - startLine`) already
covers headings once the initial kind guard is relaxed — but a setext heading's `lines`
array has 2 entries (title, underline). A split targeted at `lineIndex === 1` (the
underline) has no meaningful "text before/after the cursor" to split, since the underline
carries no title text. Reject with `cannot-split` (the same rejection code atoms use) for
`node.kind === 'heading' && node.setext && lineIndex !== 0`.

**Correction from the original draft of this decision**: this was first written assuming
the underline-rejection guard was the ONLY setext-specific change needed — that a
mid-title split (`lineIndex === 0`) would fall out correctly from the existing
`upperLines`/`lowerRest` computation once headings were allowed through at all. Verified
false once actually tested (only after initial delivery, on user feedback that setext
didn't work — the property-test suite never caught it because `arbTree()` never generates
setext headings, so this shape had zero generated coverage). The bug: the generic
`lowerRest = node.lines.slice(lineIndex + 1)` swept the underline (`node.lines[1]`) into
the SPLIT-OFF REMAINDER's own lines, not the truncated heading. Splitting
`"Hello world\n====\n"` after `"Hello "` produced a single corrupted node with
`lines: ["Hello ", "world", "===="]` — re-parsing `"Hello \nworld\n====\n"` interprets the
whole thing as ONE multi-line setext heading (CommonMark: any paragraph immediately
followed by an underline becomes a setext heading, and the paragraph can itself be
multi-line), silently undoing the split entirely while still passing the round-trip
property (the corrupted result was internally self-consistent, just semantically wrong —
property testing catches "doesn't round-trip," not "round-trips to the wrong thing").

Fixed by special-casing the setext underline explicitly rather than relying on the
generic per-line slicing: `upperLines` becomes `[title-before-cursor, underline]`
(keeping the underline attached to the truncated heading) and `lowerRest` becomes `[]`
(nothing carries over — the underline was never real continuation content). Verified
directly (`npx tsx`, before and after) and via new explicit unit/e2e tests (`arbTree()`
still won't generate this shape, so it stays reliant on explicit coverage, not property
coverage) for: mid-title split with no children, with an existing paragraph child
(exercises D3's separator fix too), with an existing list-item child, and end-of-title
(exercises D2's gap-widen path) — all confirmed round-trip-correct and edit-reproducing.

### D5. `mergeNodes` was discarding a heading's own gap (found via user testing of this change, root cause predates it)

Reported after initial delivery: merge a list item into a heading (Backspace at the
item's content-start — `node-edit-enforcement`'s D10 content-adjacent merge, via
`mergeNodes`), then press Enter to split back out — the heading's original blank-line
gap was gone, and whatever followed stuck directly to the heading. Reproduced directly
(`npx tsx`) with `"# Head\n\n- item1\n- item2\n"`: merging `item1` into the heading
produces `"# Headitem1\n- item2\n"` — the gap is ALREADY lost at the merge step, before
Enter is even pressed. The subsequent split (this change's own code) was working
correctly on already-corrupted input; the root cause is entirely in `mergeNodes`,
predates this change, and is unrelated to headings-can-now-split — it's just that
splitting a heading back out of a merge is the first place this became visibly
observable in a natural editing sequence.

Root cause: `mergeNodes` (`src/ops.ts`) builds the merged node's `trailingGap`
unconditionally from `second` (the absorbed node) — `structural-operations`' own
"Adjacent-node merge" requirement documents this as "consuming `first`'s trailing gap."
That's the correct convention for ordinary interior merges (paragraph absorbs
paragraph, list-item absorbs list-item): the two nodes fuse into one, so "the gap
between them" is genuinely gone, and the merged node's boundary to whatever follows is
legitimately whatever followed `second`. It's the WRONG convention when `first` is a
heading: the gap after a heading is the heading's own established separation from its
content — a section-level styling choice, not a property of whichever node happened to
be absorbed. Discarding it whenever the absorbed node's own gap happens to be smaller
(here, `item1`'s gap to `item2` was `[]`, since adjacent list items don't need
separation from each other) silently shrinks a gap the user never touched.

Fix: for `first.kind === 'heading'`, take whichever of `first.trailingGap` or
`second.trailingGap` has MORE lines, instead of always `second.trailingGap`. Verified
this doesn't regress the existing "heads absorbs terminal content" test
(`'# Title\nBody.\n'` → `'# TitleBody.\n'`, `tests/edit-ops.test.ts`): there, `first`
(the heading) has NO gap of its own, while `second` (`Body.`, the document's own last
node) carries the file's trailing-newline representation in ITS gap — the longer side
is still `second`'s, so the existing test's expected output is untouched. Scoped
narrowly to `first.kind === 'heading'` — no change to the ordinary interior-merge
convention for paragraph/list-item `first`.

This modifies `structural-operations`' already-shipped "Adjacent-node merge"
requirement (its "consuming `first`'s trailing gap" language), not just this change's
own new "Node split" ground — a genuine, if narrow, scope expansion beyond the
original Q17 proposal, taken on because it's the direct root cause of a bug surfaced
while testing this change's own feature.

## Risks / Trade-offs

- **[Risk]** D5's `mergeNodes` fix changes shared code exercised by every heading
  merge, not just the merge-then-split sequence that surfaced it. → **Mitigation**: the
  change is a single conditional (`first.kind === 'heading' && first.trailingGap.length
  > second.trailingGap.length`) that only ever WIDENS the merged node's gap relative to
  the old behavior, never shrinks it — the old value (`second.trailingGap`) remains the
  result whenever it's the longer side, which is what the existing terminal-content test
  already covers. `tests/edit-ops.test.ts` gained an explicit test locking in that
  no-regression case alongside the fix's own test.
- **[Risk]** The paragraph-adjacency separator fix (D3) changes shared code
  (`splitNode`'s children-branch) that also serves paragraph/list-item splits, not just
  headings. → **Mitigation**: the fix is additively gated (`childKind === 'paragraph' &&
  node.children.length > 0 && node.children[0]?.kind === 'paragraph'`) — a condition that,
  per the D3 analysis, is unreachable for non-heading parents under the current
  context-determined-encoding rule. `tests/closure.test.ts`'s property suite (which
  already generates paragraph/list-item split scenarios across the operation-closure
  laws) re-running green is the confirming signal that non-heading behavior is unchanged;
  add an explicit assertion/comment noting why the new branch is a no-op for non-heading
  cases today, so a future change to the context rule doesn't silently reintroduce the
  bug it fixes.
- **[Risk]** Existing test `tests/grammar.test.ts`'s "Enter on a heading opens an empty
  child line below" asserts the OLD cursor-ignoring behavior at a MID-TEXT cursor
  position (`ch: 3` in `"# Head"`) — it will fail once this change lands, by design. →
  **Mitigation**: this is expected; the test is renamed and its expectation updated to
  the new split-at-cursor output, with a second test added for cursor-at-end asserting
  the REVISED D2 behavior (gap widens by one more blank line than before, not
  byte-identical — see D2's correction).
- **[Risk]** Real-vault muscle memory: users who currently expect "Enter anywhere in a
  heading always just opens a blank line below" will see mid-text Enter behave
  differently (splitting their title text) after this ships. → **Mitigation**: this is
  the intended fix per Q17 (the old behavior was the bug, confirmed via direct testing);
  no mitigation needed beyond what any user-facing behavior change gets — no migration
  path exists for "the way Enter behaved before" since there's no persisted state
  involved, purely a keystroke-time behavior.
- **[Trade-off]** Cursor mid-heading-text now performs a structural split (two nodes)
  where before it was a single blind insertion — one more shape for `splitNode`'s
  property tests (`tests/closure.test.ts`) to cover, and one more kind in
  `arbTree()`-style generators if heading splitting needs generated coverage. Scoped
  cost, consistent with how D11 already extended the same test suites for
  paragraph/list-item content-adjacent splits.

## Migration Plan

No data migration — this is pure editing-gesture behavior in the CM6 keymap layer, no
persisted state, no markdown files affected until a user actually presses Enter
mid-heading. Ship as a normal change: implement, add unit/property/e2e coverage, run the
full suite, manual-vault-pass per the project's standing practice for structural-op
changes (`docs/research/04-open-questions.md`'s recurring "measure twice" discipline for
foundational grammar changes). No feature flag — Enter's behavior for every other kind
already works this way; this closes the one remaining gap.

## Open Questions

None outstanding for this change. The one deliberately-deferred adjacent question (D13:
should heading `#` markers get direct-edit protection like list markers) stays explicitly
out of scope per Q17's own framing ("think about it, don't act on it").
