# Proposal

## Why

A paste writes a block in the document's unit and keeps the clipboard's own characters only where
the unit would change the block's tree. Two defects sent blocks there that the unit writes
correctly: the read-back dropped the blank line between a root and its first child, and a child
written in another unit from its parent was carried by the root's prefix, where a tab absorbed it.
On random pastes, 5 236 of 38 370 runs with tabs and 5 965 of 43 420 with spaces only fell back on
`main`, against 647 and 140 once both are fixed (`docs/research/paste-fallback-misfires`). #244's
example is one of them: its expected `⏵··1. m` in a two-space note is the fallback's output, and
the unit writes `      1. m`.

The carry is what "Subtree insertion at a boundary" prescribes for any line not opening with its
node's indentation, while the same requirement writes every level in the document's unit and keeps
each line's offset from its node; the child spelled apart meets the first and breaks the second.

## What Changes

- The read-back keeps the blank lines between the block's own nodes and leaves out only the gap
  after its last line.
- A child's line, or a nested node's own line, at or past its node's indentation that does not
  open with it keeps its offset in columns, in spaces after the new indentation. A line short of
  it, a lazy continuation, and the block root's own lines are carried with the root's prefix as
  before: the read-back measures the root from its own column rather than its container's, so it
  would not see a root's line kept in columns land on a block start.

## Non-goals

- The fallback's own writing, where a tab past the root's prefix absorbs the new prefix: #270.
- Seams between blocks: #267.
- The read-back's model of the root's column. It re-roots the block at its indentation modulo a tab
  stop, not at its container's content column, so a root's own line past a two-column container
  can open a block it does not see; that is on `main` for the space spelling already
  (`docs/research/paste-fallback-misfires`, "Left alone").

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `structural-operations`: "Subtree insertion at a boundary" — a line spelled apart from its node
  keeps its column offset; the read-back keeps the block's inner blank lines. Two scenarios.

## Impact

`readsAsWritten` in `src/ops.ts`, `rewriteOwnLine` in `src/reencode.ts`; reached by paste and
cross-scope moves. #267 and #270 carry the same requirement in their deltas, so whichever is
archived after another merges the requirement by hand.
