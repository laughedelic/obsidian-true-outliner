# Examples: current versus intended behavior

Keyboard selection extension. Every **today** frame was measured in a real Obsidian instance
(1.12.7, desktop) on 2026-07-25 via a temporary WebDriver probe suite, i.e. BEFORE
`selection-as-subtree-set` landed — so a "today" frame showing an ancestor pulled in (E4) is
already historical, though the granularity and one-way-ratchet frames still hold. The
**intended** frames are written against the post-`selection-as-subtree-set` geometry, which has
since shipped (#36).

Caret-motion examples live in the `content-space-caret` change's own examples.md.

Notation:

| mark | meaning |
| --- | --- |
| `\|` | caret |
| `▌` | this line is inside the selection |

Where today and intended agree, one frame is shown and marked *unchanged*.

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

**Today** — the very first press selects the entire document, and every press after that does
nothing:

```
▌- parent
▌	- child one
▌	- child two
▌- next
```

**Intended** — one node per press, and crossing out of the parent's scope does not add the
parent:

```
1st →   - parent          2nd →   - parent
        	- child one             	- child one
       ▌	- child two             ▌	- child two
        - next                   ▌- next
```

> This case carried the change's biggest open question through two review rounds. With the old
> escalation rule the second press had to pull `- parent` in — a *down* key growing the
> selection upward — and reversing it then needed stored state to find the way back.
> `selection-as-subtree-set` removed the pull-in, and both problems went with it. The "today"
> frame above is what the pre-#36 filter produced; a drag over the same span now already gives
> the intended cover, and only the per-press granularity is left for this change.

### E4c — reversing after leaving a scope

Same document, immediately after E4's second press. Press `⇧↑`.

**Intended**:

```
 - parent
 	- child one
▌	- child two
 - next
```

The selection returns to `- child two`'s own subtree — the cover the first press produced.
Because the parent was never added, the selection's start edge still identifies `- child two`
as where the gesture began, so no extension-origin state is needed to find it.

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

### E7 — Upward out of a FIRST child (design D8)

The shape no earlier example drew: every reversal example above extends downward, and E6's
upward case is flat paragraphs with no ancestor to swallow.

```
- P
	- c|1
	- c2
- Q
```

`⇧↑`.

**Today** — the whole `P` subtree, and then the gesture is stuck. `⇧↓` produces a
byte-identical selection, indefinitely: the head sits at `- P`'s own first column, moves down
one line into `P`'s own trailing gap, and a gap line resolves back to `P`, which re-escalates
to the same cover. Measured for a heading section and for a LOOSE list; a tight list escapes
the trap but drifts its anchor onto `c2` instead.

```
▌- P
▌	- c1
▌	- c2
 - Q
```

**Intended** — the first press takes `- c1` alone, exactly as `⇧↓` would: a caret is not a
cover, so reaching the anchor's own subtree is that press's step (D6). The swallow is the
SECOND press, where downward closure admits no smaller cover containing both `c1` and `- P`,
so `- c2` comes along BELOW the anchor:

```
1st ⇧↑ →   - P          2nd ⇧↑ →  ▌- P          3rd, ⇧↓ →  ▌- P          4th, ⇧↑ →  ▌- P
          ▌	- c1                  ▌	- c1                  ▌	- c1                  ▌	- c1
           	- c2                  ▌	- c2                  ▌	- c2                  ▌	- c2
           - Q                    - Q                    ▌- Q                    - Q
```

`P` is the anchor from the second frame on (D8 — a single-root cover re-seats it), so `⇧↓`
GROWS to `P`'s sibling rather than sticking as it does today. From there the selection
oscillates between the last two frames. `- c1` is not reachable again by keyboard — the swallow
is irreversible, which D8 accepts and states rather than hiding.

> Contrast E4, where the anchor is the LAST child and extension runs downward. There the
> anchor survives every press, because a forest span always begins at the anchor's own subtree
> start and no ancestor can displace it. The asymmetry is inherent to preorder, not a choice.

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

**Intended** — two independent ranges, each taking its own node. Several ranges means
multi-cursor, so each advances its own sequence; the parent is not dragged in:

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

