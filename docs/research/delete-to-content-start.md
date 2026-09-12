# Cmd+Backspace on a list item: where "delete to the start of the line" actually reaches

Measured 12 September 2026 against `ebac7e7`, Obsidian 1.13 under the e2e harness, dispatching
the transaction CodeMirror's own `deleteLineBoundaryBackward` builds, plus a probe of `classify`
and `computeVerdict` over the same shapes.

The report from real-vault use: Cmd+Backspace on a list item deletes too much, and leaves the
caret at the bullet.

## The key, and what it deletes

The plugin binds nothing to Mod-Backspace. On macOS the key is CodeMirror's
`deleteLineBoundaryBackward`, which deletes back to `moveToLineBoundary`'s answer — the start
of the caret's VISUAL row, or the line's first column when nothing wraps. It knows nothing about
indentation or markers, so on an unwrapped item the range starts at column 0 and takes the
indentation and the marker with it. `Home`, by contrast, is bound and stops at the raw line's
content boundary (`content-space-caret`).

## Where the range then goes

| document (`|` is the caret) | range | classified | result | caret |
| --- | --- | --- | --- | --- |
| `- alpha beta|` / `- gamma` | 0–12 | boundary-crossing, **rewrite** | `- gamma` — the node is gone | line 0, ch 2: the next item's content start |
| `- alpha` / `  - gamma delta|` | line start–end | within-node, pass | `- alpha` / `` — an empty line where the item was | line 1, ch 0 |
| `- [ ] task text|` | 0–15 | within-node, pass | `` | ch 0 |
| `- alpha` / `  - gamma| delta` | line start–10 | within-node, pass | `- alpha` / `delta` — a paragraph, the marker gone | line 1, ch 0 |

Two outcomes, decided by what follows the item. A range from column 0 to the end of a childless
item's line is an EXACT subtree cover when the item owns no trailing gap — which is exactly an
item followed directly by its next sibling — and `node-edit-enforcement` reads an exact cover as
a structural deletion: the whole node is removed with its line, and the caret goes where a
deletion puts it, the neighbour's content start. Every other shape passes as ordinary editing
and leaves the marker's line emptied or the marker deleted, with the caret at column 0.

Unit-level, the same two branches over more shapes:

| document | verdict | after |
| --- | --- | --- |
| `- a` / `- b|` / `- c` | rewrite | `- a` / `- c` |
| `1. one` / `2. two|` / `3. three` | rewrite | `1. one` / `2. three` — renumbered |
| `- a` / `  - b` / `    - c|` / `  - d` | rewrite | `c` gone |
| `- alpha` / `- beta|` (file ends with a newline, so `beta` owns a gap) | pass | `- alpha` / `` |
| `- alpha|` / `  - kid` / `- gamma` | pass | `` / `  - kid` / `- gamma` |
| `- alpha` / `- |beta` (caret AT the content start) | pass | `- alpha` / `beta` — demoted to a paragraph |

Classification cannot tell this range from a selection of the whole line: same spans, same
cursor, same facts. The last row is the shape `docs/research/zoom-editing-boundary` R7 already
recorded as "within-node authoring, no verdict computed".

## What follows

The key needs its own rule rather than a wider classifier. Bound on macOS like CodeMirror's own
binding, it deletes from the caret back to the caret's line's content start: on an item's
first line the column where its text begins — past the list marker and, on a task item, the
task marker too, so the checkbox survives; on a continuation line the line's alignment column.
That range never starts at column 0, so it can never be an exact cover, and the marker's line
keeps its marker. At or before the content start the key does what Backspace does there — the
merge or veto the content-start rules already give, and ordinary editing inside the marker.

Left as it is: a paragraph or a heading has its content start at column 0, so the key stays
stock there, and the exact-cover branch above still applies to a childless paragraph followed
directly by another node. That is a question about what an exact cover means for a
caret-derived range, not about this key, and it is recorded in the parking lot.
