## Why

[#252](https://github.com/laughedelic/obsidian-true-outliner/issues/252)'s fix makes a structural
dispatch land exactly as planned. Before it, Obsidian's "Smart lists" renumbering ran on top of
every plan (`docs/research/obsidian-list-renumbering.md`). In a vault that indents with a tab or
four spaces, it read a new nesting correctly and renumbered a new child list from `1.`. That hid
what the plan itself wrote. With the plan restored, ⇥ on `2. b` shows the spec's own answer:

```
 before    ⇥ main       ⇥ restored plan
┆1. a     ┆1. a        ┆1. a
┆2. b┃    ┆⏵   1. b┃   ┆⏵   2. b┃
┆3. c     ┆2. c        ┆2. c
```

`structural-operations` says a run with no member present beforehand "SHALL keep the lowest
number its own members carry". That clause was written for a paste, where the numbers are what
the clipboard held. For a relocated item they are the numbers of the list it left. A new
sublist rendered from `2.` reads as a list that starts part-way, and it is not what a Tab means.
Decided on #256: a new sublist starts from `1.`.

## What Changes

- A run with no member present beforehand starts at `1.` when its members were RELOCATED to it:
  - the arrival side of an indent or an outdent
  - the siblings an outdent adopts into the outdented node's own child list
  - a drag to another level
- A run of PASTED blocks keeps its own lowest number, as before.
- `renumberOrderedAgainst` (`src/ops.ts`) takes which of the two a call site is. Indent, outdent
  and `moveSubtreesTo`'s splice pass the relocation form. Paste keeps the default.

## Non-Goals

- A relocated item joining a run that is already there is unchanged: it takes the next number of
  that run.
- A paste is unchanged. Whether a pasted fragment should also restart at `1.` is a separate
  question, which the decision did not reach.

## Impact

- Affected specs: `structural-operations` (Ordered-run renumbering).
- Affected code: `src/ops.ts`; tests in `tests/ops.test.ts`, `tests/group-ops.test.ts`,
  `tests/grammar.test.ts`, and `e2e-tests/specs/31-tab-indented-vault.e2e.ts`.
