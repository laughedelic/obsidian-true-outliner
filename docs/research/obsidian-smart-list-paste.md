---
type: "research"
description: "Why three paste cases fail on Obsidian 1.14.4 and pass on 1.13.7 (#372): with Smart lists on, 1.14.4's own paste hook (`tryCollapseListMarker`) turns a list pasted at a list item's content start into a replacement of the item's marker, which our classifier reads as an ordinary within-node edit and passes; the two transactions drawn side by side, the Obsidian code that builds the second, the one clause in `classify` that lets it through, which pastes it reaches, what the transaction no longer carries (the first pasted line's indentation, measured on sibling and deep payloads) and the paste event's clipboard text that does, the candidate fixes with what each costs, and a prototype of one run on both builds, desktop and mobile emulation, over the whole `clipboard` group and eight edge shapes; how to run a 1.14.4 build in a cloud session when the harness's own download fails"
---

# Obsidian's smart-list paste: a marker rewrite our filter does not read as a paste

Measured 6 October 2026 against `main` at `cd48e98`, on Obsidian 1.13.7 and 1.14.4 (installer 1.5.8,
Chromium 120) on Linux, through the e2e harness and `npm run drive`. Issue
[#372](https://github.com/laughedelic/obsidian-true-outliner/issues/372) asks which of three things is
at fault: the plugin's paste handling not running, Obsidian's paste path having moved, or the
harness's `pasteText` no longer reaching the handler. It is Obsidian's paste path, in one specific
way, and the plugin's handling runs and is reached.

`┃` marks the caret, `·` a space that touches the caret or ends a line, `∅` the end of the document
after a final newline. `┆` is a column's left edge.

## What goes wrong

Case 1 of the issue, in the app. ⌘V on the empty item under `d1`, Smart lists on (its default):

```
 clipboard    before    1.13.7       1.14.4
┆  - c2      ┆- DEST   ┆- DEST      ┆- DEST
┆- S         ┆  - d1   ┆  - d1      ┆  - d1
┆  - t1      ┆  -·┃    ┆  - c2      ┆  - c2
┆  - t2      ┆∅        ┆  - S       ┆- S
                       ┆    - t1    ┆  - t1
                       ┆    - t2┃   ┆  - t2
                       ┆∅           ┆┃
                                    ┆∅
```

On 1.14.4 the paste lands as Obsidian alone would put it. A real ⌘V through `npm run drive -- key
mod+v` gives the same result as the spec's `pasteText`, so the harness's helper reaches the handler
and is not at fault.

## What Obsidian dispatches

`app.js` of each build, read from its asar: 1.13.7 has no `tryCollapseListMarker`; 1.14.4 has it, as
a method of the Markdown editor that Obsidian's `clipboardPasteHook` calls after `tryPasteUrl`. The
method is gated on the vault's `smartIndentList` setting ("Smart lists") and takes the text the hook
settled on: what Obsidian's clipboard manager returns for the data transfer, or the plain text when it
returns nothing. For an HTML clipboard that is converted markdown (the edge shapes below show an HTML
list arriving as `- a⏎    - b`). For each selection range it:

1. reads the text between the line's start and the range's start and matches it against Obsidian's
   list-prefix pattern `^([>\s]*)(([*+-] |(\d+)([.)] ))(?:\[(.)\] )?)?`;
2. continues only if that whole text is a list prefix with a marker, and the pasted text's first
   line also starts with a list prefix. The item need not be empty: any caret at a list item's
   content start qualifies;
3. replaces the range, from the start of the destination's marker (past its indentation) to the
   range's end, with the destination's marker, the task box (the pasted line's if it has one,
   otherwise the destination's), and the pasted text without its first line's prefix.

The same ⌘V on case 1's `before`, logged at `cm.dispatch` before any plugin filter runs
(`d1` ends at offset 13; the empty item's line starts at 14, its marker `- ` is 16 to 18):

| | 1.13.7 | 1.14.4 |
| --- | --- | --- |
| Builder | CodeMirror's stock paste | `tryCollapseListMarker` |
| Change | 18 to 18, inserts the clipboard whole: `  - c2⏎- S⏎  - t1⏎  - t2⏎` | 16 to 18, replaces the marker with `- c2⏎- S⏎  - t1⏎  - t2⏎` |
| `userEvent` | `input.paste` | `input.paste` |
| Class the filter gives it | `boundary-crossing-edit` | `within-node-edit` |
| What the filter does | rewrites it, as `input.paste.structural` | passes it |

The two classes were read from `classify` on those facts. The 1.14.4 change is a replacement made
from a caret, and `isMultiBlockInsertion` returns false for exactly that: "A replacement made from a
CARET is neither", the clause `docs/research/enter-inside-a-quote` added so Obsidian's Enter inside a
quote would not read as a paste. Nothing else in `classify` reads the change as a paste, so it stays
inside one node and passes. Read as an insertion at the content start with the same text, it is
`boundary-crossing-edit` again.

With Smart lists off, 1.14.4 dispatches the stock insertion (18 to 18, the clipboard whole) and case 1
comes out as on 1.13.7. The setting is what separates the two behaviours, so the users who see this
are those on 1.14.4 with Smart lists on.

## Which pastes it reaches

All three failing cases of the issue have the shape:

- **Case 1** (`61-selection-enforcement`): the clipboard's first line is indented, into an empty item.
- **Case 2** (`62-outline-edit-enforcement`): `- parent1` with two children, into an empty item three
  tabs deep.
- **Case 3** (`80-outline-zoom`): `- p⏎  - q` at the start of the non-empty `- beta`, which the change
  turns into `- p` and `  - qbeta`.

Not run: which 1.14.x build introduced `tryCollapseListMarker`. 1.14.0 to 1.14.3 are insider builds
(`isBeta` in `obsidian-versions.json`), which the harness cannot reach without Catalyst credentials
(the comment on `workflow_dispatch` in `.github/workflows/ci.yml`); a GitHub release URL for each
answered Not Found. Only 1.13.7 and 1.14.4 were compared.

## What the transaction no longer carries

The collapse drops the first pasted line's own prefix, its indentation included. Two payloads that
differ only in that indentation therefore produce the same transaction, and our paste handling reads
them as different trees. Measured on an empty top-level item:

```
clipboard    before    1.13.7    1.14.4
┆  - a       ┆- A      ┆- A      ┆- A
┆  - b       ┆-·┃      ┆- a      ┆- a
             ┆∅        ┆- b┃     ┆  - b
                                 ┆┃
```

`a` and `b` were siblings in the clipboard; on 1.14.4 `b` becomes a child of `a`. A deeper payload
(`    - x⏎      - y`) arrives as `- x` with `      - y` six spaces in, where 1.13.7 gives `y` one level
under `x`. Reading the 1.14.4 transaction alone cannot undo this: the indentation is not in it.

The clipboard text is in the paste event. A capture-phase `paste` listener on the editor's content
element, run before Obsidian's hook, saw:

| Clipboard | `clipboardData.types` | Text |
| --- | --- | --- |
| Written by the harness's `navigator.clipboard.writeText` | `text/plain` | the whole payload, indentation included |
| An in-app copy (⌘C in outline mode) | `text/html`, `text/plain`, `text/markdown` | `text/markdown` and `text/plain` carried the copied lines |

For a clipboard Obsidian converts from HTML, the text it collapses is the converted markdown, which
no `clipboardData` entry holds. That text always starts at depth 0, so the collapse loses nothing
there.

## Candidate fixes

1. **Read the collapse from the transaction alone**, as the paste at the content start of the text it
   inserts. It fixes the three cases, whose payloads lose nothing, and it gives the 1.14.4 column of
   the table above for an indented first line (the sibling payload's `b` under `a`). That follows
   from the measurement above and was not run as code.
2. **Record the clipboard text on the paste event, and read the collapse as the paste of that
   text** when the transaction is exactly what Obsidian builds from it; where no recorded text
   reproduces the change (the HTML case), read the inserted text as the payload. The prototype
   below.
3. **Take paste over in outline mode** with a higher-precedence paste hook that inserts the text
   itself. It would also preempt Obsidian's URL paste, HTML conversion and file paste, and the hook's
   text argument is the plain text, not the converted one. Not tried.
4. **Turn Smart lists off for outline-mode notes.** It is a vault setting that also drives
   renumbering and Enter (`docs/research/obsidian-list-renumbering`), and whether outline mode should
   override Obsidian's smart-list behaviour is already the open question of #263 for renumbering.
   Not tried.
5. **Hold CI on 1.13.7** (#359). It keeps the required suites green and leaves every user on 1.14.4
   with Smart lists on exposed, since Obsidian updates itself.

## Prototype of the second

Sixty-two lines in `src/plugin/smart-list-paste.ts` and three edits in `transaction-filter.ts` (below).
`pasteRecorder` stores the clipboard's `text/markdown` and `text/plain` on each paste and handles
nothing. `readCollapsedPaste` runs on the changes the filter already judges: for a single-range
`input.paste` whose range starts right after a list prefix, it compares the one change with what
Obsidian would build from each recorded text and, on a match, returns the plain paste at the content
start; with no match it returns the change from the marker's start as the paste of its own inserted
text; otherwise it returns the changes untouched. Everything after it, the class, the verdict and
the rewrite, is the code that runs on 1.13.7.

Results, with the prototype in:

| Run | Result |
| --- | --- |
| The three failing cases, 1.14.4, desktop and mobile emulation | 6 of 6 pass |
| `clipboard` group (61, 62, 67, 80), 1.14.4, desktop, first version | 207 of 207 pass |
| Same, mobile emulation | 189 of 189 pass |
| Same group, desktop, with the HTML fallback added | 206 of 207 pass; the failure is `stays within the enforcement budget on a ~2000-line note`, a 60 s timeout that also occurs on plain `main` on 1.13.7 on this VM after its worker restarted, where the same spec had passed 76 of 76 before |
| `npm run typecheck`, `eslint` on the two files | clean |

Edge shapes, the same ⌘V on each build with the prototype in (the 1.14.4 change is Obsidian's, read
from the `cm.dispatch` log):

| Shape | 1.14.4's change | 1.14.4 | 1.13.7 |
| --- | --- | --- | --- |
| Empty task item `- [ ] `, clipboard `- a⏎- b` | 4 to 10, `- [ ] a⏎- b⏎` | `a`, `b` after the empty task item | same |
| Numbered empty item `2. `, clipboard `- a⏎  - b` | 5 to 8, `2. a⏎  - b⏎` | `- a` with `b` under it | same |
| Caret at the start of non-empty `beta`, clipboard `- p⏎  - q` | 4 to 6 | `p` after `beta`, `q` under `p` | same |
| First pasted line is a task, `- [x] a⏎- b` | 4 to 6 | `- [x] a`, `- b` | same |
| Sibling payload `  - a⏎  - b`, top-level empty item | 4 to 6 | `a`, `b` siblings | same |
| Deep payload `    - x⏎      - y`, top-level empty item | 4 to 6 | `y` one level under `x` | same |
| HTML list, flat | 4 to 6 | `a`, `b` siblings | same |
| HTML list, `a` with child `b`, into an empty item two levels deep | 18 to 20 | `b` under `a` | same |
| Two carets, two-line clipboard | one change per caret | `- a`, `- b` | `- - a`, `- - b` |

The last row differs and is left as it is: the prototype reads one change only, so Obsidian's
per-caret collapse stands, and its result is a pair of list items.

Without the prototype, on 1.14.4: the sibling payload gives `a` with `b` as its child (above), the
deep payload gives `y` six spaces in, and the nested HTML list gives `a` and `b` as siblings at
depth 2. The first two are the measurements behind the second candidate over the first.

## Not measured

- A real paste on iOS or Android. The mobile runs are Chromium's mobile emulation, which delivers the
  same `paste` event.
- A clipboard of files or an image, which Obsidian handles before `tryCollapseListMarker`.
- A paste over a non-empty selection that starts at a content start. The code allows it (`to` is the
  range's end); no case drives it.
- A clipboard with `\r\n` line breaks, and any text Obsidian normalizes before collapsing it, which
  the prototype's fallback would read from the inserted text.
- Which build introduced the method (above).

## Where the pin stands

CI on `main` at `cd48e98` runs `latest`. The pin the issue's last step removes is #359's:
`env.obsidian-version: "1.13.7"` in `.github/workflows/ci.yml`, with a comment naming #372. #359 is
open. A change that fixes this and removes the pin edits the lines #359 adds, so whichever lands
second carries the removal.

## Running a 1.14.4 build in a cloud session

The cache the session starts with holds 1.13.7 and the Electron 28 installer. A run on 1.14.4 first
fetches the 1.14.4 asar and, for the installer's Electron 28.2.3, a 155 MB chromedriver. In this
session the harness's download stopped mid-transfer with an undici assertion (`Parser.finish`,
`client-h1.js:374`): the first run left an unfinished asar directory, and after the asar was in place
the second run failed the same way on the chromedriver, whose partial zip was 91 KB short. The
proxy's `recentRelayFailures` was empty. `curl` through the same proxy completed both:

```bash
cd /opt/obsidian-cache/obsidian-app
curl -sSL -o obsidian-1.14.4.asar.gz \
  https://github.com/obsidianmd/obsidian-releases/releases/download/v1.14.4/obsidian-1.14.4.asar.gz
gunzip -f obsidian-1.14.4.asar.gz

D=/opt/obsidian-cache/electron-chromedriver/linux-x64/28.2.3
mkdir -p "$D" && cd "$(mktemp -d)"
curl -sSL -o cd.zip \
  https://github.com/electron/electron/releases/download/v28.2.3/chromedriver-v28.2.3-linux-x64.zip
unzip -q -o cd.zip -d "$D" && rm -f "$D/chromedriver.debug"   # 483 MB, not used
```

The harness then runs with `OBSIDIAN_VERSION=1.14.4`. A failed run leaves a `.tmp.*` directory beside
the target, to be removed first.

## The prototype's source

`src/plugin/smart-list-paste.ts`:

```ts
import { Prec, type Text, type Transaction } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { UserChange } from './user-changes';

/** Obsidian's own list-prefix pattern (`dR` in app.js): indentation and `>`
 * quotes, then a bullet or number marker, then an optional task box. */
const PREFIX_RE = /^([>\s]*)(([*+-] |(\d+)([.)] ))(?:\[(.)\] )?)?/;

interface Recorded {
  readonly texts: readonly string[];
}

let lastPaste: Recorded | undefined;

/** Records the clipboard's text on each paste event, before Obsidian's own paste
 * hook runs, and declines to handle it. */
export const pasteRecorder = Prec.highest(
  EditorView.domEventHandlers({
    paste(event) {
      const data = event.clipboardData;
      lastPaste = data
        ? { texts: [data.getData('text/markdown'), data.getData('text/plain')].filter((t) => t !== '') }
        : undefined;
      return false;
    },
  }),
);

/** The change Obsidian's smart-list paste replaced with a rewrite of the marker
 * (`tryCollapseListMarker`), read back as the plain paste at the content start
 * that it came from. */
export function readCollapsedPaste(
  tr: Transaction,
  startDoc: Text,
  changes: readonly UserChange[],
): readonly UserChange[] {
  if (!tr.isUserEvent('input.paste') || changes.length !== 1) return changes;
  const ranges = tr.startState.selection.ranges;
  if (ranges.length !== 1) return changes;
  const sel = ranges[0]!;
  const change = changes[0]!;
  const line = startDoc.lineAt(sel.from);
  const before = startDoc.sliceString(line.from, sel.from);
  const d = PREFIX_RE.exec(before);
  if (!d?.[2] || d[0] !== before) return changes;
  const start = line.from + d[1]!.length;
  for (const text of lastPaste?.texts ?? []) {
    const f = PREFIX_RE.exec(text.split('\n', 1)[0]!);
    if (!f?.[2]) continue;
    const box = f[6] ?? d[6];
    const insert = d[3]! + (box ? `[${box}] ` : '') + text.substring(f[0].length);
    if (change.fromA === start && change.toA === sel.to && change.insert === insert) {
      return [{ fromA: sel.from, toA: sel.to, insert: text }];
    }
  }
  // No recorded text rebuilds it (a clipboard Obsidian converted from HTML): the
  // inserted text already opens with the destination's marker, at depth 0.
  if (change.fromA === start && change.toA === sel.to && change.insert.startsWith(d[3]!)) {
    return [{ fromA: sel.from, toA: sel.to, insert: change.insert }];
  }
  return changes;
}
```

`src/plugin/transaction-filter.ts`:

```diff
+import { pasteRecorder, readCollapsedPaste } from './smart-list-paste';
@@
-    const changes = userChanges(tr.startState.doc, tr.changes);
+    const changes = readCollapsedPaste(tr, tr.startState.doc, userChanges(tr.startState.doc, tr.changes));
@@
-  return [filter, vetoCue];
+  return [filter, vetoCue, pasteRecorder];
```
