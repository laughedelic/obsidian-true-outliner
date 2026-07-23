## Context

Outline mode's structural ops (`ops.ts`) are pure functions with no Obsidian imports
by design — `document-tree-mapping`/`structural-operations` keep the mapping algebra
testable without a live editor. When a node needs brand-new indentation and the
document offers no existing indented list item to infer a unit from,
`destinationIndent`'s `inferIndentUnit` fell back to a hardcoded `'  '` (two spaces),
regardless of Obsidian's own "Indent using tabs" vault setting. This project's
architecture bar (docs/research/03-obsidian-api-feasibility.md) is "100% public
Obsidian APIs, no private APIs, no monkey-patching" — `Vault.getConfig`/`setConfig`
(the common but undocumented way plugins read this setting) is not part of the public
`obsidian.d.ts` surface, so the fix needed a public-API route to the live setting.

## Goals / Non-Goals

**Goals:**
- Brand-new indentation (no existing document evidence) uses the vault's configured
  tab/space preference, live, without any Obsidian-private API in shipped plugin code.
- Zero behavior change for every existing pure-function call site that doesn't pass
  the new parameter (all existing tests keep passing unmodified).
- Cover both everyday paths that can materialize new indentation: Tab/Shift-Tab
  (`keymap.ts`) and structural paste/type-over/merge-splice rewrites
  (`transaction-filter.ts` → `enforce.ts`).

**Non-Goals:**
- Fixing `main.ts`'s command-palette structural commands — no public API exposes the
  live CM6 facet from `Editor`/`MarkdownView`; documented as a known, narrow gap
  rather than worked around with a private accessor.
- Changing how an EXISTING document's own indentation is inferred (list-item-donor
  and existing-tab/space detection are unchanged and still take priority — this only
  changes the last-resort fallback).
- Any change to `indentUnit`'s own semantics or CodeMirror's indentation service —
  this only READS the facet, never sets it.

## Decisions

### Read Obsidian's setting via CM6's public `indentUnit` facet, not `vault.getConfig`
`@codemirror/language` exports `indentUnit: Facet<string, string>` — "a string
consisting entirely of the same whitespace character... when not set, defaults to 2
spaces." Verified empirically against a real Obsidian instance (via the e2e harness's
`executeObsidian`, probing `view.editor.cm.state.facet(indentUnit)` before/after
toggling `useTab`): Obsidian sets this facet from its own "Indent using tabs" setting,
live — `useTab: false` → `"    "` (spaces, width = the configured `tabSize`);
`useTab: true` → `"\t"`. Reading `EditorView.state.facet(indentUnit)` (keymap.ts) or
`Transaction.startState.facet(indentUnit)` (transaction-filter.ts) is plain public CM6
API — no Obsidian-internal call at all.
**Alternative considered**: `(app.vault as any).getConfig('useTab')` / `'tabSize'` —
works, is what most community plugins do, but is explicitly the kind of undocumented
internal this project's architecture bar rules out; also would need a second call for
`tabSize` and its own space-string construction, duplicating what the facet already
gives as one ready-to-use string.
**Alternative considered**: track a `ViewPlugin`-based "active editor" reference on
the plugin instance so `main.ts`'s commands could also read the facet — would close
the command-palette gap, but adds a standing piece of mutable cross-context state for
a narrow, secondary entry point; deferred rather than adding that surface now.

### Thread as an optional trailing parameter, not a required one
Every function in the `ops.ts`/`enforce.ts` chain that can materialize new
indentation (`indent`, `outdent`, `splitNode`, `reencodeBlocksForDestination`,
`insertSubtrees`, `computeVerdict` and its private helpers) gains
`fallbackIndentUnit?: string` as its last parameter, defaulting through to the
existing two-space behavior when omitted.
**Alternative considered**: an options object (`{fallbackIndentUnit}`) — more
extensible if more editor-derived preferences show up later, but every one of these
functions already has 2-5 positional parameters and the existing call sites/tests are
positional; a single optional trailing string keeps the diff minimal and every
existing call site untouched.
**Alternative considered**: a module-level "current preference" singleton set by the
plugin on load/setting-change — rejected, breaks the pure-function/no-Obsidian-import
design `ops.ts`/`enforce.ts` deliberately keep (design.md's own stated goal for
testability), and goes stale the instant the user flips the setting without a reload.

### Only the FALLBACK changes — existing-document inference still wins
`destinationIndent`'s priority order is unchanged: (1) an existing list-item sibling
at the destination donates its indentation verbatim, (2) else infer a unit from any
indented list item anywhere in the document, (3) else — now — the caller-supplied
fallback, still defaulting to two spaces. A vault-wide "use tabs" preference does NOT
retroactively change an already-tab-or-space-committed document's own established
style; it only governs indentation with zero existing evidence, matching the existing
"tab-indented vaults... adopt the destination level indentation" design intent
(structural-operations spec) rather than overriding it.

## Risks / Trade-offs

- **[Risk] `@codemirror/language` version drift between this plugin's devDependency
  and Obsidian's actual bundled version** → Mitigation: the package is in
  `esbuild.config.mjs`'s existing `external` list (already present before this
  change, for `@codemirror/state`/`@codemirror/view` reasons) — it is NEVER bundled,
  only used for TypeScript types at build time; at runtime Obsidian's module resolver
  supplies its own instance, so the `indentUnit` Facet object identity is always
  Obsidian's own, regardless of the devDependency's pinned version. Facet APIs this
  stable (2 spaces default, string-based unit) are very unlikely to break across CM6
  6.x versions regardless.
- **[Risk] Command-palette structural commands stay inconsistent with Tab/Shift-Tab**
  → Mitigation: documented inline (main.ts's `StructuralOp` comment) and in this
  proposal's Non-Goals; the everyday paths are fixed, and this is a pre-existing
  inconsistency this change doesn't worsen.
- **[Risk] `e2e/helpers.ts`'s new `setIndentUsingTabs` uses `vault.setConfig`, the
  same private API the shipped plugin code avoids** → Mitigation: this is test-setup
  scaffolding arranging Obsidian's own state for a test, not plugin runtime code —
  same category as this file's pre-existing `(editor as any).cm` reads used
  elsewhere in the harness; the architecture bar applies to what ships in `main.js`.

## Migration Plan

Pure addition of optional parameters plus two read-only facet reads — no data
migration, no schema change, no settings UI added (the plugin doesn't introduce a new
setting; it respects Obsidian's existing one). Rollback is a plain revert. Verified via:
1. Unit tests (`tests/ops.test.ts`) pinning both the unchanged default and the
   fallback-supplied behavior, plus that existing-document inference still wins over
   the fallback.
2. A real-Obsidian e2e test (`e2e/specs/30-keyboard-grammar.e2e.ts`) toggling the
   actual "Indent using tabs" setting and asserting Tab produces the corresponding
   character — the empirical proof, not just a mocked facet read.
3. Full existing unit (816) and e2e (130+, 12 spec files) suites re-run clean.

## Open Questions

- Whether to later close the command-palette gap via a tracked-active-view extension
  (see Decisions, alternative considered) — not needed unless a user reports the
  inconsistency in practice.
