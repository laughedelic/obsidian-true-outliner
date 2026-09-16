## MODIFIED Requirements

### Requirement: References are searchable by content and by note name

The filter controls SHALL include a free-text field that narrows results to references matching
the entered query. What the query MEANS — its terms, their matching, quoting, exclusion, and the
`>` separator — SHALL be as `search-grammar` defines it, and the footer SHALL apply no matching
rule of its own. An empty query SHALL admit everything. The query SHALL combine conjunctively
with the filter axes.

The footer's corpus for a reference SHALL be the content it shows for that reference: the
referencing node's own text, the first line of each ancestor in its lineage, the text of the
children the footer renders beneath it, and the name of the source note the reference comes from.
A property reference SHALL match on the property's own text. Content the footer does not show for
a reference — descendants beyond the level it renders — SHALL NOT be searched.

A query of a SINGLE step SHALL admit a reference when it matches any one of those texts, which is
the rule the footer has always applied.

A query with ancestor steps SHALL divide that corpus rather than widen it. Its last step SHALL be
answered against the referencing node's own text or the text of a child the footer renders beneath
it. Its ancestor steps SHALL be answered against the chain the footer draws above that reference,
root-most first: the source note's name, then the first line of each ancestor in the lineage. A
property reference SHALL offer the property's text as its last step and the source note's name as
its whole chain.

A group SHALL show only the references the query admits, and its count SHALL be the number of
those references. A source note none of whose references match SHALL NOT be shown.

#### Scenario: A term found in a source note's name admits its references

- **WHEN** text matching some source note names, and no reference content, is entered
- **THEN** those notes' groups are shown whole, and no other group is

#### Scenario: A term found in a reference's own text admits it

- **WHEN** the entered text occurs in the text of a referencing node and in no source note name
- **THEN** that reference is shown, in its group, and references whose content does not match
  are not

#### Scenario: A term found in an ancestor admits the reference beneath it

- **WHEN** the entered text occurs in the first line of an ancestor of a referencing node
- **THEN** that reference is shown, with the matching ancestor in its lineage

#### Scenario: A term found in a rendered child admits the reference above it

- **WHEN** the entered text occurs in a child the footer renders beneath a referencing node
- **THEN** that reference is shown

#### Scenario: Two words are found in either order

- **WHEN** two words are entered that both occur in a referencing node's text, in the opposite
  order
- **THEN** that reference is shown

#### Scenario: Search does not reach content the footer does not render

- **WHEN** the entered text occurs only in content the footer does not render for a reference —
  a descendant deeper than the level it shows
- **THEN** the reference above it is not shown

#### Scenario: Matching ignores case

- **WHEN** the entered text differs from the content only in letter case
- **THEN** the reference is shown

#### Scenario: An ancestor step narrows to references beneath a matching lineage

- **WHEN** a query names an ancestor step matching one heading and a last step matching text that
  occurs both under that heading and elsewhere
- **THEN** only the references under that heading are shown

#### Scenario: The source note's name is the root of the chain

- **WHEN** a query's ancestor step matches only a source note's name and its last step matches a
  referencing node in that note
- **THEN** that reference is shown, and references with the same text in other notes are not

#### Scenario: An ancestor step is not answered by the node itself

- **WHEN** a query names an ancestor step and a last step that a single referencing node's own
  text matches in full, with no ancestor and no note name matching the ancestor step
- **THEN** that reference is not shown

#### Scenario: Search combines with an axis

- **WHEN** a reference-kind filter and a search term are both active
- **THEN** only references of that kind that match the term are shown

#### Scenario: Totals follow the term

- **WHEN** a term admits some references and not others
- **THEN** the reported reference and note totals count only the admitted ones
