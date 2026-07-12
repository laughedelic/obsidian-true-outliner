## 1. Project bootstrap

- [x] 1.1 Initialize npm package with TypeScript (strict), vitest, fast-check, eslint +
  obsidianmd/eslint-plugin config; add npm scripts (build, test, lint) and CI-friendly
  defaults
- [x] 1.2 Define the tree model types: node kinds (heading, paragraph, list-item variants,
  atoms), verbatim line spans, trailing gaps, document preamble, node ids; plus tree
  traversal helpers (parent, siblings, subtree)

## 2. Parser (markdown → tree)

- [x] 2.1 Implement line classifier for Obsidian's block dialect (headings incl. setext,
  list items incl. ordered/task, fenced code, tables, callouts, quotes, HTML blocks,
  thematic breaks, frontmatter preamble)
- [x] 2.2 Implement segmentation into node spans with total blank-line ownership
  (trailing-gap rule) — every input line owned by exactly one span
- [x] 2.3 Implement hierarchy derivation: heading nesting from levels (skips preserved),
  list nesting from indentation, list-after-paragraph attachment behind an isolated
  `attachmentRule` strategy function
- [x] 2.4 Implement `encode` as span concatenation and wire the byte-identity round-trip
  property test (`encode(parse(md)) === md`) with a fast-check adversarial-markdown
  generator

## 3. Test corpus

- [x] 3.1 Build `tests/corpus/` of real-world fixtures: flat prose notes, deep nested
  lists, mixed heading/paragraph/list docs, Obsidian-flavored constructs (callouts, tasks,
  embeds), whitespace edge-case zoo; corpus round-trip test green
- [x] 3.2 Build fast-check tree generators (arbitrary valid trees) and the
  encode-then-parse identity property (`parse(encode(tree))` equals tree)

## 4. Structural operations

- [x] 4.1 Implement the ops framework: pure `Result<{tree, edits}, Rejection>` signature,
  typed rejection catalog, minimal line-edit computation from changed nodes
- [x] 4.2 Implement heading indent/outdent: level ± 1 with recursive subtree marker shift,
  h1/h6 bound rejections, setext→ATX rewrite when a target level is inexpressible
- [x] 4.3 Implement non-heading indent (child of previous sibling) and outdent
  (brother→uncle), subtree included, with context-determined encoding behind an isolated
  `encodingRule` strategy function
- [x] 4.4 Implement moveUp/moveDown sibling swap with subtree, including ordered-list
  marker renumbering policy (documented minimal-edit exception)
- [x] 4.5 Handle atoms in all ops: uniform re-indentation as a unit, internals untouched

## 5. Property verification

- [x] 5.1 Op-closure property: for any generated op on any generated tree, accepted results
  re-parse to the same tree and applying `edits` to source text equals `encode(result.tree)`
- [x] 5.2 Minimal-edit property: lines outside op-touched nodes are byte-identical (with
  the ordered-list renumber exception encoded explicitly)
- [x] 5.3 Inverse-law tests: heading indent∘outdent = id away from bounds; paragraph
  indent∘outdent restores byte-identical document; nested-list docs never flatten on outdent
- [x] 5.4 Rejection tests: every rejection case from the specs returns the right typed
  value and leaves the document untouched

## 6. Wrap-up

- [x] 6.1 Evaluate the two provisional rules against test findings; record outcomes (keep /
  revise / needs-config) in docs/research/04-open-questions.md
- [x] 6.2 Write library README (API surface, guarantees, dialect notes) and resolve the two
  design open questions (indentation unit inference; heading move semantics) or log them
  for the CM6 change
