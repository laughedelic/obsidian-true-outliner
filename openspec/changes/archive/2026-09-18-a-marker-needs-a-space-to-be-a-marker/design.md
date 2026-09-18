## Context

Three readers disagree about a line holding nothing but a marker, and one of them is the one
the user is looking at while typing. The measurements are in
[docs/research/marker-without-trailing-space](../../../docs/research/marker-without-trailing-space.md):
Live Preview's own markdown mode requires whitespace after a marker before it emits a list
token, while CommonMark and Obsidian's reading mode read an empty list item.

`list-marker-content-column` already faced a disagreement between the same two Obsidian
readers, over the width of a content column, and followed Live Preview. This is the second,
and the reasoning is the same shape, so what wants recording is the two candidates that were
worked and rejected rather than the one that was taken.

## Goals / Non-Goals

**Goals:**

- A reading of a bare marker that the editing surface agrees with, so nothing in the outline
  moves on a character that is still ambiguous.
- A visible signal, in the outline's own vocabulary, when a note carries the shape.

**Non-Goals:**

- Agreement with reading mode or with export, which keep reading an empty item. Stated in the
  proposal as knowingly divergent.
- Repairing what the shape does to a list around it. See D3.

## Decisions

### D1. Follow the editing surface, not the file format's letter

Rejected first: keep the CommonMark reading and repair the rendering, which is what the two
superseded PRs did. #127 fixed the continuation the item reading wrote; #134 supplied the
bullet Live Preview declines to draw.

What decided against it was not either defect but a measurement taken after #134 was already
green. Typing into an empty line with the item reading in force, the line took list treatment,
drew a bullet and shifted its text indent to −14px on the `-`, then gave all three back on the
`4` of `-42 is negative`. Supplying the bullet made that flash more conspicuous rather than
less: before it, the raw dash at least stayed a dash and only the indentation moved.

So the cost of the item reading was not a missing glyph. It was structure moving on an
ambiguous character, and no amount of rendering work removes that — only the reading does.

The plugin's premise is that a note maps onto its inherent block tree, and CommonMark is the
better authority on what a file means. What this change asserts is narrower: for the ONE shape
where Obsidian's two engines contradict each other, the tree follows the engine the user is
editing in. `atxHeaderRE` admitting a marker at end of line three lines below `listRE`, which
does not, is the evidence that the divergence is an accident of that mode rather than a
reading anyone intended.

### D2. A paragraph's ordinary block marker, not a marker of this shape's own

Rejected: draw something that says "malformed" — a mark like `SURPLUS_MARKER_SPACE_CLASS`,
which already exists for a marker's surplus whitespace and carries a click that repairs it.

It would fire on the first keystroke of every bullet anyone types. `-` is what exists for one
keystroke on the way to `- `, measured and confirmed: typing a dash on a blank line in outline
mode leaves a bare marker in the buffer. A warning on the commonest transient state in the
editor is noise, and the repair it would offer is the space the user is about to type anyway.

The paragraph marker says enough. It is the same marker every other paragraph carries, so it
reads as "this is a paragraph" rather than as an error, which is exactly true.

### D3. The list around it ends, and what follows attaches — kept, not repaired

A marker line inside a list ends it, and the items below become the paragraph's children under
the list-after-paragraph rule (`src/rules.ts`, provisional per `open-questions` Q2). Measured:
they move one level in and render under the paragraph's marker.

Rejected: exempting a bare-marker paragraph from that rule, so the items below stay top-level
siblings. It is a local change — the rule is isolated in `rules.ts` for exactly this reason —
and it would keep the list's tail from moving.

Kept as it is because the movement is the feedback. An imported note with an empty bullet
mid-list shows where it is unfinished, in structure rather than in prose, and one space undoes
all of it. Exempting the rule would buy a still tail at the price of concealing the shape,
which is what this change exists to stop.

The asymmetry is recorded rather than smoothed: the rule runs only where a list stack can
empty, so the same three lines inside a subtree leave the items below as siblings. Both shapes
are pinned in `tests/corpus.test.ts`.

### D4. Keep the column-measured continuation prefix, drop the clamp change

#127 carried two grammar fixes. The prefix arithmetic survives here because it is independent
of the reading: a continuation's prefix counted the marker's characters where the content
column counts columns, and `-⇥x` (content at column 4, marker and run two characters) landed
two columns short whatever a bare marker means.

The clamp change does not. It swapped `contentColumnCh` for `caret.ts`'s `contentBoundaryCh`
on an item's first line, motivated by `contentColumnCh` reading 0 for a bare marker — which
cannot arise once a bare marker is not an item. Its only remaining effect would be on
`- # title`, where the two helpers genuinely differ, and that is a separate question with its
own spec. Dropping it also drops #127's second commit, which existed only to repair the
paragraph regression the clamp introduced.
