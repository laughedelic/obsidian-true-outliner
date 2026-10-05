---
type: "research"
description: "Behaviours of Obsidian 1.13.7, CodeMirror and the e2e environment that cost September's sessions hours to find, each re-checked on 2026-10-05 against `app.js`, the CodeMirror sources or the repository, with the note that holds the full measurement where one exists; two candidates from #347 that did not survive the check; and how to read Obsidian's bundle"
---

# Obsidian runtime gotchas

Issue #347 collected behaviours that sessions found the hard way and that lived only in PR
descriptions and transcripts. Each entry below was re-checked on 2026-10-05 against Obsidian
1.13.7's `app.js` (read as described in the last section), CodeMirror (`@codemirror/view`
6.43.13, `state` 6.7.6, `commands` 6.11.1, `language` 6.12.4) or the repository at `791d803`.
Where a note already holds the measurement, the entry links it and adds only what the note lacks.
Identifiers quoted from `app.js` are minified names from 1.13.7 and change between releases; the
string literals next to them are what to grep for.

## Obsidian

### Editor suggesters re-run 50 ms after any edit or caret move

`MarkdownView`'s update listener calls `editorSuggest.trigger` through a 50 ms debounce on every
update with `docChanged`, `selectionSet` or `focusChanged`. A flag passed to `trigger` decides
whether a closed suggester may open, and it is set when a transaction is `isUserEvent("input")` or
`isUserEvent("delete")`; an open suggester keeps updating either way.

```js
n=Ml((function(){e.editorSuggest.trigger(e.editor,e.file,t),t=!1}),50)
function DL(e){return e.isUserEvent("input")||e.isUserEvent("delete")}
```

Our structural edits carry `input.*` events (`src/plugin/provisional-cleanup.ts:174`,
`src/plugin/misplaced-ids.ts:38`), so any of them that leaves the caret after `#word` opens the tag
suggester (trigger pattern `/(^|\s)#[^…\s]*$/`). While it shows, Obsidian's local keymap gives it
↑, ↓, ⏎ and ⇥ (`run: () => editorSuggest.isShowingSuggestion()`), ahead of our handlers. A test
that presses one of those keys after such an edit has to wait out the 50 ms first. Measured with a
probe spec in #346 (2026-09-27); the case that hit it is in #274.

### Smart lists' renumbering joins our transaction

The full account is in `docs/research/obsidian-list-renumbering.md`: the filter appends
`{changes, sequential: true, userEvent: "input.renumber"}` to a user edit ("The ranges it appends
to a user edit"), filters run from the last registered to the first
(`@codemirror/state` `for (let i = filters.length - 1; …)`), and our restoration is registered
last at default precedence so that it runs right after Obsidian's filter and before `fold-carry`
and the enforcement funnel ("Filter order"; `src/plugin/main.ts:483-488`). `Prec.highest` is the
wrong tool there: it makes a filter run after every other one, which is how the first version let
`fold-carry` open the fold before the restoration ran (#256).

Because the renumbering is joined into the same transaction, `iterChangedRanges` merges a linewise
cut and the renumbering below it into one range that crosses two nodes; `userChanges` sets the
renumbering aside before classifying (`src/plugin/user-changes.ts:85-89`, #269).

### A dispatch with no `userEvent` can join the previous undo step

`Editor.transaction(tx, origin)` sets `userEvent` to `origin`; we call it without one
(`src/plugin/main.ts:1504`), so the transaction has no `userEvent`. CodeMirror's history joins a
transaction into the previous event when its `userEvent` is absent or matches
`/^(input\.type|delete)($|\.)/`, the previous event has no recorded `selectionsAfter`, less than
`newGroupDelay` (500 ms) has passed, and `joinToEvent` holds (by default, the changes are adjacent)
(`@codemirror/commands` `HistoryState.addChanges`). A command run within 500 ms of a keystroke
whose change it touches therefore undoes together with that keystroke. `isolateHistory.of('before')`
on the command's transaction starts a new event. The fix and its measurements are in open PR #273,
which adds `docs/research/command-undo-join.md`; nothing on `main` uses `isolateHistory` yet.

Stock Mod-A and the stock selection commands dispatch `userEvent: "select"`. The dispatches
without one in outline mode are our own: the Mod-A ladder and the Shift+Arrow handlers leave it out
on purpose, because `classify.ts` treats an annotation-less transaction as programmatic
(`src/plugin/keymap.ts:20-32`).

### One `EditorView` per leaf, and what a file switch does to it

`docs/research/outline-mode-surfaces.md` ("Question 4") measures that each leaf keeps one
`EditorView` across file switches and mode changes. What the code adds:

- A file switch calls `view.setState`, which destroys every view plugin instance and constructs new
  ones, and fires no update listener and no `ViewPlugin.update`
  (`@codemirror/view` `EditorView.setState`). A record kept in a `WeakMap<EditorView, …>` therefore
  survives the switch unless something clears it; our per-view records are kept that way
  (`src/plugin/provisional-cleanup.ts:133`, `src/plugin/keymap.ts:715`), and per-document caches are
  keyed on `EditorState` or `Text` instead (`src/plugin/parsed-doc.ts:25`).
- Switching between reading and editing view goes through `MarkdownView.setMode`, which calls
  `editor.set(data, false)`. That path diffs the text and dispatches only what changed, so an
  unchanged note produces no transaction, no `setState`, and no `active-leaf-change`,
  `file-open` or `layout-change` event. Code that must notice the round-trip has nothing to hook.
  Read from `app.js`; not measured in the running app.

### A setting's description is cloned, and a clone cannot cross WebDriver

Obsidian renders a setting's description through `function sg(e){return"string"==typeof e?e:e.cloneNode(!0)}`,
so a `DocumentFragment` passed to `setDesc` is copied into a node nobody holds. Returning that node
from `browser.execute` serialises a reference that is stale on arrival; every test in
`41-backlinks-settings` failed that way on both platforms until the spec mapped each description to
its `textContent` inside `executeObsidian` (`e2e-tests/specs/41-backlinks-settings.e2e.ts:49-71`).
The fragment itself is built in `describeSetting` (`src/plugin/main.ts:1630-1643`).

### The caret is native; read it with `coordsAtPos`

Obsidian does not use CodeMirror's `drawSelection`. It ships its own copy of the cursor layer,
which draws `.cm-cursor` only for secondary cursors and for the primary one when the selection is a
range; an empty main selection is the browser's own caret, and the main selection's background is
native too. The position to read is `view.coordsAtPos(head)`, which agrees with the DOM selection
rectangle to 0.01 px across the 15 positions in `docs/research/ambient-e2e-monitors.md`; the
folded-line exception and `coordsAtPos(head, -1)` are there as well, and
`docs/research/rendered-ui-observability.md` ("The painted caret") covers how the monitors read it.

↓ keeps a goal column in pixels, not characters (`@codemirror/view` `moveVertically`:
`goal = startCoords.left - rect.left`), and our outline-mode ↓ keeps one too
(`src/plugin/keymap.ts:689-737`). Desktop and mobile emulation lay out the same line at different
widths, so one ↓ can land on different columns: in #274 the caret reached column 3 on mobile and
column 0 on desktop. A case that presses ↓ needs an `expected` column per platform, or a starting
caret at a column both agree on.

### Only a list starting at `1.` interrupts a paragraph

CommonMark lets an ordered list interrupt a paragraph only when it starts at 1, and no list may
interrupt one with an empty first item (`commonmark` 0.31.2, `lib/blocks.js:137-139` and
`153-160`). `para\n2. two` is one paragraph; `para\n1. one` is a paragraph and a list. Inside a list
item the same rule makes `8. eight` under `- top` a lazy continuation of `top`, while Obsidian's
editor renders it as a nested item. `docs/research/list-paragraph-mapping.md` (the CommonMark rule
and its caveat), `docs/research/ordered-run-split-numbering.md` and
`docs/research/created-seam-detection.md` hold the measurements; #262 is the open issue.

## CodeMirror

- **Lines outside the viewport are never measured.** A line hidden by a line decoration keeps the
  estimated height the height map gave it, and the scrollbar is sized from those estimates; a block
  `Decoration.replace` becomes a height-map node of its own with the widget's estimated height, 0
  by default. Measured in `docs/research/gap-line-hiding.md` ("The height map inflates every gap
  row it has not rendered": 600 lines, 43% too tall), which is why gap rows are hidden with a block
  replacement.
- **`Decoration.replace` changes the caret's height at its edge.** CodeMirror pads an inline
  replacement with `cm-widgetBuffer` images, and the native caret drawn against one is a different
  height; a mark with `display: none` leaves no box. Measured in
  `docs/research/source-indentation-width.md` ("What an undrawn run does to the caret"), which also
  records the case that keeps the replacement: a line holding only indentation, where
  `display: none` leaves `coordsAtPos` null.
- **Fold mapping cannot be relied on across structural edits.** CodeMirror drops a fold when a
  `delete.*` transaction touches it, when the selection head lands strictly inside it, or when
  mapping empties it (`@codemirror/language` `foldState`; Obsidian ships the same code). By that
  rule a change outside a fold leaves it alone, yet `docs/research/fold-mechanics.md` §3 measured a
  move dropping a fold whose range the change set did not overlap. That disagreement is not
  explained. `src/plugin/fold-carry.ts` does not depend on the answer: it restates every fold from
  the lines it hid.
- **A transaction built from several specs maps later specs unless `sequential: true`.** Without
  it, each later spec's changes are in the start document's coordinates, and its effects and
  selection are mapped through the earlier specs' changes, so an effect already written in new
  coordinates is mapped twice (`@codemirror/state` `resolveTransaction`, `mergeTransaction`).
  Measured in `docs/research/fold-mechanics.md` ("Two mechanics the carry ran into");
  `src/plugin/fold-carry.ts:207-214` and `src/plugin/planned-changes.ts:100` set it, and so does
  Obsidian's renumbering filter.

## The e2e environment

- **Workers share one display and one pointer.** With `max-instances` above 1, every Obsidian
  window runs on one Xvfb display with no window manager, so a spec that drives the real OS cursor
  can have it moved by another worker, and a sibling's window can map on top of the element under
  it. Such a spec gets a group of its own (`scripts/spec-groups.ts`: 94 `guide-pointer`, 93
  `fold-chrome`, 81 `dragging`). This is separate from `EXCLUSIVE_GROUPS`, which serialises the
  specs that share the system clipboard. Seen on CI twice, identically; a local run has one worker
  unless `E2E_MAX_INSTANCES` is set.
- **`(hover: none)` is not a touch test.** A browser with no pointing device attached, a WebDriver
  session among them, reports `hover: none` with a fine pointer, so a rule meant for touch selects
  on `(pointer: coarse)` (`styles/50-folding.css:295-299`). Read from the stylesheet's comment; no
  measurement of it is recorded.
- **WebdriverIO's `scrollIntoView` does not scroll Obsidian.** It scrolls through the Actions
  API, which Obsidian's Electron reports as not implemented (a warning on macOS, retries until the
  case timed out on CI), and since WebdriverIO 9.31 a paint heuristic can report "painted, zero
  delta" and return without scrolling. The helpers call the
  DOM's `el.scrollIntoView({ block: 'center' })` inside `executeObsidian` instead
  (`e2e-tests/helpers.ts:580-588`, `e2e-tests/footer.ts:151-168`).
- **On Chrome 150's mobile emulation a tap's selection arrives after `perform()` returns.** Wait
  for it with `waitForCursor` (`e2e-tests/helpers.ts:240`). Measured in
  `docs/research/gap-click-timing.md` and `docs/research/e2e-runtime-versions.md` ("The first full
  runs on Chrome 150"), #319.

## Candidates that did not survive the check

- **"Performance-budget specs time out in the cloud VM and pass in CI."** No record of this was
  found. The one asserted budget is in `60-transaction-classification`; `docs/cloud-sessions.md`
  sets `E2E_MAX_INSTANCES` to 2 on the cloud VM and notes that `waitBudget` widens the harness timeouts off it, and
  `docs/research/e2e-ci-budgets.md` records the opposite direction, cases that failed on CI and
  never locally.
- **"Shift+Arrow and Mod-A dispatch without a `userEvent` (#93)."** True of our outline-mode
  handlers only; the stock commands carry `select` (see the undo entry above). #93 is unrelated.

## Reading Obsidian's bundle

Obsidian's source is not published, but the application bundle is a plain asar archive, and
grepping its `app.js` found several of the mechanisms above in minutes
(`docs/research/obsidian-list-renumbering.md`, `docs/research/marker-without-trailing-space.md`).
The e2e cache keeps the archive at `<cache>/obsidian-app/obsidian-<version>.asar`, where `<cache>`
is `$OBSIDIAN_CACHE` or the repository's `.obsidian-cache` (`e2e-tests/obsidian-target.mts:24-31`,
`84`); `npm run obsidian:fetch` downloads it.

```bash
npx --yes @electron/asar extract "$OBSIDIAN_CACHE/obsidian-app/obsidian-1.13.7.asar" /tmp/obsidian-asar
# app.js is one minified line of about 3.8 MB: print matches with a little context
grep -o '.\{120\}input\.renumber.\{120\}' /tmp/obsidian-asar/app.js
```

A stack trace from a dispatch names an offset in the same file (`app://obsidian.md/app.js:1:<col>`,
`docs/research/open-questions.md`), and `cut -c` around that column shows the caller.
