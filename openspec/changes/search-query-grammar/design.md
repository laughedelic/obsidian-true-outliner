## Context

`src/search.ts` holds one grammar in one function. Its header states the split this change has to
keep: the GRAMMAR is shared across surfaces, the CORPUS is not — each surface decides which texts a
query is answered against, because each shows different text. The footer answers for a reference
against everything it renders around one; a palette or an in-note filter asks about a node on its
own.

That split survives this change and is the reason it is tractable. What breaks against it is the
ancestor operator: `A > B` is not a question about one string, so it cannot live behind a predicate
whose whole input is one string. The measurements are in `docs/research/search-grammar`; the design
below is about where the new shape sits without making three surfaces disagree.

## Goals / Non-Goals

**Goals.** One place that says what a query means. A grammar a reader can learn on the footer and
use unchanged in the palette. Signatures that let the two in-flight surface changes rebase without
rewriting. Matching that stays inside a keystroke's budget on a vault far larger than the fixture.

**Non-Goals.** Ranking, scoring, smart case, disjunction, field operators, regular expressions,
and any change to what a surface shows, orders or caps. The proposal's non-goals list carries the
reasons.

## Decisions

### D1. A query is parsed once into steps of terms; matching has two levels

`parseQuery(query)` returns steps, each a list of terms, each term carrying its text, whether it is
quoted, and whether it is excluded. It runs once per keystroke, not once per node — which is what
keeps the per-node work down to comparing a handful of strings.

Matching then has two levels, and they are different questions:

- A TERM level over one string: does this text satisfy this step? This is what a surface with one
  text to offer asks, and it is the level that produces mark ranges.
- A CHAIN level over a lineage: do these ancestor steps hold, in order? This is what `>` needs, and
  it is answered on an array of strings a surface supplies.

The alternative was one entry point taking the node and its ancestors together. It was rejected
because the footer does not have a node-shaped question to ask: it ORs the step across a set of
texts it renders, some of which are children. Two levels let each surface compose them its own way
while the rules inside each level stay in one module.

### D2. `matchesText` and `matchRanges` keep their signatures, and answer the hit step

Both keep taking `(text, query)` and both keep meaning what their callers already believe: does
this text match, and where. With a chain query they answer the LAST step, the one that applies to a
node. A caller that never passes `>` sees no change of shape at all.

This is what lets `in-note-outline-filter` and `search-palette` rebase onto this change rather than
stack on it. It costs one thing, recorded here so it is not discovered: a caller that passes a
chain query to `matchesText` alone gets the hit step's answer and silently ignores the ancestor
constraint. The chain-aware entry point is therefore the one the surfaces are ported to, and the
single-text one keeps its name because the footer's per-text OR genuinely wants it.

### D3. A term matches a word by its opening characters, with one edit at four

The measured candidate F. Three parts, each with a figure behind it in
`docs/research/search-grammar`:

- **Anchored at a word start**, not anywhere in the text. More selective exactly where selectivity
  is worth most — a three-character query returns a median 10 nodes against a substring's 15.5 —
  and it is what gives a typo something to be repaired against, since an edit distance needs two
  aligned strings and an arbitrary substring position supplies none.
- **One edit for terms of four characters or more.** Insertion, deletion, substitution, or the
  transposition of adjacent characters, which is the slip a hand actually makes and the one a
  subsequence cannot repair.
- **Nothing for shorter terms.** One edit in three characters is not a constraint.

Rejected: a subsequence within a word (candidate E). It costs what F costs, admits nearly four times
as much on short queries, and repairs no typo at all — 0% recall on both typo families, because a
transposition is not a subsequence. It is the shape of fuzziness that looks reasonable and does
nothing.

### D4. A quoted term is literal, which is today's grammar unchanged

`"..."` is a case-insensitive substring, with no word anchor and no tolerance. Whitespace inside
the quotes is part of the term; an unterminated quote runs to the end of the query, so a query is
valid at every keystroke while it is being typed.

Making the escape hatch identical to the grammar as shipped is deliberate. The prefix rule's one
real cost is the mid-word match — `note` no longer finds `footnotes` — and the migration story is
that the old behaviour is still there, reached by typing quotes. No new mechanism, and no content
that becomes unreachable.

### D5. `-` excludes, and inside an ancestor step it is answered against the whole chain

An excluded term matches by the rule it would have matched by — quoted terms exclude literally,
bare terms exclude by prefix and tolerance. A text matches when every positive term does and no
excluded one does. A query of only exclusions admits everything not excluded; a bare `-` is not a
term.

Inside an ancestor step the useful reading and the local reading differ, and we take the useful
one: `-draft > layout` means "layout, not anywhere under something matching draft", so an excluded
term in an ancestor step is tested against every entry of the chain rather than against the one
entry that satisfied the step. The local reading — "the ancestor that satisfied this step must not
also match draft" — is what falls out of the implementation if nobody decides, and it is close to
meaningless, because another ancestor matching `draft` would leave the query satisfied.

### D6. The ancestor chain is a subsequence, not a path

Each ancestor step must be satisfied by a distinct chain entry, and the entries must appear in the
steps' order; they need not be adjacent, and the first need not be the root. `A > B` therefore
means "B, somewhere under something matching A" — the partial chain — rather than "B whose parent
matches A". Assignment is greedy leftmost, which is the standard subsequence walk and is what makes
the answer independent of how deep the chain is.

A step with no terms matches anything and consumes no entry. That is one rule rather than a special
case, and it makes a trailing `>` a valid query: `layout >` is "everything under a node matching
layout", which is both a sensible query and the state a reader's box is in mid-keystroke.

Rejected: Dynalist's `ancestor:` prefix. `>` is Workflowy's, it reads as a path, and it is shorter
than the thing it replaces. The cost is that a literal `>` in a query needs quoting, which the
quoted form already handles.

### D7. The chain is the lineage a surface renders, root-most first

The corpus rule, extended: a surface already decides which texts answer a query, and now it also
decides which texts form the chain. The rule that keeps the surfaces honest is that the chain is
what the surface SHOWS as lineage, so a reader constrains what is on screen rather than something
invisible behind it.

For the footer that chain begins with the source note's name, then the lineage segments. This
absorbs a rule rather than adding one: the footer's term already matched the note name OR the
content, and the name is simply the outermost thing it renders. A single-step query behaves exactly
as it does today; a chain query gains `Projects > layout` for free.

### D8. A node's words are cached with its tree

Tokenizing is nearly all of word matching's cost: 128 ms per pass over 53,000 nodes, against 43
when the words are computed once. The trees are already cached per mtime in `SourceTreeCache`, and
the words are a pure function of the tree, so they belong on the same entry and are invalidated by
the same key. Nothing else changes about the cache's lifetime or its eviction.

### D9. A row is marked with the step that admitted it

`matchRanges` marks the positive terms of one step. A surface rendering a chain marks each lineage
entry with the step that entry satisfied, and the hit row with the last step. Excluded terms mark
nothing, since there is nothing to point at.

The non-overlap guarantee `matchRanges` makes today has to survive several terms matching in one
text, so ranges are merged when they touch or overlap before they are returned. Its callers cut
text nodes at those boundaries and two overlapping ranges cannot both be cut out of one string.

## Risks / Trade-offs

| Risk | Reading |
| --- | --- |
| The prefix rule drops mid-word matches a reader relies on today | The quoted form is the old grammar exactly (D4), so nothing becomes unfindable. It is still a change a reader can notice without having asked for it, and it is the one behaviour change here that is not strictly a widening |
| One edit of tolerance doubles whole-word results (median 5 to 10, still 0.6% of the corpus) | Measured and accepted. There is no setting for it, deliberately: a grammar that differs per reader is the anti-pattern the survey records, where operators silently differ between surfaces |
| A chain query passed to `matchesText` alone ignores its ancestor steps | D2 names it. The ported surfaces use the chain-aware entry point; the risk is a future caller reaching for the familiar name |
| Tokenizing on a cold cache | The cache is filled by the same sweep that parses, and the words are computed with the tree rather than on first query. The cold whole-vault read is `search-palette`'s first task and is unchanged by this |
| The aliased-link gap recorded in `docs/research/search-surfaces` | Unchanged and unaddressed here: admission reads a node's inline markdown, the mark walk reads the rendered row, and a term matching only a link's target still admits without marking. Word matching neither fixes nor worsens it |

## Open Questions

1. **A syntax hint in the UI.** A reader who is never told `>` exists will not type it. The cheapest
   form is a line in the palette's instructions row, which does not exist on the footer. Out of
   scope here; it belongs to whichever surface change ships the affordance.
2. **The in-note filter's two-character threshold.** It was chosen before this grammar, and a
   three-character query now returns a median 10 nodes against a substring's 15.5. Whether the
   threshold should move is that capability's question, with the figure now available to answer it.
3. **Whether readers reach for `>` at all.** Its selectivity is measured; its use is not. The
   cheapest answer is to ship it and look.
