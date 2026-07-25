# Examples: current versus intended behavior

Every **today** frame in this document was measured in a real Obsidian instance
(1.12.7, desktop) on 2026-07-25 via a temporary WebDriver probe suite, not derived
from reading the code. The **intended** frames are the proposal's target behavior and
are what a manual pass should feel out before the specs are settled.

Notation:

| mark | meaning |
| --- | --- |
| `\|` | caret |
| `×` | mouse click point |
| `▌` | this line is inside the selection |
| `⟦…⟧` | selection bounds inside a line |

Keyboard selection-extension examples live in the `node-selection-extension` change's
own examples.md.

Where today and intended agree, one frame is shown and marked *unchanged* — those cases
are the behavior we are protecting, and a manual pass should confirm they stay put.

---

## A. Vertical motion

### A1 — Down across a gap

```
Alpha o|ne.

Bravo two.
```

Press `↓`.

**Today** — the blank line costs a press, and the column is lost:

```
Alpha one.
|
Bravo two.
```

**Intended** — one press, one node, column preserved:

```
Alpha one.

Bravo t|wo.
```

### A2 — Down over a short node, three presses

```
Alpha o|ne.

Hi

Charlie three.
```

Press `↓` three times.

**Today** — four presses are needed to reach the third node at all:

```
1st →  Alpha one.        2nd →  Alpha one.       3rd →  Alpha one.
       |                                                
       Hi                        Hi|                     Hi
                                                         |
       Charlie three.            Charlie three.          Charlie three.
```

**Intended** — the goal column survives the short node, exactly as it survives a short
line today:

```
1st →  Alpha one.        2nd →  Alpha one.

       Hi|                      Hi

       Charlie three.           Charlie| three.
```

> **Carried reservation, with the evidence for it.** Column preservation across skipped
> gaps is the one rule here adopted on precedent (Logseq behaves this way) rather than
> from a felt problem, and docs/research/13 records a concrete drift risk: snapping the
> landing position on every vertical move recomputes the *next* move's goal column from
> the snapped position rather than from the user's actual motion. Two measurements make
> this less alarming than it reads. First, CM6's goal column already survives gap lines
> today — the frames above show column 7 restored after passing over one. Second, the
> drift mechanism is specific to *snapping after the fact*; computing the target directly
> in a motion command sets the goal once, from the true motion. That is an argument for
> implementing motion as commands rather than as post-hoc correction, which this change
> already chose for an independent reason (see C2's Home inconsistency). It remains
> something to feel out in real navigation, not to settle from reasoning.

### A3 — Up across a gap

```
Alpha one.

Bravo t|wo.
```

Press `↑`.

**Today** — lands on the blank line. **Intended**:

```
Alpha o|ne.

Bravo two.
```

### A4 — Down at the last node

```
Alpha one.

Bravo t|wo.
```

(The file ends with a newline, so there is one more empty line below.)

Press `↓`.

**Today** — the caret rests on the final empty line and stays there on further presses.

**Intended** — the caret moves to the end of the last node's content, and a further `↓`
does nothing:

```
Alpha one.

Bravo two.|
```

### A5 — Down onto a marker line clamps, it does not skip *(unchanged)*

```
a paragraph| here
- item
```

Press `↓`. The goal column falls inside the next line's `- ` marker. The caret clamps to
that item's content start — it does **not** continue past the item looking for an
addressable column:

```
a paragraph here
- |item
```

This already works today, and is specified as
`node-selection-enforcement`'s "Vertical motion onto a shorter marker line still lands on
content". It is called out here because it is the case that distinguishes the two vertical
corrections: a **blank line** has no content to land on, so motion continues past it; a
**marker line** has content, so motion clamps within it. Collapsing both into "keep going
until the position is addressable" would silently skip the whole item.

---

## B. Horizontal motion

### B1 — Left at a list item's content start

```
- alpha
- |bravo
```

Press `←`.

**Today** — nothing happens. Not on the first press, not on the third: the caret cannot
leave a list item backwards at all. The only escape is `Home` twice, then `←`.

**Intended**:

```
- alpha|
- bravo
```

### B2 — Right at a list item's end *(unchanged)*

```
- alpha|
- bravo
```

Press `→`. Forward motion already skips the next item's marker correctly:

```
- alpha
- |bravo
```

### B3 — Left at a paragraph start across a gap

```
Alpha one.

|Bravo two.
```

Press `←`.

**Today** — lands on the blank line. **Intended**:

```
Alpha one.|

Bravo two.
```

### B4 — Right at a paragraph end

```
Alpha one.|

Bravo two.
```

Press `→`.

**Today** — lands on the blank line. **Intended**:

```
Alpha one.

|Bravo two.
```

### B5 — Left at the document's first node

```
- |alpha
- bravo
```

Press `←`. Nothing happens, today and intended — there is nothing above to move to, and
it stays **silent**: a document boundary is self-evident and needs no cue, unlike a
structural rejection where the reason is not visible.

---

## C. Home and End

### C1 — Home *(unchanged)*

```
- br|avo
```

`Home` →

```
- |bravo
```

### C2 — Home twice

```
- br|avo
```

Press `Home` twice.

**Today** — the second press lands the caret inside the marker, a position `←` and mouse
clicks are both prevented from reaching:

```
|- bravo
```

**Intended** — the second press does nothing; content start is as far as it goes:

```
- |bravo
```

### C3 — End on a single-line node *(unchanged)*

```
- br|avo
```

`End` →

```
- bravo|
```

### C4 — Home in a multiline node

A node can span several lines: continuation lines from `⇧Enter`, or a multi-line
paragraph. The line and the node are then different things.

```
- first line of the item
  second line of |the item
- next item
```

**Intended** — first press takes the line, second takes the node:

```
1st →  - first line of the item      2nd →  - |first line of the item
       |second line of the item             	second line of the item
       - next item                          - next item
```

The first press lands at the continuation line's own content column, not at column 0 —
alignment whitespace is marker chrome like any other.

### C5 — End in a multiline node

```
- first li|ne of the item
  second line of the item
- next item
```

**Intended**:

```
1st →  - first line of the item|     2nd →  - first line of the item
         second line of the item              second line of the item|
       - next item                          - next item
```

### C6 — the single-line collapse

```
Alpha o|ne.
```

For a node that occupies one line, the line boundary and the node boundary are the same
position, so the two rungs collapse into one: `Home` reaches content start and a second
press does nothing. This is the same adjacent-identical-rung collapse the Mod-A ladder
already specifies.

> **Open detail for the manual pass.** Obsidian wraps long lines by default, so a single
> logical line can occupy several visual rows. Native `Home` goes to the *visual* row's
> start. The recommendation is to keep that as the first rung — long wrapped paragraphs
> are exactly where it earns its keep — making the full sequence: visual row → node
> content. That is still two presses in every case that matters, since for an unwrapped
> line the visual row and the logical line coincide and collapse.

---

## D. Mouse

### D1 — Click on a gap line

```
Alpha one.
×
Bravo two.
```

**Today** — the caret lands on the blank line.

**Intended** — the gap belongs to the node above it, so the caret lands at that node's
content end. No "which side is nearer" heuristic is involved:

```
Alpha one.|

Bravo two.
```

### D2 — Click on a marker *(unchanged)*

```
- alpha
×- bravo
```

The caret lands at content start — this already works, for markers and for nested
indentation alike:

```
- alpha
- |bravo
```

---

## F. Headings

Headings are ordinary nodes under every rule above. They are not a special case; they
simply own a section the way a list item owns its children. Two consequences are worth
showing explicitly, because they cut in opposite directions.

### F1 — a heading's `#` prefix stays addressable

```
## Some he|ading
```

`Home` →

```
|## Some heading
```

Unlike a list marker, `#` is text the user writes and edits directly. This is already the
shipped position: `clampCursorToContent` is list-item-only by construction, and
`progressive-select-all` already specifies column 0 as a heading's content-start rung.
Whether headings should eventually get the same prohibition is a question deliberately
parked in docs/research/04 (Q17) — this change does not reopen it.

### F2 — motion across a heading's gap

```
# Head|ing

Body text.
```

Press `↓`. **Today** — lands on the blank line. **Intended** — the same as any other
node pair:

```
# Heading

Body |text.
```

### F3 — extending from a heading takes its section

```
# Head|ing

Body text.
```

`⇧↓` → the heading's whole subtree, exactly as `⇧↓` on a parent list item takes its
children (measured; unchanged by this proposal):

```
▌# Heading
▌
▌Body text.
▌
```

---

## G. Frontmatter and the preamble

Nothing in this change applies here — the section exists to pin that "nothing" down, because
the addressable-position rule is stated over node content spans and frontmatter belongs to no
node. Read without the carve-out, that rule would clamp the caret out of the preamble.

### G1 — the caret already cannot enter rendered frontmatter *(unchanged)*

```
---
title: Note
tags: [a]
---
|
Alpha one.
```

Measured: with properties rendered in Live Preview, placing the caret on a frontmatter line
lands it on the blank line below the closing `---` instead. `ArrowUp` from the first node
stops there too, and `ArrowLeft` at the first node's start does the same. Obsidian is already
keeping the caret out; the plugin adds nothing.

That blank line is preamble — it belongs to no node, and no node owns it as a trailing gap.
It stays addressable.

### G2 — Source mode frontmatter is ordinary text *(unchanged)*

```
---
tit|le: Note
---

Alpha one.
```

With the raw markdown showing, every position in the frontmatter is editable text and every
motion key behaves exactly as it does with the plugin disabled. No clamping, no gap-skipping,
no extension geometry.

### G3 — extension from the first node does not reach into the preamble

```
---
title: Note
---

Alpha o|ne.

Bravo two.
```

`⇧↓` selects `Alpha one.`'s subtree, and repeated `⇧↑` bottoms out there rather than
extending upward into the frontmatter — the preamble is not a node and has no cover.
