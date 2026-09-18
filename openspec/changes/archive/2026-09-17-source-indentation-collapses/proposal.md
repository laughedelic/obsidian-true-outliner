## Why

A paragraph, code fence, table, quote or callout written as a CHILD of a list item renders one
column right of everything else at its depth, and how far right depends on whether the file used
a tab or spaces. Reported from real-vault use and recorded as issue #117, from
`docs/research/decoration-follow-ups`' "A non-list-item child of a list item is indented twice".

The two indentation regimes disagree for exactly this shape. The depth rules give every
non-list-item line `depth × unit + gutter`, and leave a list item to native list rendering
retargeted onto the same grid, so a list item's own source indentation is its only indentation —
while a non-list child gets the depth contribution PLUS its own leading whitespace rendered as
characters. `docs/research/source-indentation-width` carries the measurement pass: the box lands
on the depth column in every shape the report names, and the text lands 26.17px past it for two
spaces, 36px for a tab, 15.27px for a three-space run under a heading.

This follows from the additive-only discipline rather than contradicting it, which is why closing
it is a change of its own rather than a fix to a rule. What the pass found is that under a list
item the run is not content: it is written to the item's own content column, which the depth rules
then state a second time, and reading mode renders none of it. `lists-on-the-outline-grid` already
took that step for a list item's own run, stating its width from the item's depth rather than
accepting what the characters measured; a child of that item was left out.

Elsewhere the run states a depth rather than restating one, and stays. The issue reads a heading's
indented child as already correct, and at the top level the run is the only thing telling a reader
that a four-space line is an indented code block.

## What Changes

- **A non-list line written under a LIST ITEM renders its own source indentation at no width.**
  The depth rules are then the only thing positioning it, so such a child lands on its depth's
  column whatever whitespace the file wrote, and a two-space file, a three-space file and a tab
  file agree.
- **A run that restates nothing is left alone**: under a heading, and at the top level, the
  ancestor carries the depth and the whitespace is ordinary content — which the issue itself reads
  as already correct, and which at the top level is the only thing saying a four-space line is an
  indented code block.
- **The run is identified from the parse**, as the node's own indentation measured on its first
  line, so a line indented deeper than its node keeps the surplus: code inside a fence keeps its
  relative indentation.
- **List items are untouched.** Their run is SIZED to the stated hang, not collapsed, because it
  carries the native marker.
- The mechanism is a CM6 `Decoration.mark` over exactly those characters plus a rule zeroing the
  span Obsidian wraps them in; design.md D1 and D2 record why neither alone is enough.

## Non-goals

- **The parse.** Which levels exist is Markdown's business and is settled before this layer runs.
  No byte of the document changes, and no node's depth does.
- **A stated width for the run.** The collapsed run is zero-width, not sized to the depth: a
  stated width would be paid once per piece wherever CM6 splits the mark (design.md D2).
- **The quantisation residue inside an indented fence.** A code line's surviving indentation can
  render up to one `.cm-indent` quantum wider than its own characters; measured, recorded in the
  research note, and left, since both alternatives measured worse.
- **The backlinks footer.** Its rows render their content inline with no source indentation of
  their own (D18), so there is nothing there to collapse.
- **The caret's own contract.** Positions inside a collapsed run stay addressable and now share
  one x, so Home and the arrows can appear not to move. Changing that means changing
  `content-space-caret`'s boundary rule, one capability over; recorded in the research note and in
  the decoration parking lot instead.

## Capabilities

### Modified Capabilities

- `outline-decorations`: the grid requirement, which today states a LIST line's indentation width
  from its depth, is extended to that item's own children — their source indentation is written to
  the item's content column and contributes no width of its own, so a node's rendered column is a
  function of its tree depth alone whatever encodes it.

## Impact

- `src/parse.ts`: a new `indentPrefixCh` — the character index that splits a line's own
  structural indentation from what follows it.
- `src/plugin/decorate.ts`: `LineDecorationFact` gains `indentCh`.
- `src/plugin/decorations.ts`: a mark decoration, a line class for the run it wholly covers, and
  their own view plugin.
- `styles/70-source-indent.css`: a new part.
- `tests/decorate.test.ts`, `e2e/specs/56-source-indent.e2e.ts`.
- `src/plugin/footer-model.ts`: the two synthetic facts gain the new field.
