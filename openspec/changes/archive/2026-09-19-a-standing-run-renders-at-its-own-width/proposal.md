## Why

`source-indentation-collapses` hides a node's own indentation and leaves every other leading run
standing — a top-level one, and a heading child's. What it did not state is how a standing run is
MEASURED, and Obsidian measures it from `--list-indent` rather than from the characters: four
columns become a box wider than the spaces inside it, so the caret crosses a run of four columns or
more in jumps of a box edge and a click resolves a band of blank box to one position (issue #140,
measured in [docs/research/source-indentation-width](../../../docs/research/source-indentation-width.md),
"A run left standing, and Obsidian's own quantiser").

The boxes exist to align a run to Obsidian's indentation aid, which this layer already suppresses on
every line it decorates — measured, `--indentation-guide-width` resolves to 0px on all of them. In
outline mode they align to a ladder that is not drawn, and the caret pays for it.

## What Changes

- **A standing run measures its own characters.** The rule that already stops Obsidian's stated
  width from outliving a hidden run applies to every line the mode decorates that is not a list
  item, so a run left standing renders at the width of its glyphs. A four-space top-level line's run
  measures 20.34px rather than 36px, every position in it steps one space advance, and a tab renders
  to its own tab stop — the same column four spaces reach.
- **One rule replaces two conditions.** `SOURCE_INDENT_SIZED_CLASS` (`to-decor-indent-sized`) and
  the per-line decoration that carried it are removed: the kind classes the layer already puts on
  every decorated line name exactly the lines the rule is for, so the width question stops needing a
  fact about the run.
- **BREAKING for one appearance**: a top-level run of four columns or more renders 15.66px narrower
  per four columns than stock Obsidian renders it, and the line's text column moves left with it.
  The characters are untouched — an indented code block still carries its four spaces — and outline
  mode off is untouched.

## Capabilities

- **New Capabilities**: none.
- **Modified Capabilities**: `outline-decorations` — "One indentation grid for every kind" already
  requires a run that states a depth to "render at its own width", which the quantiser prevents. The
  delta states what measures a standing run and drops the clause promising stock Obsidian's own
  rendering of it.

## Impact

- `styles/70-source-indent.css` — the quantiser override's selector and its stated reason.
- `src/plugin/decorations.ts` — `SOURCE_INDENT_SIZED_CLASS` and its builder range removed.
- `e2e/specs/56-source-indent.e2e.ts` — cases for a standing run's width, its caret, and the tab
  that now agrees with four spaces.
- No change to the parse, to what is hidden, to the caret floor, or to deletion.

## Non-goals

- **The inline-code seam.** Obsidian renders a top-level indented run's text as inline code, whose
  4.2px padding puts the step from the last space onto the text start at 9.28px rather than 5.08px.
  It measures the same with the plugin disabled and is not this layer's to remove.
- **Reading a four-space top-level line as code.** The parser deliberately reads it as a paragraph
  (`parse.ts`); nothing here revisits that, and the run stays visible precisely because it is the
  only thing that distinguishes the two.
- **List items and their continuations.** Their run is sized from the stated hang
  (`--to-list-hang`), which this change leaves exactly as it is.
- **Obsidian's indentation aid.** Already suppressed on every decorated line; this change neither
  restores it nor widens the suppression.
