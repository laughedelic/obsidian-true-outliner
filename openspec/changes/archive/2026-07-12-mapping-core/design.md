## Context

First code in the repo. Everything later (CM6 enforcement, grammar, selection, zoom) consumes
this library, so its API shape and guarantees are load-bearing. The governing decisions live
in docs/research/04-open-questions.md (Q2 two-regime algebra, Q6 interop invariants) and
docs/research/05-org-mode-comparison.md. Two rules are explicitly provisional and this change
is their pressure test: list-after-paragraph attachment and context-determined encoding.

## Goals / Non-Goals

**Goals:**

- A pure TypeScript library (zero Obsidian/CodeMirror imports) implementing parse, encode,
  and structural ops with machine-checked guarantees:
  1. **Byte-identity round-trip**: `encode(parse(md)) === md` for any input.
  2. **Op closure**: every accepted op yields a tree whose encoding re-parses to that tree.
  3. **Minimal edits**: an op's text output differs from the input only on lines the op had
     to touch (Q6: no gratuitous rewrites).
- An ops API that returns both the new tree and a minimal line-edit list, so the later CM6
  layer can dispatch real editor transactions instead of whole-document replaces.
- Findings on the provisional rules fed back into the decision log.

**Non-Goals:**

- No CM6/Obsidian integration, UI, keymaps, or persistence (later changes).
- No inline-level parsing (links, emphasis) — block structure only; node text is opaque.
- No full CommonMark conformance — we target Obsidian's block dialect, not the spec.

## Decisions

### D1. Hand-rolled line-based block parser (not remark/markdown-it/lezer)

Byte-identity kills off-the-shelf parsers: mdast/markdown-it normalize on stringify, and
reconstructing text from their ASTs is exactly the lossy path Logseq fell into. We only need
*block-level* structure (headings, paragraphs, list items, fenced code, tables, quotes,
callouts, frontmatter, HTML blocks, thematic breaks), which is a line classification + stack
problem — small enough to own, and it must match *Obsidian's* dialect (callouts, task
markers) rather than strict CommonMark anyway. Lezer/`@codemirror/language` stays an option
for the CM6 layer later; the library's tree is the contract, not the parse technique.

### D2. Nodes own verbatim line spans; encode = concatenation

A node stores its original lines verbatim (marker, indentation, trailing whitespace and all);
`encode` concatenates spans. Round-trip identity is then structural rather than aspirational:
parse never interprets-and-reprints, it only *segments*. Ops that change a node produce new
lines for that node only. Blank lines are owned deterministically: a blank-line run belongs
to the gap after the preceding node (stored as its `trailingGap`), so segmentation is total
and unambiguous.

### D3. Ops are pure functions returning `Result<{tree, edits}, Rejection>`

`indent(tree, nodeId)`, `outdent(tree, nodeId)`, `moveUp/moveDown(tree, nodeId)`.
Rejections are typed values (`at-h6-bound`, `no-previous-sibling`, `at-top-level`, …), never
exceptions — the CM6 layer will map them to gentle UI feedback. `edits` is a list of
line-range replacements computed from changed nodes, enabling both the minimal-edit property
test and future CM6 transaction dispatch.

### D4. The algebra implements the decision log verbatim

- Headings: level ± 1, whole subtree shifts, reject at h1/h6 bounds; skips preserved;
  tree depth derives from levels.
- Other nodes: reparent; indent = child of previous sibling, outdent = brother→uncle;
  encoding of the landed node recomputed from nearest-preceding-sibling type (fallback
  following sibling; else paragraph under heading/root, list item elsewhere).
- List-after-paragraph = children of that paragraph; column-0 paragraph closes the group.
- Leaf blocks (code, table, callout, quote, HTML, thematic break) are atoms; frontmatter is
  an inert document preamble, not a node.

Both provisional rules are isolated behind small strategy functions (`attachmentRule`,
`encodingRule`) so a future config option or rule revision is a local change.

### D5. Testing: fast-check property tests + real-corpus fixtures, vitest runner

Generators produce arbitrary valid trees (and adversarial markdown strings); properties are
the three guarantees in Goals plus op-specific laws (heading indent∘outdent = id away from
bounds; paragraph indent∘outdent = id per context-encoding). A `tests/corpus/` of real
markdown files (flat notes, deep lists, mixed docs, edge-case zoo) locks byte-identity
against reality, not just our generator's imagination.

### D6. Tooling

TypeScript strict, vitest, fast-check, eslint (+ `obsidianmd/eslint-plugin` configured now so
later layers inherit a clean scorecard baseline), esbuild deferred until the plugin change.
Plain npm, no monorepo — one package, `src/` + `tests/`.

## Risks / Trade-offs

- [Dialect drift: our parser disagrees with Obsidian's on some construct] → corpus tests
  include Obsidian-flavored fixtures (callouts, task lists, embeds); later CM6 change adds a
  cross-check against `CachedMetadata.sections` on real vaults; disagreements become fixtures.
- [Blank-line/indentation edge cases break byte-identity] → D2 makes identity structural;
  fuzzing with adversarial whitespace generators; any failure is a red build, not a latent bug.
- [Provisional rules prove wrong under testing] → they're strategy-isolated (D4); revising
  them is a rule swap + regenerated fixtures, and the decision log gets updated.
- [Ordered lists: moving items breaks numbering] → v1 policy: renumber only the lines the op
  already touches plus affected following siblings' markers — a deliberate, documented
  exception to "minimal edits" (markers only, never content). Property test encodes this.
- [Setext headings (`===`/`---` underlines) have no form at levels 3+] → parse them as h1/h2
  nodes; a level op that needs an inexpressible setext level rewrites that heading to ATX as
  part of the op (minimal, lossless, only-when-touched).

## Open Questions

*(resolved during implementation)*

- Indentation unit: **2 spaces for newly created nesting**; existing indentation
  (including tabs) is preserved via relative shifts, so tab-indented vaults are not
  rewritten. Infer-from-file remains a candidate refinement for the CM6 change, where
  Obsidian's own indent settings are available.
- Heading `moveUp/moveDown`: **sibling-swap only, equal levels required** — swapping a
  heading with a non-heading sibling or a different-level heading has no positional
  encoding (the moved node would be re-scoped on reparse) and is rejected with
  `cannot-reorder-across-heading-boundary`.
- New discovery (fed back to the decision log): **outdent out of a heading section is
  rejected** — heading scope is positional, so a direct child of a heading has no
  "sibling of my section" spot. The CM6 layer needs UX for this.
