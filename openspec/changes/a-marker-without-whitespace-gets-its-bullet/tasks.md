## 1. The fact

- [x] 1.1 State `hasNativeMarker` from Live Preview's own rule against the line's text, and
  document the rule it mirrors and why it is not read off the DOM.
- [x] 1.2 Move the marker gutter, the surplus-whitespace mark and the ordered-digit span onto
  `isListItem && isFirstLine`, which is the question each was asking.
- [x] 1.3 Unit test: `hasNativeMarker` is false on `-` and `1.`, true on `- `, `-\tx` and
  `-  wide`, false on a continuation. Negative control: restoring `isListItem && i === 0` fails it.

## 2. The bullet

- [x] 2.1 Supply a `.list-bullet` mark over the marker character where the tree says bullet item
  and the fact says Obsidian drew nothing, as its own view plugin.
- [x] 2.2 E2E: with outline mode OFF, Obsidian leaves the bare marker bare and its siblings
  bulleted — the premise the change rests on, asserted rather than argued.
- [x] 2.3 E2E: in outline mode the bare marker carries a supplied bullet on its siblings' column,
  and typing one space hands the line back to Obsidian's own. Negative control: without 1.1 both
  fail and 2.2 still passes.

## 3. Landing

- [x] 3.1 Decorations, position-indicators and folding e2e groups green.
- [x] 3.2 `openspec validate a-marker-without-whitespace-gets-its-bullet --strict`
