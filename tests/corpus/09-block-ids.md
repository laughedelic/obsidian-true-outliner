## paragraph, blank, id

Intro.

Some prose.

^p3

Outro.

## table, blank, id

Intro.

| a | b |
| --- | --- |
| 1 | 2 |

^t1

Outro.

## table, id directly under

Intro.

| a | b |
| --- | --- |
| 1 | 2 |
^t2

Outro.

## quote, id directly under

Intro.

> quoted
^q2

Outro.

## callout, blank, id

Intro.

> [!note] Title
> body

^c1

Outro.

## callout, id directly under

> [!note] Title
> body
^c2

After.

## fence, blank, id

Intro.

```
code
```

^code1

Outro.

## fence, id directly under

```
code
```
^code2

After.

## heading, blank, id

## Head

^h2

body

## heading, id directly under

## Head
^h3

After.

## hr, blank, id

Before.

***

^hr1

After.

## html, blank, id

<div>html</div>

^html1

After.

## table, two blank lines, id

| a | b |
| --- | --- |
| 1 | 2 |


^t3

After.

## paragraph, two blank lines, id

Prose.


^p4

After.

## table under a heading, blank, id

## Head

| x | y |
| --- | --- |
| 1 | 2 |

^t6

After.

## table, id with trailing spaces

| a | b |
| --- | --- |
| 1 | 2 |

^t4   

After.

## table, blank, id, text directly under

| a | b |
| --- | --- |
| 1 | 2 |

^t5
More text.

## paragraph, blank, id, blank, id

Prose.

^y1

^y2

After.

## id at the start of a note

^first

Prose.

## indented id under an item

- item a

  ^under-a
- item b

## indented id under the first of two loose items

- a

  ^x4

- b

## indented id after an item and its child

- a
  - child

  ^x1
- b

## indented id after a nested item

- a
  - child

    ^x2
- b

## id after a paragraph inside an item

- a

  inner prose

  ^x3
- b

## table inside an item, blank, indented id

- a

  | x | y |
  | --- | --- |
  | 1 | 2 |

  ^x5
- b

## fence inside an item, blank, indented id

- a

  ```
  code
  ```

  ^x6
- b

## quote inside an item, indented id directly under

- a

  > quoted
  ^x7
- b

## id at column 0 directly under a list

- a
- b
^l3

After.

## list under a lead paragraph, id directly under

Lead.
- a
- b
^l5

After.

## list, blank, id

Before.

- a
- b

^l1

After.

## list under a lead paragraph, blank, id

Lead.
- a
- b
  - nested c

^l2

After.

## list whose last item has a child, blank, id

- a
- b
  - c

^l4

After.
