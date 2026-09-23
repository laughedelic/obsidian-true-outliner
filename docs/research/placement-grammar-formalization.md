# Formalizing the placement grammar: the options, and what each would give us

[node-kind-grammar.md](node-kind-grammar.md) records the model the drop, paste, indent and outdent
share: a node keeps its kind where the destination can hold it, and one conversion decides what it
becomes where it cannot. [node-placement-grammar.md](node-placement-grammar.md) (on
`chore/node-placement-grammar` until it lands) writes that grammar down and measures every
operation against it. It finds eight defects (D1 to D8) and ten ambiguous cases (A1 to A10), and it
leaves one question for later: how the grammar could be stated formally, and what that would give
the project. This note covers that question. It looks at eight directions. For each: what it is,
the key references, what it would give us concretely, and a rough cost. It ends with two spikes to
take up.

Three probes over enumerated notes ground the survey. They are kept in
[prototypes/placement-grammar-formalization/](prototypes/placement-grammar-formalization/). Their
findings bear on every direction below, so they come first. The probes read the grammar at the
level of node kinds: `h1` to `h3` (and `h4` as one more way to write a moved node), paragraph,
list item, a list item carrying a `##` run, code and quote. They write every forest the same way:
`-` bullets, a blank line after every node, and a list item's children two columns in. The
alphabet leaves out tasks, ordered and `*` markers, `h5` and `h6`, tables, callouts and tight
lists. The figures are for this alphabet and this writer.

Every reference below was checked for authors, title, venue and year against the publisher's
listing or the project's own repository. Where we could not confirm a detail of what a paper
proves, the text says so.

## What enumeration shows about the grammar

### Every rule is about two adjacent siblings, or about a node and its place

The grammar as `parse` reads it:

```
Root        ::= Section(0)
Section(n)  ::= Content* Heading*     -- heading levels > n, non-increasing among siblings
Content     ::= Para | Item | Atom    -- no Item directly after a Para
Para        ::= para[ Item* ]
Item        ::= item[ (Item | Leaf | Atom)* ]
Leaf        ::= para[ ]
Heading(m)  ::= heading_m[ Section(m) ]
Atom        ::= atom[ ]
```

Rewritten as constraints, each rule either looks at two adjacent siblings or at one node and where
it sits:

| Scope | Rule |
| --- | --- |
| Two adjacent siblings | a list item does not follow a paragraph (the attachment rule, Q34) |
| | content does not follow a heading |
| | a heading does not follow a shallower heading |
| A node and its parent | a paragraph holds only list items, and only at section level |
| | an atom holds nothing |
| | a heading's parent is the root or a shallower heading |
| A node and its column | a quote, callout, `hr`, `html` block or heading opens only within three columns of the margin (`OPENING_MARGIN` in `src/parse.ts`) |

The first probe wrote every ordered forest over the alphabet, up to five nodes, and parsed it back.
Atoms were kept as leaves. A forest round-trips when the parse has the same shape:

| Nodes | Forests | Admitted by the grammar as stated | Round-trip | Admitted but not round-tripping |
| --- | --- | --- | --- | --- |
| 1 | 7 | 7 | 7 | 0 |
| 2 | 84 | 53 | 53 | 0 |
| 3 | 1,253 | 419 | 418 | 1 |
| 4 | 20,916 | 3,401 | 3,371 | 30 |
| 5 | 373,982 | 28,095 | 27,538 | 557 |

The stated grammar admits 588 forests that `parse` does not. Every one of them is a quote under a
nested list item: at column 4 the quote reads as a paragraph. Adding the column rule makes the two
agree on all 396,242 forests. The parse admits nothing the grammar rejects, and every forest the
parse rejects breaks at least one rule in the table. The column rule is the one the parallel note
also records, with its measurements in [seams-across-a-re-indent.md](seams-across-a-re-indent.md).
Here it is simply the one rule the grammar as stated was missing.

In formal-language terms, each sibling sequence is a *strictly 2-local* language: it is defined by
a set of forbidden adjacent pairs, a small subclass of the regular languages. The tree grammar is
*single-type* in the taxonomy of Murata et al. (below). Two rules keep it out of the simplest
class, the *local* grammars that DTDs define, where each label has one content model:

- the attachment rule gives the paragraph two content models, one at section level and one inside
  a list item;
- the column rule makes a list item's content model depend on its depth.

### The re-parse repairs in two ways

`finalize` returns `parse(encode(surgery))` (`src/ops.ts`). Whatever the surgery builds, the note
holds its re-parse. The first probe recorded what the re-parse does to each node of a forest that
breaks exactly one rule. Forests up to four nodes; 9,166 break one rule and 9,245 more than one:

| Rule broken | What the re-parse does | Forests |
| --- | --- | --- |
| content after a heading | the content joins the heading, as its child | 2,337 |
| a heading after a shallower heading | the deeper heading joins the shallower one | 774 |
| a list item after a paragraph | the item joins the paragraph | 273 |
| a heading under a list item | lifted out of the list (932), and what follows joins it (823); past column 3 it reads as a paragraph instead (123) | 1,878 |
| a heading not deeper than its parent | lifted (1,598), and what follows joins it (100) | 1,698 |
| a heading under a paragraph | lifted (749), and what follows joins it (409) | 1,158 |
| a paragraph under a paragraph | lifted (333), and what follows joins it (53) | 386 |
| an atom under a paragraph | lifted | 380 |
| children under a paragraph inside a list item | lifted (202), and what follows joins it (42); past column 3, relabelled (8) | 252 |
| a quote past column 3 | relabelled: it reads as a paragraph | 30 |

Two repairs account for every row. A broken pair rule is repaired by making the right sibling a
child of the left one. A broken parent rule is repaired by lifting the node to the nearest scope
that can hold it. After a lift, whatever follows the lifted node is re-read against it. Relabelling
happens only past the margin. Drawn as outlines, one indent step per depth; what the surgery
built, then what the note holds:

```
 built     re-read          built       re-read
┆P        ┆P               ┆- x        ┆- x
┆- x      ┆  - x           ┆  ## H     ┆## H
```

The explicit conversion is a third repair: relabel the moved node before writing it. So every
operation's result has the shape `N(splice(t, C(x)))`. `C` picks what the moved node is written
as, `splice` puts it at the named place, and `N = parse ∘ encode` repairs whatever `C` left
inadmissible. N's repair is the join or the lift above. Absorption is `N` joining a pair; D2's
stranded children are `N` lifting.

### Where a node can land is decided by its neighbours alone

The third probe placed one node of each kind — `h2`, paragraph, list item, a list item carrying
`##`, code — at every place in every admissible forest. It wrote the node in each of seven ways:
`h1` to `h4`, paragraph, list item, list item carrying `##`. Each writing got one of three
verdicts:

- *clean*: the re-parse puts it at the named place and moves nothing else;
- *absorbing*: the only change is that siblings after it become its children;
- *misplaced*: anything else.

It then grouped the verdicts by local context: the parent, the preceding sibling, the following
sibling and the moved kind.

| Forests up to | Placements | Local contexts | (context, writing) cells whose verdict varies |
| --- | --- | --- | --- |
| 4 nodes | 146,690 | 860 | 0 |
| 5 nodes | 1,465,385 | 860 | 0 |

All 860 contexts already occur in forests of three nodes. A writing's verdict depends only on
those four things, so for this alphabet the conversion is a finite table: 860 rows, each listing
the admissible writings. Choosing among a row's admissible writings is a cost order. The
ambiguous cases are the rows where the order leaves a tie, or where two reasonable orders
disagree.

Four lexicographic orders were run over the table. A conversion was never allowed to write a `#`
the node did not carry: that rules out promoting content to a heading, which no operation does.

| Order | Cost, compared left to right | One answer | Refused | Tied |
| --- | --- | --- | --- | --- |
| Kind, then absorption | misplaced, kind changed, absorbs, marks changed, level distance | 778 | 57 | 25 |
| Absorption, then kind | misplaced, absorbs, kind changed, marks changed, level distance | 730 | 57 | 73 |
| Keep marks; the unmarked kind joins | misplaced, absorbs, marks dropped, *for a paragraph* differs from its neighbour, marks added, kind changed, level distance | 803 | 57 | **0** |
| Join the neighbours | misplaced, absorbs, differs from its neighbour, marks changed, kind changed, level distance | 758 | 57 | 45 |

A *mark* is a list marker, a `#` run, a fence or a `>`. The third order is the principle that
[node-placement-grammar.md](node-placement-grammar.md) recommends: "a mark an author wrote is
kept, the unmarked kind joins its neighbours, and a node takes in its neighbours only where the
operation draws that before the write". As tabulated, it is the paste's form of the principle,
since a paste draws nothing before the write. On this table it leaves no tie. The drop's form,
with the absorption term moved after the marks because the drop draws what it absorbs, also leaves
no tie; it is one more line in the probe's list of orders. The 57 refusals are the same under
every order:

- content placed after a heading sibling, except a list item carrying `##`, which can be written
  as the heading it carries;
- an atom under a paragraph;
- anything under a paragraph inside a list item (D3's place).

All four orders give the same single answer, or the same refusal, at 659 of the 860 contexts. The
other 201 fall into six families, and five of them are cases the parallel note found by hand:

| Family | Contexts | Answers the orders give | In [node-placement-grammar.md](node-placement-grammar.md) |
| --- | --- | --- | --- |
| A heading where keeping it absorbs what follows | 76 | the heading, absorbing; `- ## H`; a paragraph | A1 among list items (16 contexts); the table's "before a paragraph" row, and its analogue before an atom, for the rest |
| A paragraph before, or after, list items | 44 | the paragraph (adopting the list, when before it); `- P` | A2, A9 on arrival, D5 |
| A heading under a list item | 25 | `- ## H`; a paragraph without the `#` | not listed: A4 weighs `- ## H` against `- H`, not against a paragraph |
| A list item carrying `##` | 26 | kept; `## H`; a paragraph | A5, and D1 where the forced writing is a paragraph |
| A heading at the end of a scope, where keeping it is clean | 20 | the heading; `- ## H` or a paragraph, joining the neighbours | the table's "after the last list item" row |
| A list item next to a paragraph, where it can stay | 10 | kept; a paragraph, joining the neighbours | D6: the code's answer is the join-the-neighbours one |

Five of the parallel note's cases do not show up, and each for a reason:

- A3 needs an order that prefers a sibling's level to the node's own, and none of the four does.
- A6, A7 and A8 are about the tree edit rather than the writing.
- A10 is about the marker character, which the alphabet does not have.

A wider alphabet, or a wider family of orders, would bring each of them in. So the ambiguity list
is something we can compute: fix an alphabet and a family of plausible orders, and the list is
every context where they disagree.

### The test generator, against the language

The grammar can also be read as a generator: one function per nonterminal, from a size to the
forests of exactly that size it derives. The second probe enumerates the admissible forests
directly this way, rather than generating everything and filtering:

| Nodes | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Admissible forests | 7 | 53 | 418 | 3,371 | 27,538 | 226,730 | 1,876,096 |

The first five counts equal the filtered counts above, which cross-checks the generator against
the checker. All 2,134,213 forests round-trip. The count grows by about 8 per node, against about
18 per node for all forests. Size 7 took 28 s on the cloud container, about 15 µs per forest
written, parsed and compared.

The grammar admits 50 local configurations over kind classes: parent, preceding sibling and node,
plus the heading-level relations. In 5,000 draws at seed 42, `tests/generators.ts`'s `arbTree`
reaches 42 of them. It never reaches these eight:

- all six configurations with a paragraph inside a list item, whatever its siblings are;
- a heading after a deeper heading sibling;
- a heading two or more levels below its parent heading.

The parallel note found the paragraph and skipped-level gaps by reading the generator. The
enumeration lists them without reading it, and adds the decreasing-level siblings.

## What locality says about a move

A move removes a run from one place and writes it at another. The grammar's rules are local, and
the run was admissible where it stood. So whether the result is admissible as placed comes down
to a short list of checks:

1. **The source seam.** The two siblings that become adjacent where the run left must be an
   allowed pair. This is #206 and A9's removal side: taking an atom out from between a paragraph
   and a list lets the list attach.
2. **The destination's left pair**: the node before the run, and the run's first root.
3. **The destination's right pair**: the run's last root, and the node after it. A1 and D5 break
   this pair, and A6 is the question of where the rows that `N` then joins end up.
4. **The parent pair**: the parent and the run's roots. D3 and D7 break it.
5. **The roots against their new labels.** A converted root's own children must fit the content
   model of what it was converted into (D2). A heading run shifted deeper must still have every
   heading within `h6`.
6. **The column of every node the run carries**, for the margin rule
   ([seams-across-a-re-indent.md](seams-across-a-re-indent.md)).
7. **The writing re-reads as the label chosen.** D1 fails this check: a list item carrying `###`,
   written as a paragraph by stripping its marker, is a heading line. `kindAsWritten` in
   `src/parse.ts` is where the code already asks this question.

D5, D6 and D8 also come from the conversion's rules reading different pairs than the grammar
does:

- **D6** applies the attachment pair inside a list item, where the grammar has no such pair.
- **D5 and D8** choose their answer from a donor beyond the adjacent sibling, while admissibility
  is decided by the adjacent sibling. `nativeContentKind` skips atoms and headings when it looks
  for a donor, and `destinationHeadingLevel` treats paragraphs and atoms as transparent. D5 is
  the paragraph that keeps its kind because a paragraph past an atom donates it, and then adopts
  the list next to it. D8 is the heading converted for a list beyond a paragraph, then written
  right after the paragraph.

This suggests an order for the conversion. Filter the writings by the adjacent pairs first. Let a
farther donor break ties only among the writings that pass. The code does it the other way
round: it picks by donor, writes, and leaves the re-parse to repair what the pick got wrong.

## The directions

### 1. The grammar as a formal language

**What it is.** Regular tree languages over unranked trees, called hedge languages, are recognized
by hedge automata. XML schema theory ranks their grammars by how a node's type is assigned:

- *local*, the class of DTDs: one content model per label;
- *single-type*, the class of XML Schema: competing types never share a content model, so types
  are assigned top-down;
- *restrained competition*;
- full *regular*, the class of RELAX NG, where one node can have several interpretations.

**References.**
- Murata, Lee, Mani, Kawaguchi, "Taxonomy of XML schema languages using formal language theory",
  ACM TOIT 5(4), 2005 — [doi:10.1145/1111627.1111631](https://doi.org/10.1145/1111627.1111631).
- Brüggemann-Klein, Murata, Wood, "Regular tree and regular hedge languages over unranked
  alphabets", HKUST technical report, 2001 — [hdl:1783.1/738](http://hdl.handle.net/1783.1/738).
- Comon et al., *Tree Automata Techniques and Applications* (TATA), chapter 8, "Automata for
  unranked trees" — [hal-03367725](https://inria.hal.science/hal-03367725).
- Hosoya, Vouillon, Pierce, "Regular expression types for XML", ICFP 2000 — types as regular
  tree languages, with subtyping as inclusion, which is EXPTIME-complete in general —
  [doi:10.1145/351240.351242](https://doi.org/10.1145/351240.351242).
- Milo, Suciu, Vianu, "Typechecking for XML transformers", PODS 2000 — whether a transformation
  maps every valid input to a valid output is decidable, but non-elementary in general —
  [doi:10.1145/335168.335171](https://doi.org/10.1145/335168.335171).
- Balmin, Papakonstantinou, Vianu, "Incremental validation of XML documents", ACM TODS 2004 —
  re-validation after updates in O(m log n) —
  [doi:10.1145/1042046.1042050](https://doi.org/10.1145/1042046.1042050).
- Industrial counterpart: ProseMirror's schema content expressions, regular expressions over child
  node types — [guide](https://prosemirror.net/docs/guide/#schema.content_expressions).

**Is ours regular?** Yes, and it is in one of the smallest classes: single-type, with strictly
2-local sibling constraints (measured above). The sibling automaton needs one state per "last sibling
seen": nothing, content of each kind, or a heading of each level.

**What it would give us.**
- *A decidable admissibility check in one walk.* The suite has none today. Admissibility is implied
  by re-parsing, which is also the operation under test. A checker is the oracle that properties 1
  and 2 of [node-placement-grammar.md](node-placement-grammar.md) need.
- *Incremental checking.* Because the grammar is single-type and 2-local, an edit needs only its
  seams re-checked: the list in the previous section.
- *Generators derived from the grammar.* We can enumerate the language up to a size, or sample it
  at random. The second probe's generator is about seventy lines. A generator written as the
  grammar cannot miss a production the way `arbTree` misses eight configurations.
- *Typechecking the operations.* Milo, Suciu and Vianu show that this is decidable for tree
  transducers, with a non-elementary algorithm in general. Locality reduces it here to checking
  the 860-row table.
- *A precise reading of Q34.* Readings C and D of
  [list-paragraph-mapping.md](list-paragraph-mapping.md) remove the one pair rule that gives the
  paragraph a second content model. The grammar then becomes local apart from the margin, and the
  join repair no longer applies to list items.

**Cost.** Low: a checker and a generator, a few hundred lines of TypeScript in `tests/`, no new
dependency. This is part of spike 1.

### 2. Repair against a schema

**What it is.** Correcting a tree to fit a schema with the fewest edits, and reasoning over the set
of all minimal corrections when there is more than one.

**References.**
- Aho, Peterson, "A minimum distance error-correcting parser for context-free languages", SIAM J.
  Comput. 1972 — the string-level origin —
  [doi:10.1137/0201022](https://doi.org/10.1137/0201022).
- Arenas, Bertossi, Chomicki, "Consistent query answers in inconsistent databases", PODS 1999 —
  repairs as minimally different consistent instances, and answers true in every repair —
  [doi:10.1145/303976.303983](https://doi.org/10.1145/303976.303983).
- Staworko, Chomicki, "Validity-sensitive querying of XML databases", EDBT workshops 2006 — a
  distance to validity against a DTD, a compact representation of all minimal repairs, and valid
  answers across them — [doi:10.1007/11896548_16](https://doi.org/10.1007/11896548_16). The
  details of its edit model and complexity come from secondary descriptions, not from the paper
  itself.
- Boobna, de Rougemont, "Correctors for XML data", XSym 2004 — a linear-time corrector for
  documents close to their DTD —
  [doi:10.1007/978-3-540-30081-6_8](https://doi.org/10.1007/978-3-540-30081-6_8).
- Magniez, de Rougemont, "Property testing of regular tree languages", Algorithmica 2007 — the
  exact edit distance with moves is NP-complete on ordered trees —
  [doi:10.1007/s00453-007-9028-3](https://doi.org/10.1007/s00453-007-9028-3).
- Suzuki, "Finding an optimum edit script between an XML document and a DTD", ACM SAC 2005 —
  polynomial for costs independent of other nodes, per the abstract —
  [doi:10.1145/1066677.1066825](https://doi.org/10.1145/1066677.1066825).
- Canfield, Xing, "Approximate matching of XML document with regular hedge grammar", Int. J.
  Comput. Math. 2005 — the edit distance from a forest to a hedge grammar —
  [doi:10.1080/00207160412331336053](https://doi.org/10.1080/00207160412331336053).
- Svoboda, Mlýnková, "Correction of invalid XML documents with respect to single type tree
  grammars", NDT 2011 — all minimal-cost repairs —
  [doi:10.1007/978-3-642-22185-9_16](https://doi.org/10.1007/978-3-642-22185-9_16).
- Amavi, Bouchou, Savary, "On correcting XML documents with respect to a schema", The Computer
  Journal 57(5), 2014 — every correction within a distance threshold —
  [article](https://academic.oup.com/comjnl/article-abstract/57/5/639/386169).
- Industrial counterpart: ProseMirror's `replaceStep` "fits" a slice by filling required nodes,
  then wrapping, then closing — [guide](https://prosemirror.net/docs/guide/#transform).

**What it would give us.** The conversion is a repair restricted to one place and one node:
relabel it (`C`), let what follows join it (`N`'s join), or refuse. "More than one legitimate
answer" is precisely "more than one minimal repair". The general problem is polynomial with unit
costs and hard with moves, and we avoid both, because every repair we need is decided by a local
context. The third probe computes the whole answer set in seconds and the ambiguity list with it.

The literature adds one warning that bears on how we use the list. Least change is relative to the
metric (Cheney et al., under direction 3). A1 is a split for exactly that reason: the drop and the
paste rank absorption and kind change in opposite orders. The robust list is the set of contexts
where plausible orders disagree, not the ties of any single order.

**Cost.** Low to medium. The probe is about two hundred lines. Turning it into a committed table
with a differential test against the real operations is the third part of spike 1.

### 3. `parse` and `encode` as a lens

**What it is.** Bidirectional transformations: a `get` from a source to a view, a `put` that writes
an updated view back into the source, and laws tying the two together.

**References.**
- Foster, Greenwald, Moore, Pierce, Schmitt, "Combinators for bi-directional tree transformations",
  POPL 2005 — GetPut, PutGet, and the optional PutPut —
  [doi:10.1145/1040305.1040325](https://doi.org/10.1145/1040305.1040325).
- Bohannon, Foster, Pierce, Pilkiewicz, Schmitt, "Boomerang: resourceful lenses for string data",
  POPL 2008 — string lenses; dictionary lenses that match chunks by key, so that reordering the
  view carries each chunk's source text with it —
  [doi:10.1145/1328438.1328487](https://doi.org/10.1145/1328438.1328487).
- Foster, Pilkiewicz, Pierce, "Quotient lenses", ICFP 2008 — the laws up to equivalences, with
  canonizers — [doi:10.1145/1411204.1411257](https://doi.org/10.1145/1411204.1411257).
- Hofmann, Pierce, Wagner, "Symmetric lenses", POPL 2011 —
  [doi:10.1145/1926385.1926428](https://doi.org/10.1145/1926385.1926428) — and "Edit lenses",
  POPL 2012 — edits as monoid actions, with `put` a homomorphism on edits —
  [doi:10.1145/2103656.2103715](https://doi.org/10.1145/2103656.2103715).
- Diskin, Xiong, Czarnecki, "From state- to delta-based bidirectional model transformations",
  JOT 2011 — delta lenses, where the delta carries which element went where —
  [doi:10.5381/jot.2011.10.1.a6](https://doi.org/10.5381/jot.2011.10.1.a6).
- Zhu et al., "Parsing and reflective printing, bidirectionally", SLE 2016 — BiYacc, a printer
  that keeps layout and comments —
  [doi:10.1145/2997364.2997369](https://doi.org/10.1145/2997364.2997369).
- Zhu, Yang, Ko, Hu, "Retentive lenses", arXiv 2020 — a Retentiveness law: the source regions
  linked to unchanged parts of the view are kept —
  [arXiv:2001.02031](https://arxiv.org/abs/2001.02031).
- Rendel, Ostermann, "Invertible syntax descriptions", Haskell Symposium 2010 —
  [doi:10.1145/1863523.1863525](https://doi.org/10.1145/1863523.1863525) — and Matsuda, Wang,
  "FliPpr", ESOP 2013 — a parser derived from a pretty-printer —
  [doi:10.1007/978-3-642-37036-6_6](https://doi.org/10.1007/978-3-642-37036-6_6).
- Ko, Zan, Hu, "BiGUL", PEPM 2016 — putback-based BX, verified in Agda —
  [doi:10.1145/2847538.2847544](https://doi.org/10.1145/2847538.2847544).
- Cheney, Gibbons, McKinna, Stevens, "On principles of least change and least surprise for
  bidirectional transformations", JOT 2017 — least change depends on the metric and ties;
  least surprise is proposed instead —
  [doi:10.5381/jot.2017.16.1.a3](https://doi.org/10.5381/jot.2017.16.1.a3).

**Two lenses, not one.** Between the text and the concrete tree there is nothing for a lens to
do, because nodes hold their lines verbatim (`src/model.ts`, D2):

- `encode ∘ parse` is the identity on strings (`tests/roundtrip.test.ts`);
- `parse ∘ encode` is the identity on admissible trees.

So text and admissible trees are in bijection, and the laws hold trivially. The lens that matters
lies between the concrete tree and the *outline*: kinds, levels, content and children, without
markers, indentation, blank lines or numbers.

- `get` forgets the layout.
- `put` re-derives the layout for where each node now stands. That is `destinationIndent`,
  `destinationListStyle`, the gap rules in `spliceAtIndex` and the renumbering.

Read that way, the laws are properties we either have or do not have yet:

| Law | Here | In the suite |
| --- | --- | --- |
| GetPut (hippocraticness) | an operation that names the outline as it is writes nothing | stated in `moveSubtreesTo` ("a move that lands the run where it already was produces no edits at all"); not a property |
| PutGet (correctness) | the note holds the outline the operation named | not yet: properties 2 and 3 of [node-placement-grammar.md](node-placement-grammar.md). D1 to D8 all fail it |
| Retentiveness | a node the operation did not name keeps its lines verbatim | `tests/closure.test.ts` 5.2 |
| Edit-lens composition | composing surgeries equals composing operations | the `Surgery` docstring in `src/ops.ts`, checked against `tests/group-oracle.ts` |
| Quotient restoration | a move and its reverse restore the note up to layout, where nothing converted or absorbed | not yet. The parallel note's sweep restored 212,499 of 338,119 exactly |
| Least change | the chosen writing is the cheapest admissible one, and ties are ambiguities | the cost orders above |

The model's design already matches Boomerang's dictionary lenses: a node is a chunk, its id is
the key, and a move carries its text.

**What it would give us.** Names for the properties, and a checklist of which ones are missing.
GetPut and quotient restoration are each a short property over the existing generators. PutGet is
the parallel note's property 2. The lens languages themselves (Boomerang, BiYacc, BiGUL) are not
candidates: the byte-level half of our lens is concatenation, and the layout half is TypeScript
we already have.

**Cost.** Low. The missing laws become properties in spike 2.

### 4. Structure-editor calculi

**What it is.** Calculi for editors in which every edit state is meaningful. An ill-formed
placement is wrapped rather than rejected.

**References.**
- Teitelbaum, Reps, "The Cornell Program Synthesizer", CACM 1981 — templates with placeholders —
  [doi:10.1145/358746.358755](https://doi.org/10.1145/358746.358755).
- Omar, Voysey, Hilton, Aldrich, Hammer, "Hazelnut: a bidirectionally typed structure editor
  calculus", POPL 2017, mechanized in Agda. Its sensibility theorem says that every action on a
  well-typed expression yields a well-typed one. A term whose type is inconsistent with its place
  is wrapped in a non-empty hole —
  [doi:10.1145/3009837.3009900](https://doi.org/10.1145/3009837.3009900).
- Omar, Voysey, Chugh, Hammer, "Live functional programming with typed holes", POPL 2019 —
  [doi:10.1145/3290327](https://doi.org/10.1145/3290327).
- Moon, Blinn, Omar, "tylr", TyDe 2022 —
  [doi:10.1145/3546196.3550164](https://doi.org/10.1145/3546196.3550164) — and "Gradual structure
  editing with obligations", VL/HCC 2023 — ill-formed states carried as explicit obligations —
  [doi:10.1109/VL-HCC57772.2023.00016](https://doi.org/10.1109/VL-HCC57772.2023.00016).
- Zhao, Maroof, Dukkipati, Blinn, Pan, Omar, "Total type error localization and recovery with
  holes", POPL 2024 — marking, which is total and deterministic —
  [doi:10.1145/3632910](https://doi.org/10.1145/3632910).
- Adams et al., "Grove", POPL 2025 — concurrent edits, with relocation conflicts made explicit —
  [doi:10.1145/3704909](https://doi.org/10.1145/3704909).
- Prinz, Blanchette, Lampropoulos, "Pantograph", POPL 2025 —
  [doi:10.1145/3704864](https://doi.org/10.1145/3704864).
- Structured documents: Quint, Vatton, "Grif", 1986 —
  [Cambridge](https://www.cambridge.org/core/books/abs/text-processing-and-document-manipulation/grif-an-interactive-system-for-structured-document-manipulation/2CA23F241758B12074A55C73DE2365E7).
  Akpotsui, Quint, Roisin, "Type modelling for document transformation in structured editing
  systems", 1997 — dynamic transformations of a fragment moved or copied into a context whose
  structure differs — [doi:10.1016/S0895-7177(97)00021-6](https://doi.org/10.1016/S0895-7177(97)00021-6).
  Bonhomme, Roisin, "Interactively restructuring HTML documents", WWW5 1996 —
  [doi:10.1016/0169-7552(96)00042-6](https://doi.org/10.1016/0169-7552(96)00042-6).
- Industrial normalizers: Slate's `normalizeNode`, run to a fixpoint, with its documented risk of
  loops — [docs](https://docs.slatejs.org/concepts/11-normalizing) — and Lexical's node
  transforms — [docs](https://lexical.dev/docs/concepts/transforms).

**The analogue here.** Markdown has one hole we already write: a list item whose content is a
heading line. Under a list item a heading cannot stand, so it is written as `- ## H`. That line is
admissible where it lands, keeps the heading's mark, and records what to restore:

```
 a heading under x    as written, a hole    back where a heading can stand
┆- x                 ┆- x                  ┆## H
┆  ## H              ┆  - ## H
```

Hazelnut's approach suggests a law that the code does not have: a wrapping conversion is undone
where the wrapped kind is admissible again. That is exactly A5's missing way back, and it would
make the heading's round trip one of the reversible conversions. Where Markdown has no hole, the
conversion refuses, and the calculus explains why: a task cannot become a paragraph because a
paragraph has no place for a checkbox. An atom under a paragraph could be wrapped in a list item,
but an item with no text renders as a raw dash
([marker-without-trailing-space.md](marker-without-trailing-space.md)), so that wrapper is not a
clean hole.

Two more correspondences:

- Marking's determinism is the table's "one answer" column, and the keep-marks order is total on
  it.
- The gradual editor's obligations correspond to the drag's preview: a state that is not yet
  written and need not be admissible, with the release as the one point where it is written or
  refused.

Against the industrial normalizers, `N` is one pass, and it is idempotent by construction (below),
so a loop like the ones Slate warns about cannot occur.

**Cost.** None to adopt: this direction offers two design options, not a tool. The first is to
wrap instead of refuse, where Markdown has a wrapper. The second is to unwrap on return, stated as
a law and tested in spike 2.

### 5. Verified tree operations

**References.**
- Kleppmann, Mulligan, Gomes, Beresford, "A highly-available move operation for replicated trees",
  IEEE TPDS 2022. Proved in Isabelle/HOL: every node has at most one parent, there are no cycles,
  and applying operations commutes. A move that would make a node its own ancestor is skipped.
  Sibling order is an unverified extension —
  [doi:10.1109/TPDS.2021.3118603](https://doi.org/10.1109/TPDS.2021.3118603),
  [source](https://github.com/trvedata/move-op).
- Gomes, Kleppmann, Mulligan, Beresford, "Verifying strong eventual consistency in distributed
  systems", OOPSLA 2017 — [doi:10.1145/3133933](https://doi.org/10.1145/3133933).
- Kleppmann, "Moving elements in list CRDTs", PaPoC 2020. It states that no algorithm is known for
  moving a *range* of elements, and a run is a range —
  [doi:10.1145/3380787.3393677](https://doi.org/10.1145/3380787.3393677). The follow-up is Da,
  Kleppmann, "Extending JSON CRDTs with move operations", PaPoC 2024 —
  [doi:10.1145/3642976.3653030](https://doi.org/10.1145/3642976.3653030).
- Litt, Lim, Kleppmann, van Hardenberg, "Peritext", CSCW 2022. It covers inline formatting only;
  block structure is future work — [doi:10.1145/3555644](https://doi.org/10.1145/3555644).
- Verified round trips: Delaware et al., "Narcissus", ICFP 2019, derives encoders and decoders
  proven inverse in Coq — [doi:10.1145/3341686](https://doi.org/10.1145/3341686). Jourdan,
  Pottier, Leroy, "Validating LR(1) parsers", ESOP 2012 —
  [doi:10.1007/978-3-642-28869-2_20](https://doi.org/10.1007/978-3-642-28869-2_20).

We found no mechanized model of an outliner, of a Markdown block tree, or of a schema-constrained
document tree.

**What it would give us.** Little, for now. The move operation's cycle check is the one
`moveSubtreesTo` makes ("a run cannot land inside itself"). What that work proves is convergence
under concurrent moves, and our operations run on one writer, one at a time. What we need proved,
admissibility under a grammar, is outside its model. The encoder and decoder proofs cover a round
trip that ours already gets by construction. This work becomes relevant if structural edits ever
have to merge across devices, a sync conflict for instance, and then Grove (direction 4) is the
other reference.

**Cost.** High for a low payoff; not recommended.

### 6. Proof assistants and model finders

**A model in Lean 4** would state the grammar as a decidable predicate, or as an inductive family
so that inadmissible trees cannot be built. It would state the conversion as a total function
into `Option`, and the properties as theorems. A sketch, not checked by Lean:

```lean
inductive Kind where
  | heading (level : Nat) | para | item | atom
  deriving DecidableEq

inductive Node where
  | node (kind : Kind) (children : List Node)

/-- The three pair rules on adjacent siblings. -/
def pairOk : Kind → Kind → Bool
  | .para, .item => false
  | .heading a, .heading b => decide (b ≤ a)
  | .heading _, _ => false
  | _, _ => true

-- `adm` is one walk over pairs and parents, so it is decidable by construction.
-- The theorem worth proving is locality: a splice whose seams pass is admissible.
theorem splice_adm (t : Doc) (h : adm t) (m : Move) (hs : seamsOk t m) :
    adm (apply t m) := ...

-- The conversion table is finite, so "the keep-marks order never ties" is `by decide`.
theorem keepMarks_total : ∀ c ∈ contexts, (cheapest keepMarks c).length ≤ 1 := by decide
```

Plausible would give property testing of the model, and QuickChick is the Rocq counterpart.
Isabelle's Nitpick and Quickcheck (whose exhaustive mode is bounded enumeration) and Agda, where
Hazelnut is mechanized, are the alternatives.

**Lightweight tools.**

| Tool | What it would check here | Fit | Cost |
| --- | --- | --- | --- |
| Lean 4 ([Plausible](https://github.com/leanprover-community/plausible)), Rocq ([QuickChick](https://softwarefoundations.cis.upenn.edu/qc-current/index.html)), Isabelle ([Nitpick](https://doi.org/10.1007/978-3-642-14052-5_11), [Quickcheck](https://doi.org/10.1007/978-3-642-35308-6_10)), [Agda](https://agda.readthedocs.io) | the locality lemma for all sizes; `N` idempotent; no ties | low now | a second implementation, a toolchain in CI, and proofs about the model rather than `src/` |
| [Alloy 6](https://alloytools.org/alloy6.html) (Jackson, *Software Abstractions*, MIT Press 2012) | find two operations that disagree, or an operation that leaves an inadmissible tree, within a small scope; temporal operators for sequences | medium | a relational model kept in step with the code by hand |
| [TLA+](https://github.com/tlaplus/tlaplus), [Apalache](https://github.com/apalache-mc/apalache) | a state machine: the drag gesture in `src/plugin/drag-state.ts` rather than the grammar | low for the grammar | a second model |
| Z3 ([TACAS 2008](https://doi.org/10.1007/978-3-540-78800-3_24); [`z3-solver`](https://www.npmjs.com/package/z3-solver), WASM with TypeScript bindings) | minimal repair as MaxSAT, or a symbolic search for a counterexample | low | a solver in the test run, for a table of 860 rows |
| fast-check [`fc.commands`](https://fast-check.dev/docs/advanced/model-based-testing/) (Hughes, "Experiences with QuickCheck", 2016, [doi:10.1007/978-3-319-30936-1_9](https://doi.org/10.1007/978-3-319-30936-1_9)) | operation sequences against the outline as a model: PutGet at every step | high | the model is the outline plus the conversion table; spike 2 |
| Bounded-exhaustive enumeration in TypeScript (SmallCheck, [doi:10.1145/1411286.1411292](https://doi.org/10.1145/1411286.1411292); Feat, [doi:10.1145/2364506.2364515](https://doi.org/10.1145/2364506.2364515); Korat, [doi:10.1145/566172.566191](https://doi.org/10.1145/566172.566191)) | every property above, on the implementation itself, up to a size | high | hand-written: fast-check 4.10 has no exhaustive mode; the probes' enumerator is about seventy lines; spike 1 |
| Grammar-derived random generation (Boltzmann samplers, [doi:10.1017/S0963548304006315](https://doi.org/10.1017/S0963548304006315); [`fc.letrec`](https://fast-check.dev/docs/core-blocks/arbitraries/combiners/recursive-structure/); Lampropoulos, Paraskevopoulou, Pierce, POPL 2018, [doi:10.1145/3158133](https://doi.org/10.1145/3158133)) | the same properties past the enumerable sizes, with every production reachable | high | the generator written from the same productions; spike 1 |

**Cost against payoff.** The small scope is cheap to exhaust on the implementation itself:

- 2.1 million admissible forests up to seven nodes, written and parsed, take about 32 s;
- 1.47 million placements up to five nodes, each written seven ways, take about 110 s.

A model finder's advantage, searching a small scope thoroughly, is therefore available without a
second model to keep in step. A proof assistant's advantage is proving a property for every size.
By locality, most of that reduces to a finite table plus one lemma, and the lemma is a short
argument on paper. A proof assistant starts to pay when two things are true: the table has
settled, and a property has to hold for every size with no enumeration bound behind it. Neither
is true while the rules change with each operation that meets them.

### 7. Algebraic framing

- **Operations are partial maps** `Adm ⇀ Adm`. A refusal is where the map is undefined, and
  `tests/closure.test.ts` 5.4 checks that each refusal is typed. Closure is the statement that the
  map lands in `Adm`.
- **`N = parse ∘ encode` is idempotent**: `N ∘ N = parse ∘ (encode ∘ parse) ∘ encode = N`, since
  `encode ∘ parse` is the identity on strings. Its fixed points are exactly the admissible trees:
  `Adm = Fix(N)`. `finalize` is `N` after `normalizeBoundaries`, so every operation's result is a
  fixed point, and the closure property 5.1, which compares a result with its own re-parse, cannot
  fail. The parallel note makes the same observation from the code.
- **The conversion is an argmin** of a lexicographic cost over the admissible writings. The
  ambiguities are its ties, or the disagreements between orders. The table above is its graph for
  one alphabet.
- **Laws.**
  - A heading's level shift is an action of the integers, partial at `h1` and `h6`, and indent
    followed by outdent is the identity away from the bounds (5.3).
  - For content, indent followed by outdent restores the outline wherever the indent is accepted
    and nothing converts.
  - Outdent followed by indent is the identity only for a last child, under either reading of
    outdent. Direct outdenting hands the node its following siblings, and logical outdenting moves
    it past them (A8). The two readings change where the siblings go, not whether this law holds.
  - A move followed by the reverse move is the identity where nothing converted or absorbed. The
    parallel note measured how often something did.
  - A conversion followed by the move back is the identity where the way back converts in
    return. A paragraph indented under a paragraph becomes a list item and comes back a paragraph
    (5.3), because the attachment rule forces the list item back. A heading written as `- ## H`
    does not come back, because nothing unwraps it (A5); the hole reading of direction 4 would add
    that unwrap.

**Cost.** Nil: this is how to state the properties, and it costs nothing beyond them.

### 8. Outliner and Markdown prior art

We found no published formal model of an outliner, or of Markdown's block structure as a tree.
What exists:

- **CommonMark** ([0.31.2, "Appendix: A parsing strategy"](https://spec.commonmark.org/0.31.2/#appendix-a-parsing-strategy))
  parses blocks in two phases over a tree of open blocks, split into container and leaf blocks.
  Headings are leaf blocks: CommonMark has no sections. Our `Section` is a construction on top,
  as it is in djot.js, which wraps headings in `section` nodes, and in pandoc's `makeSections`
  over its flat `Header` blocks ([pandoc-types](https://github.com/jgm/pandoc-types)).
- **djot** ([syntax](https://github.com/jgm/djot);
  [Beyond Markdown](https://johnmacfarlane.net/beyond-markdown.html)): block elements cannot
  interrupt a paragraph, and a sublist needs a blank line before it. These are adjacency rules of
  the kind ours are, chosen so that the parse is predictable.
- **Org** ([syntax](https://orgmode.org/worg/org-syntax.html);
  [source](https://github.com/bzg/org-mode)). A heading holds a section and sub-headings, and
  greater elements contain elements. `org-toggle-heading` (`C-c *`) turns list items into
  headings and translates a checkbox into a TODO keyword: a conversion that keeps a mark by
  translating it, the precedent for a task that should not lose its checkbox. `org-toggle-item`
  (`C-c -`) turns headings into items. [org-mode-comparison.md](org-mode-comparison.md) records
  where we already align.
- **Logseq**'s `:editor/logical-outdenting?`
  ([outliner core](https://github.com/logseq/logseq/blob/master/deps/outliner/src/logseq/outliner/core.cljs))
  is the precedent for A8's setting.
- **OPML** ([2.0](http://opml.org/spec2.opml)) has one element kind, `outline`, so the placement
  question never arises.
- **Bike** ([documents](https://bikeguide.hogbaysoftware.com/using-bike/using-documents)) stores a
  restricted HTML nested list in which a heading is a row *type* on an ordinary row. That is the
  `- ## H` reading applied everywhere: the kind is an attribute of an item, never a position.
- **Workflowy, Dynalist and Roam** publish no formal model.
- An announced Lean implementation of CommonMark (`lean-markdown`, 2026) claims conformance and
  an HTML-safety proof. We could not confirm either claim, and neither concerns block trees or
  round trips.

For the placement question, the useful prior art is the conversions (Org, Grif and Thot) and the
reading of a heading as an item attribute (Bike), not a formalism.

## Cost against payoff

| Direction | What it would give us | Cost | Take up |
| --- | --- | --- | --- |
| 1. Formal language | an admissibility checker as the suite's oracle; generators that cover every production; incremental seam checks; Q34 as one pair rule | low | spike 1 |
| 2. Repair | the conversion as a computed table; the ambiguity list as the disagreements of plausible orders | low to medium | spike 1 |
| 3. Lens | names for the laws; GetPut, PutGet and quotient restoration as properties | low | spike 2 |
| 4. Structure editors | holes: wrap instead of refuse where Markdown has a wrapper; unwrap on return | none to adopt | spike 2, as a law |
| 5. Verified trees | a reference if structural edits ever merge concurrently | high | no |
| 6. Proof assistants, model finders | all-size proofs of what locality already reduces to a table | high | not now |
| 7. Algebra | the statement of the properties | nil | throughout |
| 8. Prior art | Org's mark-translating toggles; Bike's heading as an item attribute | nil | as design input |

## Recommendation

**Spike 1: the grammar as the suite's oracle.** TypeScript in `tests/`, no new dependency.

1. *A checker.* The pair, parent and column rules, as one walk. A test holds it equal to
   `parse ∘ write` over every forest up to four nodes: 22,260 forests, about half a second.
2. *A generator written as the grammar.* An enumerator, plus a fast-check arbitrary built from the
   same productions with `fc.letrec`. The alphabet widens to what `arbTree` and the parallel
   note's labelled generator carry: tasks, ordered and `*` markers, `h1` to `h6`, every atom kind,
   tight and loose gaps. A coverage test asserts that every local configuration the grammar admits
   is reached. That closes `arbTree`'s eight gaps by construction.
3. *The placement table.* The verdict of every writing in every local context, computed. The cost
   order is declared, keep-marks as the default, with a test that it leaves no tie. Beside it goes
   a snapshot of the answer per context, and a differential test that runs the real operations
   (`moveSubtreesTo`, `insertSubtrees`, `indent`, `outdent`) at one example of every context and
   compares them with the snapshot. A changed row is then a decision to review. The ambiguity list
   is regenerated from the disagreements between orders rather than hunted for.

The spike is done when the table reproduces the parallel note's context table, and D1 to D8 fail
as rows of the differential test on `main`. Rough cost: three to four days.

**Spike 2: the lens laws over sequences.** `fc.commands` over the outline as the model, with the
conversion table from spike 1 as the model's conversion. After every command:

- PutGet: the note's outline is the model's;
- GetPut: an operation that names the outline as it is writes nothing;
- Retentiveness: untouched nodes keep their lines;
- after a move and its reverse, the note equals the original up to layout wherever nothing
  converted, and exactly where a conversion left a hole.

This covers what spike 1 cannot, since spike 1 places one node once: the history-dependent
defects, and the reversibility classes the parallel note measured. Rough cost: two to three days
after spike 1.

**Not now: a proof assistant, Alloy, TLA+ or an SMT solver.** Each needs a second statement of the
rules kept in step with code whose rules still change with every operation that meets them. The
small scope they would search is already cheap to exhaust on the implementation itself. The first
theorem worth mechanizing later is the locality lemma, once the table from spike 1 has stopped
changing.

## Open

- **Whether locality survives the text layer.** The probes write a blank line after every node.
  In a tight note, a paragraph's continuation lines and the seams between blocks depend on the
  text around them ([seams-across-a-re-indent.md](seams-across-a-re-indent.md),
  [paste-across-encoding-regimes.md](paste-across-encoding-regimes.md)). Whether a verdict is still
  a function of the kind context there is not measured. Spike 1's widened alphabet, which includes
  tight gaps, is where it would show.
- **Q34** decides whether the attachment rule stays as one of the three pair rules. The absorbing
  answer in the paragraph family, and D5, D6 and A9, depend on it.
- **Choosing the cost order** is [node-placement-grammar.md](node-placement-grammar.md)'s
  recommendation to take up. The table records whichever order is declared; it does not decide it.
- **No new defect** turned up: the probes did not run the operations. The seven-check list and its
  mapping of D1 to D8 are derived from the grammar's shape and the parallel note's descriptions,
  not measured against the code.
