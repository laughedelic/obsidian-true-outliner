# Proposal

## Why

A block id written on a line of its own — `^t1` under a table — is a paragraph node of its own in
our tree, a sibling of the block Obsidian says it names. Moving, deleting or copying the block
leaves the id behind, and every link to it starts naming whatever now precedes it
([#207](https://github.com/laughedelic/obsidian-true-outliner/issues/207)). The operations probe in
`docs/research/lone-block-id` ("Which operations separate a lone id today") finds move, delete and
copy separating the id in every shape where it follows a block at the same level.

Not every lone id can simply join a node. Where Obsidian's reading is not a node of ours — a whole
list, a block inside a list item — or where Obsidian registers no id at all, attaching the id
anywhere would settle silently what the note means. Those ids need to be shown to the user as
misplaced, with a correction one press away (`docs/research/lone-block-id`, "Two groups").

## What Changes

- The parser attaches a lone id to the node whose own lines end right above it, blank lines
  skipped, wherever Obsidian names that same node: a paragraph, heading, table, quote, callout,
  fence, rule or html block outside a list item; a list item, with the id indented to its content
  column directly after its own lines; a list item with the id directly under it and no blank
  line. The id and the blank lines before it become part of that node's own span, the way an
  inline ` ^id` is part of its line.
- Every structural operation that moves, deletes, copies or re-indents a node takes its attached
  id with it. The round trip stays byte-identical.
- Every other lone id stays the paragraph it parses as today, and outline mode marks it as
  misplaced: a highlight on the id and a warning glyph in place of the line's block marker, with a
  title saying what Obsidian reads it as.
- A press on the highlight or the warning glyph opens a compact menu: what Obsidian reads, the
  corrections that turn the id into an attached one, and removing it. A command opens the same
  menu from the keyboard. Pressing the glyph does not zoom.
- Corrections write an inline id: `Attach to “Lead.”` appends ` ^id` to the lead paragraph's last
  line; `Attach to “c”` appends it to the last node above the id. Ids Obsidian ignores — the first
  of two in a row, one with nothing above it, an id line with trailing spaces or with text directly
  under it — are marked with the correction that makes them work, or with removing them.

## Non-goals

- What an embed of an anchor shows, and where following a link to one lands. Obsidian's reading
  stays in both; showing the outline's node instead is
  [#209](https://github.com/laughedelic/obsidian-true-outliner/issues/209), which depends on this
  change.
- Obsidian's "whole list" reading of an id after a list. No node of ours is a list, and the id is
  marked rather than attached to one.
- Inline ids. An inline id on a block inside a list item names the item, not the block
  (`docs/research/lone-block-id`, "What a lone id names"); that disagreement between the node holding
  the id and the node Obsidian names is #205's attribution to handle, not this change's.
- Rewriting any id the user has not asked to correct. Marking never edits the document.

## Capabilities

### New Capabilities
- `misplaced-block-ids`: which lone ids are misplaced and why, how outline mode marks them, the
  correction menu and command, and the edits each correction makes.

### Modified Capabilities
- `document-tree-mapping`: a lone id belongs to the node it names, and a node's span includes an
  attached id and the blank lines before it.
- `structural-operations`: an attached id travels with its node through every operation.
- `content-space-caret`: an attached id's line is a place the caret can reach; the blank lines
  before it stay gap lines.
- `outline-keyboard-grammar`: Enter and Backspace on an attached id's line.
- `outline-decorations`: a paragraph holding a misplaced id draws a warning glyph in place of its
  kind's marker.
- `outline-zoom`: pressing a misplaced id's warning glyph opens the correction menu and does not
  zoom.

## Impact

- `src/model.ts`, `src/parse.ts`, `src/encode.ts`: the attached-id field, the attachment rule,
  emission, `ownSpan`, `treesEqual`.
- Every walker that reads a node's own lines and gap directly instead of through `ownSpan`:
  `src/caret.ts`, `src/enforce.ts`, `src/classify.ts`, `src/escalate.ts`,
  `src/select-all-ladder.ts`, `src/plugin/decorate.ts`, `src/plugin/fold-model.ts`.
- `src/ops.ts`, `src/reencode.ts`: re-indenting and re-encoding a node carries its id line.
- New core module for detection and corrections; new plugin wiring for the mark, the glyph, the
  menu (`Menu`, public) and the command; `src/plugin/zoom-click.ts` yields the glyph's press.
- A new `styles/` part for the mark and the glyph.
- Tests: round-trip and corpus, generators that produce lone ids, ops properties, e2e for the mark,
  the menu, the command and the zoom exception.
- #205 stacks on this change: its anchor attribution reads the node holding the id's line.
