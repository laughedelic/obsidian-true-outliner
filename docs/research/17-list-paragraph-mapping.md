# What is a list's parent? The paragraph attachment rule, and whether to keep it

**Status: OPEN.** Nothing here is decided. This document records an exploration far enough that
picking it up later needs no re-discovery: what the rule is, what it costs, the four candidate
readings, what other formats and tools do, and the two measurements that already rule one
candidate out.

Registered in the decision log as [Q34](04-open-questions.md). The change that prompted it,
`reorder-absorption`, deliberately does not answer it — it refuses the one gesture the current
rule cannot encode, and says in its own comments that it expects to be deleted by whatever this
question settles.

Cross-references: [04-open-questions.md](04-open-questions.md) Q2 follow-ups 1 and 3 (the rule's
original decision and the mapping-core verdict on it), and
[05-org-mode-comparison.md](05-org-mode-comparison.md).

`16-native-list-decoration.md` arrives with the `lists-on-the-outline-grid` change and is not on
this branch. Its geometry measurements are what rule out candidate B, so §6 reproduces the two
that carry the argument — the indent-span mechanism and the bullet-column table — rather than
citing a document a reader here cannot open. Every other reference to it is context, not
evidence.

---

## 1. The question

> A markdown document contains a paragraph and then a list. Is the list the paragraph's child,
> or its sibling?

Markdown itself does not answer. Every parser we checked says sibling — but "sibling" leaves a
paragraph unable to have children at all, and giving paragraphs children is what lets a flat
prose note be outlined. The project answered "child, by adjacency" in Q2 follow-up 1, marked
provisional, and the mapping-core work confirmed it held under property testing.

What reopened it is a class of defect that the answer causes rather than merely fails to
prevent.

## 2. The rule today

`listAttachesTo` (src/rules.ts) returns true when the preceding sibling is a paragraph, and
`parse` consults it only when the list stack is empty — among the children of the root, or of a
heading. Among a list item's own children the enclosing item owns the list stack, so a paragraph
nested inside a list never adopts a following list. The rule's reach is section level and only
section level; the mapping-core verdict already recorded that scope refinement.

Three properties of the rule matter for everything below.

**It is unconditional.** Every list that follows a paragraph at section level is adopted. There
is no way to write "a list that is the paragraph's sibling" — the mapping-core verdict states
this outright, calling the shape unrepresentable and "the rule working as designed".

**Indentation carries nothing at that boundary.** Measured, all three of these parse to the same
tree, a list item that is `P`'s child:

| source | parsed as |
| --- | --- |
| `P` / blank / `- a` | `- a` is `P`'s child |
| `P` / blank / `  - a` | `- a` is `P`'s child |
| `P` / blank / `    - a` | `- a` is `P`'s child |

**What the encoder emits is flush.** Indenting a paragraph `Q` under a paragraph `P` produces
`P` / blank / `- Q` — no indentation at all. So the nesting the outline displays is recorded
nowhere in the file: open the note without the plugin and there is nothing to see. The hierarchy
exists only in the plugin's reading of adjacency.

A fourth property is worth stating because it is the one users notice: **what precedes a list
decides its depth.** `P` / blank / fenced code / blank / `- a` puts `- a` at the top level,
because an atom breaks the attachment. The same list, with the fence removed, is a level deeper.

## 3. What the rule costs

### 3.1 It shapes a third of real content

Measured over `tests/corpus/*.md` plus `test-vault/**/*.md` — 25 files, 149 list items:

| where a list item's parent is | count |
| --- | --- |
| a paragraph (the attachment rule fired) | **45**, across 12 of 25 files |
| another list item | 69 |
| a heading | 27 |
| the document root | 8 |

All 45 are flush. Not one file in the corpus uses indentation to express the relationship,
because indentation cannot express it.

### 3.2 It puts identical-looking lists at different depths

The crispest shape, and one the corpus contains in spirit:

```
## packing

- shirts

clothes notes.

- socks
```

`- shirts` is the heading's child at depth 1. `- socks` is the paragraph's child at depth 2. Two
flush lists, one section, different depths, decided entirely by what happens to sit above each.

### 3.3 It makes one arrangement permanently unsayable, and reordering says it anyway

A reorder swaps two siblings and re-encodes nothing — deliberately: "node types and encodings are
unchanged by reordering". When the swap puts a section-level list item directly after a paragraph
sibling, the emitted markdown re-parses with that item as the paragraph's child.

Measured on `arbLabeledDoc()`, seed 42, 3000 runs per operation:

| | accepted | subject's depth wrong | any node's depth wrong |
| --- | --- | --- | --- |
| move down | 1285 | 37 | 37 |
| move up | 1239 | **0** | **24** |

Move up violates it at the same rate and scores zero on a subject-only measurement, because the
node absorbed is the one the caller did not select:

```
- A                     P
                  →
P  (moved up)           - A     ← absorbed, depth 0 → 1
```

The same happens to a bystander list when an atom moves down between a paragraph and a list.
This is the third defect in the class (the first two are recorded at Q33), and the first where
the absorbed node is not the operand.

A predicate over the operand — *would either relocated root end up as a section-level list item
whose new preceding sibling is a paragraph?* — fires 37 times against 37 violations and 24
against 24, with zero false positives and zero false negatives over roughly 2500 accepted
reorders. It is exact on this generator, which is what makes refusing a viable stopgap.

### 3.4 The spike: what happens if a paragraph simply does not adopt

`listAttachesTo` forced to `false`, full suite run, then reverted. For flush lists — which is
every list in the corpus and every list the generator produces — this is exactly what an
indentation rule or an org-style rule would do, so it stands in for both.

- **27 of 825 tests fail (3.3%)**, across 14 files. They triage into three groups, none of which
  says the reading cannot work:
  - `arbTree()` builds paragraph-with-flush-children trees the encoder can no longer spell — the
    generator encodes today's rule in its builder, as its own comment says.
  - `destinationIndent` must emit indentation under a paragraph parent. The indent∘outdent
    inverse law and both depth-contract indent rows catch this; the crude spike does not
    implement it, which is why they fail.
  - Spot checks that pin the old rule by name (`03-mixed: attachment rule and heading scoping`).
- **Reorder absorption drops to zero.** Move down 1444 accepted, 0 depth violations; move up 1407
  accepted, 0. Not by a check — by construction, since a reorder never changes indentation and
  therefore can never change anyone's depth.
- **Acceptance rises**: 1285 → 1444 and 1239 → 1407. The moves that were structurally impossible
  simply work.

## 4. The four candidate readings

| | list after a paragraph | Tab under a paragraph | the reorder defect |
| --- | --- | --- | --- |
| **A. Adjacency** (today) | always its child; sibling unsayable | works: subject becomes a flush bullet | present, permanently; every relocating op needs a check |
| **B. Indentation decides** | child iff indented past it | works: indented bullet | gone — **but see §6, this is ruled out** |
| **C. Paragraphs are leaves** | always a sibling | rejected, as for any first child | gone by construction |
| **D. Leaves + Tab promotes the parent** | always a sibling | works: both nodes become list items | gone by construction |

**A** is the status quo. Its cost is §3 in full: an unsayable arrangement, a depth that depends
on what precedes, and a hierarchy the file does not record.

**B** would read `P` / `  - a` as a child and `P` / `- a` as siblings, making both arrangements
sayable and giving the user control over which. §6 rules it out on measurement.

**C** is org-mode's model (§5). A paragraph cannot have children, so `indent` on a node whose
previous sibling is a paragraph must be refused. Worth noting how conventional that refusal is:
in Workflowy, Logseq and Roam, Tab on the first child of a parent does nothing, because there is
no preceding sibling to nest under. Under C, the first bullet after prose is exactly that case.
What A does there — nesting it under a node of a different kind that merely happens to precede
it — is the unusual behaviour, not the refusal.

The cost of C is real: a flat prose note cannot be outlined at all, which is a direct hit on the
"flat-markdown notes keep full outliner features through the mapping" promise. Q2's rejected
alternative (a) is C, and this is why it was rejected. The new information since is §3.3 — the
promise is being kept by a rule that makes one arrangement unsayable and silently corrupts it.

**D** keeps the promise without inventing syntax. Tab on `beta.` under `alpha.` yields:

```
alpha.                    - alpha.
              Tab   →       - beta.
beta.
```

Ordinary list nesting, correct in every renderer, indentable at a tab so it stays quantized
(§6), and no adjacency rule anywhere. Its price is rewriting `alpha.`, which the caller did not
select — the same objection raised against re-encoding in `reorder-absorption`, with the
difference that it rewrites the node being nested *under*, which is part of what the gesture
asked for. It is also not byte-reversible: outdenting `beta` back does not turn `alpha.` into a
paragraph again, because nothing records that it was one. This is Logseq's model reached by an
explicit gesture rather than imposed on the whole file.

## 5. What other formats and tools do

The short answer: **nothing ties a list to the paragraph before it.** Where a format does want a
following block to belong to the previous one, it spends a visible marker.

- **CommonMark** establishes no relation. Its list rules govern marker indentation (up to three
  spaces, discarded) and interruption; nothing makes a preceding paragraph a parent. A bullet
  list may interrupt a paragraph, and an ordered one only if it starts at 1 — but the spec notes
  this "differs from most current implementations", so the tight form is the less portable one.
  Rendering is identical with or without the blank line; looseness is decided by blanks between
  and inside items, never by the blank before the list.
- **Pandoc**'s AST is `Para` followed by `BulletList` — siblings.
- **Org-mode** forbids it structurally. A paragraph is an object container; a plain list is a
  greater element; an element cannot be a child of an object container. A list after a paragraph
  is its sibling in the section, full stop. This is candidate C, in the closest living reference
  outliner.
- **Notion** has genuine block children and loses them on export: markdown has no equivalent, so
  a paragraph's children come out as more paragraphs at the same indentation and the structural
  relationship is gone.
- **AsciiDoc** requires an explicit `+` continuation line to attach a block to a list item.
- **reStructuredText** is the one format where bare indentation after a paragraph means
  something, and what it means is *block quote*, not child. RST then needs a no-blank-line rule
  to distinguish a definition list from one.
- **Markdown's own definition lists** (PHP Markdown Extra, kramdown, pandoc) require the `:`
  marker.
- **Logseq** deletes the problem: every block is a bullet, markers stripped, indentation is the
  hierarchy — the model Q1 rejected as "forced into bullets".
- **Prettier** and other formatters normalize list indentation, and Prettier is openly unstable
  about it. Any convention we place on leading whitespace is at the mercy of tools that reformat.

One more datum, on the shape of the ideal rather than the actual. MacFarlane, designing djot
after CommonMark, removed indented code blocks precisely because "most of the complexity in the
rules for list items is motivated by the need to deal with indented code blocks", and removing
them "frees up indentation to be used more flexibly to indicate list nesting". Indentation *is*
the natural structural channel; markdown has already spent it. His prescription for the
paragraph boundary is the opposite of using tightness as a signal: "We should require a blank
line between paragraph text and a list. Always."

Sources: [CommonMark lists](https://spec.commonmark.org/0.31.2/#lists),
[Beyond Markdown](https://johnmacfarlane.net/beyond-markdown.html),
[Org Element API](https://orgmode.org/worg/dev/org-element-api.html),
[Notion export quirks](https://mdstill.com/blog/notion-markdown-export-quirks),
[AsciiDoc continuation](https://docs.asciidoctor.org/asciidoc/latest/lists/continuation/),
[reStructuredText spec](https://docutils.sourceforge.io/docs/ref/rst/restructuredtext.html),
[Prettier #16230](https://github.com/prettier/prettier/issues/16230).

## 6. Why candidate B is ruled out

Two measurements, from opposite directions, and the gap between them has no room in it.

**From markdown's side, only 1–3 columns are available.** A block indented four or more columns
after a blank line is an indented code block. Confirmed by hand in Obsidian: a list indented with
a single tab renders as a code block in the preview; a list indented with two spaces renders as a
normal list, indistinguishable from flush in the preview and visibly indented in the editor.

**From Obsidian's side, only 4 columns and tabs are resolved.** The mechanism, measured against a
running Obsidian 1.13.4 for the `lists-on-the-outline-grid` change and reproduced here: a view
plugin walks each line's leading whitespace, a tab emits one `.cm-indent`, exactly four spaces
emit one `.cm-indent`, and a shorter run emits `.cm-indent-spacing` and then advances one
character at a time. The quantum is hardcoded at four and does not follow the vault's Tab size.
The resulting bullet columns, relative to `.cm-content`, with indentation guides on:

| source indentation | level 1 | 2 | 3 | 4 |
| --- | --- | --- | --- | --- |
| tab | 12 | 48 | 84 | 120 |
| 4 spaces | 12 | 48 | 84 | 120 |
| 2 spaces | 12 | **20.38** | 48 | **56.38** |

So the widths markdown leaves free under a paragraph are exactly the widths Obsidian's editor
refuses to resolve, and the width Obsidian resolves is a code block in markdown. An
indentation-encoded nesting would be **invisible in reading mode and misaligned in editing
mode** — the residual the `lists-on-the-outline-grid` research already records and cannot
fix without a normalizer.

### 6.1 The same constraint, on our own output

The quantization boundary is not only B's problem; it is a standing tension between correct
markdown and Obsidian's editor. A bullet's content column is 2 and an ordered marker's is 3, so
*minimal correct nesting* is unquantized by construction.

Measured over documents whose list indentation is already all tabs-or-4-space-groups, seed 42,
3000 runs, counting operations that leave such a document non-quantized:

| fallback unit | indent | outdent | move up | move down |
| --- | --- | --- | --- | --- |
| tab | 3 / 29 | 0 / 35 | 0 / 29 | 0 / 28 |
| 4 spaces | 3 / 29 | 0 / 35 | 0 / 29 | 0 / 28 |
| **2 spaces** | **18 / 29** | 0 / 35 | 0 / 29 | 0 / 28 |

The indent cases are minimal nesting doing its job: indenting `L2` under `L1` shifts its child to
`  1. L3`, which is correct and unquantized. The clean-document sample is small (29–35 of 3000)
precisely because the generator nests at content columns, which is itself the finding.

Two carry-forwards, both independent of this question:

- The spec's **two-space default indent fallback** sits on the wrong side of the quantum. That is
  a one-line policy question worth revisiting with the normalizer.
- The corpus already contains the mixed shape: `"  \t- grandchild1"` in
  `test-vault/tab indent merge bug repro.md`, plus `"  - Mixed Doc"` and `"  - USB-C"` in
  `tests/corpus/03-mixed.md`. Five lines in two of 25 files.

## 7. Interaction with `lists-on-the-outline-grid`

That change pushes `--to-decor-unit` into Obsidian's `--list-indent` and puts a list marker on
its own depth column, so every kind's marker centre sits at `depth × unit`. Three consequences
for this question:

1. **Aligned markers become the grid's statement that two nodes are siblings.** Under readings C
   and D, a flush list after a paragraph would render with its bullet on the paragraph's column.
   That is not an anomaly to correct — it is what siblinghood means once kind no longer affects
   x-position.
2. **Special extra indentation for top-level list items would be a regression.** It would put
   kind back into the x-position, which is the exact defect the grid change exists to remove.
3. **Today's rule masks the question.** Because a list after a paragraph is currently a child, it
   renders one unit deeper and coincidentally matches the intuition that lists sit right of
   prose. Changing the reading makes that alignment literal, and the grid is what makes it
   legible rather than strange.

**Sequencing: the grid change lands first.** Its verification gate covers tab / four-space /
two-space, ordered, task and wrapping fixtures, and a mapping change moves depths in exactly the
mixed documents those fixtures use. Doing the mapping first invalidates the fixtures mid-flight;
doing it after gives the new depths a settled reference to be judged against.

## 8. What is decided, and what is not

**Decided:** a reorder refuses the arrangement it cannot encode (`reorder-absorption`). That
change touches no mapping rule and no encoding path. It is written to be deleted: under readings
C and D its predicate never fires.

**Not decided:** the reading. Nothing here commits the project to A, C or D. B is ruled out on
§6, and should not be reopened without new information about Obsidian's indent quantization.

## 9. How to pick this up

Everything below is reproducible from this branch.

- **The spike.** Force `listAttachesTo` to `false`, run `npm test`, revert. Expect ~27 failures
  in the three groups of §3.4. For a truer C or D, also make `destinationIndent` emit
  indentation under a paragraph parent, which is what the inverse-law and depth-contract indent
  failures are pointing at.
- **The measurements.** All use `arbLabeledDoc()` from `tests/group-oracle.ts` at seed 42 and
  3000 runs, with depth read through `forEachNodeWithLine` and subjects tracked by their `L<n>`
  labels — the technique Q33 records. The absorption predicate, the quantization predicate
  (a tab, or exactly four spaces, repeated) and the lazy-continuation predicate are each a dozen
  lines against those helpers.
- **The open sub-questions**, in the order they would need answering:
  1. C or D — does a flat prose note need to be outlinable at all, and is rewriting the parent
     an acceptable price for it?
  2. How often, in real editing rather than in the generator, is Tab pressed on a node whose
     previous sibling is a paragraph? Measured at 4% of accepted indents on the generator and 13%
     of non-heading nodes in the corpus, but both understate it under a changed reading, where
     every paragraph-owned list contributes its first item to that count.
  3. Does Obsidian's own list editing preserve whatever indentation we emit, under Tab, Enter and
     its reindent behaviours? Only relevant to B, so currently moot.
  4. What happens to the 45 paragraph-owned list items in the corpus — is a flatter outline of
     existing notes better or worse? No file changes either way; this is a judgement to make by
     looking, in a real vault, after the grid change lands.
