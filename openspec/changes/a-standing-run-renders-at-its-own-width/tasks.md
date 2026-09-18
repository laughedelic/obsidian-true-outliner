## 1. The rule

- [x] 1.1 Select the quantiser override on the kind classes (`to-decor-block`, `to-decor-atom`)
  rather than on `to-decor-indent-sized`, and state its reason at the level it now holds: on a line
  outline mode decorates that is not a list item, the leading run measures its own characters.
- [x] 1.2 Remove `SOURCE_INDENT_SIZED_CLASS`, its export and its `Decoration.line` range from
  `computeSourceIndent`, leaving the mark and the replacement untouched.

## 2. What the rule has to hold

- [x] 2.1 E2E: a top-level nine-space line's text begins five space advances right of the
  four-space line above it — their difference, since both carry Obsidian's own inline-code padding
  onto their text and it cancels. Negative control: restoring the class-driven selector leaves both
  at a box edge, 41.09px apart, and fails it.
- [x] 2.2 E2E: walking the caret through a standing run steps one space advance per press, with no
  press landing on a box edge. Negative control: the same restoration reintroduces the 20.75px step.
- [x] 2.3 E2E: a click inside a standing run puts the caret within one space advance of where it
  pointed. Negative control: the same restoration lands it at the box's edge, three spaces right.
- [x] 2.4 E2E: a tab-indented top-level line renders its text on the same column as a four-space
  one.
- [x] 2.5 E2E: the lines whose run is HIDDEN are unmoved — the existing child-column, deeper-line,
  Shift+Enter and list-continuation cases, which are also what would catch a hidden run left without
  a kind class.

## 3. Landing

- [x] 3.1 The decorations group green in full locally, 14 spec files with no vault drift; the
  outline-mode and selection groups from the checkpoint's own CI sweep.
- [x] 3.2 `npm run lint`, `npm test`, `npm run build`, `npm run build:e2e`.
- [x] 3.3 Remove the probe spec once its figures are in
  `docs/research/source-indentation-width`.
- [x] 3.4 `openspec validate a-standing-run-renders-at-its-own-width --strict`
