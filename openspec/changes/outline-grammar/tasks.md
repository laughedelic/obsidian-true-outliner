## 1. Node split operation (mapping core)

- [x] 1.1 Implement `splitNode(doc, nodeId, position)` in `src/ops.ts`: same-kind sibling
  split, children stay with the original, marker reuse + ordered renumber, boundary-rule
  blank for paragraphs, `cannot-split` for headings/atoms/positions outside the node's
  text
- [x] 1.2 Unit tests for every spec scenario (mid-text, end-of-node, empty lower half,
  atom rejection, ordered-run renumber) + property tests: split results close over the
  mapping; untouched nodes keep verbatim lines; generated split positions never corrupt

## 2. Keyboard grammar (plugin)

- [x] 2.1 Pure grammar module: binding → op resolution (node at cursor, atom-interior
  no-op rules, heading-Enter→child-paragraph rule, Shift+Enter continuation synthesis),
  returning either `null` (decline key) or a transaction plan {changes, selection,
  userEvent}; unit-tested without CM6
- [x] 2.2 CM6 wrapper: `Prec.highest` keymap extension with per-keypress outline-mode
  check via `editorInfoField`; registered with `registerEditorExtension`; add
  `@codemirror/state`/`@codemirror/view` types (build externals unchanged)
- [x] 2.3 Wire Tab / Shift+Tab / Alt+ArrowUp / Alt+ArrowDown to indent/outdent/move ops
  through the CM6 dispatch path (one annotated transaction, selection from op cursor,
  Notice on rejection)
- [x] 2.4 Wire Enter (splitNode + heading rule) and Shift+Enter (continuation) with the
  same dispatch/undo semantics

## 3. Verification

- [x] 3.1 Full gate green: tsc, lint (zero errors), vitest, plugin build
- [x] 3.2 Extend the editor-core dev-vault protocol (verification.md) with grammar
  scenarios: off-mode stock behavior, instant toggle effect, each binding, undo
  granularity, atom no-ops — pending the human run
