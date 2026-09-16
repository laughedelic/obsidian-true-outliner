# Search grammar: what a query should mean, measured against the candidates

Measured 2026-09-23, against the grammar `search-hits-and-footer-content-filter` shipped: a
trimmed, case-insensitive literal substring, held in `matchesText` in `src/search.ts` and read by
every search surface. [search-surfaces.md](search-surfaces.md) planned that grammar as a first
cut and left two things for this note to settle before anything looser replaced it — its open
question 2, "per-word, first-line, or scored-and-capped", and the warning beside it that a
subsequence over a whole paragraph is "nearly vacuous". Both were claims about numbers that
nobody had. This note has them.

The harness is [prototypes/search-grammar/](prototypes/search-grammar/): `candidates.mjs` holds
six matching semantics as pure functions, `corpus.mjs` parses `test-vault` with the plugin's own
parser through esbuild, and `bench.mjs` prints every table below.

```bash
node scripts/gen-backlink-hub.mjs
node docs/research/prototypes/search-grammar/bench.mjs [--tracked] [--scale 30]
```

## How it is measured

**The corpus** is `test-vault` with the generated backlink hub: 151 files, 1,786 nodes, 84 KB.
Node text is short — median 47 characters, p90 87, longest 1,316 — which is the fact underneath
everything below, because a matcher's selectivity depends entirely on how much text each unit
offers it.

**The queries are derived, not chosen.** Every word of four characters or more is counted by the
number of nodes it appears in; the ones in a band of 3 to 30 nodes are kept, as common enough to
be looked for and rare enough for a hit to mean something; forty are taken evenly spaced through
that list alphabetically. Each seed word then becomes five queries:

| Family | Shape | What it stands for |
| --- | --- | --- |
| `short` | its first 3 characters | a box three keystrokes in |
| `prefix` | its first 4 characters | a box still being typed |
| `word` | the word itself | a term typed out |
| `typo` / `typo4` | its second and third letters transposed, in a word of 5+ / of exactly 4 | a hand that slipped |
| `pair` | the word plus another word from the same node | two terms, order not guaranteed |

Every query has a SEED: a node that really contains the word it was derived from. "Seed found"
below is the share of queries whose seed is still in the result set, which is recall against a
target we know exists.

**The candidates** all return the ranges to mark, not a boolean, so one pass measures both how
much a grammar admits and whether the result can be highlighted. That pairing matters here: all
three surfaces mark their matches, so a semantics that cannot be shown legibly is not a
candidate however well it selects.

| | Candidate | Rule |
| --- | --- | --- |
| A | `literal` | case-insensitive substring — the grammar as shipped |
| B | `subsequence-whole` | the query's characters, in order, anywhere in the text |
| C | `word-substring` | every query word occurs as a substring, in any order |
| D | `word-prefix` | every query word prefixes some word of the text |
| E | `word-subsequence` | every query word is a subsequence of some single word |
| F | `word-prefix-typo` | D, plus one edit of tolerance for query words of 4+ characters |

B stands in for `prepareFuzzySearch`, which cannot be measured directly: the `obsidian` npm
package ships types and no runtime, so Obsidian's own matcher does not run outside the
application. B is the same idea — a scoreless whole-text subsequence — written out.

Medians are the figures to read. The hub fixture is 120 near-identical notes, which pulls every
mean far above its median; `--tracked` reruns the whole thing over the 31 tracked notes alone
(386 nodes) and every ordering below survives, so the hub is not driving any of it.

## Result 1: the naive fuzziness is worse than vacuous

| Family | A `literal` | B `subsequence-whole` | D `word-prefix` | F `word-prefix-typo` |
| --- | --- | --- | --- | --- |
| `short` (3 chars) | 15.5 (0.9%) | **501.5 (28.1%)** | 10 (0.6%) | 10 (0.6%) |
| `prefix` (4 chars) | 10 (0.6%) | **238 (13.3%)** | 7 (0.4%) | 11 (0.6%) |
| `word` | 6.5 (0.4%) | 107.5 (6.0%) | 5 (0.3%) | 10 (0.6%) |
| `typo` | 0 | 35 (2.0%) | 0 | 4.5 (0.3%) |
| `typo4` | 0 | **279 (15.6%)** | 0 | 5 (0.3%) |

Median hits per query, and the share of the 1,786-node corpus they are.

A whole-text subsequence returns more than a quarter of the corpus for a three-character query
and a sixth of it for a mistyped four-letter word. That is the vacuity `search-surfaces`
predicted, and it is worse than it looks, because the recall is bad at the same time:

| Family | B: seed found | F: seed found |
| --- | --- | --- |
| `typo` | 55.0% | **100%** |
| `typo4` | 66.7% | **100%** |
| `pair` | 35.9% | **100%** |

B returns hundreds of nodes and still misses the node the query came from in a third to nearly
two thirds of cases. It fails at the one job fuzziness exists for. The reason is that it is scoreless: a
subsequence match over a long paragraph is easy to find and says nothing about whether the
paragraph is what was meant, and the transposed pair the reader actually typed is precisely the
case a subsequence cannot repair in order. Adding a score would sort the noise rather than remove
it, and would need a cap, and a cap needs a ranking the surfaces have nowhere to put (below).

Highlighting fails with it. Across every family, on both corpora:

| | Marks per hit | Spread |
| --- | --- | --- |
| B `subsequence-whole` | 2.7 – 8.4 | 7.5 – 15.4 |
| F `word-prefix-typo` | 1.0 – 2.5 | 1.3 – 6.0 |

Spread is the distance from the first marked character to the last, over the number of characters
actually marked. B scatters single characters across seven to fifteen times their own length —
a row of confetti down a paragraph. F marks whole words.

## Result 2: the largest gap is word splitting, not fuzziness

The `pair` family is two words that occur together in at least one node, so a correct answer
always exists.

| Candidate | Median hits | Seed found | Queries returning nothing |
| --- | --- | --- | --- |
| A `literal` | 0 | **10.3%** | **35 / 39** |
| C `word-substring` | 1 | 100% | 0 / 39 |
| D `word-prefix` | 1 | 100% | 0 / 39 |
| F `word-prefix-typo` | 1 | 100% | 0 / 39 |

Today's grammar answers nothing for thirty-five of thirty-nine two-word queries whose target
exists, because a literal substring can only match two words that happen to be adjacent and in
the order typed. Splitting the query on whitespace and requiring every word takes recall from 10%
to 100%, and it is not fuzzy matching — C, the strictest of the three, does it. This is the
cheapest large improvement available and it is independent of everything else in this note.

## Result 3: prefix beats substring, and the quoted form gives substring back

D is more selective than A and C where selectivity is worth most — while the query is still being
typed. At three characters D returns a median 10 nodes against A's 15.5, because a prefix of a
word is a narrower thing than a run of characters anywhere in one.

What a prefix rule gives up is the mid-word match: under D, `note` no longer finds `footnotes`.
The quoted form covers exactly that, and covers it without a new rule, because a quoted term is a
literal case-insensitive substring — the grammar as shipped, unchanged. Nothing findable today
becomes unfindable; it becomes findable by typing quotes around it.

E, fuzziness confined to a word, is the candidate this note rejects for being pointless rather
than for being loose: it costs what F costs, admits nearly four times what F admits on short
queries (37 against 10), and repairs no typo at all — 0% seed recall on both typo families, because a
transposition is not a subsequence. It is the shape of fuzziness that looks reasonable and buys
nothing.

## Result 4: the typo floor is four characters

F gives one edit of tolerance to query words of four characters or more and holds shorter ones to
an exact prefix. Sweeping that floor:

| Floor | `short` (3): median hits | `prefix` (4) | `word` | typo in a 5+ word: seed found | typo in a 4-letter word |
| --- | --- | --- | --- | --- | --- |
| 3 | **28.5** | 11 | 10 | 100% | 100% |
| **4** | **10** | 11 | 10 | 100% | **100%** |
| 5 | 10 | 7 | 7 | 100% | **0%** |
| off | 10 | 7 | 5 | 0% | 0% |

Three costs nearly three times the width at three characters and buys no recall anywhere: one edit in
three characters is not a constraint. Five loses every typo in a four-letter word. Four is the
only value that repairs what readers mistype without widening what they are still typing.

## Result 5: the ancestor operator narrows what a two-word query does not

89.2% of nodes in the corpus have an ancestor; the corpus is 7 deep at its deepest, with 327
distinct words of 4+ characters in ancestor first lines. Forty (ancestor word, node word) pairs
were drawn from real lineages, so each has at least one true structural answer, and matched four
ways with D:

| Reading | Median hits | Pairs returning nothing | One pass, ms |
| --- | --- | --- | --- |
| `B` alone, against the node's own text | 15.5 | 0 / 40 | 3.2 |
| `A B` against the node's own text | 0 | **22 / 40** | 3.4 |
| `A B` against own text plus the lineage | 4.5 | 0 / 40 | 7.6 |
| `A > B` — A in an ancestor, B in the node | **1** | 0 / 40 | 3.7 |

Three things settle the operator's design.

It is not redundant. `A > B` narrows to a quarter of what the same two words narrow to when the
lineage is simply folded into the searched text, and to a fifteenth of the bare term. The
lineage-AND reading is what a reader gets today if a surface searches lineage text, and it
conflates "under a section about A" with "in a node that happens to mention A".

It cannot be expressed without it. For 22 of the 40 pairs, no node in the corpus contains both
words in its own text, so the flat two-word query returns nothing at all: the ancestor is the only
place its word occurs, which is what made it an ancestor worth naming.

It is cheaper than the alternative it replaces — 3.7 ms against 7.6, median of three runs — because
testing the node first and consulting the chain only for the nodes that pass short-circuits most
of the corpus away. Against a plain query it costs a little more, 3.7 ms against 3.2, rather than
a multiple.

## Result 6: cost, and where it goes

One pass over the whole corpus, and over 30 copies of it — 53,580 nodes, the synthetic scale
`search-surfaces` used:

| Candidate | 1,786 nodes | 53,580 nodes |
| --- | --- | --- |
| A `literal` | 0.44 ms | 12.6 ms |
| B `subsequence-whole` | 1.00 ms | 29.1 ms |
| C `word-substring` | 0.71 ms | 18.9 ms |
| D `word-prefix` | 3.25 ms | 103.5 ms |
| E `word-subsequence` | 3.97 ms | 116.1 ms |
| F `word-prefix-typo` | 3.99 ms | 119.5 ms |

Every selectivity figure above this section is deterministic and repeats exactly. Timings do not:
they move by up to a quarter from run to run and by a factor of two between machines, so these
are the median of three and only the ratios between them are worth reading. E and F are within that noise of each other and are not
separated by cost.

Word-based matching costs roughly ten times a substring pass, because it tokenizes every node on
every keystroke. Tokenizing is nearly all of it, and it does not have to be paid per keystroke —
the trees are already cached per mtime in `SourceTreeCache`, and their words can hang off the
same entry:

| F, where its words come from | 53,580 nodes |
| --- | --- |
| tokenized on every pass | 128.1 ms |
| tokenized once, cached with the tree | **42.6 ms** |

Three times faster, on a vault thirty times the size of the fixture. The query itself is parsed once per keystroke rather than once per node, which is the other
half: the parse produces terms and a chain, and the per-node work sees only those.

## What this settles

1. **Split the query on whitespace; require every term.** The largest measured gain, and not a
   fuzzy rule. `search-surfaces` open question 2 asked per-word or whole-text; per-word, by a
   wide margin, on both selectivity and recall.
2. **Match each term as a word prefix with one edit of tolerance at four characters or more.**
   100% typo recall at a median of 4.5 hits, against a whole-text subsequence's 55% at 35.
3. **Never fuzzy-match the whole text.** B is the one candidate that is both loose and
   unreliable, and it is the one an off-the-shelf fuzzy matcher gives.
4. **Keep a quoted term literal.** It is the escape from fuzziness every surveyed app offers, it
   is the grammar as shipped, and it is what keeps mid-word matches reachable under a prefix rule.
5. **Spell an ancestor constraint `A > B`.** It narrows four and a half times beyond folding the
   lineage into the text, expresses something 22 of 40 real pairs cannot otherwise express, and
   costs about a seventh more than a plain query.
6. **Cache a node's words with its tree.** 128 ms to 43 ms at 53,000 nodes.

## What it does not settle

- **Ranking.** One edit of tolerance widens the median `word` result from 5 hits to 10 and the
  mean from 12.1 to 43.2 — twice as many, still 0.6% of the corpus, and not enough to force a
  score. The reason to leave it is
  structural rather than numeric: the footer orders groups by a reader-selected sort, the palette
  by modification time, the in-note filter by document position, and none of the three has a slot
  a score could occupy. Ranking is a change to those three surfaces, not to the grammar.
- **Smart case.** Every candidate here is case-insensitive. Whether an uppercase letter in the
  query should mean case-sensitive was not measured and is not proposed.
- **Stemming or synonyms.** Not measured, not wanted: one edit of tolerance repairs a slip, and
  a reader who types a different word meant a different word.
- **Whether a reader types `>` at all.** The operator's value is measured here as selectivity,
  which is a property of the corpus. Whether anyone reaches for it is a question for use, and the
  cheapest answer is to ship it and look.
