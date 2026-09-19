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

Each case is a short heading, the keystrokes in plain text, then one code block laying the
editor states out side by side as columns:

**Case 3: pasting over the last item.** ⌘V with the clipboard shown.

```
 clipboard    before    actual     expected
┆- x         ┆- a      ┆- a       ┆- a
┆  - y       ▒- b      ┆- x       ┆- x
             ┆∅        ┆  - y┃∅   ┆  - y┃
                                  ┆∅
```

- **Columns**, left to right: the inputs (`clipboard`, when there is one), `before`, then the
  results. A single result is `after`; a bug report shows `actual` and `expected`; a control run
  (off-mode, native Obsidian) is one more result column.
- **Keystrokes** sit outside the block, in the case's sentence: symbols in plain text, ⌘A, ⇧⌥⏎,
  ⇥, ⇧⇥, ⌫, ⌦, ↑ ↓; steps separated by spaces, repeats as ×N (⇧↓×2 ⌫). Spell a key out in
  monospace (`cmd-shift-enter`) when it is uncommon or its symbol is ambiguous.
- **Setup**, when it changes the outcome, goes in the same sentence: the settings in play
  ("Indent using tabs" on), and whether the block is Markdown source (the default) or what is
  drawn on screen. For what is drawn, a screenshot usually beats a diagram.
- **Number the cases** so the user can point at one, and add a sentence on the difference when
  two columns look alike.
- **Every result shows the caret** where the edit leaves it, from the code or a measurement. A
  result whose caret nobody has checked says so rather than guessing.

A `diff` block showing only what changed suits a small change in a long document better than
columns.

## Glyphs

| Glyph | Meaning |
|---|---|
| `┆` | Left edge of a column, touching the content |
| `▒` | A block-selected line, in place of the edge. A block selection has no caret: the editor gives up focus while it holds |
| `┃` | Caret |
| `x̲` | Selection inside one item's text, underlined |
| `‸` | Insertion or paste point, when it differs from where the caret ends up |
| `⏵   ` | Tab, padded to its visual width |
| `·` | A space in an indentation that holds a tab, and a trailing space. Every other space stays plain |
| `∅` | End of document: after the last line's text when there is no final newline, on a line of its own otherwise |

Draw `∅` only when the final newline or the end of the document is the point. An empty line
stays empty. The first example in a conversation gets a one-line legend of the glyphs it uses.

## Drawing the block

Generate the block with [`layout.mjs`](layout.mjs) rather than aligning it by hand: combining
underlines, tab glyphs and column padding all have to add up. It reads columns on stdin, each
starting with a `## <header>` line, written as the document itself: real tabs and spaces, `▒`
opening a block-selected line, `«…»` around a selection inside a line, and `┃`, `‸`, `∅` where
they go.

```bash
node .agents/skills/presenting-examples/layout.mjs <<'EOF'
## before
- a
▒- b
∅

## after
- a┃
∅
EOF
```

Paste its output into a fenced block.

## Copy-paste version

When the user will reproduce an example by hand, follow the cases with a **To paste** block for
each note: the plain document with real tabs and spaces and no glyphs, and a sentence on where
the caret or selection goes.

Where it lands decides its wrapping. On GitHub (issues, PRs, comments), the section goes in
`<details><summary>To reproduce</summary>` … `</details>`, with a blank line after the summary
line so the fences inside still render. The chat renders no raw HTML, so there it is the last
section of the message, under its own heading.
