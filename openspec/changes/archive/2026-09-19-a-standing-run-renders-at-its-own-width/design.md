# A standing run renders at its own width

## What decides the shape

Everything this design rests on is measured in
[docs/research/source-indentation-width](../../../docs/research/source-indentation-width.md) — the
earlier sections for what the collapse does with a run it hides, and "A run left standing, and
Obsidian's own quantiser" for the run it does not.

Three findings from that pass carry the design:

- On a run left STANDING the stated width comes from ONE element. `.cm-indent` takes its `min-width`
  from `--list-indent` per four columns; the remainder Obsidian leaves in a `.cm-indent-spacing`
  whose glyphs measure themselves there — measured, three spaces under a heading at 15.27px. So a
  standing run shorter than four columns never had the defect, and the fix has one box kind to
  answer. Under a list item the same element is sized instead, as `padding-left` written inline, and
  that is why the rule keeps all four declarations rather than only a width.
- The declarations that answer it already exist. The collapse's own rule zeroes `width`,
  `min-width`, `padding` and `margin` on the same three span kinds, for the neighbouring reason that
  a stated width outlives the characters a mark undraws. Applied to a run left standing, the same
  four declarations leave the glyphs to measure themselves.
- The lines they should reach are named by classes the layer already writes. `to-decor-block` and
  `to-decor-atom` are on every decorated non-list line; `to-decor-list` is on a list item AND on its
  continuation, which is what keeps the stated hang (`--to-list-hang`) out of this rule's way.

## The decision: one rule, one reason

`70-source-indent.css` carried the override under `to-decor-indent-sized`, a class
`computeSourceIndent` put on a line whose own indentation it had just hidden. That class states a
fact about the RUN; the rule is about the LINE. Selecting on the kind classes states the rule at the
level it holds — on any line outline mode decorates that is not a list item, the leading run
measures its own characters — and covers both cases with one sentence: where the run is hidden there
is nothing left to measure, and where it stands the glyphs are the width.

That removes `SOURCE_INDENT_SIZED_CLASS`, its export, and one `Decoration.line` range per affected
line from the builder. The mark and the replacement stay exactly as they are: what is HIDDEN is
still the node's own indentation and nothing else, decided by `indentCh`.

The residual risk of dropping the class is a line whose run is hidden but which carries no kind
class — its stated width would revive and put the line's text in a second column, which is issue
#117 returning. Measured across the child corpus, every line carrying the sized class carried a kind
class too. The spec's existing cases pin the outcome rather than the class: a line whose run is
hidden begins on its depth's column, and the line Shift+Enter opens gives the caret that column.
Both fail loudly if a line is ever missed.

## Alternatives measured and dropped

- **Leave it**, which issue #140 lists first. Defensible while the boxes serve Obsidian's
  indentation aid — but on a decorated line that aid is already suppressed, measured at 0px, so
  they align the run to a ladder that is not drawn while costing the caret a box edge per four
  columns and a click 26px of one line resolving to one position.
- **Keep the class and add a second rule** for runs left standing. Two rules with identical
  declarations and two reasons to keep in step, where one sentence covers both.
- **State the run's width from the characters ourselves**, as a computed length. Ruled out by the
  same measurement that ruled it out for the hidden case: a space's advance differs between the
  prose font and a code font, and a tab renders to a tab stop rather than to a count of advances.
  `width: auto` asks the glyphs, which are right in every font by construction.

## What stays outside the change

The caret floor, the atomic ranges and deletion are untouched: they answer for characters that are
not drawn, and a standing run's characters are drawn. The seam onto the text start keeps Obsidian's
own inline-code padding, which measures the same with the plugin disabled.
