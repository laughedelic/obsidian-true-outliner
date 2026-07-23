## Why

Outline mode always materializes brand-new list indentation as two literal spaces,
ignoring Obsidian's own "Indent using tabs" editor setting (Settings → Editor). Any
vault configured for tabs (or a different space width) gets mixed indentation the
moment the outliner creates a fresh indent level with nothing in the document yet to
infer a unit from — the first Tab in a new note, the first structural paste into an
otherwise-flat scope, an Enter-driven split that materializes a new nested child.
Since `structural-operations`' own "Context-determined encoding on reparent" rule
already infers the unit from EXISTING document content when there is any, this only
bites the "nothing to infer from yet" case — but that case is common (every new note,
every first indent) and the mismatch it produces is exactly the kind of "breaks
indentation in multiple cases" a user notices immediately.

## What Changes

- `ops.ts`'s `inferIndentUnit`/`destinationIndent` gain an optional
  `fallbackIndentUnit` parameter, used only when the document itself has no existing
  indented list item to infer a unit from (unchanged default: two spaces, so every
  existing pure-function caller/test is unaffected).
- This threads through `indent`, `outdent`, `splitNode`, `reencodeBlocksForDestination`,
  `insertSubtrees` (ops.ts) and `computeVerdict` and its internal helpers (enforce.ts),
  covering every place brand-new indentation can be materialized: Tab/Shift-Tab,
  Enter-driven splits, and structural paste/type-over/merge-splice rewrites.
- The CM6 adapters (`keymap.ts` for Tab/Shift-Tab, `transaction-filter.ts` for the
  paste/type-over verdict path) supply the live value by reading the PUBLIC
  `@codemirror/language` `indentUnit` facet off the editor state — confirmed live
  against a real Obsidian instance that this facet tracks Obsidian's "Indent using
  tabs" setting exactly, with no private `vault.getConfig`/`vault.setConfig` API
  needed in the shipped plugin code (this project's architecture bar: 100% public
  Obsidian APIs).
- **Known gap, not fixed here**: `main.ts`'s command-palette structural commands
  (`indent-node`/`outdent-node`) have no public-API path to the live CM6 facet from
  Obsidian's `Editor`/`MarkdownView` types, so they keep inferring from document
  content only (same as before this change) — documented inline at the `StructuralOp`
  type. This is a narrow, secondary entry point; Tab/Shift-Tab and paste (the
  everyday paths) are fully fixed.
- New devDependency: `@codemirror/language` (types only — already externalized in
  `esbuild.config.mjs`, resolved to Obsidian's own bundled copy at runtime, so no
  extra bytes ship and the facet reference is the SAME instance Obsidian itself sets).

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `structural-operations`: brand-new indentation (no existing document evidence to
  infer a unit from) now takes the vault's "Indent using tabs" preference instead of
  a hardcoded two-space default.

## Impact

- `src/ops.ts`, `src/enforce.ts`: optional trailing parameter threaded through the
  functions listed above; no behavior change for any existing caller that omits it.
- `src/plugin/keymap.ts`, `src/plugin/transaction-filter.ts`: read the public CM6
  `indentUnit` facet and pass it through.
- `src/plugin/main.ts`: doc comment only, no behavior change (documents the known
  command-palette gap).
- `src/plugin/grammar.ts`: `planKey` gains the same optional parameter.
- `package.json`/`package-lock.json`: `@codemirror/language` devDependency added.
- Tests: new unit coverage in `tests/ops.test.ts` (fallback-unit behavior for
  `indent`/`splitNode`), a new e2e test in `e2e/specs/30-keyboard-grammar.e2e.ts`
  toggling the real Obsidian setting and asserting Tab output, and a new
  test-setup-only `setIndentUsingTabs` helper in `e2e/helpers.ts`.
