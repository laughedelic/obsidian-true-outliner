# Examples: what a paste does, and what it should do

Every **today** frame is measured, not described — driven through `classify` and `computeVerdict`,
the same two gates the transaction filter uses, by the probe at
`docs/research/prototypes/paste-probe/paste-probe.ts.txt`. Every **intended** frame is a buffer
that was written out and re-parsed, so the tree beneath it is what our parser actually produces
rather than what the encoding was meant to produce.

The rule these frames illustrate is design D1: a paste replants a subtree at the level the caret
names, the subtree takes whatever encoding that level permits, and its own relative hierarchy is
preserved.

Notation:

| mark | meaning |
| --- | --- |
| `\|` | caret |
| a `tree` block | the re-parse of the frame above it, which is what the outline shows |

---

## A. The payload

One payload is used throughout, so the destination is the only thing that varies: a heading
section with a paragraph and a nested list under it, as copied.

```
## Notes

Some prose.

- alpha
  - beta
```

```tree
h2: ## Notes
  paragraph: Some prose.
    list-item: - alpha
      list-item:   - beta
```

Four levels. `- alpha` is a child of `Some prose.` — the attachment rule, "a list following a
paragraph is that paragraph's children". Keeping those four levels intact is what the existing
structural-paste guarantee promises.

---

## B. Into a list scope

### B1 — Today: a raw insertion

```
- one
  - two
    - three|
```

Paste →

```
- one
  - two
    - three## Notes

A paragraph.

- alpha
  - beta
```

```tree
list-item: - one
  list-item:   - two
    list-item:     - three## Notes
paragraph: A paragraph.
  list-item: - alpha
    list-item:   - beta
```

`insertSubtrees` rejects the payload — correctly, a heading cannot be a list item's child — and
`computePasteVerdict` turns that rejection into a native pass. The payload's first line is
concatenated onto the anchor's, the rest lands at its original indentation, and the result
resembles neither document.

### B2 — Intended: the payload converts, whole, and keeps its rank

```
- one
  - two
    - three|
```

Paste →

```
- one
  - two
    - three
    - ## Notes

      - Some prose.

        - alpha
          - beta
```

```tree
list-item: - one
  list-item:   - two
    list-item:     - three
    list-item:     - ## Notes
      list-item:       - Some prose.
        list-item:         - alpha
          list-item:           - beta
```

Four levels in, four levels out, at the depth the caret named. The heading's `#` run rides along
as the item's own text: `- ## Notes` is a list item containing an `h2` in CommonMark, which
Obsidian renders with heading styling, and which our `contentColumnCh` already treats as chrome.

### B3 — Why the *whole* payload converts, not just its root

The obvious cheaper rule is the one the rest of the re-encode path already uses: convert the
root to the destination's encoding, re-indent the descendants verbatim. Measured, it loses a
level:

```
- one
- two
- ## Notes

  Some prose.

  - alpha
    - beta
- three
```

```tree
list-item: - one
list-item: - two
list-item: - ## Notes
  paragraph:   Some prose.
  list-item:   - alpha        <- was a CHILD of Some prose.
    list-item:     - beta
list-item: - three
```

`- alpha` has become a sibling of `Some prose.` instead of its child. Raising its indentation
does not fix it: at columns 2, 3, 4, 5 and 6 alike the list lands as the paragraph's sibling,
because the attachment rule is applied at section level only (`parse.ts:406`). Below a list item
a paragraph can have no children at all — not a list, not another paragraph, not an atom.

So the conversion is not a choice of style. **Below a list item, a node with children must be a
list item**, and preserving the payload's tree requires re-encoding every node that has children,
not only the root.

### B4 — The rank comes back

The converted item, outdented back to a heading scope, strips its marker and re-parses as a real
heading at its original rank:

```
- one
- two

## Notes

- Some prose.
  - alpha
    - beta
```

```tree
list-item: - one
list-item: - two
h2: ## Notes
  list-item: - Some prose.
    list-item:   - alpha
      list-item:     - beta
```

This is what makes the conversion cheap to accept: the `#` run carries the rank across the move
and gives it back on the way out. Paragraph-ness is the part genuinely lost — there is no marker
to carry it — and paragraph/list-item conversion is what the context-determined rule already
does everywhere else.

### B5 — The reverse direction needs no rule *(unchanged)*

```
# Title

## Sub

More prose.|
```

Pasting `- alpha` / `  - beta` →

```
# Title

## Sub

More prose.

alpha
- beta
```

```tree
h1: # Title
  h2: ## Sub
    paragraph: More prose.
    paragraph: alpha
      list-item: - beta
```

The root takes the destination's content encoding, the descendants keep theirs, and the
attachment rule makes `- beta` a child of `alpha` again. This already works. Nothing has to
become a heading, because headings are only ever created by the heading regime's own operations.

---

## C. Into a heading-bearing scope: the section absorbs what follows

Design D3 accepts this. The frames are here because it is a stated consequence now, and a stated
consequence has to be checkable.

### C1 — A heading pasted mid-run takes the rest of the run with it

```
# Project

- one
- two|
- three
```

Paste →

```
# Project

- one
- two
## Notes

Some prose.

- alpha
  - beta
- three
```

```tree
h1: # Project
  list-item: - one
  list-item: - two
  h2: ## Notes
    paragraph: Some prose.
      list-item: - alpha
        list-item:   - beta
      list-item: - three      <- was a top-level sibling
```

A heading opens a section that runs to the next heading of its level or shallower, so everything
after the anchor is inside the pasted section. A caret at a heading level is a request for a
section at that level, and this is what a section there means.

### C2 — What it would have cost to avoid

Converting instead would demote the heading where a heading was perfectly writable:

```tree
h1: # Project
  list-item: - one
  list-item: - two
  list-item: - ## Notes
    list-item:   - Some prose.
      list-item:     - alpha
        list-item:       - beta
  list-item: - three
```

Relocating instead would land the content at the end of the sibling run rather than at the
caret. Both give up something the caret already said; absorption gives up only the assumption
that a paste never reparents.

### C3 — Absorption is bounded by the destination scope

```tree
h1: # One
  h2: ## Two
    h3: ### Three
      paragraph: prose
      h4: #### Pasted
        paragraph: body
        paragraph: para after     <- absorbed
    h3: ### Four                  <- NOT absorbed
      paragraph: more
```

The enclosing heading's next sibling is shallower than any level the payload can be re-levelled
to, so it ends the inserted section. The exception is the root of a note with no headings, where
there is no scope end and the whole remainder is absorbed — design D3's recorded risk.

### C4 — When the next sibling is a heading, nothing is absorbed *(unchanged)*

```
# One

prose|

# Two

prose
```

Paste →

```tree
h1: # One
  paragraph: prose
  h2: ## Notes
    paragraph: Some prose.
h1: # Two
  paragraph: prose
```

---

## D. Levels are re-derived

Not a cross-regime case — both sides are headings — and not covered by the change's original
framing.

### D1 — Today

```
# One

## Two

### Three

prose|
```

Paste →

```tree
h1: # One
  h2: ## Two
    h3: ### Three
      paragraph: prose
  h2: ## Notes           <- two levels above the caret
    paragraph: Some prose.
```

The payload keeps the levels it was written with. Pasting a `#` section under an `#####` puts it
at root, five levels from where the caret was.

### D2 — Intended

The payload's root re-levels to the destination's depth and every heading in it shifts by the
same delta:

```
# One

## Two

### Three

prose

#### Notes

Some prose.

- alpha
  - beta
```

```tree
h1: # One
  h2: ## Two
    h3: ### Three
      paragraph: prose
      h4: #### Notes        <- child of ### Three, as pointed
        paragraph: Some prose.
          list-item: - alpha
            list-item:   - beta
```

Re-levelling routes through `headingWithLevel`, which rewrites setext to ATX on the way — so a
setext payload stops staying setext as a consequence, with no separate rule.

---

## E. The reported defect: an unguarded path

The 2026-07-25 report, reproduced. A type-over that consumes every node in its scope reaches
`insertAsOnlyChildren`, which calls the shared re-encode step directly and so runs neither
expressibility guard.

### E1 — Today

```
- one
  - two
    ▌- three▌
```

Type-over with the payload →

```
- one
  - two
    ## Section

    A paragraph.

    - alpha
      - beta
```

```tree
list-item: - one
  list-item: ["  - two", "    ## Section"]     <- the heading is now a continuation line
    paragraph:     A paragraph.
    list-item:     - alpha
      list-item:       - beta
```

A heading's leading whitespace is chrome markdown allows up to three columns of. Re-indented to
column 4 the line stops being a heading altogether, and our parser reads it as a continuation
line of the anchor's parent — "the heading becomes a list item and loses its `#` markers, while
the section's other blocks land at inconsistent depths", exactly as reported.

### E2 — Intended

The guard moves into the shared re-encode step, so all three insert paths see it, and this frame
becomes B2's — the payload converts and the tree is preserved.

### E3 — One shape, three answers *(today)*

The same payload, the same destination, differing only in what was selected:

| gesture | path | outcome |
| --- | --- | --- |
| type-over with a surviving sibling | `insertSubtrees` | **veto**, with the "Markdown can't express that content here" notice |
| caret paste | `insertSubtrees` | **native pass**, buffer corrupted |
| type-over consuming the whole scope | `insertAsOnlyChildren` | **rewrite**, heading silently destroyed |

One rule in one place is what collapses these three into one answer.
