## MODIFIED Requirements

### Requirement: A caret's content start has one definition
Where the procedure places a caret at a node's content start, it SHALL use
`content-space-caret`'s content boundary — the one that treats a heading's `#` prefix as
ordinary content — and not the marker boundary the structural operations use for their own
purposes.

Consequence, and a deliberate behaviour change: after a structural operation on a heading
the caret SHALL sit at column 0, before the `#` characters, matching where Home puts it on
the same line. On a list item whose content itself begins with `#`, the caret SHALL sit
after the list marker and before the `#`.

One exception, and only one: where the procedure would place a caret at the content start of
a list item carrying a TASK MARKER, it SHALL place the caret PAST that marker, where the
item's own text begins. `[ ] ` sits between the boundary every other kind has and the place a
reader points at as the start of the item, and the position in front of it is one where
typing the first character of what the item is for destroys the marker.

It SHALL NOT depend on whether the box is ticked, nor on whether the item has text after the
marker. Where an item's text begins is not a function of its state, and an item created empty
and one that kept its text through a split present the same position. On an item whose content
is a bare marker the resulting position is also its content end, so an empty item's caret
lands at the end of its line.

It is stated on the resulting position rather than on the operation that produced it, so
every placement case takes it alike and none can be forgotten. It therefore applies only to a
caret the procedure PLACES at that boundary: a column the user chose — inside the marker, or
anywhere else — is carried forward unchanged by the operations that preserve one.

It is a PLACEMENT rule and nothing more. `[ ]` remains ordinary content: it stays
caret-addressable, Home still lands in front of it, `content-space-caret`'s boundary is
unchanged, and no other behaviour is permitted to depend on an item's task-ness.

The operations' own marker boundary is unchanged and keeps its other callers — split-point
clamping, chrome recognition, transaction classification, and the selection ladder. They
ask about markers, not about where a caret may sit.

#### Scenario: Moving a heading
- **WHEN** a heading is moved up or down
- **THEN** the caret is at column 0 of the heading's line, the same position Home gives,
  rather than after the `#` and its space

#### Scenario: A list item whose text starts with a hash
- **WHEN** a list item reading `- # title` is moved
- **THEN** the caret is after the `- ` marker and before the `#`

#### Scenario: The selection ladder is unaffected
- **WHEN** progressive select-all runs on a heading
- **THEN** its covers are unchanged by this requirement

#### Scenario: A new task item's caret lands past its marker
- **WHEN** Enter is pressed at the end of `- [x] done`, so a new `- [ ] ` item is created
- **THEN** the caret is at the end of that item's line, after `[ ] `, and typing produces
  `- [ ] foo`

#### Scenario: An interior split lands where the new item's text begins
- **WHEN** Enter is pressed mid-text in `- [ ] foobar`, after `foo`
- **THEN** the new item is `- [ ] bar` with the caret between `] ` and `bar`, so the next
  character typed continues the item rather than breaking its marker

#### Scenario: A ticked box is not a special case
- **WHEN** a structural operation places a caret at the content start of `- [x] done`
- **THEN** the caret is past `[x] `, in the same place an unchecked item's would be

#### Scenario: A column the user chose is not snapped to it
- **WHEN** the caret sits inside `[ ]`, or on the boundary in front of it where Home lands,
  and an operation that preserves the caret's own column runs
- **THEN** the caret keeps that column in both cases — the exception governs where a caret is
  PLACED, not where one already is, and the boundary is a column the user can choose as well
  as the one this exception fires on

#### Scenario: A plain empty item is unaffected
- **WHEN** Enter is pressed at the end of `- alpha`, so a new `- ` item is created
- **THEN** the caret is where it already was — the item's content start, which on a bare
  marker is also its content end

#### Scenario: The task marker stays addressable
- **WHEN** the caret is moved left from the end of an empty `- [ ] ` item, and Home is
  pressed on it
- **THEN** every position inside `[ ] ` is reachable and Home lands after `- `, exactly as
  before this exception existed
