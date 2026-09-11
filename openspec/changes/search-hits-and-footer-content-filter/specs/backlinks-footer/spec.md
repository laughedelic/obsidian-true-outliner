## ADDED Requirements

### Requirement: A search term's matches are marked in the rows

While a search term is active, every occurrence of the term in the content of a rendered row —
a referencing node, a lineage segment, a rendered child, a property — SHALL be visibly marked
within that row. The mark SHALL be distinguishable from an author's own highlighted text, and
SHALL NOT alter the row's text, its links, or its layout.

Clearing the term SHALL remove every mark.

#### Scenario: The matched text is marked where it occurs

- **WHEN** a term admits a reference because it occurs in the referencing node's text
- **THEN** that occurrence is marked in the node's row, and no other text in the row is

#### Scenario: A match in an ancestor is marked in the lineage row

- **WHEN** a term admits a reference because it occurs in an ancestor's first line
- **THEN** the occurrence is marked in that lineage segment

#### Scenario: An author's highlight is not mistaken for a match

- **WHEN** a row contains highlighted text written by the note's author and a term matches
  elsewhere in it
- **THEN** the author's highlight and the term's mark are distinguishable

#### Scenario: Clearing the term clears the marks

- **WHEN** the term is cleared
- **THEN** no row carries a mark
