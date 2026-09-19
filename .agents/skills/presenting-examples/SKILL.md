---
name: presenting-examples
description: How to draw editor states for the user — text, caret, selection, keystrokes, before and after. Use whenever a message to the user shows or describes what an edit does — explaining a behaviour, reporting a bug or a test case, proposing a change, or handing over steps for manual testing.
---

# Presenting examples

The user reads an example as a picture of the editor: lines stacked, indentation visible, the
caret where it sits. The compact inline form (`- a / gap / - b`, `\n` escapes) makes them rebuild
that picture in their head; draw it for them instead. The compact form stays fine in notes, specs
and docs that only agents read.

## Shape of an example

1. **Setup**, one line, only when it changes the outcome: the settings in play ("Indent using
   tabs: on"), and whether the block is Markdown source (the default) or what is drawn on screen.
   For what is drawn, a screenshot usually beats a diagram.
2. **Before**: a code block with the document and the caret or selection.
3. **Keystrokes**, on their own line in plain text, not monospace.
4. **After**: a code block with the result and the new caret.
5. **The difference in one sentence**, when the two blocks look alike.

Stack the parts vertically. Code blocks cannot sit in table cells, so a table only summarises
cases already drawn in full. Number the cases ("case 2") so the user can point at one. A bug
report draws **expected** and **actual** after-blocks, labelled.

For a small change in a long document, a `diff` block showing only what changed is clearer than
two full copies.

## Glyphs

| Glyph | Meaning |
|---|---|
| `│` | Caret (box-drawing bar: taller than `\|` and safe inside Markdown tables) |
| `‸` | Insertion or paste point, when it differs from where the caret ends up |
| `x̲` | Selection, as a combining underline (U+0332) after each selected character: `-̲ ̲b̲` |
| `▐` | Whole-line selection in a left gutter, when block-level selection is the point |
| `⏵   ` | Tab, padded to its visual width |
| `·` | Trailing space, and any space next to a tab: `⏵   ⏵   ··- b` |
| `∅` | End of document: ending the last line when it has no final newline, on a line of its own otherwise |

Draw only the whitespace that matters to the example, and `∅` only when the final newline or the
end of the document is the point. A blank line with nothing on it stays blank. With a selection,
put `│` at its moving end. Generate underlined text rather than typing it:
`python3 -c "print(''.join(c+'̲' for c in '- b'))"`.

The gutter form keeps every line shifted by the same two columns:

```
  - a
▐ - b
▐ - c│
```

The first example in a conversation that uses glyphs gets a one-line legend of the ones it uses.

## Keystrokes

Symbols in plain text: ⌘A, ⇧⌥⏎, ⇥, ⇧⇥, ⌫, ⌦, ↑ ↓. Separate steps with spaces and write repeats
as ×N: ⇧↓×2 ⌫. Spell a key out in monospace (`cmd-shift-enter`) when it is uncommon or its symbol
is ambiguous.

## Copy-paste version

When the user will reproduce the example by hand, add a block labelled **To paste** with the
plain document: real tabs and spaces, no glyphs. Say in words where the caret or selection goes,
since the block cannot show it.

## Worked example

Indent using tabs: on.

```
- a
-̲ ̲b̲
-̲ ̲c̲│
```

⇥

```
- a
⏵   -̲ ̲b̲
⏵   -̲ ̲c̲│
```

To paste (select from the start of `- b` to the end of `- c`):

```
- a
- b
- c
```
