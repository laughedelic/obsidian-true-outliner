## ADDED Requirements

### Requirement: A reference reports the part of its target it addresses

A reference whose link addresses a heading or a block inside the target SHALL be reported with
that subpath as the link carries it — `#Heading`, `#Parent#Child`, `#^id` — with any alias
removed. This SHALL hold for every kind that can carry a subpath: an Anchor reference, an Embed of
a heading or block, and a Property whose link addresses a heading or block. A reference that
addresses the note as a whole SHALL report no subpath.

The subpath SHALL be available without reading any source note's content, like the rest of what
the index reports about a reference before placement.

#### Scenario: A heading link reports its subpath

- **WHEN** a source links to `[[Target#Current sprint|the sprint]]`
- **THEN** the reference is an Anchor reference reporting the subpath `#Current sprint`, with no
  trace of the alias

#### Scenario: A nested heading path is reported as written

- **WHEN** a source links to `[[Target#Top#Current sprint]]`
- **THEN** the reference reports `#Top#Current sprint`

#### Scenario: An embed of a block reports its subpath

- **WHEN** a source embeds `![[Target#^t1]]`
- **THEN** the reference is an Embed reference reporting `#^t1`

#### Scenario: A frontmatter link to a heading reports its subpath

- **WHEN** a source's frontmatter property links to `[[Target#Current sprint]]`
- **THEN** the reference is a Property reference reporting `#Current sprint`

#### Scenario: A link to the whole note reports none

- **WHEN** a source links to `[[Target]]`, embeds `![[Target]]`, and names `[[Target]]` in a
  property
- **THEN** none of the three references reports a subpath

#### Scenario: The subpath costs no read

- **WHEN** the references to a target are requested
- **THEN** each reference's subpath is available before any source note's content has been read
