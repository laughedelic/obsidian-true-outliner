# Top

## Current sprint

- Alarm list ships ^alarm-list
  - owner: Maya
- Mobile triage view ^mobile-triage
- Retro notes

## Backlog

- Later ideas
  - Offline mode ^offline

| a | b |
| --- | --- |
| 1 | 2 |

^zt-table

- first of list
- second of list

^zt-list

- holder item

  inner prose ^zt-inner

Lead. ^zt-k3

^zt-k4

## Duplicate

The first one.

## Duplicate

- lonely item ^nobody

# Shapes

The block-id shapes of docs/research/zoom-scoped-backlinks and docs/research/lone-block-id, one per section, each id prefixed with its section's number.

###### Shape 1: paragraph, id at end

Some prose. ^s1-p1

###### Shape 2: paragraph, id directly below

Some prose.
^s2-p2

###### Shape 3: paragraph, blank, id

Some prose.

^s3-p3

###### Shape 4: item with children, id at end

- parent ^s4-li1
  - child

###### Shape 5: nested item, id at end

- parent
  - child ^s5-li2

###### Shape 6: two-line item, id on continuation

- first line
  second line ^s6-li3

###### Shape 7: heading, id at end

## Head ^s7-h1

body

###### Shape 8: table, blank, id

| a | b |
| --- | --- |
| 1 | 2 |

^s8-t1

###### Shape 9: table, id directly below

| a | b |
| --- | --- |
| 1 | 2 |
^s9-t2

###### Shape 10: quote, blank, id

> quoted

^s10-q1

###### Shape 11: quote, id directly below

> quoted
^s11-q2

###### Shape 12: callout, blank, id

> [!note] Title
> body

^s12-c1

###### Shape 13: fence, blank, id

```
code
```

^s13-code1

###### Shape 14: two items, blank, id

- a
- b

^s14-l1

###### Shape 15: id indented under an item, after a blank

- item a

  ^s15-under-a
- item b

###### Shape 16: lead, nested list, blank, id

Lead.
- item a
- item b
  - nested c

^s16-l2

###### Shape 17: callout body line ending an id

> [!note] Title
> body line ^s17-cb

###### Shape 18: quote line ending an id

> quoted line ^s18-qa

###### Shape 19: heading, blank, id

## H

^s19-h2

###### Shape 20: heading, id directly below

## H
^s20-h3

###### Shape 21: rule, blank, id

***

^s21-hr1

###### Shape 22: html, blank, id

<div>html</div>

^s22-html1

###### Shape 23: fence, id directly below

```
code
```
^s23-code2

###### Shape 24: callout, id directly below

> [!note] T
> body
^s24-c2

###### Shape 25: table, two blanks, id

| a |
| --- |
| 1 |


^s25-t3

###### Shape 26: paragraph, two blanks, id

Para.


^s26-p4

###### Shape 27: table under a heading, blank, id

## H

| a |
| --- |
| 1 |

^s27-t6

###### Shape 28: id with trailing spaces

| a |
| --- |
| 1 |

^s28-t4   

###### Shape 29: id with text directly under

| a |
| --- |
| 1 |

^s29-t5
More text.

###### Shape 30: two ids in a row

Para.

^s30-y1

^s30-y2

###### Shape 31: item, child, blank, id at the item column

- a
  - child

  ^s31-x1

###### Shape 32: item, child, blank, id at the child column

- a
  - child

    ^s32-x2

###### Shape 33: item, blank, id, blank, next item

- a

  ^s33-x4

- b

###### Shape 34: prose inside an item, blank, id

- a

  inner prose

  ^s34-x3

###### Shape 35: table inside an item, blank, id

- a

  | t |
  | --- |
  | 1 |

  ^s35-x5

###### Shape 36: fence inside an item, blank, id

- a

  ```
  code
  ```

  ^s36-x6

###### Shape 37: quote inside an item, id directly below

- a

  > quoted
  ^s37-x7

###### Shape 38: two items, id directly below

- a
- b
^s38-l3

###### Shape 39: lead, two items, id directly below

Lead.
- a
- b
^s39-l5

###### Shape 40: items, nested item, blank, id

- a
- b
  - c

^s40-l4

###### Shape 41: prose inside an item, ending an id

- a

  inner prose ^s41-x8

###### Shape 42: table inside an item, last row ending an id

- a

  | x | y |
  | --- | --- |
  | 1 | 2 | ^s42-x9
- b

###### Shape 43: quote inside an item, ending an id

- a

  > quoted ^s43-x10

###### Shape 44: lead, items, nested item ending an id

Lead.
- a
- b
  - c ^s44-l6

###### Shape 45: lead, blank, id, item directly under

Lead.

^s45-id3
- a

###### Shape 46: lead, blank, id, heading directly under

Lead.

^s46-f1
## H

###### Shape 47: table, blank, id, item directly under

| a |
| --- |
| 1 |

^s47-f6
- a

###### Shape 48: table, id directly below, item directly under

| a |
| --- |
| 1 |
^s48-f7
- a

###### Shape 49: heading, id directly below, item directly under

## H
^s49-f12
- a

###### Shape 50: lead, blank, id, table directly under

Lead.

^s50-f15
| a |
| --- |
| 1 |

###### Shape 51: heading, blank, id, item directly under

## H

^s51-f11
- a

###### Shape 52: callout, id, item directly under

> [!note] T
> body
^s52-g9
- a

###### Shape 53: lead, blank, id, blank, item

Lead.

^s53-id4

- a

###### Shape 54: lead, id directly under, item directly under

Lead.
^s54-id1
- a

###### Shape 55: lead, id directly under, blank, item

Lead.
^s55-id2

- a

###### Shape 56: two-line lead, id directly under

Lead one
lead two
^s56-id5

###### Shape 57: items, blank, indented id, item directly under

- z
- a

  ^s57-f8
- b

###### Shape 58: item, blank, id, nested item directly under

- a

  ^s58-f9
  - c

###### Shape 59: item, id, item directly under

- a
^s59-f10
- b

###### Shape 60: item, blank, id, quote directly under

- a

  ^s60-g1
  > q

###### Shape 61: item, id, quote directly under

- a
^s61-g2
> q

###### Shape 62: item, id, heading directly under

- a
^s62-g3
## H

###### Shape 63: item, blank, id, heading directly under

- a

  ^s63-g4
## H

###### Shape 64: item, id, ordered item directly under

- a
^s64-g5
1. b

###### Shape 65: item, blank, id, text directly under

- a

  ^s65-g6
Text.

###### Shape 66: item, id, continuation directly under

- a
^s66-g7
  more

###### Shape 67: table, blank, id, blank, id

| a | b |
| --- | --- |
| 1 | 2 |

^s67-t1

^s67-t2

###### Shape 68: quote, lazy id, blank, id

> q
^s68-n5

^s68-n6

###### Shape 69: heading, id directly under, blank, id

## H
^s69-n9

^s69-n10

###### Shape 70: paragraph, id directly under, blank, id

Lead.
^s70-n15

^s70-n16

After.

###### Shape 71: paragraph with an inline id, blank, id

Lead. ^s71-k3

^s71-k4

After.

###### Shape 72: item, blank, indented id, blank, id at column 0

- a

  ^s72-n1

^s72-n2

###### Shape 73: item, lazy id, blank, id at column 0

- a
^s73-n3

^s73-n4

###### Shape 74: two items, indented id under the last, blank, id

- b
- a

  ^s74-n7

^s74-n8

###### Shape 75: nested item, its id, then the parent item id

- a
  - c

    ^s75-n11

  ^s75-n12

###### Shape 76: item, blank, two indented ids in a row

- a

  ^s76-n13

  ^s76-n14

###### Shape 77: item, blank, id, blank, id, next item

- a

  ^s77-p5

  ^s77-p6
- b

###### Shape 78: item, blank, id, child, blank, id

- a

  ^s78-p1
  - c

  ^s78-p2

###### Shape 79: item, lazy id, child, blank, id

- a
^s79-p3
  - c

  ^s79-p4

###### Shape 80: item, id at content column directly under, blank, id

- a
  ^s80-p7

  ^s80-p8

###### Shape 81: item, lazy id, blank, indented id

- a
^s81-p9

  ^s81-p10

###### Shape 82: item with an inline id, blank, indented id

- a ^s82-k1

  ^s82-k2

###### Shape 83: paragraph with an inline id, id directly under

Lead. ^s83-k5
^s83-k6

After.

###### Shape 84: heading with an inline id, blank, id

## H ^s84-k7

^s84-k8

After.

###### Shape 85: quote with an inline id, blank, id

> q ^s85-k9

^s85-k10

After.

###### Shape 86: paragraph, id ending the first of two lines

Lead ^s86-m1
second line

After.

###### Shape 87: item, id ending the first of two lines

- a ^s87-m2
  second line

After.

###### Shape 88: code block, a line inside ending an id

```
code ^s88-m3
more
```

After.

###### Shape 89: table, a middle row ending an id

| a | b |
| --- | --- |
| 1 | 2 | ^s89-m4
| 3 | 4 |

After.

###### Shape 90: quote, first of two lines ending an id

> q ^s90-m5
> more

After.

###### Shape 91: setext heading ending an id

Title ^s91-m6
===

After.
