# Backspace at a heading's content start: where it leaves the enforcement funnel

Measured 8 September 2026 against the plugin at `f4a76eb`, Obsidian 1.13.7 on macOS, plus
direct unit-level probes of `classify` and `computeVerdict` over the same document.

`node-edit-enforcement` states that a merge which would destroy a heading is refused:

> Scenario: Structure-corrupting merge is vetoed — Backspace at the first character of a heading
> → the document is unchanged and the rejection cue is shown

It is not. This note records where the transaction actually goes, which neighbouring shapes
already behave, and the one measurement that decides the shape of the fix.

## The reproduction

```
# One

para one

## Two

para two

## Three

para three
```

Caret at line 4, ch 3 — `## Two`'s first content character, immediately after `## `. Backspace
deletes the marker's trailing space and leaves `##Two`. No veto, no cue. The verdict counters
read `{pass: 0, rewrite: 0, veto: 0}`: no verdict was computed at all.

The same keypress behaves identically with and without a zoom scope active, so this is base
editing behaviour rather than anything zoom introduces. Under a zoom rooted on that heading the
visible scope collapses onto the one line, because `##Two` is a paragraph and owns no section —
the symptom recorded alongside the zoom editing-boundary pass in
[PR #76](https://github.com/laughedelic/obsidian-true-outliner/pull/76), which leaves the fix to
this change. That note is not on this branch, and nothing here depends on it: the trace below
stands on its own.

## Where it leaves the funnel

The transaction never reaches the verdict layer. Probed directly:

| stage | result |
| --- | --- |
| `classify` | `within-node-edit` |
| `computeVerdict` (as classified) | `pass` |

A one-character deletion inside one line crosses no boundary by span, so classification depends
entirely on `crossesViaChromeDeletion`'s marker-space shape — and that shape opens with
`node.kind !== 'list-item'`. A heading fails the gate, falls through to `within-node-edit`, and
the keypress is a native character deletion.

`recognizeMergeIntent` in `enforce.ts` carries the *same* kind gate, one layer down. The two are
deliberately paired — `isContentStartCh`'s own comment says so — and both were written for list
items alone.

## The neighbouring shapes already behave

The defect is narrower than "headings are unenforced". Probing the same document:

| gesture | class | verdict |
| --- | --- | --- |
| Backspace at `## Two` ch 3 (content start) | `within-node-edit` | `pass` — **the defect** |
| Backspace at `## Two` ch 0 (line start) | `boundary-crossing-edit` | `veto(merge-not-expressible)` |
| Delete at the end of `para one` | `boundary-crossing-edit` | `veto(merge-not-expressible)` |
| Backspace at `## Two` ch 2 (inside `##`) | `within-node-edit` | `pass` |

Both newline-deletion shapes already veto, because `crossesViaBoundaryDeletion` is kind-agnostic
and `mergeNodes` already rejects any merge whose absorbed node is a heading. The machinery the
spec describes is entirely present; only the in-line marker-space shape is missing from it.

The ch 2 row is not a defect. Deleting one `#` out of `##` demotes the heading and leaves it a
heading — ordinary marker editing, the same reasoning the spec already applies to a position
inside a task item's `[ ]`.

## Widening classification alone is worse than the defect

Handing the *current* verdict layer this transaction with the class it is missing does not
produce the veto. Measured, with the class forced by hand:

| gesture | forced-class verdict |
| --- | --- |
| Backspace at `## Two` ch 3 | `rewrite`, deleting lines 4–7 — the whole `## Two` section |
| Backspace at `# One` ch 2 | `rewrite`, deleting lines 0–11 — the entire document |

With the kind gate still closed, `recognizeMergeIntent` returns `undefined` and the edit routes
to `computeDeletionVerdict`, whose `coverGroupsOf` reads the one-character range as covering that
heading's whole subtree. A one-character keypress becomes a section deletion, and on the first
node a whole-document deletion.

So the two gates are not independent, and the classifier is not the place to fix this on its own.
They have to move together, and any change that widens one must show the other widening with it.

## What the narrow fix measures at

Admitting `heading` alongside `list-item` at both gates — two conditions, nothing else — produces:

| gesture | class | verdict |
| --- | --- | --- |
| Backspace at `## Two` ch 3 | `boundary-crossing-edit` | `veto(merge-not-expressible)` |
| Backspace at `# One` ch 2 (first node) | `boundary-crossing-edit` | `veto(no-following-neighbor)` |
| Backspace at `## Two` ch 2 (inside `##`) | `within-node-edit` | `pass` — unchanged |
| Backspace at `- beta` ch 2 (list control) | `boundary-crossing-edit` | `rewrite` — unchanged |

Both vetoes come from rules already written: `mergeNodes` refuses to absorb a heading, and a
heading with no content-space predecessor hits the first-node `veto-no-predecessor` branch. The
existing unit suite — 1213 tests — passes unchanged under the widening.

## Which controls detect a dropped kind guard

The gates could equally be fixed by dropping the kind test rather than admitting `heading`
beside `list-item` — every kind's content-start column is already computed correctly. The two
obvious regression cases do not tell the two apart. Measured, with the guards dropped entirely:

| gesture | admit `heading` | drop the kind test |
| --- | --- | --- |
| Backspace inside a heading's `#` run | `within-node-edit` / `pass` | `within-node-edit` / `pass` |
| Backspace at a list item's content start | `boundary-crossing-edit` / `rewrite` | `boundary-crossing-edit` / `rewrite` |
| Backspace at an INDENTED paragraph's content start | `within-node-edit` / `pass` | `boundary-crossing-edit` / `rewrite` |

The `#`-run case is unmoved because `isContentStartCh` already rejects that column whatever the
kind, and the list-item case is unmoved because it was admitted either way. Only the indented
paragraph discriminates: `contentColumnCh` reads leading indentation as a content prefix, so
`  indented para` resolves a content-start column at 2 and a dropped guard turns Backspace there
into a merge into the predecessor. That is the case worth a test, and it is what keeps the
paragraph-indentation question closed rather than silently answered.

## Heading content columns

`isContentStartCh` is the predicate both gates share, and a heading resolves exactly one column
where a task item resolves two. Measured across the shapes a heading line can take:

| line | `contentColumnCh` | `markerPrefixCh` | content-start columns |
| --- | --- | --- | --- |
| `# One` | 2 | 2 | 2 |
| `## Two` | 3 | 3 | 3 |
| `###### Six` | 7 | 7 | 7 |
| `  ## Indented` | 5 | 5 | 5 |
| `# [ ] title` | 2 | 2 | 2 |
| `#NoSpace` | 0 | 0 | 0 |

The task item's second column collapses onto the first, because `markerPrefixCh` already requires
a real list marker before it will count a task marker — the guard written for `# [ ] title` when
that function was introduced. `#NoSpace` is not a heading to the parser at all, so its column 0
is never reached through this path. A setext heading's text line has no marker, so its content
start is ch 0 and it is handled by the newline shape that already vetoes.
