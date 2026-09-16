## Why

`search-hits-and-footer-content-filter` put one matcher in `src/search.ts` and said what a query
means there and nowhere else: a trimmed, case-insensitive literal substring. It named fuzziness,
quoted phrases and operators as later layers of that one module, and `docs/research/search-surfaces`
left the semantics open because a subsequence over a whole paragraph looked "nearly vacuous" and
nobody had measured it.

It is measured now, in `docs/research/search-grammar`, and two of the three findings were not the
expected ones.

- **The biggest gap is not fuzziness.** A literal substring answers nothing for 35 of 39 two-word
  queries whose target exists in the corpus, and finds the node the query came from 10.3% of the
  time, because a substring can only match two words that are adjacent and in the order typed.
  Splitting the query on whitespace takes that to 100%, and it is not a fuzzy rule.
- **The off-the-shelf fuzziness is worse than vacuous.** A whole-text subsequence returns 28% of
  the corpus for a three-character query and 23% for a mistyped four-letter word, and still misses
  the intended node in a third to a half of cases. Confining the match to a word and allowing one
  edit gives 100% recall on both typo families at a median of 4 hits. Highlighting separates them
  as sharply: 1.0 marks per hit against 2.7 to 7.8, scattered over 8 to 14 times their own length.
- **An ancestor constraint expresses something no flat query does.** For 22 of 40 pairs drawn from
  real lineages, the ancestor's word does not occur in the node's own text at all, and `A > B`
  narrows to a quarter of what the same two words narrow to when the lineage is folded into the
  searched text.

Three surfaces read this matcher — the footer's term field today, the palette and the in-note
filter as they land — so the grammar is worth getting right once rather than three times.

## What Changes

- **A new `search-grammar` capability** states what a query means, once. `backlink-filtering`
  stops restating the rule and defers to it; `search-palette` and `outline-filter` cite it instead
  of each growing their own wording.
- **A query is a list of terms, all of which must match**, split on whitespace, in any order. This
  alone is the largest measured gain.
- **A bare term matches a word by its opening characters**, and for terms of four characters or
  more tolerates one edit — an insertion, deletion, substitution, or transposition of adjacent
  characters. The floor is four because the sweep puts it there: three costs 2.4 times the width
  at three characters and buys no recall, five loses every typo in a four-letter word.
- **A quoted term stays literal** — a case-insensitive substring, no fuzziness, no word boundary.
  It is the escape from fuzziness every surveyed app offers, and it is today's grammar exactly, so
  nothing findable now becomes unfindable: a mid-word match a prefix rule drops is reached by
  typing quotes around it.
- **A term prefixed with `-` excludes.**
- **`>` splits a query into steps over the ancestor chain.** The last step is answered against the
  node; each earlier step must be satisfied by a distinct chain entry, in order, skipping
  generations freely — a partial chain, not a path. A step with no terms matches anything and
  consumes no entry, so a query being typed is valid at every keystroke.
- **The chain is the lineage a surface renders, root-most first**, and each surface says what its
  own is. For the footer that chain begins with the source note's name, which turns the name-or-
  content rule it has today into the root of one chain rather than a second rule beside it.
- **Marks follow the step that admitted the row**, so an ancestor row marks the ancestor step's
  terms rather than the whole query's.
- **A node's words are cached with its tree.** Word matching costs ten times a substring pass
  because it tokenizes on every keystroke; tokenizing once against the mtime-keyed
  `SourceTreeCache` takes 53,000 nodes from 77.5 ms to 24.4 ms.

## Capabilities

### New Capabilities

- `search-grammar`: what a query means — terms, matching, quoting, exclusion, and the ancestor
  chain — for every surface that has a query field.

### Modified Capabilities

- `backlink-filtering`: the term requirement defers to `search-grammar` for what a term means, and
  states the footer's own corpus in the chain's vocabulary — the source note's name as the chain's
  root, the referencing node and the rendered children as the hit.
- `backlinks-footer`: a row is marked with the terms of the step that admitted it, rather than
  with the whole query.

## Non-goals

- **Ranking and scoring.** Fuzziness widens the median whole-word result from 5 hits to 7.5 —
  enough to notice, not enough to force a score. The reason to leave it is structural: the footer
  orders groups by a reader-selected sort, the palette by modification time, the in-note filter by
  document position, and none has a slot a score could occupy. Ranking is a change to those three
  surfaces (`docs/research/search-grammar`, "What it does not settle").
- **Smart case.** Matching stays case-insensitive throughout.
- **Stemming, synonyms, or a second edit of tolerance.**
- **`OR`, parentheses, or field operators** (`tag:`, `path:`, `is:`). The filter axes already
  answer what `tag:` and `path:` would, and disjunction has no measured demand.
- **A regular-expression term.** Obsidian's own pane offers one, and the hand-off command in
  `docs/research/search-surfaces` is how a reader reaches it.
- **Any change to what the surfaces show, order, or cap.** This change is the grammar; the corpus,
  the ordering and the caps are each surface's own and are untouched.
- **A syntax hint in the UI.** Worth having, and not part of the grammar; recorded as an open
  question.

## Impact

- **Modified**: `src/search.ts` — the query parser, the term rule, the chain match, and the ranges
  each step marks; `src/plugin/footer-filter.ts` (the note name becomes the chain's root);
  `src/plugin/backlinks-footer.ts` (the mark walk carries a step); `src/plugin/source-tree-cache.ts`
  (a node's words cached with its tree).
- **Tests**: `tests/search.test.ts`, `tests/footer-filter.test.ts`,
  `e2e/specs/77-footer-controls.e2e.ts`.
- **Docs**: `docs/research/search-grammar` (new, with its harness under
  `docs/research/prototypes/search-grammar/`); `docs/research/search-surfaces` open question 2
  answered and its "later layers" list shortened by the two entries this change takes.

## Sequencing

Off `main`, and the mechanical test says it could as easily stack. `src/search.ts`,
`src/plugin/footer-filter.ts` and `tests/search.test.ts` are all touched by
`in-note-outline-filter` (#93); `search-palette` (#95) carries no code yet and overlaps only in
`docs/research/`. Neither reads what this change adds, which is the other half of the test: both
consume the matcher through the signatures it already has, and those are kept.

The reading we take is off `main`, because a stack charges for a dependency that is not there.
Whichever of the three merges first, the two after it rebase onto a `src/search.ts` whose exported
shape did not move; stacking would instead make every layer above wait for the grammar and pay a
restack on each version bump. The cost of being wrong is one rebase of the term-matching lines in
`footer-filter.ts`, which is the only place the three genuinely meet.
