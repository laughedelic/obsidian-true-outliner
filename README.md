# obsidian-true-outliner

A true outliner for Obsidian — *any note is an outline*: enforced structure, node
selection, and a lossless (isomorphic) mapping between markdown and its inherent block
tree. Research and decisions: [docs/research/](docs/research/).

**Status**: mapping core implemented (pure library, no Obsidian/CodeMirror dependencies
yet). The editor integration comes in later changes.

## The mapping core (`src/`)

Markdown ↔ block tree, plus the structural operations, with machine-checked guarantees:

- **Byte-identity round-trip** — `encode(parse(md)) === md` for *any* input. Nodes own
  their original lines verbatim; encoding is span concatenation, so identity is
  structural, not aspirational.
- **Op closure** — every accepted operation returns a tree that re-parses identically
  from its own encoding, plus a minimal line-edit list that reproduces it.
- **Minimal edits** — lines outside the moved/re-leveled subtree are byte-identical
  (documented exception: ordered-list marker renumbering).

### API

```ts
import { parse, encode, indent, outdent, moveUp, moveDown } from './src';

const doc = parse(markdown);            // OutlineDoc: block tree, verbatim spans
encode(doc) === markdown;               // always

const result = indent(doc, nodeId);     // OpResult<{ doc, edits }>
if (result.ok) {
  result.value.doc;                     // new tree (re-parsed canonical form)
  result.value.edits;                   // minimal line-range replacements
} else {
  result.rejection.reason;              // typed: 'at-h6-bound', 'at-top-level', …
}
```

### The two-regime algebra

- **Headings**: indent/outdent = level ± 1 (org-mode promote/demote), whole subtree
  shifts, hierarchy re-derives from levels; rejected only at the h1/h6 bounds.
- **Everything else**: indent = child of previous sibling, outdent = brother→uncle;
  the node's encoding (paragraph vs list item) is recomputed from its new context.
- **Always**: an op writes the minimal markdown encoding of the new tree, or is
  rejected as a typed value — never hidden state, never lossy conversion.

Full rules and their rationale: [docs/research/04-open-questions.md](docs/research/04-open-questions.md);
org-mode alignment: [docs/research/05-org-mode-comparison.md](docs/research/05-org-mode-comparison.md).

### Dialect notes

Block-level Obsidian markdown, not strict CommonMark: callouts and task markers are
recognized; lazy continuation lines are not supported; top-level 4-space-indented code
parses as paragraph nodes (bytes still round-trip); setext headings are recognized and
rewritten to ATX only when a level op touches them. New nesting uses 2-space
indentation; existing indentation (including tabs) is preserved via relative shifts.

## Development

```sh
npm test        # vitest: unit + fast-check property suites + corpus round-trips
npm run build   # tsc --noEmit
npm run lint    # eslint (obsidianmd plugin config lands with the plugin surface)
npm run test:e2e  # end-to-end: real Obsidian against a sandboxed copy of test-vault/
```

### End-to-end tests (`e2e/`)

`npm run test:e2e` builds the plugin, then uses
[wdio-obsidian-service](https://github.com/jesse-r-s-hines/wdio-obsidian-service)
to download Obsidian (first run only, cached in `.obsidian-cache/`), launch it
against a throwaway copy of `test-vault/` with the plugin installed, and run
the specs in `e2e/specs/`. The checked-in vault is never modified.

The suites automate the verification protocol in
`openspec/changes/archive/2026-07-13-editor-core/verification.md` — see that
file for the scenario-to-spec map. To add a spec, drop a `*.e2e.ts` file in `e2e/specs/`
and use the helpers in `e2e/helpers.ts` (buffer/disk/data.json readers, key
chords, notice assertions). `browser.executeObsidian(({app, obsidian}) => …)`
runs code inside the app; `browser.reloadObsidian()` restarts it for
persistence tests. The harness lives outside the plugin bundle, the vitest
suite, and the root typecheck (`npm run build:e2e` typechecks it).
