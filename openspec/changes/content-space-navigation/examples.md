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

## E. Selection extension

### E1 — Loose paragraph *(unchanged)*

```
Alpha o|ne.

Bravo two.
```

`⇧↓` →

```
▌Alpha one.
▌
 Bravo two.
```

The node's own trailing gap comes along — that is what makes a copy or delete of this
selection leave no stray blank line behind.

### E2 — Tight list item

```
- a|lpha
- bravo
- charlie
```

`⇧↓`.

**Today** — two items on the first press, purely because no blank line separates them:

```
▌- alpha
▌- bravo
 - charlie
```

**Intended** — one press, one node, the same as A1's loose case:

```
▌- alpha
 - bravo
 - charlie
```

### E3 — Parent with children *(unchanged)*

```
- pa|rent
	- child one
	- child two
- next
```

`⇧↓` → the whole subtree, matching Logseq and Workflowy:

```
▌- parent
▌	- child one
▌	- child two
 - next
```

### E4 — The last child of a subtree

```
- parent
	- child one
	- child t|wo
- next
```

`⇧↓`.

**Today** — the very first press selects the entire document, and every press after that
does nothing:

```
▌- parent
▌	- child one
▌	- child two
▌- next
```

**Intended** — the first press takes the anchor node. The second press means "take the next
node down", which is `- next`; including it forces the parent's subtree in as well, so both
happen in one press rather than being split into two steps:

```
1st →  - parent          2nd →  ▌- parent
       	- child one             ▌	- child one
      ▌	- child two             ▌	- child two
       - next                   ▌- next
```

Selecting the parent's subtree *without* `- next` is still reachable — that is what the
Mod-A ladder is for — it just is not a stop on the directional walk. Directional extension
answers one question ("one more node, that way"); the ladder answers the other ("wider, from
here").

### E4b — the same walk continues one node per press

```
- parent
	- child one
	- child t|wo
- next
- after
```

`⇧↓` three times. **Intended** — only the second press is a jump, and only because the
invariant forces it:

```
1st →   - parent        2nd →  ▌- parent        3rd →  ▌- parent
        	- child one         ▌	- child one          ▌	- child one
       ▌	- child two         ▌	- child two          ▌	- child two
        - next                 ▌- next               ▌- next
        - after                 - after              ▌- after
```

> Still the case that most needs a manual pass. The second press extends the selection
> *upward* while pressing a *down* key — forced by the rule that a node is never partially
> selected together with content outside it. Only real use can say whether the jump reads as
> sensible or as a surprise.

### E4c — reversing the jump must return to the child, not the parent

Same document, immediately after E4's second press. Press `⇧↑`.

**Intended**:

```
 - parent
 	- child one
▌	- child two
 - next
```

The selection returns to `- child two`'s own subtree — the cover the first press produced.

This example exists because it is the case that breaks a purely stateless implementation.
Once the second press pulls `- parent` in, the selection's two ends are the parent's own
bounds; nothing in the selection still identifies `- child two` as where the gesture began.
An implementation that re-derives the originating node from the selection would step back
into `- parent`'s own sequence and produce the parent's subtree without `- next` — a cover
that never appeared on the way down. Hence the extension origin recorded in design D6.


### E5 — Shrinking back

```
Alpha o|ne.

Bravo two.

Charlie three.
```

Press `⇧↓`, `⇧↓`, then `⇧↑`.

**Today** — the third press does nothing; the selection is a one-way ratchet:

```
▌Alpha one.
▌
▌Bravo two.
▌
 Charlie three.
```

**Intended** — the walk reverses:

```
▌Alpha one.
▌
 Bravo two.

 Charlie three.
```

### E6 — Reversing past the anchor

```
Alpha one.

Bravo t|wo.

Charlie three.
```

Press `⇧↓`, `⇧↓`, `⇧↑`, `⇧↑`. **Intended** progression — the walk shrinks to the anchor
node, then keeps going and starts growing upward:

```
1st →   Alpha one.       2nd →   Alpha one.      3rd →   Alpha one.      4th →  ▌Alpha one.
                                                                                ▌
       ▌Bravo two.               ▌Bravo two.             ▌Bravo two.            ▌Bravo two.
       ▌                         ▌                       ▌
        Charlie three.           ▌Charlie three.          Charlie three.         Charlie three.
```

The caret's original position inside "Bravo two." is not recoverable once the selection
snaps to node boundaries — the smallest rung is the anchor node, whole. Workflowy and
Logseq behave the same way.

### E7 — Escape

```
▌Alpha one.
▌
▌Bravo two.
```

Press `Esc`.

**Today — measured, and messier than either earlier account.** The FIRST Escape changes
nothing. The SECOND collapses to the head edge — which is `3:0`, **a blank gap line**. On a
backward selection the first Escape also changes nothing. So "Escape does nothing" and
"Escape collapses to an edge" are both partly right. The two-press behavior is plausibly the
blur-based chrome mechanism consuming the first press.

**Intended — Escape is not bound.** Native collapse stays exactly as it is; the caret's
landing is corrected by the placement rule, because a cover's end is a gap-line position:

```
Alpha one.

Bravo two.|
```

(The caret lands at the content end of the node owning that gap — `Bravo two.` owns line 3.)

> **Manual-pass item, not a blocker.** Why the first Escape does nothing is worth
> understanding, but it does not change the decision: whatever Escape does natively, it can
> land the caret on chrome, and the placement rule has to catch that regardless. Binding
> Escape would hide the two-press oddity rather than fix it, and would consume a key the
> filed modal block-selection work wants.

### E8 — Two cursors in adjacent siblings

```
- parent
	- child |one
	- child |two
- next
```

Press `⇧↓`.

**Today** — one press collapses everything into a single range covering the whole
document:

```
▌- parent
▌	- child one
▌	- child two
▌- next
```

**Intended** — two independent ranges, each taking its own node. Note this is the shape
Logseq produces from a single gesture; here it takes multiple cursors, but the resulting
selection is the same set of blocks, and the parent is not dragged in:

```
 - parent
▌	- child one
▌	- child two
 - next
```

### E9 — Two cursors in separate paragraphs *(unchanged)*

```
Alpha o|ne.

Bravo two.

Charlie t|hree.
```

`⇧↓` → each range advances independently; this already works:

```
▌Alpha one.
▌
 Bravo two.

▌Charlie three.
▌
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
