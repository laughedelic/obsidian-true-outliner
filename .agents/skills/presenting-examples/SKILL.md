---
name: presenting-examples
description: How to draw editor states for the user — text, caret, selection, keystrokes, before and after. Use whenever a message to the user shows or describes what an edit does — explaining a behaviour, reporting a bug or a test case, proposing a change, or handing over steps for manual testing.
---

# Presenting examples

The user reads an example as a picture of the editor: lines stacked, indentation visible, the
caret where it sits. The compact inline form (`- a / gap / - b`, `\n` escapes) makes them rebuild
that picture in their head; draw it for them instead. The compact form stays fine in notes, specs
and docs that only agents read.

## Shape of an example

Each case is a short heading, the keystrokes in plain text, then the editor states, each as its own
block under its label. No layout depends on how wide a glyph is, so the same text reads the same on
GitHub, in chat and on a phone:

**Case 3: pasting over the last item.** ⌘V with the clipboard shown.

clipboard
```
- x
  - y
```

before
```
- a
▒- b
∅
```

actual
```
- a
- x
  - y┃
∅
```

expected
```
- a
- x
  - y┃
```

- **Blocks**, in order: the inputs (`clipboard`, when there is one), `before`, then the results. A
  single result is `after`; a bug report shows `actual` and `expected`; a control run (off-mode,
  native Obsidian) is one more result block.
- **Keystrokes** sit outside the blocks, in the case's sentence: symbols in plain text, ⌘A, ⇧⌥⏎,
  ⇥, ⇧⇥, ⌫, ⌦, ↑ ↓; steps separated by spaces, repeats as ×N (⇧↓×2 ⌫). Spell a key out in
  monospace (`cmd-shift-enter`) when it is uncommon or its symbol is ambiguous.
- **Setup**, when it changes the outcome, goes in the same sentence: the settings in play
  ("Indent using tabs" on), and whether the block is Markdown source (the default) or what is
  drawn on screen. For what is drawn, a screenshot usually beats a diagram.
- **Number the cases** so the user can point at one, and add a sentence on the difference when
  two blocks look alike.
- **Every result shows the caret** where the edit leaves it, from the code or a measurement. A
  result whose caret nobody has checked says so rather than guessing.

A `diff` block showing only what changed suits a small change in a long document better than
blocks.

Where a terminal is the reader, as in a test's failure output, the states can sit side by side as
columns: `layout.ts --columns`. Rows there line up only in a font that gives every glyph a full
cell, so the form is for terminals and not for GitHub or chat.

## Where a node can land

A drop, a paste or an indent can put a node at several depths at one place, and a flat Markdown
block hides which one a sentence means. Draw the outline instead: one indent step per depth, the
node's own markdown after it. Put a row of numbers where the node would land, each number under
the position it lands at, and say what each number writes:

```
## A
  ### B
    P
1 2 3 4
```

Then list the numbers, each with what the node is written as there and whose child it becomes,
read from the code or a measurement rather than from memory. A place between two rows puts the
number row between them. Name a position by its number afterwards, never by a name for the rule
that produced it, and draw each result the same way, as a block.

## Glyphs

| Glyph | Meaning |
|---|---|
| `▒` | A block-selected line, opening the line. A block selection has no caret: the editor gives up focus while it holds |
| `┃` | Caret |
| `«…»` | A selection. It may run across lines: `«` on one line, `»` on a later one |
| `‸` | Insertion or paste point, when it differs from where the caret ends up |
| `→ ` | A tab: an arrow and one space, as wide as the two-space indent. A note that itself holds an arrow and a space reads back as a tab |
| `·` | A space touching a tab, and a trailing space (a line of only spaces is all `·`). Every other space stays plain |
| `∅` | End of document: after the last line's text when there is no final newline, on a line of its own otherwise |

The side-by-side form also draws `┆` as the left edge of each column and underlines a selection
(`x̲`) in place of `«…»`.

Draw `∅` only when the final newline or the end of the document is the point. An empty line
stays empty. The first example in a conversation gets a one-line legend of the glyphs it uses.

## Drawing the blocks

Generate them with `scripts/layout.ts` rather than by hand, so tabs and trailing spaces come out
as the notation says. It reads columns on stdin, each starting with an `=== <header>` line, so a
Markdown heading stays content. Each column is written as the document itself: real tabs and
spaces, including lines of only spaces, `▒` opening a block-selected line, `«…»` around a
selection (`«` on one line and `»` on a later line draw a selection across lines, the line breaks
between them included), and `┃`, `‸`, `∅` where they go. With `┃` touching one end, the selection's
head is that end: `«big»┃` runs forward, `┃«big»` backward.

```bash
node scripts/layout.ts <<'EOF'
=== before
- a
▒- b
∅

=== after
- a┃
∅
EOF
```

Paste its output as it is: each block is already fenced.

The script reads the other way too. A drawn block from an issue or a PR, in either form, on stdin
with `--read`, prints the columns that draw it, which is the input a case file takes (see below);
`·` reads as a space. `--case` draws a case file's columns under its keys and setup, for a PR's
manual-test section.

### A case that waits on a fix

A case for an open bug fails until the fix lands. `known-failing: #<issue>` says it waits on that
issue, and an `actual` column holds what the app gives while the bug stands:

```
case: an edit in one ordered list does not renumber the list after it (#228)
known-failing: #228
keys: ⏎

=== before
1. a┃
1) b
2) c
=== expected
1. a
2. ┃
1) b
2) c
=== actual ⏎
1. a
2. ┃
3) b
4) c
```

- **While the bug stands** the case passes, if the app gives `actual` at the first phase that
  differs from `expected` (the text, and the caret only where `expected` draws one). The run
  reports it in its output, in `knownFailing` of `.obsidian-cache/e2e-summary.json`, and in the CI
  job's step summary, and presses no key after that phase.
- **Once every phase matches `expected`** it fails, saying `remove known-failing: #<issue>`. The
  change that fixes the bug removes the marker, and the case guards the fix from then on.
- **When the app gives a third result** it fails, drawing `actual (recorded)` beside `actual (now)`:
  the bug changed, or the drawing was never what the app does (a key that means something else on
  the platform, an operation the app's own gesture does not reach).
- **To write one**, draft `before`, the keys and the `expected` the fix should give, run it with
  `--record` on each platform, and copy what it wrote as `actual`. On a file with the marker,
  `--record` keeps the marker and `expected` and writes the state at the first differing phase as
  `actual`, with a caret only where `expected` draws one. The tracker's `after <keys>` header names
  what happened; in a case file that column is `actual`.
- **Limits.** The marker holds on every platform the case runs on, so a bug seen on one platform
  takes `platform:`. A result that is not a document, such as a refusal message or a drop's landing
  place, cannot be compared, and its drawing stays in the issue. A case with two candidate results
  is committed when one is chosen. Both take `--columns` for the side-by-side form where it is the one wanted.

````bash
node scripts/layout.ts --read <<'EOF'
before
```
- a
▒- b
```
EOF
````

## Copy-paste version

When the user will reproduce an example by hand, follow the cases with a **To paste** block for
each note: the plain document with real tabs and spaces and no glyphs, and a sentence on where
the caret or selection goes.

Where it lands decides its wrapping. On GitHub (issues, PRs, comments), the section goes in
`<details><summary>To reproduce</summary>` … `</details>`, with a blank line after the summary
line so the fences inside still render. The chat renders no raw HTML, so there it is the last
section of the message, under its own heading.

## Case files: a drawing that runs

A case drawn for an issue or a PR runs as written. The file is the `scripts/layout.ts` input with a
preamble and a keys line, saved as `<name>.case`:

```
case: ⇥ indents under the sibling above (#123)
tabs: on
keys: ⇥ | ⇧⇥

=== before
- a
- b┃
=== after ⇥
- a
	- b┃
=== after ⇧⇥
- a
- b┃
```

- **Preamble**, all optional: `case` (a title), `outline: off` (default on), `tabs: on` ("Indent
  using tabs"; default off), `platform: desktop` or `mobile` (default both), `known-failing: #123`
  (the case waits on that issue's fix, see below), `keys`.
- **Keys** are phases separated by ` | `, each a run of steps as the sentence above a drawing
  writes them: ⌘⇧⌥⌃ in front of ⇥ ⏎ ⌫ ⌦ ↑ ↓ ← → ⎋ or one character, spelled keys (`Home`, `End`,
  `PageUp`, `PageDown`, `Esc`) and chords (`mod-shift-enter`), `×N` for a repeat, `"quoted text"`
  typed as characters. ⌘ is the platform's Mod key. ⌘V pastes the `clipboard` column.
- **Columns**: `clipboard` (read by a ⌘V step), `before` (the state the case starts from) and
  `expected` or `after …` (the state after each phase, one per phase). Any other header, `actual`
  included, is a reference the run ignores, so a failure report runs again as it was printed; a
  file with `known-failing` is the exception, and holds an `actual` the run reads. A result column
  with no caret, selection or `▒` does not compare one.
- **Limits.** A case file cannot hold a note that contains `┃ « » ‸ ∅ ▒`. A selection that begins
  at the end of a line, or ends at the start of one, draws as the shorter selection its underline
  shows, since a line break has no underline; `--read` returns the shorter one.
- **`before` is the start.** A drawing of the state after the first key belongs in a result
  column. A `before` the editor cannot hold (a caret inside a marker, say) fails before any key
  is pressed, and the failure draws what the editor holds.

Turn an issue's block into a case file with `layout.ts --read`, add the keys line and settings,
and run it in the real app, desktop and mobile emulation:

```bash
npm run case -- path/to/x.case            # pass, or a drawing of before, expected and actual
npm run case -- path/to/x.case --mobile
npm run case -- path/to/x.case --record   # never fails; writes the file with its results filled
                                          # from the app to .obsidian-cache/cases/
```

`--record` on a file with a `before` and keys and no result column is a bug's first reply: the
carets in it are measured, not predicted. A case that stays goes under
`e2e-tests/cases/<capability>/`, where `<capability>` is a directory of `openspec/specs/`, and
runs with the rest. `node scripts/layout.ts --case < x.case` draws it under its keys and settings for a PR's
manual-test section.
