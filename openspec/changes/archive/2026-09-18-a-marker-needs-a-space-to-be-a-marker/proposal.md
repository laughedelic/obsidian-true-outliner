## Why

A line holding nothing but `-` rendered as a raw dash carrying an outline's indentation, its guide
column and its fold arrow. Reported from real-vault use on 2026-09-17, with screenshots, in stock
Live Preview and in outline mode alike.

Three readers disagree about that line, measured out of the 1.13.7 bundle and recorded in
[docs/research/marker-without-trailing-space](../../../docs/research/marker-without-trailing-space.md):
our parser and Obsidian's own reading mode read an empty list item, while the CodeMirror markdown
mode Live Preview runs gates every list token on `listRE = /^(?:[*\-+]|^[0-9]+([.)]))\s+/`, whose
`\s+` no marker at end of line can satisfy. One line below it, the same file admits a marker at end
of line for headings (`/^(#+)(?: |$)/`), so the list rule's `\s+` is an inconsistency within the
mode rather than a reading of the shape.

Reading the marker as an item cost more than the missing bullet. Measured, typing into an empty
line:

| after typing | list treatment | bullet | text-indent | glyphs at |
| --- | --- | --- | --- | --- |
| (empty) | no | — | 0px | −6.78 |
| `-` | yes | yes | −14px | −2.89 |
| `-4` | no | — | 0px | −6.78 |
| `- ` (the other branch) | yes | yes | −14px | −2.89 |

The line acquired list structure and shifted on a character that is still ambiguous, then gave both
back on the next keystroke. The space after a marker is the keystroke by which a user declares the
intent to make an item, and nothing should move before it.

## What Changes

- **A marker needs whitespace after it to be a marker.** `LIST_ITEM_RE` stops admitting a marker at
  end of line; `- `, `-⇥` and `-␣␣` are all still items, and only the exact end-of-line case moves.
  A bare marker is a paragraph, and in outline mode it carries the block marker every paragraph
  carries — the odd shape stays visible rather than being dressed as an item.
- **The caret rule follows the parse.** `caret.ts`'s `LIST_PREFIX` required whitespace *or* end of
  line, making the dash chrome the caret could not sit on. It requires whitespace now, which also
  decides a shape the node kind cannot: an item's continuation line reading exactly `␣␣-` is the
  item's own text, and its dash stays addressable.
- **A continuation's prefix is measured in COLUMNS.** Independent of the rule above and the one
  defect in this area that survives it: the prefix counted the marker's characters plus its run's,
  where the content column counts columns, and the two diverge wherever a tab sits inside the run.
  `-⇥x` puts its content at column 4 while its marker and run are two characters, so Shift+Enter
  landed the continuation two columns short and it re-parsed as a top-level paragraph.

## Non-goals

- **No new decoration.** A paragraph's own block marker is what the line gets, which the marker
  machinery already draws for every other paragraph. Nothing is supplied for a bullet Obsidian
  declines to draw, because the line is not an item.
- **Reading mode is left divergent, knowingly.** CommonMark and Obsidian's reading mode read a bare
  marker as an empty item and will keep rendering it as a bullet. A user who adds the space gets
  agreement everywhere; one who does not sees the ambiguity flagged rather than concealed on the
  surface they are editing.
- **The list a bare marker splits** is an accepted consequence, not a shape to repair. See the
  research note's closing section.

## Supersedes

This change replaces two open PRs, both of which treated the item reading as given:

- **#127** (`fix/continue-an-item-with-a-bare-marker`) fixed the continuation Shift+Enter writes on
  a bare marker. Under this rule the line is a paragraph and the position it opened was always that
  paragraph's own second line, so the defect issue #116 reported dissolves. Its column arithmetic
  survives and is carried here; its clamp change does not, because the blind spot that motivated it
  cannot arise once a bare marker is no longer an item.
- **#134** (`fix/a-bare-marker-shows-no-bullet`) supplied the bullet Live Preview declines to draw.
  Its premise goes with the parse rule: there is no item, and Obsidian is right to leave the line
  bare. Its bundle measurements are kept in the research note this change carries.
