## MODIFIED Requirements

### Requirement: A search term's matches are marked in the rows

While a search term is active, every occurrence in the content of a rendered row — a referencing
node, a lineage segment, a rendered child, a property — of every term that admitted that row SHALL
be visibly marked within it. A row admitted by an ancestor step SHALL be marked with that step's
terms; the referencing node's row and the rows of its rendered children SHALL be marked with the
query's last step. Excluded terms SHALL mark nothing.

The mark SHALL be distinguishable from an author's own highlighted text, and SHALL NOT alter the
row's text, its links, or its layout.

Clearing the term SHALL remove every mark.

#### Scenario: The matched text is marked where it occurs

- **WHEN** a term admits a reference because it occurs in the referencing node's text
- **THEN** that occurrence is marked in the node's row, and no other text in the row is

#### Scenario: A match in an ancestor is marked in the lineage row

- **WHEN** a term admits a reference because it occurs in an ancestor's first line
- **THEN** the occurrence is marked in that lineage segment

#### Scenario: A lineage row carries only its own step's marks

- **WHEN** a query names an ancestor step and a last step, and a lineage segment contains text
  matching the last step as well as text matching the ancestor step
- **THEN** only the ancestor step's occurrence is marked in that segment

#### Scenario: An excluded term is not marked

- **WHEN** a query names one term and excludes another, and a row contains text matching both
- **THEN** only the named term's occurrence is marked

#### Scenario: An author's highlight is not mistaken for a match

- **WHEN** a row contains highlighted text written by the note's author and a term matches
  elsewhere in it
- **THEN** the author's highlight and the term's mark are distinguishable

#### Scenario: Clearing the term clears the marks

- **WHEN** the term is cleared
- **THEN** no row carries a mark
