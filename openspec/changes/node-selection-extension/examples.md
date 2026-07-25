# Examples: current versus intended behavior

Keyboard selection extension. Every **today** frame was measured in a real Obsidian instance
(1.12.7, desktop) on 2026-07-25 via a temporary WebDriver probe suite. The **intended** frames
assume `selection-as-subtree-set` has landed, since this change is sequenced after it.

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
> `selection-as-subtree-set` removes the pull-in, and both problems go with it.

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

