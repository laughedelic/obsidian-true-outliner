# Drawn cases in both directions: what the tracker holds, what the app returns

What a drawn case (`.agents/skills/presenting-examples/SKILL.md`) can carry into a run, what a
run can hand back as a drawing, and what that costs. Measured on 2026-09-28 in a Claude cloud
session on `main` at `685d3f8`: Obsidian 1.13.7 on installer 1.5.8 (Chrome 120.0.6099.283), under
Xvfb, 4 vCPUs, software rendering, desktop and mobile-emulation configs. The environment is the
one `rendered-ui-observability.md` describes; the tracker was read on the same day.

The short answer is that both directions are small. The drawn form reads back into columns
without loss on every drawing the tracker holds; the editor's state draws as the same notation
in one page-side call; a case costs about 80 ms in a running spec. What a drawing leaves
unsaid is the keystrokes and the setup, and 34% of the tracker's drawn cases name no key at all.

## What the tracker holds

`gh api` over 274 issues and PRs (92 issues, 182 PRs), about 1,260 issue comments and 1,049 PR
review comments, for fenced blocks with `┆` or `▒` at a line start:

| | |
| --- | --- |
| Drawn blocks | 208 in 70 items (47 issues, 23 PRs); median 2 per item, at most 10 |
| Columns per block | 1: 8, 2: 45, 3: 96, 4: 49, 5: 9, 6: 1 |
| Header row | on all 208 |
| Headers | 135 distinct. `before` 187, `expected` 53, `actual` 42, `clipboard` 41, `after` 34; 77 blocks use only those five |
| Comparison or history columns | 36 blocks: `main`, `this PR`, `this branch`, `now`, `was`, `today`, `proposed` |
| Keystrokes in a header, one column per step | 69 blocks, as `⇧⏎`, `⇧⏎ ⇥`, `⇧⏎ ⇥ ⌫ today` |
| Glyphs (occurrences / blocks) | `┃` 373 / 152, `·` 428 / 96, `⏵` 238 / 45, `∅` 29 / 10, `▒` 24 / 16, `‸` 4 / 4, `«»` 1 / 1, combining underline 0 |

The sentence above a block names its keys in symbols for 132 of the 208 (63%) and by spelling for
5 more. 71 (34%) name none: 10 drag, 9 paste with no key, 6 call an API function, and about 46
describe a state. 50 follow "Caret _where_, then _keys_"; 25 use ⌘V. No sentence writes a repeat
as ×N; repeats are `⌫ ⌫`.

Beyond the skill's notation, the tracker holds: one selection drawn with `«…»` across lines
(#203), a rendered screen as a column (#205), a lone digit row for drop places (#278, #279),
prose labels as headers (`1: quote`), `…` elisions and `<-` annotations inside a cell (#192,
#230). A caret nobody measured is stated in prose only ("The caret was not measured").

## Reading a drawing

A prototype read each of the 208 blocks back into columns of literal lines (the input
`layout.mjs` takes): column starts from the `┆` and `▒` edges, `⏵` and three spaces as a tab,
`·` as a space, a run of underlined characters as `«…»`. Every one of the 208 blocks gave a line
for every edge glyph in it. Laid out again, 166 give the same block (ignoring trailing spaces) and
34 differ only in the padding a hand alignment had chosen. The other 8 differ in more (#190, #203,
#205, #210, #226 twice, #230, #246): #205 draws a screen and #230 annotates a cell, and reading
the others again shows a column whose header sits over the wrong cells, which the reader takes as
another column. Reading and laying out a second time, 204 of the 208 reach the same columns; the
four that do not are #190, #203, #210 and #246.

The reading is lossy in one place: `·` is a space in a drawing and a middle dot in a note that
contains one.

## Reading the editor

One page-side function returns everything a drawing needs as plain data:

```js
({ app, obsidian }) => {
  const cm = app.workspace.getActiveViewOfType(obsidian.MarkdownView).editor.cm;
  const doc = cm.state.doc;
  const blockLines = [...cm.contentDOM.querySelectorAll('.cm-line.to-decor-node-selected')]
    .map((el) => doc.lineAt(cm.posAtDOM(el)).number - 1);
  return { text: doc.toString(), blockLines, focused: cm.hasFocus,
    ranges: cm.state.selection.ranges.map((r) => ({ anchor: r.anchor, head: r.head })) };
}
```

It takes 7 to 8 ms a call, on both configs. The block-selected lines are read from the chrome
the editor paints (`to-decor-node-selected`), not derived from the selection, so `▒` says what a
person sees. On a three-item outline, ⌘A pressed twice with the caret in `b` read back as:

```
 before    after ⇥     after ⌘A    after ⌘A ⌘A
┆- a      ┆- a        ┆- a        ┆- a
┆- b┃     ┆⏵   - b┃   ┆⏵   - b̲┃   ▒⏵   - b
┆- c      ┆- c        ┆- c        ┆- c
```

The second press left `focused` false and the range at 4–8, the item's whole line: the block
selection has no caret, as the skill's glyph table says. The read drew it as `▒` and no `┃`.

Two states the notation cannot draw as it stands. A selection across lines has no glyph in the
skill: `«…»` is per line, and a backward selection in a stock note read back as

```
 stock, backward
┆- ┃a̲
┆-̲ ̲b̲
┆-̲ c
```

only once the underline continues across lines from an opening `«` to a closing `»` on a later
line, with the newlines between them implied. And a state with several ranges has no drawing:
the prototype drew the main range and would have to say so.

## What a case costs

One spec, 30 repetitions of arranging and pressing ⇥ on a three-item outline, median ms:

| Step | Desktop | Mobile emulation |
| --- | --- | --- |
| `setBuffer` | 25 | 20 |
| `setCursorSettled` | 180 | 177 |
| Buffer, focus and selection set in one page-side call | 29 | 31 |
| One key through `browser.keys` | 33–40 | 34–45 |
| The read above | 7 | 7 |
| Drawing it, in the test process | 0 | 0 |

The existing helpers put arranging a state at about 205 ms, and one call does it in about 30.
`setCursorSettled` polls every 50 ms after a read-back; the same read-back inside the call that
sets the selection settles it without the poll, and a mismatch there is worth reporting as it
stands (see below). 29 derived cases ran in 5.8 s on desktop and 6.4 s on mobile inside the spec's
own run, after Obsidian had launched.

The runner that came of this puts each case in a note of its own. The six case files it ships and
four helper cases ran in 4.5 s on desktop and 4 s on mobile emulation, in the spec's own run.

An error thrown with a multi-line drawing as its message reaches the reporter intact: the
`obsidian` reporter prints it with its column padding, and the JSON report keeps it whole.
`writeFailureSummary` prints only the first line of each message on stdout, so a drawing's
first line has to be the verdict.

## How the tracker's drawings run

A prototype runner derived a case from a drawing when it had a `before` column, an `expected` or
`after` column, and a sentence "then _keys_" whose steps were all key symbols (or ⌘V with a
clipboard column): 29 of the 208. It set the note, the caret, and "Indent using tabs" when the
sentence said so, pressed the keys, and compared text, then caret or block lines where the drawn
result stated them.

| | Desktop | Mobile emulation |
| --- | --- | --- |
| Derived cases | 29 | 29 |
| The editor held the drawn `before` | 23 | 23 |
| Text matched | 10 | 12 |
| Text and caret matched (where the drawing gave one) | 10 | 12 |

Of the six cases whose `before` the editor did not hold, three draw the selection _after_ ⇧↓ as
`▒` in `before` (#269 twice, #260): the drawing is right about the state and wrong about when. A
case file has to say where the caret starts and what the keys do, and those three would read
`b┃` and ⇧↓ ⌫. One (#259) says "zoomed" in its sentence, which is setup the prototype had no word
for, and two (#160) were not read.

Of the 13 cases that held `before` and did not match on desktop, the reasons found on reading
them were:

- two run a command by name between keys (#248);
- four are drawings on an issue still open, whose `expected` is the fix (#264 three, #198);
- four changed nothing when the keys ran, for reasons not diagnosed (#153 two, #158 two);
- two are table pastes (#197), below;
- one, #192, was not read.

On the two table pastes (#197), desktop read back the table with its cells padded and the
separator row as `---` and mobile read back the pasted text, in one full run. Run alone, desktop
gave the same reading twice; mobile matched on one of the two and not on the other. The
difference did not settle and stays unexplained. It is recorded because the prototype set every
case in one shared note, and a widget left by an earlier case is one way it could reach a later
one. With a note of its own per case, #197's first table paste passed on both platforms.

## Glyphs and fonts

The drawings quoted above predate this section and use the first glyph set. Measured on
2026-09-29 for three monospace fonts installed on the session's VM, each glyph either has a
one-cell advance or is missing:

| Glyph | DejaVu Sans Mono | Liberation Mono | FreeMono |
| --- | --- | --- | --- |
| `⏵` tab | missing | missing | ok |
| `┆` edge | ok | missing | ok |
| `‸` paste point | missing | missing | ok |
| `┃` caret | ok | missing | ok |
| `∅` end | ok | missing | ok |
| `│ → ¦ « » ▒ ·` | ok | ok | ok |

A maintainer reported, from GitHub's rendering (Monaspace Neon, they believe) and from a phone,
that `⏵` and `┆` are narrower than a space, which breaks the alignment of the columns to their
right, that `⏵` is a missing-glyph box on mobile, that `‸` shifts the line and can be illegible,
and that `│` may show the same narrowing on mobile. We have not reproduced these from a session;
they agree with the table in kind, where a glyph a font lacks is drawn from another, narrower
one.

Two things follow. What a reader needs from a drawing is each state legible, with its tabs,
trailing spaces and caret visible; the rows of two columns lining up carries no meaning, and it
is the one property that depends on every glyph having a full cell. And `→` followed by one space
is as wide as the two-space indent the vault uses, where `⏵` and three spaces read a tab-indented
note as twice as deep as a space-indented one.

## Existing specs

A TypeScript-compiler pass over the 958 `it` sites in `e2e-tests/specs/` (five are generated in
loops, so the executed count is higher) classified each by the helpers it reaches, following
local wrappers:

| | Cases |
| --- | --- |
| Reach only state and keys: `createNote`, `setBuffer`, `setCursor*`, `setSelection`, `keys.*`, `pasteText`, `runCommand`, `getBuffer`, `getCursor`, `getSelection`, outline-mode and tab-setting helpers | 181 (18.9%) |
| Of those, assert equality on buffer, caret or selection only | 144 |
| One key phase between arranging and reading | 88 |
| Two to five key phases, with a read or a set between them | 91 |
| Need page state: DOM, computed style, stats, pointer, drag, footer, folds | 777 |

Seventeen of the 55 specs hold any. `30-keyboard-grammar` has 54 of 68, `65-content-space-caret`
39 of 49, `67-node-selection-extension` 23 of 45, `31-tab-indented-vault` all 14, and
`20-structural-commands` 10 of 18. The most common blockers among the other 777 are
`browser.executeObsidian` (395 cases: 339 touch the DOM, 110 plugin internals, 21 only read
editor state), `dismissNotices` (105, housekeeping), `resetStats` (76), `markPoint` (54),
`foldedLineRanges` (47) and `mouseDragSelect` (35). Allowing the seven housekeeping helpers
would add 39 cases. The 181 include 13 whose assertion is a `toContain` or `toMatch` on the
buffer, 9 with numeric comparators and 15 on parse output, and some depend on layout (visual-row
motion through a wrapped paragraph, right-to-left text) that a drawing does not carry. Half of
the drawable cases are multi-step, so a case file that takes one keys line covers about half of
them.

## What the notation cannot say yet

- Several ranges, focus, folds, zoom, scroll, a rendered screen.
- Pointer gestures (10 tracker cases drag) and commands run by name or against a clock ("within
  500 ms").
- Per-step columns with the keys in the header, which 69 tracker blocks use. Whether such a
  header lists the steps since the previous column or since the start is not said in any of them.
- A comparison column with a history name (`main`, `this PR`) has no role a runner can infer.
- An annotation or an elision inside a cell.

## Re-running

The state read above is the function in "Reading the editor". The case cost is a spec that
arranges with one `executeObsidian` call, presses keys with `browser.keys`, reads, and lays the
columns out; it runs with `npm run test:e2e:narrow -- <spec>` and `--mobile`, under
`e2e-tests/docker/start-xvfb-and-run.sh` in a cloud session. The tracker figures come from
`gh api repos/{owner}/{repo}/issues` and the comment endpoints, read by explicit page number:
`--paginate` followed a numeric repository URL the session's proxy truncated.
