# How a note becomes an outline

Everything the plugin does rests on one mapping: a markdown note is parsed into a tree of nodes, and that tree encodes back to exactly the same bytes. This page explains the mapping. It is short, and it answers most of the "why did it do that?" questions that come up in the first week.

## Nodes

Every block in a note is exactly one node. The kinds are:

| Kind | Example | Notes |
| --- | --- | --- |
| Heading | `## Plan` | ATX (`#`) and setext (underlined) headings alike |
| Paragraph | `The 2026 project.` | Any run of text lines that is not something else |
| List item | `- tile`, `3. cabinets`, `- [ ] call the tiler` | Bulleted, ordered and task items |
| Code block | ` ```js … ``` ` | An **atom**: its inside is never parsed |
| Table | `\| a \| b \|` | Atom |
| Callout | `> [!note] …` | Atom |
| Blockquote | `> …` | Atom |
| HTML block | `<div>…</div>` | Atom |
| Thematic break | `---` | Atom |

YAML front matter is an inert preamble, not a node: the outline starts below it and nothing the plugin does can touch it.

Atoms move, indent and zoom as opaque units. Their internal lines are never split or merged, and the caret inside a code block behaves exactly as in stock Obsidian.

## Two ways to nest

Markdown has two ways to say "this belongs under that", and the mapping honours both.

**Headings nest by level.** A heading is the child of the nearest preceding heading with a smaller level, or of the note itself. Everything between a heading and the next heading of the same or smaller level is inside it. A skipped level (`#` followed directly by `###`) is kept verbatim: the `###` heading is a direct child of the `#`, one level down in the tree even though its marker says three. Tree depth is position in the tree, not the number of `#` characters.

**Everything else nests by indentation.** A list item's children are the blocks indented to at least its content column. Those children may be any kind: a nested list, but also a paragraph, a code block or a table.

Indenting a **heading** with Tab therefore changes its level (`##` becomes `###`, its subtree's headings shift with it), the way org-mode promotes and demotes. Indenting **anything else** re-parents it under its previous sibling and rewrites only the lines that need new indentation or a new marker.

## The paragraph adoption rule

A list that directly follows a paragraph is parsed as that paragraph's children:

```markdown
Things to pack.
- shirts
- socks

Another thought.
```

Here `shirts` and `socks` are children of `Things to pack.`, and `Another thought.` is the paragraph's next sibling. A list that directly follows a heading, with no paragraph in between, is a direct child of the heading.

This is what makes the "paragraph with a list under it" idiom, which is everywhere in real notes, an actual parent with children rather than four unrelated blocks. It also explains two things the plugin refuses to do:

- **Moving a top-level list item down past a paragraph** is refused. Landing after that paragraph would make the item its child, which is a different result from the swap that was asked for.
- **Moving a paragraph up above a list item** is refused for the mirror reason: the item would be adopted.

The cue in both cases is *Markdown would nest that under the paragraph instead.* The rule only applies among the children of a heading or the note itself; inside a list item, a paragraph does not adopt the list after it.

## One blank line, two readings

This is the one place the mapping can surprise, so it is worth seeing once:

```markdown
- item                - item
  more text
                        more text
```

On the left, `more text` is a continuation line of the item: one node, two lines. On the right, separated by a blank line, it is a paragraph **child** of the item: two nodes. Both are valid markdown, both render almost identically, and the blank line is the only difference. The outline draws them differently, with the child on its own row with its own marker, one level in, which is the quickest way to tell which one a note has.

## Blank lines belong to the node above

The blank lines after a block are part of that block: they move with it, are deleted with it, and the caret skips over them. That is why moving a section never leaves a stray blank line behind, and why deleting a selection never leaves two blank lines where there was one.

Setext headings (a title with `===` or `---` under it) are one node of two lines. The underline is part of the heading's mark: the caret does not stop on it and Enter there is refused.

## The round-trip guarantee

Parsing a note and encoding the tree back produces the **same bytes**: indentation style, list markers, trailing whitespace and blank-line runs included. After a structural edit, every line that belongs to a node the edit did not touch is byte-identical to what it was. Only the nodes the edit moved or reshaped are rewritten, and only as far as needed: an outdented item that lands among paragraphs becomes a paragraph, an item that lands among a `1.` list gets renumbered, indentation is copied from the siblings at the destination so a tab-indented note stays tab-indented.

The consequence for daily use is that outline mode can be switched on and off freely, on any note, without leaving a trace. There is nothing to migrate and nothing to clean up.

## What is not a tree operation

Ordinary typing inside a node is never touched. Typing `# ` at the start of a paragraph turns it into a heading; deleting the `- ` at the start of an item turns it into a paragraph. Both are authoring, not violations, and both are allowed exactly as in stock Obsidian. The plugin only steps in when an edit reaches across a node boundary, and then it either rewrites the edit into the well-formed equivalent or refuses it with a cue. That is covered in [Structural editing](./structural-editing#editing-across-node-boundaries).
