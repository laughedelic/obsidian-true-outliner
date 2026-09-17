# A marker with no trailing space: a list item to us, plain text to Live Preview

Measured 17 September 2026 against Obsidian 1.13.7, read out of the application bundle
(`obsidian-1.13.7.asar`, `npm run obsidian:fetch`) rather than inferred from rendering.

The report from real-vault use: a line holding nothing but `-` shows a raw dash. It carries the
outline's indentation, its guide column and its fold arrow, but no bullet — while its siblings
one line above and below show theirs. Reading mode shows the same line as an ordinary bullet.

## The three readers disagree

| reader | `-` alone | the engine |
| --- | --- | --- |
| our parser | empty list item, content column 2 | `LIST_ITEM_RE`, `src/parse.ts` |
| Live Preview | plain text — no list token at all | the CodeMirror 5 markdown mode, `lib/codemirror/markdown.js` |
| reading mode | a list item, the continuation its only content | the CommonMark block tokenizers in `app.js` |

Live Preview's mode gates every list line on one regex:

```js
listRE = /^(?:[*\-+]|^[0-9]+([.)]))\s+/
```

`\s+` requires at least one whitespace character, and `\s` does not match end of line, so a
marker at end of line never matches. That branch is the sole writer of `state.list`, of the
`listStack` push, and of `formatting = ["list", "list-" + listType]` — and `app.js` replaces the
marker with the native `.list-bullet` element only where a `formatting-list-ul` token appears.
No token, no bullet. The line falls through to the inline tokenizer and renders as text.

The same file makes the opposite choice one line down for headings:

```js
atxHeaderRE = modeCfg.allowAtxHeaderWithoutSpace ? /^(#+)/ : /^(#+)(?: |$)/
```

`(?: |$)` admits a marker at end of line explicitly. So the list rule's `\s+` is an
inconsistency within the mode rather than a considered reading of the shape.

Two further rules of that mode are worth recording beside it, both read from the same file:

- `setextHeaderRE = /^ {0,3}(?:\={1,}|-{2,})\s*$/` requires TWO dashes, so Live Preview does not
  read a lone `-` under a paragraph as a setext underline. CommonMark does. Our parser agrees
  with Live Preview here, by a different route: `startsNewBlock` claims the line as a list item
  before the setext check runs.
- `maxNonCodeIndentation` is the enclosing item's content column plus three, and gates the list
  branch as it gates the heading, quote and thematic-break branches.

## Why the line still looks like an item to us

`hasNativeMarker` in `src/plugin/decorate.ts` was `isListItem && i === 0` — a claim about what
Obsidian's DOM holds, made from our parse alone and never checked against the rule Obsidian
actually applies. Everything downstream trusts it:

- `chrome-line.ts` reserves a marker gutter (`--to-list-marker-cols`) for a glyph that is not
  drawn, so the raw dash sits in the column a bullet would have occupied instead of on its
  siblings' column;
- `isMarkerEligible` in `decorations.ts` refuses a synthetic marker to any list item, on the
  grounds that the native one already signals the node;
- the marker-sizing pass queries `.cm-formatting-list`, which that line does not carry.

The predicate is derivable without touching the DOM, because Obsidian's own rule is a pure
function of the line's text. Mirroring `listRE` is what makes the fact true again, and what lets
the synthetic marker every other kind already uses cover the lines Live Preview leaves bare.

## What this does not change

The parse stays as it is. A bare marker is an empty list item in CommonMark and in reading mode,
the continuation `-` / `␣␣text` is one item in both, and `docs/research/list-marker-content-column`
records the content column that follows. Live Preview disagreeing with its own reading mode is a
rendering gap to cover, not a reason to hold a different tree than the file means — the earlier
note followed Live Preview on a question Live Preview alone decides, the width of a content
column, which is not this question.
