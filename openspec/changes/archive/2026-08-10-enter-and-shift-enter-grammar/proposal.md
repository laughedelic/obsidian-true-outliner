## Why

Enter and Shift+Enter carry more keystrokes than every other structural key combined, and
they are the least designed part of the grammar: each shipped as a side effect of a change
about something else. Nobody has asked what the two keys mean across the whole document.

A catalogue of 49 cursor positions, run through the real planner rather than read off the
spec (2026-08-06, `docs/research/15-enter-and-shift-enter-catalogue.md`), found three
failures a user can feel:

- **Enter at a node's content start moves the user's own text.** On a list item WITH
  children, `- |alpha` demotes `alpha` one level and leaves an empty parent above it. On a
  heading, `# |Hello` turns the title into a paragraph under an empty `# `.
- **An empty list item cannot be escaped.** Enter on `- ` produces another empty sibling,
  and another. Obsidian core, Logseq, Workflowy and obsidian-outliner all outdent an empty
  item and leave the list at the top level.
- **Shift+Enter breaks the guarantee its own requirement states.** "The result SHALL
  re-parse as one (multiline) node" is false on a heading (it produces a paragraph child),
  on a setext underline (it splits `====`), and at any node's end.

Underneath those, the same shape-dependence recurs: what a key does depends on the node's
kind, whether it has children, and what kind its first child happens to be — none of which
is visible before pressing. Two specs also disagree on what a heading's remainder becomes.

Review of the catalogue (2026-08-07) added a fourth theme the original draft did not
address: **the keys leave debris.** An end-of-node Enter that is not used leaves blank
lines behind, and an empty node created and abandoned stays in the file.

## What Changes

**Enter acts on the empty position adjacent to the cursor.** One rule replaces the
kind-by-kind behavior:

- At a node's content END, the empty position BELOW it — its child scope when it has
  children, its sibling scope when it does not.
- At a node's content START, the empty position ABOVE it, in its sibling scope. The node's
  own text, children and depth do not move. This replaces demotion.
- Anywhere between, an ordinary split (unchanged).

**The caret goes to that empty position, never to the node's own text.** Where the
destination scope's kind has an empty markdown encoding — a list item, or a heading in the
sibling-above case — a real empty node is materialized. Where it does not (a paragraph),
the adjacent gap widens by two blank lines and the caret lands on a PROVISIONAL position.

**A heading MAY take a sibling in the content-start case.** `structural-operations`
currently forbids a heading sibling outright, on the grounds that a plain-text split has no
such encoding. At a content start nothing is being split — an empty node is being inserted —
and `# ` above `# Hello` is perfectly encodable. Without this amendment, "the caret goes to
the new empty node" on a heading reproduces the demotion defect it exists to remove.

**Enter on an EMPTY list item outdents it**, on `outdent`'s own terms. Where outdent is not
available — at the top level, or directly under a heading — the item is UNWRAPPED: its
marker goes and the caret is left on a provisional position, so the next thing typed is
prose outside the list. An empty item with children is rejected with the cue. An item whose
only content is an unchecked task marker counts as empty, because we wrote that marker.

**Shift+Enter on a heading creates a sibling heading of the same level**, carrying any text
after the cursor. A heading has no continuation line, so the key is free, and this is the
draft-the-structure gesture. The new heading is written ATX regardless of the original's
form: an empty setext heading has no encoding.

**Shift+Enter clamps out of chrome and preserves the node's own indentation.** A caret
inside a marker continues at the content column instead of splitting the marker; an
indented paragraph's continuation carries that paragraph's own leading whitespace instead
of landing at column 0 and surviving only by CommonMark's lazy-continuation rule.

**PROVISIONAL POSITIONS become a named concept with a load-bearing requirement.** Enter's
provisional position is blank-separated from both neighbours; Shift+Enter's is adjacent to
the node above. That difference is a REQUIREMENT, not a side effect: it is the only thing
that lets the parse tell "typing here makes a new node" from "typing here continues this
one", and the alternative — a narrower gap plus a rule applied when text is typed — is
provably ambiguous at a top-level paragraph, where both keys leave the caret in the same
place. It would need editor state to disambiguate. The two blank lines ARE the encoding of
that distinction.

**Abandonment is cleaned up by UNDO, not by deletion.** When the user declines a position a
structural keypress just created — a provisional line, an empty list item, an empty heading —
and that keypress is still the most recent entry in the undo history, the plugin undoes it.
Declining it means either moving the caret away without typing, or deleting it: a provisional
position stands for an empty node, so Backspace and Delete remove the whole place rather than
narrowing the gap around it by a line. The document returns byte-for-byte, no history entry is added, and the
caret continues where the gesture was headed. This rests on the structural `userEvent` never
being history-joinable, which is true (`/^(input\.type|delete)($|\.)/` is CodeMirror's
join test and `input.structure.split` cannot match it) and is pinned by a test rather than
assumed.

**Enter and Shift+Enter over a selection delete it first, then act at the resulting caret** —
one composed rule for a text range and for a block selection alike. Multi-cursor declines to
stock rather than silently discarding every secondary range, as it does today.

**Smaller corrections bundled in**, each measured:

- A heading and its first paragraph child are separated by a blank line. `normalizeBoundaries`
  already does this for a list item's paragraph child; headings have no such rule, so a
  heading split currently produces `# Head` / `line` with no separator.
- An end-of-node Enter on a node whose child scope resolves to `paragraph` widens that
  node's own gap instead of falling through to the sibling path, which places the new
  position after the entire subtree.
- The horizontal whitespace run at the split point is consumed by both keys, for every kind.
  Today a list-item split drops it, a paragraph split keeps it, and Shift+Enter keeps it.
- A split of a task item continues the task marker, unchecked.
- A new node takes its indentation from the siblings it lands among, whatever their kind;
  consulting list-item siblings only lets a split re-parent an existing child.
- Enter and Shift+Enter on a thematic break are REJECTED rather than declined. Every other
  atom's stock behavior is the next line of the same type — a `> ` line, a table row, a code
  line — but stock Enter splits `---` into a paragraph and an empty list item, destroying the
  node.
- The heading-remainder contradiction is resolved in favor of the child scope's kind
  (`structural-operations` and the implementation); the grammar spec's wording is corrected.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities

- `outline-keyboard-grammar`: both keys' requirements are rewritten around the empty-position
  rule; a new requirement names provisional positions and states the separation property
  their distinguishability depends on.
- `structural-operations`: "Node split" gains the content-start case, the child-scope
  gap-widen path and the whitespace rule; the destination-indentation rule consults siblings
  of any kind; a heading may take a sibling in the content-start case; new operations unwrap
  an empty list item and create a sibling heading; a new requirement states the heading /
  first-paragraph-child separation.
- `structural-history-integration`: a new requirement for undo-on-abandon — what it covers,
  the still-on-top guard, and the userEvent property it rests on.
- `content-space-caret`: a provisional position is a caret-addressable position by named
  exception. The addressability requirement currently says a blank gap line never is, which
  the split operation has contradicted since it shipped.
- `node-edit-enforcement`: the chrome-transparency requirement asserts that the caret cannot
  rest on a gap line, so no in-mode gap edit needs exempting. That premise is false for a
  provisional position; the requirement is corrected to say what happens there.
- `document-tree-mapping`: what a list item's own lines are and what its children may be —
  the blank-line distinction between a continuation line and a child block, and that children
  are not restricted to list items. Unspecified today; the rule lives only in the parser, and
  its absence is why two of the catalogue's findings read as surprises.

## Impact

- `src/ops.ts`: `splitNode` gains a content-start branch and loses the sibling-path
  fall-through; `destinationIndent`'s sibling lookup widens (shared with `insertSubtrees`
  and `reencodeBlocksForDestination`, so the paste suites are the regression surface);
  `normalizeBoundaries` gains the heading rule; two new exported operations.
- `src/plugin/grammar.ts`: the `split` case gains the ladder, the content-start route and
  the selection route; the `continue` case gains the heading route, the clamp and the
  paragraph indentation prefix.
- `src/plugin/keymap.ts`: the selection and multi-cursor gates both keys currently lack.
- New: the undo-on-abandon listener, and a per-view transient cache holding the undo depth
  at which a provisional position was created. Transient, fail-safe, and not document state.
- `src/result.ts`, `src/plugin/messages.ts`: two new rejection reasons and their cues.
- Tests: `tests/split.test.ts`, `tests/ops.test.ts`, `tests/grammar.test.ts`,
  `tests/closure.test.ts`, `tests/history-caret.test.ts`, and
  `e2e/specs/30-keyboard-grammar.e2e.ts` for the behaviors only visible live.

## Out of scope

- **Planning every cursor in a multi-cursor selection.** Declining is a strict improvement
  over today's silent discard; planning each range is a feature, filed with the existing
  structural-keys-over-a-multi-node-selection question.
- **Whether a task marker is chrome.** Continuing `- [ ] ` on a split is a marker rule in one
  function. Making `[ ]` unaddressable the way a bullet is would reach caret motion, Home/End
  and decorations, and is a model decision of its own.
- **Backspace and merge at a node's boundary**, Enter's inverse, which has its own settled
  specification.
- **The parser's per-kind tolerance for tab indentation.** A tab-indented quote under a list
  item parses as that item's content while a tab-indented fence parses as its child, because
  `QUOTE_RE` accepts up to three spaces and `FENCE_OPEN_RE` accepts tabs. Real, recorded in
  the catalogue, and a parser change rather than a keyboard one.
- **The decoration consequences**, both filed in `docs/research/12-decoration-follow-ups.md`:
  a non-list-item child of a list item is indented twice (our depth padding plus its own
  literal whitespace), and a provisional line has no decoration facts, so the caret visibly
  jumps left until the first character is typed.
