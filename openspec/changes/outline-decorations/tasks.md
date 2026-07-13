## 1. Depth/marker computation (pure module)

- [ ] 1.1 `src/plugin/decorate.ts`: given an `OutlineDoc` (from `parse()`), compute a flat
  list of per-line decoration facts — `{ lineNumber, depth, isParagraphFirstLine }` —
  walking the tree the same way `startLine` in `grammar.ts` does (depth = distance from
  root; a node's own `lines` (not its `trailingGap`) all carry its depth). No CM6 imports;
  unit-testable directly against parsed fixtures.
- [ ] 1.2 Unit tests: heading depth vs. list depth vs. paragraph-adjacency depth all agree
  when tree-equivalent (the three-encodings-one-hierarchy guarantee); gap lines excluded;
  multiline node continuation lines included at the node's own depth; empty document and
  preamble-only document produce no facts.

## 2. CM6 decoration extension

- [ ] 2.1 `src/plugin/decorations.ts`: a `ViewPlugin` producing a `DecorationSet` from
  `decorate(parse(view.state.doc.toString()))` — one `Decoration.line` per fact, setting a
  `--to-depth` CSS custom property and (for paragraph-first-lines) a `to-node-marker`
  class; recompute on `update.docChanged` or a mode-gate flip; empty `DecorationSet` when
  the file isn't in outline mode (reuse the `ModeSource` contract from `keymap.ts`).
- [ ] 2.2 `styles.css` at repo root: guide rule using `calc(var(--to-depth) * <unit>)`
  (anchor to Obsidian's own list-indent CSS variables where available), and a `::before`
  rule for `.to-node-marker`; verify against both bundled light and dark themes.
- [ ] 2.3 Register the extension in `main.ts` via `registerEditorExtension`, alongside
  `grammarExtension`.

## 3. Verification

- [ ] 3.1 Full gate green: `tsc`, `lint` (zero errors), `vitest` (unit tests from 1.2 plus
  any existing suites), plugin build.
- [ ] 3.2 `e2e/specs/`: new spec asserting the non-mutation contract (decorations present,
  document text/cursor/undo-stack unaffected) and DOM-level checks — guide depth agreement
  across a mixed heading/list/paragraph fixture, marker present on paragraphs only, no
  decorations off-mode, decorations appear immediately after toggling on.
- [ ] 3.3 Extend `verification.md` with a short manual/visual residue item (theme
  sweep, does the guide read cleanly at 3+ nesting levels) — same pattern as prior
  changes' manual residue checklist.
- [ ] 3.4 Dev-vault visual pass: open a flat paragraph-only note and a mixed
  heading/list/paragraph note in outline mode; confirm the finding that motivated this
  change (`docs/research/04-open-questions.md`) is resolved — record any follow-up in
  open-questions.md the way the first dev-vault round did.
