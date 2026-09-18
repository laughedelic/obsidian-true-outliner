# A marker with no trailing space: what each reader makes of it, and which one we follow

Measured 17 September 2026 against Obsidian 1.13.7, read out of the application bundle
(`obsidian-1.13.7.asar`, `npm run obsidian:fetch`) rather than inferred from rendering.

The report from real-vault use: a line holding nothing but `-` shows a raw dash. It carried the
outline's indentation, its guide column and its fold arrow, but no bullet — while its siblings one
line above and below showed theirs. Reading mode shows the same line as an ordinary bullet.

## The three readers disagree

| reader | `-` alone | the engine |
| --- | --- | --- |
| our parser, as it was | empty list item, content column 2 | `LIST_ITEM_RE`, `src/parse.ts` |
| Live Preview | plain text — no list token at all | the CodeMirror 5 markdown mode, `lib/codemirror/markdown.js` |
| reading mode | a list item, the continuation its only content | the CommonMark block tokenizers in `app.js` |

Live Preview's mode gates every list line on one regex:

```js
listRE = /^(?:[*\-+]|^[0-9]+([.)]))\s+/
```

`\s+` requires at least one whitespace character, and `\s` does not match end of line, so a marker
at end of line never matches. That branch is the sole writer of `state.list`, of the `listStack`
push, and of `formatting = ["list", "list-" + listType]` — and `app.js` replaces the marker with
the native `.list-bullet` element only where a `formatting-list-ul` token appears. No token, no
bullet. The line falls through to the inline tokenizer and renders as text.

The same file makes the opposite choice one line down for headings:

```js
atxHeaderRE = modeCfg.allowAtxHeaderWithoutSpace ? /^(#+)/ : /^(#+)(?: |$)/
```

`(?: |$)` admits a marker at end of line explicitly. So the list rule's `\s+` is an inconsistency
within the mode rather than a considered reading of the shape.

Two further rules of that mode, read from the same file:

- `setextHeaderRE = /^ {0,3}(?:\={1,}|-{2,})\s*$/` requires TWO dashes, so Live Preview does not
  read a lone `-` under a paragraph as a setext underline. CommonMark does.
- `maxNonCodeIndentation` is the enclosing item's content column plus three, and gates the list
  branch as it gates the heading, quote and thematic-break branches.

## We follow Live Preview

The surface being edited is the one whose reading a user can act on, and the space after a marker
is the keystroke that declares the intent to make an item. Measured, typing into an empty line
with the item reading in force:

| after typing | list treatment | bullet | text-indent | glyphs at |
| --- | --- | --- | --- | --- |
| (empty) | no | — | 0px | −6.78 |
| `-` | yes | yes | −14px | −2.89 |
| `-4` | no | — | 0px | −6.78 |
| `-42 is negative` | no | — | 0px | −6.78 |
| `- ` (the other branch) | yes | yes | −14px | −2.89 |

So the line acquired list structure and shifted on a character that is still ambiguous, then gave
both back on the next keystroke. Reading the marker the way the editing surface does removes that:
nothing moves until the space arrives, and a dash that turns out to start `-42` was never anything
but text.

`docs/research/list-marker-content-column` set the same precedent for the same reason, on the
width of a content column: where the readers disagree, follow the one whose rendering the report is
about.

## What follows from it

A bare marker is a PARAGRAPH, and in outline mode it carries the block marker every paragraph
carries — the shape stays visible rather than being dressed as an item. `- `, `-⇥` and `-␣␣` are
all still items: only the exact end-of-line case moves.

Three things dissolve with it rather than needing fixes of their own:

- **The continuation position.** Shift+Enter on a bare marker writes a column-0 line, and typing
  there makes that line the paragraph's second line — one node. Under the item reading the same
  bytes made a top-level paragraph beside an item, which is the defect issue #116 reported.
- **The bullet that was not drawn.** Nothing to supply: the line is not an item, and Obsidian is
  right to leave it bare.
- **The empty-item ladder.** `itemContentIsEmpty` reads a bare marker as content because
  `contentColumnCh` requires whitespace after a marker; with the line no longer an item, Enter
  there splits a paragraph and never reaches that path.

The caret rule moves with the parse: `caret.ts`'s `LIST_PREFIX` required whitespace or END OF LINE,
so the dash was chrome the caret could not sit on. It requires whitespace now, which also decides a
shape the node kind cannot — an item's continuation line reading exactly `␣␣-`, which is the item's
own text.

## What a bare marker does to a list around it

It ends the list, and the items below it attach to it. `- a` / `- b` / `-` / `- c` / `- d` parses
as two items, then a paragraph whose children are the last two — the list-after-paragraph rule
(`src/rules.ts`) running because the marker line is now a paragraph. Measured, `- c` and `- d` come
out at depth 1 where they were at depth 0, so they render one level in, under a paragraph's block
marker.

That is the behaviour rather than a cost to pay down. The reader gets told, in the outline's own
vocabulary, that something on that line is unfinished: a paragraph marker where a bullet should be,
and the items below visibly parented to it. Typing the space undoes all of it in one keystroke and
the flat list of five comes back.

It happens only where a list stack can empty, which is section level: the same three lines inside
an item's subtree leave the items below as the paragraph's siblings, because the attachment rule
never runs there. Both shapes are pinned in `tests/corpus.test.ts`.

CommonMark and reading mode read one list of three throughout, so a note authored elsewhere with an
empty bullet mid-list reads differently here than it does on export. The shape is not one the
outline's own grammar produces — the ladder writes `- `, with the space — so reaching it means
importing it, which is the case the feedback is for.
