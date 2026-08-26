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
a list item whose only content is an UNCHECKED task marker, it SHALL place the caret at that
item's content END instead. That marker is one this grammar's own continuation rule wrote,
and the content start in front of it is a position where typing destroys it. The condition is
the emptiness rule the grammar already applies to decide whether Enter may unwrap an item —
including its carve-out that a CHECKED box is content the user ticked and is never skipped —
so the two cannot drift apart. On an item whose content is a bare marker and nothing else the
two positions coincide, so the exception changes nothing there.

It is stated on the resulting position rather than on the operation that produced it, so
every placement case takes it alike and none can be forgotten.

It is a PLACEMENT rule and nothing more. `[ ]` remains ordinary content: it stays
caret-addressable, Home still lands in front of it, `content-space-caret`'s boundary is
unchanged, and no other behaviour is permitted to depend on an item's task-ness. On an item
whose content is a task marker followed by text, the placement is unchanged — the marker is
not skipped there.

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

#### Scenario: A task item with text keeps the ordinary content start
- **WHEN** a structural operation places a caret at the content start of `- [ ] alpha`
- **THEN** the caret is after the `- ` marker and before `[`, unchanged by the exception

#### Scenario: A checked empty box is content, not a marker to skip
- **WHEN** a structural operation places a caret at the content start of `- [x] `
- **THEN** the caret is after the `- ` marker and before `[`, because a ticked box is the
  user's own content and the exception does not reach it

#### Scenario: A plain empty item is unaffected
- **WHEN** Enter is pressed at the end of `- alpha`, so a new `- ` item is created
- **THEN** the caret is where it already was — the item's content start, which on a bare
  marker is also its content end

#### Scenario: The task marker stays addressable
- **WHEN** the caret is moved left from the end of an empty `- [ ] ` item, and Home is
  pressed on it
- **THEN** every position inside `[ ] ` is reachable and Home lands after `- `, exactly as
  before this exception existed
