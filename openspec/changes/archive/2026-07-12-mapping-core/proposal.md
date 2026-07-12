## Why

Every later layer of the plugin (enforcement, grammar, node selection, zoom, backlinks) sits
on one foundation: a lossless, bidirectional mapping between markdown text and its inherent
block tree, plus structural operations closed over that mapping. This is also the project's
riskiest bet — if the isomorphism or the two-regime algebra doesn't hold up under real-world
markdown, we need to know in days, not after CM6 integration. Building it first, as a pure
library with property-based round-trip tests and zero Obsidian/CodeMirror dependencies,
de-risks the whole project and pressure-tests the two provisional mapping rules
(list-after-paragraph attachment, context-determined encoding).

## What Changes

- Bootstrap the TypeScript project (first code in the repo): build tooling, test runner,
  property-testing library, lint (including `obsidianmd/eslint-plugin` config, ready for
  later layers).
- New pure library module: markdown → block tree parser (headings, paragraphs, list items,
  leaf-block atoms: code fences, tables, callouts, quotes) and tree → markdown encoder,
  with the lossless round-trip guarantee (`encode(parse(md)) === md`; parse-relevant tree
  edits re-encode minimally — untouched lines byte-identical).
- New structural operations on the tree, per the decided two-regime algebra
  (docs/research/04-open-questions.md): headings = level ± 1 with subtree shift (reject at
  h1/h6 bounds); all other nodes = reparent (indent under previous sibling / outdent
  brother→uncle) with context-determined encoding; move up/down among siblings; every op
  returns either a new valid tree or a typed rejection — never a corrupt or lossy result.
- Property-test harness: round-trip identity, op-closure (any op result re-encodes to valid
  markdown that re-parses to the same tree), and no-gratuitous-rewrite (edits touch only the
  lines they must) over generated trees and a corpus of real-world markdown fixtures.

Explicitly out of scope: any CM6/Obsidian integration, editor UI, rendering, keymaps,
persistence. This change produces a library plus its tests.

## Capabilities

### New Capabilities

- `document-tree-mapping`: parsing any markdown document into its block tree (node types,
  depth rules, attachment rules, atoms, skipped-level headings) and encoding a tree back to
  markdown, with the isomorphism and minimal-edit guarantees.
- `structural-operations`: the outliner operations on the tree — indent, outdent, move —
  under the two-regime algebra, including rejection semantics and context-determined
  re-encoding of reparented nodes.

### Modified Capabilities

(none — first change in the project)

## Impact

- New code: `src/` library modules (tree model, parser, encoder, ops) + `tests/`.
- New dev dependencies: TypeScript, vitest (or similar), fast-check (property testing),
  eslint + obsidianmd plugin. No runtime dependencies on Obsidian/CodeMirror in this change.
- No existing code affected (repo currently has docs only).
- Decisions consumed from docs/research/04-open-questions.md (Q2 algebra, Q6 invariants);
  outcomes here may revise the two provisional rules — feed findings back into that log.
