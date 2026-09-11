## RENAMED Requirements

- FROM: `### Requirement: Source notes are searchable by name`
- TO: `### Requirement: References are searchable by content and by note name`

## MODIFIED Requirements

### Requirement: References are searchable by content and by note name

The filter controls SHALL include a free-text field that narrows results to references matching
the entered term. A reference SHALL match when the term occurs in the source note's name, or in
the content the footer shows for that reference: the referencing node's own text, the first line
of each ancestor in its lineage, or the text of the children the footer renders beneath it. A
property reference SHALL match on the property's own text. Content the footer does not show for
a reference — descendants beyond the level it renders — SHALL NOT be searched.

The term SHALL be matched as a literal substring, ignoring case and surrounding whitespace. An
empty term SHALL admit everything. The term SHALL combine conjunctively with the filter axes.

A group SHALL show only the references the term admits, and its count SHALL be the number of
those references. A source note none of whose references match SHALL NOT be shown.

#### Scenario: Typing narrows to matching notes

- **WHEN** text matching some source note names is entered
- **THEN** only groups whose source note name matches are shown

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

#### Scenario: Search does not reach reference content

- **WHEN** the entered text occurs only in content the footer does not render for a reference —
  a descendant deeper than the level it shows
- **THEN** the reference above it is not shown

#### Scenario: Matching ignores case

- **WHEN** the entered text differs from the content only in letter case
- **THEN** the reference is shown

#### Scenario: Search combines with an axis

- **WHEN** a reference-kind filter and a search term are both active
- **THEN** only references of that kind that match the term are shown

#### Scenario: Totals follow the term

- **WHEN** a term admits some references and not others
- **THEN** the reported reference and note totals count only the admitted ones

### Requirement: Volume is capped, with the caps under the reader's control

The footer SHALL bound how much it renders by two caps: a maximum number of references admitted
across the whole footer, and a bound on how much any one source note shows. Both SHALL be
configurable, and both SHALL have defaults.

While no search term is active, the overall cap SHALL be applied before a source note's content
is read, so a note the cap excludes costs nothing to exclude. While a search term is active, every
source note the filter axes admit SHALL be read, because the term is answered from its content;
the overall cap SHALL then apply to the references the term admits.

The per-note bound SHALL be expressed as an extent of the rendered group rather than a count of
its references, because a reference's rendered height depends on how its content wraps and a
count of references does not predict it.

Caps SHALL be applied after filtering, so narrowing the results makes more of the narrowed set
visible rather than leaving it hidden behind a cap consumed by excluded references.

The reader SHALL be able to request the next tranche of results without losing what is already
rendered.

#### Scenario: The per-note bound limits a single group

- **WHEN** one source note contributes more than its bound shows
- **THEN** that group shows no more than the bound, and reports that it has more

#### Scenario: The overall cap bounds the footer

- **WHEN** the sum of references across groups exceeds the overall cap
- **THEN** rendering stops at the last source note that fits within it, and the footer reports how
  much is not shown

#### Scenario: A single group larger than the cap is still admitted whole

- **WHEN** the very first group's own reference count already exceeds the overall cap
- **THEN** that group is admitted in full rather than refused — refusing it would render a footer
  that reports references and shows none — and nothing after it is

#### Scenario: A note beyond the overall cap is never read

- **WHEN** no search term is active and the overall cap excludes a source note
- **THEN** that note's content is not read or parsed

#### Scenario: A term reads what the cap would have skipped

- **WHEN** a search term is active and a source note beyond the overall cap holds the only
  reference matching it
- **THEN** that reference is shown

#### Scenario: Filtering frees cap budget

- **WHEN** a filter excludes most references and the remainder is below the cap
- **THEN** the whole remainder renders

#### Scenario: Requesting more is additive

- **WHEN** the reader requests the next tranche
- **THEN** further results render below what was already shown, and nothing already rendered is
  removed or reordered
