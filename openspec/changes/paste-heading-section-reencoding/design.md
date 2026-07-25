## Context

The mapping model has two encoding regimes. A heading's depth is carried by its `#` count; a
list item's is carried by its indentation. Both derive tree position, and structural operations
already respect the split for level-shifting (Q2, `structural-operations`). Paste is where they
have to meet: a subtree copied from one regime can be dropped into the other, and there is no
recorded rule for what happens.

Observed today, from real-vault use: pasting a heading section into a list drops the heading's
`#` and turns it into a list item, while its descendants keep their original encoding and land
at inconsistent depths. That is not one decision applied consistently — it is the absence of a
decision, with each block re-encoded on its own.

The change is scoped narrowly on purpose. The two earlier paste-re-indentation fixes (Q18, Q19)
each began as "one obviously correct call site and one silently-stale duplicate", and both were
found only when a real note produced a wrong result. This one starts from a real note too.

## Goals / Non-Goals

**Goals:**

- One stated rule for a payload crossing between regimes, applied to the whole subtree.
- The existing guarantee — internal relative nesting preserved exactly — holds for descendants,
  not just the root.
- Whatever the rule is, it is expressible as concrete before/after examples a manual pass can
  check.

**Non-Goals:**

- Changing Tab/Shift+Tab level-shift semantics.
- Changing what a selection can contain.
- Solving arbitrary kind conversion in general; this is about the heading/content boundary
  specifically.

## Decisions

### D1. What a heading becomes inside a list scope — open, with three candidates

Deliberately unresolved in this document. The options differ enough that choosing without worked
examples would repeat the mistake the earlier paste fixes made.

**Option A — convert.** The heading becomes a list item at the destination depth; its
descendants re-encode into the list regime beneath it, preserving relative nesting. Most
Logseq-like, and it means a paste always succeeds. Cost: heading-ness is silently lost, and the
inverse paste cannot restore it — a lossy operation in a project whose central invariant is
losslessness of the *document*, though not of a copy/paste round trip.

**Option B — preserve.** The heading stays a heading, landing after the list rather than inside
it, at the nearest valid position. No information is lost, but the paste does not go where the
user pointed, which is its own surprise.

**Option C — reject.** The paste is vetoed with the existing transient cue naming the reason.
Cheapest and never wrong, but it makes a common editing move impossible and pushes users to turn
outline mode off, which is a poor answer for something this ordinary.

*How to decide:* build the examples file first, with each option's result for the same handful
of real shapes — a heading section into a list at depth 1 and depth 3, a list subtree into a
heading section, a section containing a callout and a code block. Then judge. This is the same
sequence that settled the caret and extension work.

### D2. The rule applies to the whole subtree, in one pass

Whatever D1 chooses, the payload re-encodes as a unit: the root's target encoding determines the
regime, and every descendant is re-encoded relative to it. The observed breakage — descendants
keeping their original encoding while the root changed — is precisely what per-block handling
produces.

### D3. One call site

`reencodeBlocksForDestination` is already the shared path extracted in Q19 after the second
duplicate-logic incident. The cross-regime rule goes there, not into a new branch beside it.

## Risks / Trade-offs

- **Option A is lossy across a copy/paste round trip** → it does not violate the isomorphism
  invariant, which is about a document round-tripping to its own tree, but it is worth stating
  plainly rather than discovering later.
- **Option C makes a common move impossible** → measure how common in the manual pass before
  choosing it.
- **Callouts, code blocks and tables inside a pasted section** → atoms move as opaque units
  today, which should compose, but it is exactly the sort of assumption that has failed twice on
  this path. Explicit test coverage rather than reasoning.

## Migration Plan

In-editor behavior only. No file or data migration.

## Open Questions

- D1, pending the examples pass.
- Whether the inverse direction (a list subtree into a heading section) needs its own rule or
  falls out of the same one.
