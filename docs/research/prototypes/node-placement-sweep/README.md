# Node placement sweep

The probes behind the figures in [`../../node-placement-grammar.md`](../../node-placement-grammar.md).
They are scripts rather than tests: copy the four files into `tests/`, dropping the `.txt`, and run
each with `tsx` from the repository root.

```bash
for f in docs/research/prototypes/node-placement-sweep/*.ts.txt; do
  cp "$f" "tests/$(basename "$f" .txt)"
done
RUNS=150 SEED=42 npx tsx tests/drop-sweep.ts > /tmp/drop.txt
RUNS=150 SEED=42 npx tsx tests/ops-sweep.ts  > /tmp/ops.txt
npx tsx tests/context-table.ts
```

- `labelled-notes.ts` is the generator: every node carries a unique label `nK`, so a node is
  followed across the re-parse by its label. It covers the shapes `tests/generators.ts` does not —
  paragraphs inside list items, tasks, ordered and `*` items, list items carrying a `#` run, every
  atom kind in sections and in list items, and sub-headings that skip a level.
- `drop-sweep.ts` drags every labelled node to every destination `dropSeams` offers and compares
  every node's parent after the release with the one the preview names; pastes the same payload at
  the same destination where the run leaves its scope; and moves the run back. Output is a tally
  of keys: `DEST:` counts destinations by the shape that moved a node, `moved:` the nodes with their
  kinds, `WHERE:` the column kind, `KIND:` what the run was written as. `EX=<substring>` prints up
  to three example notes for each matching key.
- `ops-sweep.ts` does the same for indent, outdent, move up, move down and a paste at the place the
  paste layer's caret rule resolves.
- `context-table.ts` writes the table below: 25 places by 6 moved kinds, every plausible writing of
  the node tried by hand at the place, and what the drop and the paste write there.

## The context table

A writing is clean when the node lands under the parent the place names and no other node moves;
absorbing when the only nodes that move go under it. `!` marks an operation whose result lands the
node under another parent or moves another node.

| context | moved | admissible, clean | admissible, absorbing | drop writes | paste writes |
| --- | --- | --- | --- | --- | --- |
| heading, alone | paragraph | para, item | — | para | no anchor |
| heading, alone | list item | item, para | — | item | no anchor |
| heading, alone | task | task | — | task | no anchor |
| heading, alone | heading h3 | h3, h4, h5, h6, item#, item | — | h3 | no anchor |
| heading, alone | list item carrying ### | item#, h3, h4 | — | item# | no anchor |
| heading, alone | code block | code | — | code | no anchor |
| heading, after a paragraph | paragraph | para | — | para | para |
| heading, after a paragraph | list item | para | — | para | para |
| heading, after a paragraph | task | — | — | not offered | refused (insertion-not-expressible) |
| heading, after a paragraph | heading h3 | h3, h4, h5, h6 | — | h3 | h3 |
| heading, after a paragraph | list item carrying ### | h3, h4 | — | h3 | h3 |
| heading, after a paragraph | code block | code | — | code | code |
| heading, after a paragraph that owns a list | paragraph | para | — | para | para |
| heading, after a paragraph that owns a list | list item | para | — | para | para |
| heading, after a paragraph that owns a list | task | — | — | not offered | refused (insertion-not-expressible) |
| heading, after a paragraph that owns a list | heading h3 | h3, h4, h5, h6 | — | h3 | h3 |
| heading, after a paragraph that owns a list | list item carrying ### | h3, h4 | — | h3 | h3 |
| heading, after a paragraph that owns a list | code block | code | — | code | code |
| heading, after a list item | paragraph | para, item | — | item | item |
| heading, after a list item | list item | item, para | — | item | item |
| heading, after a list item | task | task | — | task | task |
| heading, after a list item | heading h3 | h3, h4, h5, h6, item#, item | — | h3 | item# |
| heading, after a list item | list item carrying ### | item#, h3, h4 | — | item# | item# |
| heading, after a list item | code block | code | — | code | code |
| heading, after an atom | paragraph | para, item | — | para | para |
| heading, after an atom | list item | item, para | — | item | item |
| heading, after an atom | task | task | — | task | task |
| heading, after an atom | heading h3 | h3, h4, h5, h6, item#, item | — | h3 | h3 |
| heading, after an atom | list item carrying ### | item#, h3, h4 | — | item# | item# |
| heading, after an atom | code block | code | — | code | code |
| heading, before a paragraph | paragraph | para, item | — | para | para |
| heading, before a paragraph | list item | item, para | — | item | item |
| heading, before a paragraph | task | task | — | task | task |
| heading, before a paragraph | heading h3 | item#, item | h3, h4, h5, h6 | h3 +absorbs | h3 +absorbs |
| heading, before a paragraph | list item carrying ### | item# | h3, h4 | item# | item# |
| heading, before a paragraph | code block | code | — | code | code |
| heading, before a list item | paragraph | item | para | item | item |
| heading, before a list item | list item | item | para | item | item |
| heading, before a list item | task | task | — | task | task |
| heading, before a list item | heading h3 | item#, item | h3, h4, h5, h6 | h3 +absorbs | item# |
| heading, before a list item | list item carrying ### | item# | h3, h4 | item# | item# |
| heading, before a list item | code block | code | — | code | code |
| heading, between two list items | paragraph | item | para | item | item |
| heading, between two list items | list item | item | para | item | item |
| heading, between two list items | task | task | — | task | task |
| heading, between two list items | heading h3 | item#, item | h3, h4, h5, h6 | h3 +absorbs | item# |
| heading, between two list items | list item carrying ### | item# | h3, h4 | item# | item# |
| heading, between two list items | code block | code | — | code | code |
| heading, between two paragraphs | paragraph | para | — | para | para |
| heading, between two paragraphs | list item | para | — | para | para |
| heading, between two paragraphs | task | — | — | not offered | refused (insertion-not-expressible) |
| heading, between two paragraphs | heading h3 | — | h3, h4, h5, h6 | h3 +absorbs | h3 +absorbs |
| heading, between two paragraphs | list item carrying ### | — | h3, h4 | h3 +absorbs | h3 +absorbs |
| heading, between two paragraphs | code block | code | — | code | code |
| heading, between a list item and a paragraph | paragraph | para, item | — | item | item |
| heading, between a list item and a paragraph | list item | item, para | — | item | item |
| heading, between a list item and a paragraph | task | task | — | task | task |
| heading, between a list item and a paragraph | heading h3 | item#, item | h3, h4, h5, h6 | h3 +absorbs | item# |
| heading, between a list item and a paragraph | list item carrying ### | item# | h3, h4 | item# | item# |
| heading, between a list item and a paragraph | code block | code | — | code | code |
| heading, between an atom and a list item | paragraph | item | para | item | item |
| heading, between an atom and a list item | list item | item | para | item | item |
| heading, between an atom and a list item | task | task | — | task | task |
| heading, between an atom and a list item | heading h3 | item#, item | h3, h4, h5, h6 | h3 +absorbs | item# |
| heading, between an atom and a list item | list item carrying ### | item# | h3, h4 | item# | item# |
| heading, between an atom and a list item | code block | code | — | code | code |
| heading, between a paragraph, an atom and a list item | paragraph | item | para | para +absorbs | para +absorbs |
| heading, between a paragraph, an atom and a list item | list item | item | para | item | item |
| heading, between a paragraph, an atom and a list item | task | task | — | task | task |
| heading, between a paragraph, an atom and a list item | heading h3 | item#, item | h3, h4, h5, h6 | h3 +absorbs | item# |
| heading, between a paragraph, an atom and a list item | list item carrying ### | item# | h3, h4 | item# | item# |
| heading, between a paragraph, an atom and a list item | code block | code | — | code | code |
| heading, before its first sub-heading | paragraph | para | — | para | para |
| heading, before its first sub-heading | list item | para | — | para | para |
| heading, before its first sub-heading | task | — | — | not offered | refused (insertion-not-expressible) |
| heading, before its first sub-heading | heading h3 | h3, h4, h5, h6 | — | h3 | h3 |
| heading, before its first sub-heading | list item carrying ### | h3, h4 | — | h3 | h3 |
| heading, before its first sub-heading | code block | code | — | code | code |
| heading, after a sub-heading | paragraph | — | — | not offered | para under n2! |
| heading, after a sub-heading | list item | — | — | not offered | item under n3! |
| heading, after a sub-heading | task | — | — | not offered | task under n3! |
| heading, after a sub-heading | heading h3 | h3 | — | h3 | h3 |
| heading, after a sub-heading | list item carrying ### | h3 | — | not offered | item# under n3! |
| heading, after a sub-heading | code block | — | — | not offered | code under n2! |
| heading, after a sub-heading that skips levels | paragraph | — | — | not offered | para under n2! |
| heading, after a sub-heading that skips levels | list item | — | — | not offered | item under n3! |
| heading, after a sub-heading that skips levels | task | — | — | not offered | task under n3! |
| heading, after a sub-heading that skips levels | heading h3 | h3, h4, h5 | — | h5 | h5 |
| heading, after a sub-heading that skips levels | list item carrying ### | h3, h4 | — | not offered | item# under n3! |
| heading, after a sub-heading that skips levels | code block | — | — | not offered | code under n2! |
| heading, between two sub-headings | paragraph | — | — | not offered | para under n2! |
| heading, between two sub-headings | list item | — | — | not offered | item under n3! |
| heading, between two sub-headings | task | — | — | not offered | task under n3! |
| heading, between two sub-headings | heading h3 | h3 | — | h3 | h3 |
| heading, between two sub-headings | list item carrying ### | h3 | — | not offered | item# under n3! |
| heading, between two sub-headings | code block | — | — | not offered | code under n2! |
| paragraph, before its first list item | paragraph | item | — | item | item |
| paragraph, before its first list item | list item | item | — | item | item |
| paragraph, before its first list item | task | task | — | task | task |
| paragraph, before its first list item | heading h3 | item#, item | — | item# | item# |
| paragraph, before its first list item | list item carrying ### | item# | — | item# | item# |
| paragraph, before its first list item | code block | — | — | not offered | refused (insertion-not-expressible) |
| paragraph, between its list items | paragraph | item | — | item | item |
| paragraph, between its list items | list item | item | — | item | item |
| paragraph, between its list items | task | task | — | task | task |
| paragraph, between its list items | heading h3 | item#, item | — | item# | item# |
| paragraph, between its list items | list item carrying ### | item# | — | item# | item# |
| paragraph, between its list items | code block | — | — | not offered | refused (insertion-not-expressible) |
| paragraph, after its last list item | paragraph | item | — | item | item |
| paragraph, after its last list item | list item | item | — | item | item |
| paragraph, after its last list item | task | task | — | task | task |
| paragraph, after its last list item | heading h3 | item#, item | — | item# | item# |
| paragraph, after its last list item | list item carrying ### | item# | — | item# | item# |
| paragraph, after its last list item | code block | — | — | not offered | refused (insertion-not-expressible) |
| list item, no children | paragraph | para, item | — | item | no anchor |
| list item, no children | list item | item, para | — | item | no anchor |
| list item, no children | task | task | — | task | no anchor |
| list item, no children | heading h3 | item#, item | — | item# | no anchor |
| list item, no children | list item carrying ### | item# | — | item# | no anchor |
| list item, no children | code block | code | — | code | no anchor |
| list item, after a child item | paragraph | para, item | — | item | item |
| list item, after a child item | list item | item, para | — | item | item |
| list item, after a child item | task | task | — | task | task |
| list item, after a child item | heading h3 | item#, item | — | item# | item# |
| list item, after a child item | list item carrying ### | item# | — | item# | item# |
| list item, after a child item | code block | code | — | code | code |
| list item, before a child item | paragraph | para, item | — | item | item |
| list item, before a child item | list item | item, para | — | item | item |
| list item, before a child item | task | task | — | task | task |
| list item, before a child item | heading h3 | item#, item | — | item# | item# |
| list item, before a child item | list item carrying ### | item# | — | item# | item# |
| list item, before a child item | code block | code | — | code | code |
| list item, after a child paragraph | paragraph | para, item | — | para | para |
| list item, after a child paragraph | list item | item, para | — | para | para |
| list item, after a child paragraph | task | task | — | not offered | refused (insertion-not-expressible) |
| list item, after a child paragraph | heading h3 | item#, item | — | item# | item# |
| list item, after a child paragraph | list item carrying ### | item# | — | h3 under n1! | h3 under n1! |
| list item, after a child paragraph | code block | code | — | code | code |
| list item, after a child atom | paragraph | para, item | — | item | item |
| list item, after a child atom | list item | item, para | — | item | item |
| list item, after a child atom | task | task | — | task | task |
| list item, after a child atom | heading h3 | item#, item | — | item# | item# |
| list item, after a child atom | list item carrying ### | item# | — | item# | item# |
| list item, after a child atom | code block | code | — | code | code |
| paragraph inside a list item | paragraph | — | — | item under n2! | no anchor |
| paragraph inside a list item | list item | — | — | item under n2! | no anchor |
| paragraph inside a list item | task | — | — | task under n2! | no anchor |
| paragraph inside a list item | heading h3 | — | — | item# under n2! | no anchor |
| paragraph inside a list item | list item carrying ### | — | — | item# under n2! | no anchor |
| paragraph inside a list item | code block | — | — | not offered | no anchor |
