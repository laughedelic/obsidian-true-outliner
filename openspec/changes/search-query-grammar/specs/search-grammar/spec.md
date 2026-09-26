## Purpose

Defines what a search query MEANS: how it is split into terms, how a term matches a text, how a
term is made literal or made to exclude, and how a query constrains the chain of ancestors above a
match. It exists because three surfaces carry a query field — the backlinks footer's term, the
search palette, the in-note outline filter — and a reader who learns the language on one must find
the same language on the others.

What this capability does NOT define is the CORPUS: which texts a query is answered against, and
which texts form the chain. Each surface states its own, because each renders different text, and a
query answered against text a surface does not show would narrow results for reasons a reader
cannot see.

## ADDED Requirements

### Requirement: A query is a set of terms, every one of which must match

A query SHALL be split into terms on whitespace. A text SHALL match when every term matches it.
Terms SHALL be order-independent: a text matching two terms matches them whichever order they were
typed in.

Matching SHALL ignore letter case throughout, and SHALL ignore whitespace surrounding the query. A
query with no terms — empty, or whitespace alone — SHALL match every text.

#### Scenario: Two terms in either order

- **WHEN** a text contains two words and a query names them in the opposite order
- **THEN** the text matches

#### Scenario: Every term must be present

- **WHEN** a query names two words and a text contains only one of them
- **THEN** the text does not match

#### Scenario: Case is ignored

- **WHEN** a query differs from the text only in letter case
- **THEN** the text matches

#### Scenario: An empty query matches everything

- **WHEN** the query is empty or is whitespace alone
- **THEN** every text matches

### Requirement: A term matches a word by its opening characters, tolerating one slip

A term SHALL match a text when some WORD of that text begins with the term. A term of four
characters or more SHALL also match when some word's opening characters differ from it by at most
one edit — one character inserted, one deleted, one substituted, or two adjacent characters
transposed. A term of fewer than four characters SHALL match by its opening characters only.

A term SHALL NOT match a word it occurs inside but does not begin: matching is anchored at a word
boundary.

#### Scenario: A half-typed word finds the whole one

- **WHEN** the term is the first four characters of a word in the text
- **THEN** the text matches

#### Scenario: A transposition still finds the word

- **WHEN** the term is a word of the text with two adjacent characters transposed
- **THEN** the text matches

#### Scenario: A short term gets no tolerance

- **WHEN** a three-character term differs by one character from a word of the text and prefixes no
  word in it
- **THEN** the text does not match

#### Scenario: A term does not match inside a word

- **WHEN** the term occurs in the text only in the middle of a longer word
- **THEN** the text does not match

#### Scenario: Two edits are too many

- **WHEN** the term differs from every word of the text by two characters or more
- **THEN** the text does not match

### Requirement: A quoted term is literal

A term enclosed in double quotes SHALL match as a literal substring, ignoring case: anywhere in the
text, with no word boundary and no tolerance for an edit. Whitespace inside the quotes SHALL be
part of the term rather than separating two terms. A quote left unclosed SHALL extend to the end of
the query, so that a query being typed is valid at every keystroke.

#### Scenario: A quoted phrase matches across a space

- **WHEN** a quoted term contains a space and the text contains that exact sequence
- **THEN** the text matches

#### Scenario: A quoted term reaches inside a word

- **WHEN** a quoted term occurs in the text only in the middle of a longer word
- **THEN** the text matches

#### Scenario: A quoted term tolerates no slip

- **WHEN** a quoted term differs from the text by one character
- **THEN** the text does not match

#### Scenario: An unclosed quote is still a query

- **WHEN** a query contains one double quote followed by text
- **THEN** the text after the quote is one literal term

### Requirement: A term prefixed with a minus excludes

A term prefixed with `-` SHALL exclude: a text SHALL match only when no excluded term matches it.
An excluded term SHALL be matched by the same rule it would have been matched by unprefixed — a
quoted one literally, a bare one by its opening characters with tolerance.

A query of excluded terms alone SHALL match every text no excluded term matches. A `-` with no term
after it SHALL NOT be a term.

#### Scenario: An exclusion removes a text the other terms admit

- **WHEN** a query names one term a text matches and excludes another the same text matches
- **THEN** the text does not match

#### Scenario: Exclusions alone admit the rest

- **WHEN** a query is a single excluded term
- **THEN** every text that term does not match is matched

#### Scenario: A quoted exclusion excludes literally

- **WHEN** a query excludes a quoted term that occurs in the middle of a word in the text
- **THEN** the text does not match

### Requirement: A query may constrain the chain of ancestors above a match

A query SHALL be split into STEPS on `>` outside quotes. The LAST step SHALL be answered against
the matching text itself. Each earlier step SHALL be an ANCESTOR step, answered against the chain
of texts the surface supplies for that match, root-most first.

The ancestor steps SHALL be satisfied by DISTINCT entries of the chain, appearing in the same order
as the steps. They SHALL NOT be required to be adjacent to one another, nor to begin at the root of
the chain: a chain satisfies `A > B > C` when some entry matching A appears before some later entry
matching B, whatever lies between or above them.

A step with no terms SHALL match anything and SHALL consume no chain entry, so that a query ending
in `>` is valid while it is being typed.

An excluded term within an ancestor step SHALL be answered against the WHOLE chain: the match SHALL
be admitted only when no entry of its chain matches that term.

A match whose chain is shorter than the query's ancestor steps SHALL NOT be admitted.

#### Scenario: Generations may be skipped

- **WHEN** a query is `A > B`, and a node matching B sits three levels under a node matching A
- **THEN** the node is admitted

#### Scenario: The order of the steps is the order of the chain

- **WHEN** a query is `A > B` and the only node matching B has an ancestor matching A BELOW it in
  the chain rather than above
- **THEN** the node is not admitted

#### Scenario: The node's own text does not satisfy an ancestor step

- **WHEN** a query is `A > B` and a node's own text matches both A and B, and no ancestor of it
  matches A
- **THEN** the node is not admitted

#### Scenario: A root node cannot satisfy an ancestor step

- **WHEN** a query has one ancestor step and a matching node has an empty chain
- **THEN** the node is not admitted

#### Scenario: A trailing separator is a valid query

- **WHEN** a query is a term followed by `>`
- **THEN** every node with an ancestor matching that term is admitted, whatever the node's own text

#### Scenario: An exclusion in an ancestor step excludes the whole chain

- **WHEN** a query is `-A > B` and a node matching B has an ancestor matching A
- **THEN** the node is not admitted

#### Scenario: A quoted separator is not a separator

- **WHEN** a quoted term contains `>`
- **THEN** the query has one step and the character is part of the term

### Requirement: What is marked is what the step that admitted a text matched

Every occurrence in a text of every term that admitted it SHALL be reportable as a range over that
text, so a surface can mark what matched. Excluded terms SHALL contribute no range. A text admitted
by an ancestor step SHALL report the ranges of THAT step's terms, not of the whole query's.

Reported ranges SHALL NOT overlap one another; ranges that touch or overlap SHALL be reported as
one. A query with no terms SHALL report no range.

#### Scenario: Each term is marked where it occurs

- **WHEN** a query names two terms and a text contains both
- **THEN** both occurrences are reported

#### Scenario: A tolerated slip marks the word it found

- **WHEN** a term matches a word by one edit rather than exactly
- **THEN** the range reported covers the word that was found

#### Scenario: An excluded term is never marked

- **WHEN** a query names one term and excludes another, and a text matches the first
- **THEN** only the first term's occurrences are reported

#### Scenario: Overlapping matches are reported once

- **WHEN** two terms match overlapping text
- **THEN** one range covering both is reported
