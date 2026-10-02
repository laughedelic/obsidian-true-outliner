# Folded and zoomed case files: which form states them, and which cases move

What a drawing (`.agents/skills/presenting-examples/SKILL.md`) has to say for a case that starts
from, or ends in, a folded or zoomed outline, which of three forms says it, and which of the
zoom and fold specs' 147 cases each form lets move. Measured on 2026-09-29 in a Claude cloud session
on `main` at `0b8169d`: Obsidian 1.13.7 on installer 1.5.8 (Chrome 120.0.6099.283), under Xvfb,
desktop and mobile-emulation configs, the environment `drawn-case-files.md` describes. The
question is [#308](https://github.com/laughedelic/obsidian-true-outliner/issues/308).

The short answer is that a mark on the line of the node it describes is the smallest form that
moves a case whose result is a fold or a zoom, and the only one of the three that can say a result
at all. A start-only form opens 6 cases; the mark opens 36, of 37 that a case file could hold once
folds and zoom can be stated (the 37th is drawable today).

## What the tracker holds

A second sweep of the tracker on the same day, by `gh api` with explicit page numbers over 285
issues and PRs, 223 issue comments and 1,149 review comments (the earlier note's totals were 274,
about 1,260 and 1,049; the two sweeps disagree on comments and this one is the one measured here),
for fenced blocks with `┆` or `▒` at a line start: 212 drawn blocks in 72 items.

- **Zoomed.** Two blocks draw a zoomed state: #259 case 1 ("Zoomed on `2. p`, caret in `a`, then
  ⌘⇧↓") and #205 case 1, which is a rendered screen with the footer beside it. The issue's "six
  drawings" are every block of the three items it names: #259 has one, #254 has three (drags
  over an open place, in an item that also says zoom), and #205 has two, the second a source tree. The sentence over #259's drawing is the only place
  the zoom is stated; the drawing carries none of it.
- **Folded.** No block. The nearest are the specs' fixtures, whose comments write a fold as a
  count and an ellipsis (`- one2…`, the placeholder the editor paints).

#259 is spec case `80:361`, and it runs on `main` with a zoom start (below).

## What a state has to say

Both states are a fact about a node, and a node is its first line:

- **Zoom.** One node is the root, identified by its own first line (`ZoomScope.startLine`).
  Everything outside the root's subtree is hidden, and the hiding is derived from the root, so a
  drawing that names the root has said what is visible. The drawing keeps every line of the
  document, since it is the document.
- **Fold.** Any number of nodes are folded. The fold hides exactly the node's subtree, so naming
  the node names the range. Measured against `ourFoldable`, the provider's own ranges: fold-all
  folded 10 ranges over three fixture documents and every one is a range the provider claims;
  Obsidian's native fold-all folded 11 and 10 of them are. The one that is not is a heading with
  no children at the end of the note (`## Next`, lines 8 to 10 of `96-fold-grammar`'s `MIXED`).

Six things measured on both configs, with the same reading each time:

1. **A fold's recorded `from` is the node's last own line, not its first.** On a paragraph of two
   source lines (`MIXED` lines 2 and 3), `fold-node` from either line folded lines 3 to 6, and the
   provider's claim for line 2 is 3 to 6 while it claims nothing for line 3. A read that draws the
   mark on the fold's `from` puts it on the paragraph's second line, so the read maps each fold
   to the provider range with the same lines and takes that range's `line`.
2. **A zoom opens every fold in the document, and folds made after it survive.** With `- one` folded
   and a zoom on `# Top`, the fold was gone after the zoom (`foldedLineRanges` empty) and came
   back on `zoom-clear`; a fold made while zoomed stayed. A `before` that draws a fold and a zoom
   is arranged zoom first.
3. **A caret set on a hidden line opens the fold that hides it.** Folding an outer node and then
   setting the caret on an inner one left no fold at all; inner first, then outer, gave both
   ranges. Folds are arranged from the last line to the first.
4. **`⌘⌥↑` and `⌘⌥↓` reach the fold commands under `browser.keys`; `⌘⌥.` does not.** From a caret
   in `- one`, the first folded lines 0 to 2 and the second unfolded them; `⌘⌥.` pressed twice
   changed nothing, on desktop and under mobile emulation. `toggle-fold` has the hotkey
   `Mod+Alt+Period`. Why the key does not arrive was not diagnosed. The zoom commands have no
   hotkey, so no phase can zoom, and neither can `fold-all`, `fold-more` and `fold-less`.
5. **A fold command drops a block selection.** With `- one` block-selected (⌘A twice, the chrome on
   lines 0 and 1), `⌘⌥↑` left the fold in place and the selection a caret at the end of `- one`,
   and `blockLines` empty. A fold and `▒` did not appear together in anything run.
6. **The six shipped case files leave nothing folded or zoomed.** Read after every phase on both
   configs: no fold, no zoom. A rule that a result column states the whole fold and zoom state,
   with no mark meaning none, therefore changes none of them.

What the zoom read needs is one fact that only the plugin holds: the zoom anchor is a `StateField`
that a spec cannot reach (`zoom-state.ts`), as the fold state was, which is why `foldState()` is
a probe. A DOM read of the first rendered line gave the right root in all three arrangements run
(lines 1, 0 and 0) and depends on the viewport, since a zoom scrolled down has no rendered root
line above it. A probe beside `foldState()` has neither problem.

Cost with the existing helpers, median of 10 on each config: arranging two folds and a caret
took 758 ms on desktop and 728 on mobile, and a zoom, a caret and a read 462 and 474, against the
205 ms `drawn-case-files.md` gives for a note and a caret. Three `setCursorSettled` calls at about
180 ms each account for most of the first; one page-side call sets a selection in about 30 ms.

## Glyphs

The candidates against the three monospace fonts on the VM, each a one-cell advance or missing:

| Glyph | DejaVu Sans Mono | Liberation Mono | FreeMono |
| --- | --- | --- | --- |
| `►` U+25BA, `▼` U+25BC, `●` U+25CF, `○` U+25CB, `■` U+25A0, `□` U+25A1 | ok | ok | ok |
| `▸` U+25B8, `▾` U+25BE, `◆` U+25C6, `◉` U+25C9, `⊞`, `⊕` | ok | missing | ok |
| `⋮` U+22EE, `‥` U+2025, `※` U+203B | missing | missing | ok |
| `▒`, `…`, `·`, `«`, `»`, `→` (in use) | ok | ok | ok |

The glyphs that are present in all three are the ones Windows Glyph List 4 holds (`▒`, `►`, `▼`,
`●`, `○`, `■`, `□`, `…`), which is why the notation's own `▒` is safe and `┃`, `┆`, `‸`, `∅` are
not. That the glyph list is the reason is background and was not measured. Nothing was measured
on GitHub's font or on a phone: the maintainer's report in `drawn-case-files.md` is the only
observation, and it is consistent with a missing glyph being drawn from a narrower font. The
conventional tree chevrons `▸` and `▾` are the ones the table rules out, and ASCII marks collide
with the markdown the drawing holds (`+`, `>`, `#` and `-` all open lines).

A mark that opens a line moves that line one cell right of its neighbours, as `▒` does, so a
marked line and its children read one indent step shallower than they are. Nothing in a drawing
depends on the columns lining up.

## Three forms, against the cases

The same case in each: `96-fold-grammar`'s "Enter inside a folded node's text opens it first",
whose start is a folded `- one`, whose result is the same outline unfolded.

A mark on the line:

```
before
►- on┃e
  - nested a
  - nested b
- two
```

A preamble list (`fold: 1`, the line counted from 1, or `fold: - one`, the line's text):

```
fold: - one
=== before
- on┃e
  - nested a
  - nested b
- two
```

A separate column, one per state, listing what is folded:

```
=== before
- on┃e
  - nested a
  - nested b
- two
=== folds
1
```

| | Mark on the line | Preamble list | Separate column |
| --- | --- | --- | --- |
| States the start | yes | yes | yes |
| States a result | yes, the same mark in the result column | no: a preamble has one value for the file | yes, one column per phase |
| Node named by | the line it sits on | a line number or the line's text (two nodes with one text share it) | a line number |
| Read from the drawing alone | yes | line numbers are counted by hand | line numbers are counted by hand |
| A drawing pasted in an issue | the marks come with it | the sentence above it carries the preamble, as today | a second block per state |
| Cases opened | 36 | 6 | 36 |

A preamble list is the form the tracker's prose already uses ("Zoomed on `2. p`"), and it is
enough for a case whose result says nothing about the state: `80:361`, `80:374`, `80:490`,
`80:1698`, `80:1714` and `96:169`. It cannot say that a zoom survives a refused edit or that a fold
closes when its text is split, and 30 of the 37 cases below say one or the other. A column says
what a mark says and asks the reader to count lines in a second block; it costs a column per state
where the mark costs a glyph per line.

## The 147 cases

Sorted by what a case file would need, from the calls each `it` reaches (a TypeScript pass over
the eight specs, following local wrappers, with the `beforeEach` of each enclosing `describe`),
then read one by one where the calls did not decide it:

| | 80 | 90 | 91 | 92 | 93 | 94 | 95 | 96 | All |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Cases | 76 | 5 | 16 | 10 | 15 | 15 | 3 | 7 | 147 |
| A case file could hold with marks | 19 | 0 | 4 | 7 | 0 | 0 | 0 | 7 | 37 |
| Of those, drawable today | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 1 |
| Also need a command run by name | 8 | 0 | 6 | 0 | 0 | 0 | 0 | 0 | 14 |
| Other | 49 | 5 | 6 | 3 | 15 | 15 | 3 | 0 | 96 |

The 37 are the cases whose arranging is text, a caret or selection, folds and a zoom root, whose
steps are keys and whose results are text, caret, folds and zoom root. Marks carry the state of
30 of them in the result column and of 33 in the start; `91:63`, `91:100` and `91:141` start
unfolded and only end folded, and `91:93` states no fold at all. The issue's "3 that reach only
state and keys today" counts by the helpers a case reaches; a case file can state 1 of them,
`91:93`. By my reading the other two are `91:111`, which sets a caret between key phases, and
`96:169`, which folds and then selects into what it hid: each arranges something a case file has
no step for.

For seven of the 37 (`80:1516` to `80:1563`, `80:1698`, `80:1714`) the refusal's notice is half of
what the case asserts, and a drawing carries only that the text is unchanged and the zoom intact.
`80:490` asserts an outcome and a mechanism count, and the drawing carries the outcome, as an exact
caret where the spec says a line at most.

The 96 that stay out, sorted by the first blocker a case reaches: 37 read the DOM (the trail's
crumbs, rendered lines, layout, chrome colours, the footer), 34 press, hover or drag a pointer,
14 change something outside a key phase (an outside edit, a second pane, a mode or setting change,
a reopened note, `Editor.exec`, a time budget), 8 read command availability or provider ranges
and 3 set a caret between key phases.

The 14 that need a command are 8 in `80`, all `zoom-in`, and 6 in `91`, which run `zoom-in`,
`zoom-out`, `zoom-clear`, `fold-all`, `fold-more`, `fold-less` and `toggle-fold` (the last for the
reason in item 4). They open with a step that runs a command
by name, which is a change to the case-file format of its own.

### The 37

| Spec | Case | Needs |
| --- | --- | --- |
| `80:361` | a command move inside the zoom is not refused over a renumbering Obsidian adds | zoom start |
| `80:374` | a deletion inside the zoom is not refused over a renumbering Obsidian appends | zoom start |
| `80:490` | confines arrow motion, and its own handler is what declines | zoom start |
| `80:900` | keeps the zoom while the root own text is edited | zoom start, zoom result |
| `80:1516` | Backspace at the zoom root's content start (A1) | zoom start, zoom result |
| `80:1526` | Delete at the end of the last visible line (B1) | zoom start, zoom result |
| `80:1537` | Backspace at a nested root's content start, into its hidden parent (R8) | zoom start, zoom result |
| `80:1548` | a paste that would splice beside the root (G1) | zoom start, zoom result |
| `80:1563` | a Backspace that would unwrap an emptied list root (R4) | zoom start, zoom result |
| `80:1588` | appends a last child, with no trailing gap in the cover (X2) | zoom start, zoom result |
| `80:1598` | appends a last child when the cover ENDS on a trailing gap (X1) | zoom start, zoom result |
| `80:1611` | a paste at a root WITH children lands in its child scope (G1b) | zoom start, zoom result |
| `80:1627` | pastes a block inside the subtree (G2) | zoom start, zoom result |
| `80:1637` | deletes the cover's own trailing gap line (R6) | zoom start, zoom result |
| `80:1646` | merges two visible nodes (A5) | zoom start, zoom result |
| `80:1656` | types into the root (X5) | zoom start, zoom result |
| `80:1668` | emptying the root's own line leaves no zoom, not a retargeted one (R7) | zoom start, zoom result |
| `80:1698` | a heading root's trailing edge still reports the inexpressible merge | zoom start |
| `80:1714` | a first-node zoom root reports the first-node veto | zoom start |
| `91:63` | folds the node the caret is in | fold result |
| `91:93` | leaves the caret alone when the fold hides nothing it is in | none: drawable today |
| `91:100` | is idempotent, and toggles back | fold result |
| `91:141` | folds every covered subtree under a block selection | fold result |
| `92:41` | a moved folded node stays folded, at its new position | fold start, fold result |
| `92:62` | an indented folded node stays folded | fold start, fold result |
| `92:73` | a node containing folds keeps them when it moves | fold start, fold result |
| `92:159` | undo of a move brings the fold back with it | fold start, fold result |
| `92:179` | typing on a folded node's own line leaves it folded | fold start, fold result |
| `92:190` | a structural key leaves a fold closed when Obsidian renumbers the lines it hides | fold start, fold result |
| `92:208` | a deletion leaves a fold closed when Obsidian renumbers the lines it hides | fold start, fold result |
| `96:53` | Enter at a folded node's end makes a sibling after its subtree | fold start, fold result |
| `96:69` | Enter inside a folded node's text opens it first | fold start, fold result |
| `96:82` | Enter mid-way through a folded multi-line node splits it exactly as an unfolded one | fold start, fold result |
| `96:109` | Enter at a folded HEADING's end opens it rather than inventing a sibling | fold start, fold result |
| `96:132` | steps the caret over a folded node, and leaves it folded | fold start, fold result |
| `96:152` | extends a selection over a folded node as one node, and leaves it folded | fold start, fold result |
| `96:169` | deleting a folded node takes its hidden children with it | fold start |

### The 14 that need a command

| Spec | Case | Command |
| --- | --- | --- |
| `80:386` | zooms to the node at the caret, hiding everything else | zoom-in |
| `80:394` | zooms into a list item, keeping only its own subtree | zoom-in |
| `80:400` | leaves the file untouched across a zoom in and out | zoom-in, zoom-clear |
| `80:466` | collapses a selection, and zooms the same way whichever direction it was drawn | zoom-in |
| `80:831` | keeps the cover trailing gap line inside the visible range | zoom-in |
| `80:985` | does nothing when the caret is in the preamble | zoom-in |
| `80:1118` | hides a sibling widget atom on the far side of the tail range | zoom-in |
| `80:1283` | opens a folded root, so the focus view is not of a collapsed node | zoom-in on a folded root |
| `91:69` | escalates from a leaf to the branch above it | toggle-fold |
| `91:151` | folds all, including the paragraph Obsidian's own fold-all cannot reach | fold-all, unfold-all |
| `91:203` | folds again on leaving a zoom what the zoom opened | zoom-in, zoom-out, zoom-clear |
| `91:235` | opens a fold outside the zoom too, and folds it again on leaving | zoom-in, zoom-clear |
| `91:263` | walks the outline's depth one level at a time | fold-more, fold-less |
| `91:311` | offers the document-wide commands wherever the caret is | fold-all |

## Not measured

- How `►` and `●` render on GitHub and on a phone. Only the three fonts above were measured.
- Whether a zoomed root can be block-selected and how that draws (`●▒`); no case in the 147 needs it.
- The cost of a probe beside `foldState()`; it reads one field.
- Why `⌘⌥.` does not arrive, and whether `browser.keys` reaches other punctuation chords.

## Re-running

The classification is a TypeScript-compiler walk over `e2e-tests/specs/{80,90,91,92,93,94,95,96}-*`
listing the calls each `it` and its enclosing `beforeEach` reach; its 147 matches the issue's
count. The reads are these page-side functions, run in a scratch spec after arranging with
`h.setCursorSettled`, `h.runCommand('fold-node')` and `h.runCommand('zoom-in')`:

```js
// folds: the plugin's own probe, line ranges of the hidden lines
({ plugins }) => plugins.trueOutliner.foldState().folded

// zoom, DOM form: the class, and the document line of the first rendered line
({ app, obsidian }) => {
  const cm = app.workspace.getActiveViewOfType(obsidian.MarkdownView).editor.cm;
  const first = cm.contentDOM.querySelector('.cm-line');
  return { zoomed: cm.dom.classList.contains('to-zoomed'),
    root: first ? cm.state.doc.lineAt(cm.posAtDOM(first)).number - 1 : null };
}
```

The glyph table is `fontTools` over the three fonts' `cmap` and `hmtx`, comparing each glyph's
advance with the space's. The tracker sweep is `gh api repos/{owner}/{repo}/issues`,
`issues/comments` and `pulls/comments` by page number, scanning fenced blocks for `┆` or `▒` at a
line start. The runs are `sh e2e-tests/docker/start-xvfb-and-run.sh npm run test:e2e:narrow --
<spec>` with and without `--mobile`. A first desktop run of a spec failed before launching Obsidian
with an undici socket error while the launcher fetched something over the network, and passed
on the next run.
