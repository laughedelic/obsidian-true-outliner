# Placement grammar, enumerated

The probes behind the figures in
[`../../placement-grammar-formalization.md`](../../placement-grammar-formalization.md). They read
the grammar at the level of node kinds — `h1` to `h3`, a paragraph `P`, a list item `I`, a list
item carrying a `##` run `I#`, a code block `C`, a quote `Q`, and `h4` as one more way `repair`
writes a moved node — and write each forest with one canonical writer: `-` bullets, one blank
line after every node, children of a list item two columns in. Tasks, ordered and `*` markers,
`h5` and `h6`, tables, callouts and tight lists are outside that alphabet.

To run one, copy the four files beside each other with a `.ts` extension, in this directory so
the relative imports resolve, and run it from the repository root:

```bash
for f in enumerate grammar language repair; do cp $f.ts.txt $f.ts; done
npx tsx docs/research/prototypes/placement-grammar-formalization/enumerate.ts 5
npx tsx docs/research/prototypes/placement-grammar-formalization/language.ts 7 5000
npx tsx docs/research/prototypes/placement-grammar-formalization/repair.ts 4
rm docs/research/prototypes/placement-grammar-formalization/*.ts
```

- `enumerate.ts.txt [maxN]` — every ordered forest up to `maxN` nodes over the alphabet (atoms as
  leaves), each written, parsed back and compared by shape with the stated grammar's verdict,
  once without and once with the opening-margin rule. For the forests that break exactly one
  rule, it records what the re-parse did to each node: kept, joined a sibling on its left,
  lifted to an ancestor's scope, relabelled, or merged.
- `grammar.ts.txt` — the grammar as a generator: one function per nonterminal, from a size to the
  forests of exactly that size it derives, with the sibling automaton's state and the column as
  parameters. Also the writer and the shape reader the other probes share.
- `language.ts.txt [maxN] [samples]` — counts the admissible forests per size straight from the
  generator and checks each one round-trips; then lists the local configurations (parent,
  preceding sibling, node, over kind classes, plus the heading-level relations) the grammar
  admits and those `arbTree` reaches in `samples` draws at seed 42.
- `repair.ts.txt [maxN]` — every place in every admissible forest up to `maxN` nodes, every moved
  kind, every writing of a single moved node: clean, absorbing or misplaced. Then, per local
  context (parent, preceding sibling, following sibling, moved kind), whether the verdict varies
  across instances, and the answer four lexicographic cost orders choose, with their ties and
  disagreements.

Figures at the sizes the note quotes: `enumerate.ts 5` takes about 14 s, `language.ts 7 5000`
about 35 s, `repair.ts 4` about 11 s and `repair.ts 5` about 110 s.
