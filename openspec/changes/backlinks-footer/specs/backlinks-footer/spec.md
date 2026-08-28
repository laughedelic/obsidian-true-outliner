## Purpose

Defines the in-document backlinks surface: a read-only section below a note's own content that
shows every reference to it in the tree of the note it came from — the lineage that leads to
the referencing node, the node itself, and what hangs off it. It is the outward-facing use of
the plugin's block tree, and it is strictly a rendering: it never changes the note it sits under
or the notes it displays.

## ADDED Requirements

### Requirement: The footer is scoped to outline mode and to the editing view

The footer SHALL render only when the open file has outline mode enabled, resolved through the
same mode source the rest of the plugin uses, and only in the editing view. In the
reading/preview view, or with outline mode off, the document SHALL render exactly as it does
without this feature.

#### Scenario: No footer off-mode

- **WHEN** a note without outline mode enabled is open
- **THEN** no backlinks footer renders and the document ends exactly as stock Obsidian renders it

#### Scenario: Toggle applies without reload

- **WHEN** outline mode is toggled on for the open note
- **THEN** the footer appears without reopening the file

### Requirement: The footer is read-only and never mutates the document

The footer SHALL be a pure rendering projection. It SHALL NOT dispatch any document-changing
transaction against the note it sits under, SHALL NOT write to any note it displays, SHALL NOT
create undo history entries, and SHALL NOT alter the note's on-disk bytes, however often it
recomputes or however the user interacts with it.

The note's own content SHALL occupy the same document positions with the footer present as
without it, so that a caret position, a selection, or a structural operation behaves identically
either way.

#### Scenario: Rendering mutates nothing

- **WHEN** a note with many references is opened, scrolled, and closed in outline mode
- **THEN** the file's bytes are unchanged and the undo stack contains no entry attributable to
  the footer

#### Scenario: Document positions are unaffected

- **WHEN** the same note is opened with the footer present and with the feature disabled
- **THEN** every document position, the end-of-document position, and the result of selecting
  the whole document are identical in both cases

#### Scenario: Interacting with the footer leaves the note alone

- **WHEN** the user expands, collapses, and clicks within the footer
- **THEN** the note's text and undo stack are unchanged

### Requirement: References are grouped by source note

The footer SHALL group references by the note they come from, one group per source note, each
labelled with that note's name, its containing folder, and the number of references it
contributes. A group SHALL be collapsible, and collapsing it SHALL hide its references while
leaving its label and count visible.

The footer SHALL state the total number of references and the number of contributing notes.

#### Scenario: One group per source note

- **WHEN** a target is referenced twice from one note and once from another
- **THEN** two groups render, the first reporting two references and the second one

#### Scenario: A group collapses

- **WHEN** a group is collapsed
- **THEN** its references are hidden and its name and count remain visible

### Requirement: A reference renders in its lineage, with the outline's own notation

Within a group, each reference SHALL render as the referencing node preceded by the lineage
that leads to it, where lineage is the collapsed ancestor chain defined by `tree-projection`.
Two references sharing ancestors SHALL share the lineage that leads to their common branch
point rather than each repeating it.

Node kind notation — the marker drawn beside a node — SHALL be identical between a lineage
element and a referencing node: same glyph for the same kind, same size, same colour. Emphasis
SHALL be carried by text treatment alone, with lineage rendered smaller and dimmer than the
referencing node it leads to.

#### Scenario: Shared ancestors are not repeated

- **WHEN** two references in one note sit under the same heading
- **THEN** that heading renders once, with both references below it

#### Scenario: An unbranching chain renders as one lineage line

- **WHEN** a reference sits four levels deep with no other reference in that note
- **THEN** its four ancestors render as a single lineage line rather than four rows

#### Scenario: Markers do not encode emphasis

- **WHEN** a lineage element and a referencing node are of the same kind
- **THEN** their markers are drawn identically, and only the text differs in size and colour

### Requirement: A reference shows one level of children, deeper subtrees folded

The children of a referencing node SHALL render. A child that has children of its own SHALL
render collapsed, with the same fold affordance the outline uses in the editor, positioned
beside its marker. Expanding it SHALL reveal its own children under the same rule.

#### Scenario: Immediate children are shown

- **WHEN** a referencing node has three children, none of which has children
- **THEN** all three render

#### Scenario: A grandchild-bearing child is folded

- **WHEN** a referencing node has a child that itself has two children
- **THEN** that child renders with a fold affordance and its own children are hidden until it is
  expanded

### Requirement: A property reference renders without lineage

A reference of kind Property SHALL render as a single row carrying the property name and the
link, without lineage and without tree indentation, because it has no position in the block
tree. It SHALL be visually distinguishable from a reference that does have a position.

#### Scenario: A frontmatter reference claims no place in the tree

- **WHEN** a source note references the target from a frontmatter property
- **THEN** the reference renders as one row showing the property name, with no lineage and no
  indentation

### Requirement: An embed reference is distinguishable from a link

A reference of kind Embed SHALL render in its lineage like any positioned reference, and SHALL
additionally carry an indication that it is an embed, so a transclusion is not read as a
mention.

#### Scenario: An embed is marked

- **WHEN** a source note embeds the target
- **THEN** the reference renders in tree context and is marked as an embed

### Requirement: The footer paints known information first and fills in context as it resolves

The footer SHALL render the reference total, the contributing notes and their per-note counts as
soon as they are known, without waiting for any source note to be read. Each group SHALL fill in
its references and lineage when that source note has been read and placed, independently of
other groups.

A group whose context has not yet resolved SHALL indicate that it is still resolving, and SHALL
NOT display placeholder content standing in for structure that is not yet known.

#### Scenario: Counts appear before context

- **WHEN** a note with several referencing notes is opened
- **THEN** the total, the note names and their counts are visible before any reference's lineage
  is

#### Scenario: Groups resolve independently

- **WHEN** one source note is slow to read
- **THEN** the other groups render their references without waiting for it

#### Scenario: No fabricated structure while loading

- **WHEN** a group has not yet resolved
- **THEN** it shows that it is resolving and shows no rows standing in for references

### Requirement: Clicking a reference opens its source at that node

Clicking a referencing node SHALL open its source note and reveal the referenced node.
Clicking a lineage element SHALL open its source note and reveal that ancestor. Navigation
SHALL follow Obsidian's own conventions for opening a link, including the modifiers that open
in a new pane.

#### Scenario: A reference navigates to its source

- **WHEN** a referencing node is clicked
- **THEN** its source note opens with that node revealed

#### Scenario: A lineage element navigates to that ancestor

- **WHEN** an element of a lineage line is clicked
- **THEN** the source note opens with that ancestor revealed

### Requirement: A note with no references shows a dormant footer

A note with no references SHALL render a single quiet line stating that there are none, in the
position the populated header would occupy, rather than rendering nothing at all.

#### Scenario: An unreferenced note still ends predictably

- **WHEN** a note that nothing links to is open in outline mode
- **THEN** one line reports that there are no linked references, and no groups render
