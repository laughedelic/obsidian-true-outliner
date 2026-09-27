# The editing surface, and the research around it

This note looks at the whole of what the plugin lets a reader do to a note, not one part of it:
typing and the enforcement behind it, the keyboard grammar, selection, the caret, provisional
positions, paste, drag and drop, folding, zoom, outline mode, search, the backlinks footer, undo,
and what happens when something other than the plugin writes the note. For each part it asks which
existing research and which existing systems have met the same problem, and what they would give
us: a law to state, a measurement to take, a design to borrow, or a decision to revisit.

It builds on three notes and does not repeat them:
[placement-grammar-formalization.md](placement-grammar-formalization.md) (the placement grammar as
a formal language, repair, lenses and structure-editor calculi),
[node-placement-grammar.md](node-placement-grammar.md) (the grammar, the operations' defects D1 to
D8 and ambiguous cases A1 to A10; on `chore/node-placement-grammar` until it lands) and
[created-seam-detection.md](created-seam-detection.md) with
[lazy-continuation-at-seams.md](lazy-continuation-at-seams.md) (the blank-line problem #267
worked through; on `fix/created-seams-are-separated` until it lands).
[outliner-landscape.md](outliner-landscape.md) and [org-mode-comparison.md](org-mode-comparison.md)
already cover the modern outliners and org-mode, and are cited rather than repeated.

It rests on three measurements, all kept in
[prototypes/editing-surface-landscape/](prototypes/editing-surface-landscape/): the issue tracker
classified by where each defect lives, the chains in which one fix found the next issue, and the
keyboard grammar run exhaustively over small notes. Nothing in the current design is treated as
fixed; the section on design levers names the choices whose revision would remove whole families of
defects.

Every reference was checked against Crossref's record for its DOI, or against the project's own
page, documentation or repository. What a paper shows is stated as far as its abstract, its
publisher's page or its well-known result states it; nothing below rests on a detail we could not
check.

## The surface as a stack

Every surface of the plugin reads or writes one of five representations, and every gesture is a
path through them:

```
 interaction   keys, pointer, clipboard; caret, selection, drag state, places, history
     |             keymap.ts, grammar.ts (planKey), drag-state.ts, caret-policy.ts,
     |             provisional-cleanup.ts, history-caret.ts, select-*.ts
     v
 views         outline mode, fold, zoom, the footer's projection, the drag preview
     |             decorate.ts, fold-*.ts, zoom*.ts, project.ts, lineage.ts, drag-preview.ts
     v
 outline       kinds, levels, content, parent and order: no markers, indentation or gaps
     |             ops.ts (surgeries), rules.ts, operand.ts, escalate.ts, enforce.ts
     v
 tree          nodes that hold their own lines verbatim, blank lines as a node's trailing gap
     |             model.ts, reencode.ts, finalize in ops.ts
     v
 text          the note: CodeMirror's document, its history, the file on disk
                   parse.ts, encode.ts, transaction-filter.ts, dispatch.ts
```

Four paths cover most of what the plugin does:

- **A structural key**, Tab say, goes down the stack. `planKey` resolves the operand from the
  selection, asks the zoom whether the result would leave its scope and the fold whether the
  node's children are hidden, runs the operation on the outline, writes the tree, lets `finalize`
  re-parse it, narrows the text change to a minimal change set, and dispatches one transaction
  carrying the caret `caret-policy.ts` chose.
- **Typing** goes up the stack. The transaction filter classifies each change. A change inside one
  node passes; a change across nodes is read as an outline operation — escalated to whole
  subtrees, merged, spliced — or vetoed.
- **A drag** runs the down path without committing it on every pointer move, to draw the preview,
  and once more on release.
- **Undo, sync and other writers** bypass the stack. History replays text with `filter: false`
  ([open-questions.md](open-questions.md) Q29). A sync or another pane arrives as a text change
  nobody planned. Obsidian's own list handling appends edits to ours in the same transaction
  (#192, #252, #260). Everything above the text — caret, places, fold, zoom — is re-derived
  afterwards.

## What the plugin guarantees, stated exactly

`parse` accepts every string, and `encode ∘ parse` is the identity, so every text is exactly one
tree the plugin can read. No edit can leave the note unreadable to our parser; "structural
integrity" in the README cannot mean well-formedness in that sense. What an operation, a paste, a
drag or the enforcement layer actually guarantees is narrower and more useful: **the note
afterwards holds the tree the gesture named.**

- A Tab names "this node, as the last child of its previous sibling".
- A drop names a parent and an index, and its preview draws the tree it names.
- A deletion across nodes names "these nodes, with their subtrees".
- A keystroke inside a node names "this content, in this node".

Enforcement exists because a raw text edit can name one tree and produce another: deleting a
parent's line re-parents its children under whatever precedes them, which is a tree, and the wrong
one.

The same guarantee has a name in each of three literatures:

- In bidirectional transformations it is **PutGet**: reading back what was written gives the
  outline the operation wrote. The drag's "preview equals release" property is PutGet for the drop
  ([placement-grammar-formalization.md](placement-grammar-formalization.md), direction 3).
- In collaborative editing it is **intention preservation**: an operation's effect is the effect
  it had on the state it was issued against (Sun, Jia, Zhang, Yang, Chen, "Achieving convergence,
  causality preservation, and intention preservation in real-time cooperative editing systems",
  TOCHI 1998 — [doi:10.1145/274444.274447](https://doi.org/10.1145/274444.274447)).
- In interaction design it is the **gulf of execution** closed by **feedforward**: the preview
  shows the outcome of the gesture before it is committed (Vermeulen, Luyten, van den Hoven,
  Coninx, CHI 2013 — [doi:10.1145/2470654.2466255](https://doi.org/10.1145/2470654.2466255)).

Two qualifications follow from the rest of this note. A gesture is ambiguous when it names more
than one tree, and refused when the tree it names has no writing; both are properties of the
gesture's vocabulary, not of the note. And "the note holds the tree" is judged by our reader, while
the note is also read by CommonMark, by Obsidian's reading mode and by Live Preview, which read some
lines differently from us and from each other (#267). The guarantee the reader of the note sees is
"every reader shows the tree the gesture named", and that is the harder one.

## Where the difficulty lives

### The tracker, by layer

All 75 issues in the repository on 2026-09-27, classified by the layer of the stack where each
defect lives, read from its title and body (the `area/` labels name the code a fix touches, a
different question). The classification is `issue-layers.tsv` in the prototypes directory.

| Layer | Issues | Bugs | Open | Open bugs |
| --- | --- | --- | --- | --- |
| text: blank lines, columns, numbering, how a line is read | 29 | 28 | 17 | 16 |
| interaction: caret, places, selection, undo, gestures | 18 | 14 | 11 | 7 |
| views: rendering, footer, zoom, search | 13 | 7 | 11 | 5 |
| enforcement: how a text edit is read | 3 | 3 | 1 | 1 |
| outline: where a node lands, what it becomes | 3 | 2 | 3 | 2 |
| tooling, tests, docs | 9 | 3 | 7 | 1 |

Half of the bugs are about the text layer: not what the outline should be, but how a given outline
is written and read. The outline layer holds three filed issues and the eight defects
[node-placement-grammar.md](node-placement-grammar.md) proposes to file. The outline layer is where
the formal work so far has gone; the text layer is where the bugs are.

### How issues arrive

The tracker replaced the parking lots on 2026-09-16; issues #115 to #157 are that migration.
From 2026-09-19 to 2026-09-27, 50 issues were filed, 34 of them bugs, and 19 of those 34 record in
their body that they were found while working on something else: a review, a manual pass or a
measurement of another fix. 27 of all 75 issues name the work that found them, and the names form
chains:

| Family | Chain |
| --- | --- |
| seams | #122 (paste lands at the caret's level) found #158. #196 (a seam judged on the kind the re-parse reads) found #197, #198, #199. #210 (closes #158) found #213, #214. #246 (closes #197) found #255. #264 (closes #198)'s manual pass found #271, whose fix #267 took six design rounds and found #272. |
| numbering and units | #226 (a paste written in the note's unit, closes #216) found #227, #228, #230. #243 (closes #227) found #244. #256 (closes #252, #259) found #262. #269 (closes #260) found #275. |
| places and undo | #129 found #142; #132 found #152; #245 (closes #248) found #250; #269 found #275. |
| how a line is read | #117's manual pass found #136, #137, #138, #140; #229, #261 and #262 followed from #210 and #256. |

The seam family saw six fixes in eleven days — #122, #196, #210, #246, #264, #267 — and each
found at least one new issue in the same family. Each fix was correct for the shapes it was written
against; each review or manual pass found the next shape.

### Four boundaries between models

The chains sit where two models of the same note meet, and each fix moves one model closer to the
other for the shapes seen so far:

| Boundary | Families (issues) | What the research calls it |
| --- | --- | --- |
| our reader and the other readers: CommonMark, reading mode, Live Preview | how a line is read: #136, #137, #138, #213, #229, #261, #262, and #271 on the writing side | a parser differential; the remedy is a reference reader and output every reader agrees on |
| the outline and its layout: blank lines, list looseness, columns, tab units, ordinals, block ids | seams: #197, #198, #255, #271, #272, #230; columns: #117, #136, #154, #158, #215, #216, #244; numbering: #120, #159, #227, #228; ids: #207 | the complement of a lens, and the alignment problem; trivia ownership in lossless syntax trees |
| our plan and Obsidian's or CodeMirror's own edits in the same transaction or key | #115, #155, #192, #252, #259, #260, #263 | a second writer on one buffer: concurrent editing and intention preservation |
| interaction state and CodeMirror's history | undo grouping: #250, #275; the redo caret (Q21, Q29); places: #119, #130, #142, #152, #153, #248, #249, #253, #254, #257 | undo models; state kept outside the document |

The outline itself is the one model with a single owner, a written grammar and measured
properties. The other four are each shared with something the plugin does not control, and none
has a written statement of what the two sides must agree on. That, more than any single rule, is
why their fixes keep finding new cases.

### What #267 found

#267 set out to separate every seam an operation creates, so that a pasted quote no longer
swallows the paragraph written under it in reading mode. Its record,
[created-seam-detection.md](created-seam-detection.md), tried six ways of deciding which seams an
operation created: a table by kind, pairs of node ids, ids with lineage, a line diff of the text, a
table per operation, and the "edit site" judged on each block's outline. Each met cases the one
before it had not. A step-back review found two questions under one word:

- **Q-a, may this seam be rewritten?** Fidelity to what the author wrote. It needs the note as it
  was before the operation.
- **Q-b, what does a blank line do here?** Structure: lists turn loose, a lone `^id` changes the
  block it attaches to, a block four columns in becomes indented code.

Its oracle then measured the operations as they are, over 400 generated notes: of 28,591 seams at
an operation's edit site outside a list, 9,820 were written flush and 4,146 of those are continued
by some reader; 297 lists changed between tight and loose; 145 block ids changed host. Separating
every flush seam at the edit site adds 9,809 lines, 5,663 of them where no reader continues.

The review's own diagnosis: every design had been checked only against cases built by hand, and
the oracle is what could end the rounds. Both halves of the problem have standard names, taken up
below: Q-a is the **alignment** problem of bidirectional transformations, and Q-b is the
**serializer's join rule** every Markdown writer has to state.

### The keyboard grammar, measured

`keys.ts` runs the keyboard planner, `planKey`, for every structural key on every node of every
admissible forest of up to four nodes (list items also as tasks), and classifies what the key did
to that node from the re-parse. 144,976 runs took 8 s.

| Key | Distinct effects | What decides which one |
| --- | --- | --- |
| Enter at a node's end | 5 | the node's kind; whether it has children |
| Enter mid-text | 7 | the node's kind; whether it has children; for a heading, always a child paragraph |
| Shift+Enter | 3 | a heading drafts a sibling heading; content continues; atoms are left to the editor |
| Tab | 10 | the regime (headings change level, content re-parents); the previous sibling's kind; the column rule |
| Shift+Tab | 11 | the regime; whether the parent is a paragraph; the h1 bound |
| Move up or down | 5 | whether the neighbour is a same-level section; whether the attachment rule would re-nest |

Across the four structural keys, 49,734 of 72,488 runs were refused, most of them for having no
neighbour to act on. 807 move refusals are the attachment rule's ("Markdown would nest that under
the paragraph instead").

The probe found no defect that is not already recorded. Its surprising effects are D3 (an indent
under a paragraph inside a list item accepted with no change, 54 cases for items and tasks, or a
paragraph landing under the enclosing item instead, 24), D6 (a list item indented after a paragraph
child becomes a paragraph, 24, and a task is refused there, 24), D7 (an atom outdented from a
paragraph's list lands two levels out, 48), the column rule of Q38 (a quote indented to column 4
becomes a paragraph, 26), and A9/#206 (a move that takes an atom from between a paragraph and a
list, or puts a paragraph in front of a list, lets the list attach, 80). Each arrives through
the keys as well as through the drop. Read as a task-action grammar (Payne and Green, below), the
two regimes are the grammar's largest cost: Tab and Shift+Tab have one family of effects for
headings and another for everything else.

## The landscape, frame by frame

Each frame below names a body of work, says what it covers of this surface, lists the key
references and says what it would give us. The frames overlap on purpose: most surfaces sit in
two or three.

### 1. What a note is: text as a structure

The plugin's premise — any note is an outline — is a thesis about text that the markup community
stated and argued over thirty years ago.

- DeRose, Durand, Mylonas, Renear, "What is text, really?", Journal of Computing in Higher
  Education 1990 — [doi:10.1007/BF02941632](https://doi.org/10.1007/BF02941632). Text is an
  ordered hierarchy of content objects (OHCO): chapters, sections, paragraphs, lists, nested in one
  order. The later work by the same group argued that real texts carry several hierarchies at once
  that do not nest in each other.
- Coombs, Renear, DeRose, "Markup systems and the future of scholarly text processing", CACM 1987 —
  [doi:10.1145/32206.32209](https://doi.org/10.1145/32206.32209). Descriptive markup: mark what a
  part is, not how it looks.
- Sperberg-McQueen, Huitfeldt, "GODDAG: a data structure for overlapping hierarchies", 2004 —
  [doi:10.1007/978-3-540-39916-2_12](https://doi.org/10.1007/978-3-540-39916-2_12). A graph for
  documents whose hierarchies overlap.
- Furuta, Scofield, Shaw, "Document formatting systems: survey, concepts, and issues", ACM
  Computing Surveys 1982 — [doi:10.1145/356887.356891](https://doi.org/10.1145/356887.356891). The
  distinction between a document's logical structure and its layout.
- Shipman, McCall, "Supporting knowledge-base evolution with incremental formalization", CHI 1994
  — [doi:10.1145/259963.260386](https://doi.org/10.1145/259963.260386); Shipman, Marshall,
  "Formality considered harmful", Computer Supported Cooperative Work 1999 —
  [doi:10.1023/A:1008716330212](https://doi.org/10.1023/A:1008716330212); Marshall, Shipman,
  "Spatial hypertext: designing for change", CACM 1995 —
  [doi:10.1145/208344.208350](https://doi.org/10.1145/208344.208350). Systems that make people
  commit to formal structure early fail in practice; structure that is inferred from informal
  material, and formalized only where it pays, survives.
- Abiteboul, "Querying semi-structured data", ICDT 1997 —
  [doi:10.1007/3-540-62222-5_33](https://doi.org/10.1007/3-540-62222-5_33). Data whose structure
  is irregular, implicit and partial, which is what a vault of Markdown notes is.

What it gives us:

- **The two regimes are two hierarchies.** A Markdown note carries a section hierarchy, implied by
  heading levels, and a list hierarchy, implied by indentation. The plugin merges them into one
  tree by rule: headings own everything after them, and lists nest by column. That is the OHCO
  model applied to a text that carries two hierarchies, and the overlap literature says the merge
  is a choice rather than a fact of the text. It is also why no single keyboard rule serves both.
- **The attachment rule (Q34) is a third, invented hierarchy.** It makes a list the child of the
  paragraph before it, which neither Markdown nor any other format writes
  ([list-paragraph-mapping.md](list-paragraph-mapping.md), section 5). It is the one place the
  plugin imposes structure the text does not carry, the premature formalization Shipman and
  Marshall warn about, and it is also the source of the attachment family below.
- **"Any note is an outline" is incremental formalization**, and "the file stays plain" is its
  condition: the note stays informal on disk, and the outline is an inferred reading of it. The
  lesson from that literature is to keep the inference reversible and visible, which outline mode's
  display-only rendering already does.

### 2. What may stand where: grammars, admissibility and repair

Covered in [placement-grammar-formalization.md](placement-grammar-formalization.md): the outline
grammar is single-type with rules between adjacent siblings and one column rule; the conversion is
a finite table of 860 local contexts; the ambiguous cases are where plausible cost orders disagree;
a move can go wrong at seven places. Two practical systems belong here as well:

- **Blockly** decides where a block may be dropped with connection checks
  ([docs](https://developers.google.com/blockly/guides/create-custom-blocks/inputs/connection-checks)),
  and draws the pending connection with an insertion marker before release
  ([docs](https://developers.google.com/blockly/guides/create-custom-blocks/inputs/connection-previews)).
  Its checker runs safety, type and drag checks in turn
  ([docs](https://developers.google.com/blockly/guides/configure/advanced/interfaces/connection_checker)).
  That is our drop: admissible columns only, and a preview drawn from the same resolution as the
  release. See also Bau, Gray, Kelleher, Sheldon, Turbak, "Learnable programming: blocks and
  beyond", CACM 2017 — [doi:10.1145/3015455](https://doi.org/10.1145/3015455).
- **ProseMirror** validates every document against a schema of content expressions and fits a
  pasted slice by filling, wrapping and closing nodes
  ([guide](https://prosemirror.net/docs/guide/#transform)), the industrial form of our conversion.

### 3. Between text editors and structure editors

The plugin is a hybrid: the reader types text, and structure is kept on top of it. The literature
on syntax-directed editors records why pure structure editors lost to text editors, and what the
hybrids that followed changed.

- Teitelbaum, Reps, "The Cornell Program Synthesizer", CACM 1981 —
  [doi:10.1145/358746.358755](https://doi.org/10.1145/358746.358755). Structure by construction,
  from templates with placeholders; statements typed as text were parsed.
- Khwaja, Urban, "Syntax-directed editing environments: issues and features", SAC 1993 —
  [doi:10.1145/162754.162882](https://doi.org/10.1145/162754.162882). A survey of what such
  editors made hard: small edits that cross the tree's grain.
- Parinfer ([site](https://shaunlebron.github.io/parinfer/)): for Lisp, it keeps parentheses and
  indentation consistent on every keystroke, inferring one from the other in two modes. The
  closest analogue to the plugin's parse-and-enforce: the text stays authoritative, and structure
  is re-derived or protected after each edit.
- Kölling, Brown, Altadmri, "Frame-based editing: easing the transition from blocks to text-based
  programming", WiPSCE 2015 — [doi:10.1145/2818314.2818331](https://doi.org/10.1145/2818314.2818331).
  Structure for statements, free text inside them: the same split as the plugin's between nodes and
  content.
- Voelter, Siegmund, Berger, Kolb, "Towards user-friendly projectional editors", SLE 2014 —
  [doi:10.1007/978-3-319-11245-9_3](https://doi.org/10.1007/978-3-319-11245-9_3); Berger, Völter,
  Jensen, Dangprasert, Siegmund, "Efficiency of projectional editing: a controlled experiment",
  FSE 2016 — [doi:10.1145/2950290.2950315](https://doi.org/10.1145/2950290.2950315). The usability
  cost of editing through a projection, and the measured efficiency of doing it.
- Hempel, Lubin, Lu, Chugh, "Deuce: a lightweight user interface for structured editing", ICSE
  2018 — [doi:10.1145/3180155.3180165](https://doi.org/10.1145/3180155.3180165). Structure selected
  directly on top of ordinary text; its study found structural selection preferred to text
  selection.
- Wagner, Graham, "Efficient and flexible incremental parsing", TOPLAS 1998 —
  [doi:10.1145/293677.293678](https://doi.org/10.1145/293677.293678), and tree-sitter after it:
  re-parsing only what an edit touched. The plugin re-parses whole notes; Q33 measured 0.96 ms of
  a 1.24 ms operation step as parse on a 2,000-line note.

What it gives us: a place on a map. Pure structure editors are rigid for small edits (high
viscosity, below); pure text editors let an edit name one tree and produce another. The hybrids
that lasted keep the text authoritative, make structure cheap to select and move, and never make
a keystroke inside content pay for structure. The plugin's within-node edits pass untouched, which
is the right side of that line; its vetoes are where it pays the structure editor's price.

### 4. The layout layer

This is the layer the tracker says the difficulty lives in. The plugin's model is lossless:
nodes hold their lines verbatim and own the blank lines after them. Four literatures and a
handful of production systems have met every part of the problem #267 worked through.

**Lossless syntax trees and trivia ownership.** Compilers and refactoring tools keep whitespace and
comments in the tree as "trivia" attached to tokens, so that the source reprints exactly.

- Roslyn states one ownership rule for all of it: "a token owns any trivia after it on the same
  line up to the next token. Any trivia after that line is associated with the following token"
  ([docs](https://learn.microsoft.com/en-us/dotnet/csharp/roslyn-sdk/work-with-syntax)).
- rust-analyzer's trees are "lossless, or full fidelity. All comments and whitespace get
  preserved" ([docs](https://github.com/rust-lang/rust-analyzer/blob/master/docs/book/src/contributing/syntax.md));
  LibCST does the same for Python ([repository](https://github.com/Instagram/LibCST)).
- recast "reprints only those parts of the syntax tree that you modify", guarantees
  `print(parse(source)) === source`, and falls back to a pretty printer where it cannot reuse the
  original text ([repository](https://github.com/benjamn/recast)).

Our model is a lossless tree with one ownership rule: a blank line belongs to the node above it.
recast's policy is #267's edit site: unchanged text is reused byte for byte, and changed text is
written canonically.

**Layout preservation in program transformation.**

- de Jonge, Visser, "An algorithm for layout preservation in refactoring transformations", SLE 2011
  — [doi:10.1007/978-3-642-28830-2_3](https://doi.org/10.1007/978-3-642-28830-2_3), and Kort,
  Lämmel, "Parse-tree annotations meet re-engineering concerns", SCAM 2003 —
  [doi:10.1109/SCAM.2003.1238042](https://doi.org/10.1109/SCAM.2003.1238042). Keeping the user's
  layout and comments when a tool rewrites a tree: the text of unchanged parts is found by origin
  tracking and reused, and only the changed parts are laid out fresh.

**Canonical layout for new material.** Where a tree has no prior text, a pretty printer chooses
one: Hughes, "The design of a pretty-printing library", AFP 1995 —
[doi:10.1007/3-540-59451-5_3](https://doi.org/10.1007/3-540-59451-5_3); Wadler, "A prettier
printer", 2003 ([paper](https://homepages.inf.ed.ac.uk/wadler/papers/prettier/prettier.pdf)). This
is Q-b's half: what a created seam should be.

**Layout-sensitive grammars.** Markdown's list nesting and our three-column margin are layout
rules, which ordinary grammars cannot state: Adams, "Principled parsing for indentation-sensitive
languages: revisiting Landin's offside rule", POPL 2013 —
[doi:10.1145/2429069.2429129](https://doi.org/10.1145/2429069.2429129); Erdweg, Rendel, Kästner,
Ostermann, "Layout-sensitive generalized parsing", SLE 2012 —
[doi:10.1007/978-3-642-36089-3_14](https://doi.org/10.1007/978-3-642-36089-3_14). They are the
formal tools for the columns family (#136, #154, #158, #215, #244), if that family is ever stated
rather than patched.

**Parser differentials.** Two parsers that read the same input differently are a named hazard in
the security literature: Sassaman, Patterson, Bratus, Locasto, "Security applications of formal
language theory", IEEE Systems Journal 2013 —
[doi:10.1109/JSYST.2012.2222000](https://doi.org/10.1109/JSYST.2012.2222000). CommonMark exists
because Markdown implementations disagreed, and [Babelmark](https://babelmark.github.io/) compares
them side by side. The remedy has two parts: pick one reference reader, and write only text every
reader of concern agrees on. #267's measurements found that one blank line puts every seam it
measured into that agreement.

**Alignment in bidirectional transformations.** Q-a — which old layout belongs to the new tree —
is the question a lens's `put` answers by aligning the old source with the new view.

- Barbosa, Cretin, Foster, Greenberg, Pierce, "Matching lenses: alignment and view update", ICFP
  2010 — [doi:10.1145/1863543.1863572](https://doi.org/10.1145/1863543.1863572). Alignment is made
  a separate, declared part of the lens, with several strategies: by position, by key, by best
  match.
- Diskin, Xiong, Czarnecki, "From state- to delta-based bidirectional model transformations",
  JOT 2011 — [doi:10.5381/jot.2011.10.1.a6](https://doi.org/10.5381/jot.2011.10.1.a6). A lens that
  sees only the old and new states has to guess the alignment; one that is handed the edit's own
  correspondence does not.
- Zhu, Yang, Ko, Hu, "Retentive lenses", 2020 — [arXiv:2001.02031](https://arxiv.org/abs/2001.02031).
  What is linked to an unchanged part of the view keeps its text.

#267's six approaches are six alignment strategies, and the literature predicts where each fails:

| #267 approach | Alignment strategy | Where the literature says it fails |
| --- | --- | --- |
| a table by kind | none: a structural rule only | cannot tell a user's flush seam from a created one |
| pairs of node ids | by key | where an operation replaces a key: split, merge, type-over |
| ids with lineage | by key, with a declared correspondence | only as good as every operation's lineage, which type-over cannot give |
| a line diff of the text | by best match on the source | moves: a diff sees a moved block as a deletion and an insertion |
| a table per operation | the operation supplies its delta | complete only if every operation states its row |
| the edit site on the outline | the operation's delta, read from ids and outlines | holds by construction where ids survive; the oracle checks the rest |

The sequence moved from guessing the alignment to taking it from the operation, which is the
delta-lens argument, and approach 6's revised rule — the layout between blocks whose outline is
unchanged is kept — is the retentive-lens law.

**The serializer's join rule.** Every Markdown writer has to decide how many blank lines separate
two adjacent blocks, and one of them states it as code. mdast-util-to-markdown's `join` functions
"receive two adjacent siblings and their parent and what they return defines how many blank lines
to use between them"; `false` means the two cannot be adjacent at all, "such as two adjacent block
quotes or indented code after a list, in which case a comment will be injected to break them up"
([readme](https://github.com/syntax-tree/mdast-util-to-markdown#join),
[source](https://github.com/syntax-tree/mdast-util-to-markdown/blob/main/lib/join.js)). Its default
answers one blank line; inside a list or an item, `spread ? 1 : 0`, where mdast's `spread` field
records whether a list's children are separated by blank lines
([mdast](https://github.com/syntax-tree/mdast)) — list looseness stored as an attribute of the
list. markdownlint's MD032 asks for a blank line before and after every list
([rule](https://github.com/DavidAnson/markdownlint/blob/main/doc/md032.md)). This is Q-b answered
by a maintained table, and it is close to what #267 converged on.

**Properties of a whole list.** Looseness is a property of the list computed from every seam inside
it: in CommonMark "a list is loose if any of its constituent list items are separated by blank
lines, or if any of its constituent list items directly contain two block-level elements with a
blank line between them" ([spec](https://spec.commonmark.org/0.31.2/#loose)). One local blank line
changes the whole list, which is what makes #272 and #267's 297 flipped lists non-local. Formally
it is a synthesized attribute (Knuth, "Semantics of context-free languages", Mathematical Systems
Theory 1968 — [doi:10.1007/BF01692511](https://doi.org/10.1007/BF01692511)), and recomputing such
attributes after an edit is incremental attribute evaluation (Reps, Teitelbaum, Demers, TOPLAS 1983
— [doi:10.1145/2166.357218](https://doi.org/10.1145/2166.357218)). Stored as an attribute, as mdast
stores it, looseness becomes something an operation reads and keeps rather than something a blank
line changes by accident.

What the frame gives us, together: the layout layer is the complement of the outline lens. Q-a is
alignment, which the operation can supply; Q-b is a join table, which can be written down once;
looseness is an attribute to keep; and the readers' disagreement is a parser differential, settled
by a reference reader and an agreement set. Each is a rule set that can be stated whole, rather
than found case by case.

### 5. Views, and editing through them

Outline mode, folding, zoom, the footer's projection and the drag preview are all views of one
note, and the reader edits through most of them.

- Bancilhon, Spyratos, "Update semantics of relational views", TODS 1981 —
  [doi:10.1145/319628.319634](https://doi.org/10.1145/319628.319634). The view-update problem: an
  update to a view translates to the source unambiguously when the part of the source the view
  does not show — its complement — is held constant. Lenses descend from this.
- Pickering, Gibbons, Wu, "Profunctor optics: modular data accessors", Programming 2017 —
  [doi:10.22152/programming-journal.org/2017/1/7](https://doi.org/10.22152/programming-journal.org/2017/1/7).
  Lenses (one focus), prisms and traversals (many foci), and read-only folds, composed.
- Huet, "The Zipper", JFP 1997 — [doi:10.1017/S0956796897002864](https://doi.org/10.1017/S0956796897002864),
  and Abbott, Altenkirch, Ghani, McBride, "Derivatives of containers", TLCA 2003 —
  [doi:10.1007/3-540-44904-3_2](https://doi.org/10.1007/3-540-44904-3_2). A position in a tree is
  the tree with one hole in it: the formal shape of a caret or a zoom root.
- Furnas, "Generalized fisheye views", CHI 1986 — [doi:10.1145/22339.22342](https://doi.org/10.1145/22339.22342).
  What to show of a large structure around a focus: a degree of interest, a node's a-priori
  importance minus its distance from the focus, thresholded. Trees and program listings were its
  first examples.
- Card, Nation, "Degree-of-interest trees", AVI 2002 — [doi:10.1145/1556262.1556300](https://doi.org/10.1145/1556262.1556300);
  Plaisant, Grosjean, Bederson, "SpaceTree", InfoVis 2002 —
  [doi:10.1109/INFVIS.2002.1173148](https://doi.org/10.1109/INFVIS.2002.1173148); Bederson,
  Hollan, "Pad++", UIST 1994 — [doi:10.1145/192426.192435](https://doi.org/10.1145/192426.192435);
  Cockburn, Karlson, Bederson, "A review of overview+detail, zooming, and focus+context interfaces",
  ACM Computing Surveys 2009 — [doi:10.1145/1456650.1456652](https://doi.org/10.1145/1456650.1456652).
  Folding is focus+context, zoom is zooming, and the survey compares the families on what users
  find and remember.
- Engelbart, English, "A research center for augmenting human intellect", AFIPS FJCC 1968 —
  [doi:10.1145/1476589.1476645](https://doi.org/10.1145/1476589.1476645). NLS's view specifications
  clipped the outline to N levels and truncated each statement to its first lines. "Fold one level
  more" and "fold one level less" are NLS's level clipping.
- Emacs narrowing and org-mode's sparse trees ([manual](https://orgmode.org/manual/Sparse-Trees.html)):
  an editable restricted view, and a view of matches with their ancestors.
- Miara, Musselman, Navarro, Shneiderman, "Program indentation and comprehensibility", CACM 1983 —
  [doi:10.1145/182.358437](https://doi.org/10.1145/182.358437). Indentation depth and
  comprehension, the question behind the outline unit's width.

The plugin's views, read this way:

| View | What it hides or adds | How an edit goes through it | Edits with no translation |
| --- | --- | --- | --- |
| outline mode | draws markers, guides and one grid; changes no byte | ordinary text edits, through enforcement | editing gap whitespace |
| fold | hides a subtree | Enter at a folded node's end makes a sibling after the subtree (`planKey`'s `collapsed`); a change to hidden content opens the fold; a drop cannot target folded depths | none: it opens instead |
| zoom | shows one subtree as the note | a lens onto the root: operations inside apply, results re-based | `would-leave-zoom-scope`: an operand holding the root, an outdent of its children, a split that makes the root a sibling |
| the footer's projection | matches, every ancestor, and a set depth of descendants (`project.ts`); unbranching chains collapsed (`lineage.ts`) | read-only today | every edit |
| the drag preview | the tree the drop names | none: it is `get ∘ put` before the commit | — |

Three things follow:

- **Zoom is a lens with a domain.** Its refusals are the edits outside the lens's domain, which is
  the constant-complement condition: an edit is accepted when everything outside the root stays
  as it was.
- **A view's state changes what an edit means.** Enter on a folded node acts on the node as the
  reader sees it, a leaf. `planKey` already takes the fold and the zoom as inputs; stating every
  key's meaning as a function of the view it is pressed in would make that explicit everywhere.
- **Selection and search close in opposite directions.** A block selection is closed downward — no
  node without its descendants — which makes it a down-set of the tree order. The footer's
  projection keeps every ancestor of a match, an up-set, plus a bounded part of each match's
  subtree. The two are the two closures of the same order, and a future edit through a filtered
  view has to reconcile them: an edit to a match is an edit to a subtree the view does not fully
  show.

Furnas's degree of interest covers the family: a fold is a threshold that hides a subtree, a zoom
sets the focus and hides everything outside it, and the projection gives matches and their paths a
high a-priori interest. The code already shares one projection between the footer and the planned
search surfaces ([search-surfaces.md](search-surfaces.md)); fold and zoom use their own mechanisms
([fold-mechanics.md](fold-mechanics.md), [zoom-hiding-mechanism.md](zoom-hiding-mechanism.md)).

### 6. Interaction: state, gestures, feedback and history

**Formal models of interactive systems.** Dix, Harrison, Runciman, Thimbleby, "Interaction models
and the principled design of interactive systems", ESEC 1987 —
[doi:10.1007/BFb0022105](https://doi.org/10.1007/BFb0022105): the PIE model, which states
properties such as predictability and reachability over the map from input sequences to effects.
Sufrin, "Formal specification of a display-oriented text editor", Science of Computer Programming
1982 — [doi:10.1016/0167-6423(82)90014-4](https://doi.org/10.1016/0167-6423(82)90014-4): a whole
editor specified in Z. Harel, "Statecharts: a visual formalism for complex systems", Science of
Computer Programming 1987 — [doi:10.1016/0167-6423(87)90035-9](https://doi.org/10.1016/0167-6423(87)90035-9):
hierarchical state machines. Two of the plugin's surfaces are state machines described in prose
today: the drag (pressed, dragging past 4 px, dwelling 350 ms on touch, cancelled by Esc, capture
loss or a document change) and a place's life (opened, carried by a key, abandoned, restored by
redo). Both have lost events at their edges (#152, #153, #248, #249).

**Direct manipulation and its instruments.** Shneiderman, "Direct manipulation: a step beyond
programming languages", Computer 1983 — [doi:10.1109/MC.1983.1654471](https://doi.org/10.1109/MC.1983.1654471);
Hutchins, Hollan, Norman, "Direct manipulation interfaces", HCI 1985 —
[doi:10.1207/s15327051hci0104_2](https://doi.org/10.1207/s15327051hci0104_2), where the gulfs of
execution and evaluation are named; Beaudouin-Lafon, "Instrumental interaction", CHI 2000 —
[doi:10.1145/332040.332473](https://doi.org/10.1145/332040.332473), which describes an interface as
domain objects acted on through instruments. The marker gutter is our one instrument, and its
14 px carry four gestures: drag, zoom, fold and a task's toggle
([node-drag-and-drop.md](node-drag-and-drop.md)): the mark itself drags on a press and zooms on a
click. Djajadiningrat, Overbeeke, Wensveen, "But how,
Donald, tell us how?", DIS 2002 — [doi:10.1145/778751.778752](https://doi.org/10.1145/778751.778752),
and Vermeulen et al. 2013 (above) separate feedforward — what will happen — from feedback. The drop
preview is feedforward; a paste has none, which is why the parallel note settles A1 differently for
the two.

**Pointing.** Fitts, "The information capacity of the human motor system in controlling the
amplitude of movement", 1954 — [doi:10.1037/h0055392](https://doi.org/10.1037/h0055392); MacKenzie,
"Fitts' law as a research and design tool in human-computer interaction", HCI 1992 —
[doi:10.1207/s15327051hci0701_3](https://doi.org/10.1207/s15327051hci0701_3). Grossman,
Balakrishnan, "The bubble cursor", CHI 2005 — [doi:10.1145/1054972.1055012](https://doi.org/10.1145/1054972.1055012):
resizing the cursor's activation area so that exactly one target is always captured, which gives
each target the whole region nearer to it than to any other. `nearestIndex` in
`drop-destinations.ts` is that rule in one dimension — "a PARTITION and not a hit test", in its
own comment — so a column's effective width for Fitts's law is the spacing between columns, one
unit, not the width of any band drawn for it. Accot, Zhai, "Beyond Fitts' law: models for
trajectory-based HCI tasks", CHI 1997 — [doi:10.1145/258549.258760](https://doi.org/10.1145/258549.258760):
the steering law, for a drag that has to stay within a corridor, as a drag along a narrow column
does. Vogel, Baudisch, "Shift", CHI 2007 — [doi:10.1145/1240624.1240727](https://doi.org/10.1145/1240624.1240727):
a finger hides its own target, the problem under #201 and #144.

**Modes.** Norman, "Categorization of action slips", Psychological Review 1981 —
[doi:10.1037/0033-295X.88.1.1](https://doi.org/10.1037/0033-295X.88.1.1), names mode errors.
Sellen, Kurtenbach, Buxton, "The prevention of mode errors through sensory feedback", HCI 1992 —
[doi:10.1207/s15327051hci0702_1](https://doi.org/10.1207/s15327051hci0702_1), found that a mode the
user holds (a pedal kept down) produced fewer mode errors than one latched and shown on screen.
That is the evidence for the parallel note's "a modifier held while aiming" to switch a drop's
reading. Tesler, "A personal history of modeless text editing and cut/copy-paste", Interactions
2012 — [doi:10.1145/2212877.2212896](https://doi.org/10.1145/2212877.2212896). Outline mode is a
latched mode, per tab, with a ribbon and status-bar indicator
([outline-mode-surfaces.md](outline-mode-surfaces.md)).

**Undo.** Abowd, Dix, "Giving undo attention", Interacting with Computers 1992 —
[doi:10.1016/0953-5438(92)90021-7](https://doi.org/10.1016/0953-5438(92)90021-7); Vitter, "US&R: a
new framework for redoing", IEEE Software 1984 — [doi:10.1109/MS.1984.229460](https://doi.org/10.1109/MS.1984.229460);
Berlage, "A selective undo mechanism for graphical user interfaces based on command objects", TOCHI
1994 — [doi:10.1145/196699.196721](https://doi.org/10.1145/196699.196721); Yoon, Myers, "Supporting
selective undo in a code editor", ICSE 2015 — [doi:10.1109/ICSE.2015.43](https://doi.org/10.1109/ICSE.2015.43).
They treat what an undo step is, and what undo restores, as part of the command language's design
rather than a side effect of the editor. The plugin's undo steps are CodeMirror's history
heuristics — a change joins the previous step when it has no user event, the previous step has no
selection after it, and both fall within 500 ms (#250) — worked around with a trailing selection
transaction. CodeMirror has an explicit annotation for the boundary, `isolateHistory`
([reference](https://codemirror.net/docs/ref/#commands.isolateHistory)), available in the build
Obsidian ships.

### 7. Judging a decision: evaluation frameworks

- Green, Petre, "Usability analysis of visual programming environments: a 'cognitive dimensions'
  framework", JVLC 1996 — [doi:10.1006/jvlc.1996.0009](https://doi.org/10.1006/jvlc.1996.0009). A
  vocabulary for the trade-offs of a notation and its editor.
- Payne, Green, "Task-action grammars: a model of the mental representation of task languages", HCI
  1986 — [doi:10.1207/s15327051hci0202_1](https://doi.org/10.1207/s15327051hci0202_1), and Reisner,
  "Formal grammar and human factors design of an interactive graphics system", IEEE TSE 1981 —
  [doi:10.1109/TSE.1981.234520](https://doi.org/10.1109/TSE.1981.234520). A command language is
  consistent to the degree one rule schema covers many tasks; its cost is the number of schemas.
- Card, Moran, Newell, "The keystroke-level model for user performance time with interactive
  systems", CACM 1980 — [doi:10.1145/358886.358895](https://doi.org/10.1145/358886.358895); John,
  Kieras, "The GOMS family of user interface analysis techniques", TOCHI 1996 —
  [doi:10.1145/235833.236054](https://doi.org/10.1145/235833.236054). Predicting the time of a
  task from its keystrokes, pointings and mental steps.
- Grudin, "The case against user interface consistency", CACM 1989 —
  [doi:10.1145/67933.67934](https://doi.org/10.1145/67933.67934). Consistency with the user's task
  matters more than internal consistency; the grounds on which drop and paste may answer A1
  differently.

A cognitive-dimensions reading of the surface, from what the notes and the tracker record:

| Dimension | Where it shows | Helps or hurts |
| --- | --- | --- |
| hidden dependencies | a list's parent depends on the paragraph before it (Q34); one blank line changes a whole list's looseness; a lone `^id` attaches by the blank lines around it | hurts: the reader cannot see what an edit will move |
| viscosity | refusals that have no workaround in place (sections only swap with same-level sections; outdent of a heading's direct child, #200); gap whitespace cannot be edited in outline mode | hurts for some rearrangements; the price of enforcement |
| premature commitment | a drop must pick a depth before release; a paste commits to the caret's reading (#190) | the preview removes it for the drop; the paste keeps it |
| provisionality | Enter opens a place that disappears if abandoned | helps; also the source of eleven issues |
| secondary notation | blank lines, marker characters, numbering, flush or separated seams | the author's layout is the notation's secondary channel, which is why Q-a exists |
| consistency | two regimes for Tab; drop and paste differ at A1; ten effects for Tab | the keyboard probe counts it |
| error-proneness | a raw edit names one tree and makes another; the outline shows two nodes where reading mode shows one | enforcement and #267 exist to reduce it |
| visibility and juxtaposability | fold, zoom, the footer's lineage, outline mode | helps |
| progressive evaluation | the drop preview; the re-parse after every edit | helps |
| hard mental operations | predicting where a heading's absorbed rows land (A6); where a paste lands under #190 | hurts |

### 8. Other writers

The plugin assumes one writer. Two others exist today and a third may.

- **Obsidian and CodeMirror themselves.** Obsidian's list handling renumbers ordered lists inside
  the same transaction as our edit (#192, #252, #260), and CodeMirror's own commands build ranges
  the plugin then has to read (#115). That is a second writer on the same buffer, which is the
  setting of operational transformation: Ellis, Gibbs, "Concurrency control in groupware systems",
  SIGMOD 1989 — [doi:10.1145/66926.66963](https://doi.org/10.1145/66926.66963), and Sun et al.
  1998 (above), whose intention preservation is exactly what #256 and #269 restore by judging our
  edit without Obsidian's appended one.
- **Sync.** A note edited on two devices is merged as text. Every merged text is some tree to our
  parser, so sync cannot corrupt the note; it can produce a tree nobody named. Structure-aware
  merging exists for trees: Davis, Sun, Lu, "Generalizing operational transformation to the
  standard general markup language", CSCW 2002 — [doi:10.1145/587087.587088](https://doi.org/10.1145/587087.587088);
  Apel et al., "Semistructured merge", ESEC/FSE 2011 — [doi:10.1145/2025113.2025141](https://doi.org/10.1145/2025113.2025141);
  Falleri et al., "Fine-grained and accurate source code differencing" (GumTree), ASE 2014 —
  [doi:10.1145/2642937.2642982](https://doi.org/10.1145/2642937.2642982), which computes tree
  edit scripts with moves; and the replicated tree move in
  [placement-grammar-formalization.md](placement-grammar-formalization.md), direction 5.
- **Local-first software** (Kleppmann, Wiggins, van Hardenberg, McGranaghan, Onward! 2019 —
  [doi:10.1145/3359591.3359737](https://doi.org/10.1145/3359591.3359737)) is the ethos the plugin
  already follows: plain files, the user's own storage. Its collaboration engines (Gentle,
  Kleppmann, "Collaborative text editing with Eg-walker", EuroSys 2025 —
  [doi:10.1145/3689031.3696076](https://doi.org/10.1145/3689031.3696076)) merge text, not trees.

What it gives us now: a name and a remedy for the second-writer family. Either the plugin owns
every edit its gestures cause, so no second writer acts inside its transactions, or it treats the
other writer's edit as concurrent and transforms against it, as #256 and #269 do case by case.

### 9. Testing an editor

The project already tests by properties, and the literature names what each property is.

- Claessen, Hughes, "QuickCheck", ICFP 2000 — [doi:10.1145/351240.351266](https://doi.org/10.1145/351240.351266);
  Hughes, Pierce, Arts, Norell, "Mysteries of Dropbox: property-based testing of a distributed
  synchronization service", ICST 2016 — [doi:10.1109/ICST.2016.37](https://doi.org/10.1109/ICST.2016.37):
  a model of a synchronizing system tested against the real one by generated operation sequences.
- Chen et al., "Metamorphic testing: a review of challenges and opportunities", ACM Computing
  Surveys 2018 — [doi:10.1145/3143561](https://doi.org/10.1145/3143561); Segura, Fraser, Sanchez,
  Ruiz-Cortés, "A survey on metamorphic testing", IEEE TSE 2016 —
  [doi:10.1109/TSE.2016.2532875](https://doi.org/10.1109/TSE.2016.2532875). Checking a relation
  between the outputs of related inputs where no oracle knows the right output.
- McKeeman, "Differential testing for software", Digital Technical Journal 1998: running two
  implementations of one specification on the same input and comparing.
- Utting, Pretschner, Legeard, "A taxonomy of model-based testing approaches", STVR 2012 —
  [doi:10.1002/stvr.456](https://doi.org/10.1002/stvr.456).

| The project's property | What it is |
| --- | --- |
| round trip (`tests/roundtrip.test.ts`) | an invariant |
| closure 5.1 | an invariant that, as Q33 found, cannot fail |
| indent then outdent restores (5.3); a move and its reverse | metamorphic relations |
| preview equals release; drop equals paste at one destination | metamorphic relations between two paths |
| the group forms against `tests/group-oracle.ts` | differential testing against a slower reference |
| the depth contract (`tests/depth-contract.test.ts`) | a per-operation oracle: what the operation promises |
| #267's seam oracle against CommonMark | differential testing against a reference reader |

Two techniques are not in use: differential testing against Obsidian's own readers, which the e2e
harness could run on generated notes as #267's measurements did by hand, and model-based testing
of operation sequences, spike 2 of the first note.

### 10. The outliner lineage

[outliner-landscape.md](outliner-landscape.md) covers the modern apps and
[org-mode-comparison.md](org-mode-comparison.md) org-mode. The older line adds three things:

- **NLS** (Engelbart, English 1968, above; Engelbart, "Augmenting human intellect: a conceptual
  framework", 1962 — [Doug Engelbart Institute](https://www.dougengelbart.org/content/view/138/))
  had structured statements, level clipping and statement truncation: fold, "fold one level
  more", and the footer's one-line rows.
- **ThinkTank, Ready and MORE** (Dave Winer's archive at [outliners.com](http://outliners.com/)),
  and **Lotus Agenda** (Kaplan, Kapor, Belove, Landsman, Drake, "Agenda: a personal information
  manager", CACM 1990 — [doi:10.1145/79204.79212](https://doi.org/10.1145/79204.79212)), which
  categorized free-form items after the fact: incremental formalization, shipped.
- **Outlining as a writing aid** has one careful study: Kellogg, "Attentional overload and writing
  performance: effects of rough draft and outline strategies", JEP: Learning, Memory, and
  Cognition 1988 — [doi:10.1037/0278-7393.14.2.355](https://doi.org/10.1037//0278-7393.14.2.355).

No outliner in this line publishes a formal model of its editing, and none edits a text format
that other programs also read. That combination is what makes the text layer ours alone to solve.

## Design levers

The choices below were made for usability, case by case, and each is now the source of a family.
Revising one would remove a family rather than a case. Each row names the family, the cost, the
prior art, and what to measure first. The issue counts are from `issue-layers.tsv`.

| Lever | Today | The family it would dissolve | Cost | Prior art | Measure first |
| --- | --- | --- | --- | --- | --- |
| 1. One reference reader | our own parse: no lazy continuation, a three-column margin, its own HTML and table rules | how a line is read: #136, #137, #138, #213, #229, #261, #262, all open | our tree changes for existing notes; reading mode and Live Preview disagree with each other, so one must be chosen | CommonMark's reason to exist; parser differentials; Babelmark | how many corpus notes read differently under CommonMark's block structure |
| 2. A write-side normal form | separate only where our parse needs it | seams: #198, #255, #271, #272; part of #230 | the author's flush style at the edit site | mdast-util-to-markdown's join table; recast; markdownlint MD032 | #267's oracle, already built |
| 3. Ordinals the gesture did not name are left alone | renumber runs, keep split runs' numbers, adopt a donor's | numbering: #120, #159, #192, #214, #227, #228, #252, #259, #260, #263 (ten issues, three open), and most of the second-writer family | a source list can read 1, 2, 2, 3; a reader who numbers by hand loses nothing | CommonMark: "the numbers of subsequent list items are disregarded"; markdownlint MD029's `one` style | how often notes in the corpus rely on explicit ordinals |
| 4. Places out of the text | Enter at a paragraph's end writes two blank lines and records them | places: eleven issues, four open (#152, #253, #254, #257) | a place drawn without a line of its own: the caret needs a real line, so its first keystroke would write the node | Hazelnut's holes and tylr's grout live in the model, not the text | whether CodeMirror can hold a caret on a line that exists only as a decoration |
| 5. Q34: paragraphs do not adopt lists | the attachment rule | placement: D2, D5, D6, A9/#206; 807 move refusals in the keyboard probe; 16,707 forced conversions over 341,585 drop destinations | flat prose can no longer be outlined by indenting (reading C), or indenting rewrites the parent (reading D) | CommonMark, org-mode and every other format ([list-paragraph-mapping.md](list-paragraph-mapping.md)) | the readings' costs, as that note sets out |
| 6. One conversion function | forced-kind, native-kind and heading-level rules, each reading its own donor | D5, D8; the ambiguity list becomes computed | re-stating conversions as a table | ProseMirror's fitting; repair with a declared cost order | the first note's spike 1 |
| 7. Own every list edit | detect and discount Obsidian's appended renumbering | second writer: #115, #155, #192, #252, #259, #260, #263 | taking over keys Obsidian handles today | OT's intention preservation | which of Obsidian's list handlers still run in outline mode |
| 8. Explicit history boundaries | CodeMirror's join heuristics, blocked by a trailing selection | undo grouping: #250, #275 | the command path dispatches through `Editor.transaction`, which carries no annotations | `isolateHistory`; selective-undo work | whether the command path can reach the `EditorView` through public API |

Three observations on the table:

- **Levers 2 and 3 are decisions about the author's layout.** Each trades some fidelity to what
  the author wrote for robustness. The literature's settled answer is recast's: keep the text of
  what the gesture did not touch, and write what it did touch in a canonical form. Lever 2 applies
  that to blank lines, lever 3 to ordinals.
- **Levers 1, 4 and 5 are decisions about the model.** Each removes a rule the plugin added that
  the text does not carry: a reading of lines no other reader shares, a line written into the note
  to hold a caret, and a parent for a list. They cost the most to change and remove the most.
- **Levers 7 and 8 are decisions about the boundary with Obsidian.** They are the smallest, and
  each closes a family that recurs with every fix of its neighbours.

## Is there one theory?

No single body of work covers the whole surface, and the stack explains why: each layer meets a
different problem. Three theories each cover a contiguous part of it:

- **Bidirectional transformations** — lenses, alignment, retentiveness, view update — cover the
  text, the tree, the outline and the views: every edit is a `put` through some view, and every
  guarantee is a law of that `put`.
- **Structure-editor calculi** — grammars, holes, repair — cover what may stand where, and what an
  edit does when the tree it names has no writing.
- **Formal models of interaction** — state machines, feedforward, modes, undo — cover the gestures
  and the state that lives outside the note.

What can unify them in practice is not a theory but a table: **each layer's laws, the property that
checks each law, and the known violations.** The first rows exist already:

| Layer | Law | Checked by | Known violations |
| --- | --- | --- | --- |
| text and tree | `encode ∘ parse` is the identity | `tests/roundtrip.test.ts` | none |
| text and readers | every reader of concern reads the tree we read, for text we write | #267's seam oracle, CommonMark only | #271, #272, #255, the readers family |
| tree and outline | the note holds the outline the operation named (PutGet) | the depth contract, in part | D1 to D8, #206 |
| tree and outline | layout between unchanged blocks is kept (retentiveness) | `tests/closure.test.ts` 5.2, in part | #255, the numbering family |
| outline | every result is admissible | the grammar checker, when built | none known |
| views | a zoomed edit stays in scope, or is refused | `tests/zoom-enforcement.test.ts` | — |
| views | the preview is the release | the drop's agreement property | A6 |
| interaction | one gesture is one undo step | `tests/minimal-change-history.test.ts`, e2e | #250, #275 |
| interaction | an abandoned place leaves no trace | `tests/undo-on-abandon.test.ts`, `tests/provisional-place-record.test.ts` | #253 |

A new surface then states its rows before it ships, and a new fix states which row it restores.

## Recommendations

1. **Take the layout layer's rule sets as whole tables.** Q-b as a join table, as
   mdast-util-to-markdown states one; list looseness as an attribute an operation keeps; Q-a as
   #267's edit site, which is the retentive-lens law. #267 is most of the way there.
2. **Decide the reference reader** (lever 1), and until then write only text every reader agrees on
   (lever 2). The readers family is the only family with no fix yet, and #261 is marked
   `needs/research`.
3. **Decide the numbering normal form** (lever 3). It is a decision, not a research project, and it
   closes the largest family of fixed-and-refound bugs.
4. **Spike places out of the text** (lever 4): whether a place can exist without writing lines.
5. **Test each layer's laws against references, not against hand-built cases.** Differential
   testing against CommonMark and against Obsidian's own readers on generated notes, as #267 began;
   the grammar as the suite's oracle and the lens laws over sequences, as the first note proposes.
6. **State the two state machines** — the drag and a place's life — as statecharts, with the events
   at their edges enumerated. #152, #153, #248 and #249 were all edges.
7. **Run a cognitive-dimensions review** before each new surface ships. It costs an hour, and the
   table above shows it names the costs the tracker later records.

## Open

- **The classification is one reading.** `issue-layers.tsv` assigns each issue a layer and families
  by reading it; another reader could move a few rows. The figures in "Where the difficulty lives"
  depend on it, the chains do not.
- **How often authors write lazy lines, explicit ordinals or flush seams on purpose** is unmeasured:
  the corpus holds test notes only. Levers 1 to 3 each want that figure.
- **Obsidian's list handlers in outline mode** are not inventoried: which run, and which reach our
  transactions.
- **The literature does not cover several disagreeing readers of one format.** Parser differentials
  are treated as a hazard to remove, not as a condition to design around, and Markdown's readers
  will stay different.
