---
type: "research"
description: "Why three paste cases fail on Obsidian 1.14.4 and pass on 1.13.7 (#372): with Smart lists on, 1.14.4's own paste hook (`tryCollapseListMarker`) turns a list pasted at a list item's content start into a replacement of the item's marker, which our classifier reads as an ordinary within-node edit and passes; the two transactions side by side, the clause in `classify` that lets the second through, which pastes it reaches, and what it drops (the first pasted line's indentation, measured on sibling and deep payloads); where Obsidian's paste handling starts and how it picks the text, the same code on both builds, and the CodeMirror handler order that lets a plugin take a paste after `editor-paste` and before Obsidian's hook; everything Smart lists reaches and what public API can and cannot do about it; two prototypes measured on both builds, desktop and mobile emulation (taking a structural paste before the hook, the same transaction and result on both builds; reading 1.14.4's rewrite back, which works on that build only); how to run a 1.14.4 build in a cloud session when the harness's own download fails"
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

## A version-independent entry point

`app.js` of both builds: Obsidian's Markdown editor installs a CodeMirror DOM handler for `paste`
among its local extensions (`clipboardManager.handlePaste`). It fires the public `editor-paste`
workspace event unless the event is already handled, and returns true, which stops CodeMirror, when a
listener called `preventDefault()`. The paste itself happens afterwards, in CodeMirror's built-in
`paste` handler, through Obsidian's `clipboardPasteHook`. The hook picks the text with
`handleDataTransfer`, then tries a URL over a selection (`tryPasteUrl`), on 1.14.4 tries
`tryCollapseListMarker`, inserts text it converted with `replaceSelection(…, "input.paste")`, or
inserts files. With none of those, CodeMirror's stock paste inserts the plain text.

`handlePaste` and `handleDataTransfer` are the same code on 1.13.7 and 1.14.4, minifier names aside.
`handleDataTransfer` takes, in order:

1. for HTML holding `<!-- obsidian -->` (Obsidian's own copy) beside a plain text: nothing;
2. `text/markdown`, when present;
3. for other HTML: nothing when "Convert pasted HTML to Markdown" (`autoConvertHtml`) is off.
   Otherwise the HTML goes through `sanitizeHTMLToDom` (public), which strips a `javascript:` link's
   target among other things. Nothing when the result is a lone image beside files. Otherwise each
   media element whose source is under the desktop resource prefix is rewritten to a vault link, each
   `data:` source over 1000 characters is taken out and saved as an attachment in the background, and
   the serialized HTML is converted to Markdown. Media from a web address stays in the text;
4. without HTML, a `text/uri-list`: the URI when there is no plain text (or a dropped `.webloc` or
   `.url` file's name), and `[plain](uri)` when it differs from the plain text;
5. otherwise nothing.

The hook then inserts that text when there is one; with none, it inserts the clipboard's files when it
has any, and otherwise leaves the plain text to CodeMirror's stock paste.

CodeMirror runs DOM event handlers in precedence order, its built-in handlers last, and stops at the
first that returns true. Obsidian's local extensions come before every plugin's
`registerEditorExtension` extensions, so a plugin's `paste` handler at default precedence runs after
`handlePaste`, so after every `editor-paste` listener, and before the built-in paste with its hook.
The handler sees the `EditorView`, and what it does there does not depend on what the hook would have
done. `Workspace.on('editor-paste')` and `htmlToMarkdown` are public (`obsidian.d.ts`);
`vault.getConfig`, which reads `autoConvertHtml` and `smartIndentList`, is not.

## What Smart lists reaches

`smartIndentList` defaults to on in both builds and is read in three places on 1.14.4, two on 1.13.7:

| Where | What it does | Builds | In an outline-mode editor |
| --- | --- | --- | --- |
| Enter and Shift-Enter in the Markdown editor's keymap, read at each keypress | continues or ends the list | both | our keymap runs first, at `Prec.highest` (`src/plugin/keymap.ts`) |
| A transaction filter, installed while the setting is on | appends the renumbering of ordered lists to a transaction; skips one marked with a private annotation, `set`, `input.renumber`, a table cell's and a composition | both | runs before our filters (`docs/research/obsidian-list-renumbering`, "Filter order"); its changes are set aside before an edit is judged, a `rewrite` replaces them and a `pass` keeps them (#263) |
| `tryCollapseListMarker` in the paste hook | this note | 1.14.4 | taken before it runs, by the second prototype below |

Tab (`indentList`) is bound whatever the setting.

No public API reads or turns off the setting. `vault.getConfig` and `vault.setConfig` are private,
the value is one vault-wide setting that applies in every other note too, and the annotation that
exempts a transaction from renumbering is private. What public API allows is intercepting each entry
point: the keymap by precedence, the paste at the DOM handler above, and the renumbering in our own
transaction filter, which receives Obsidian's appended changes and can drop them. A behaviour Obsidian
adds under the setting in a later build is a new entry point, found the way this one was, by the
suites on the newest build.

## Candidate fixes

1. **Take a structural paste before Obsidian's paste hook.** A `paste` handler at the entry point
   above inserts the clipboard's text, chosen in `handleDataTransfer`'s order, as CodeMirror's stock
   paste does, for the pastes the enforcement treats as structural, and leaves every other paste to
   Obsidian. The same transaction reaches the enforcement on every build. The second prototype,
   below.
2. **Read the collapse from the transaction alone**, as the paste at the content start of the text it
   inserts. It fixes the three cases, whose payloads lose nothing, and it gives the 1.14.4 column of
   the table above for an indented first line (the sibling payload's `b` under `a`). That follows
   from the measurement above and was not run as code.
3. **Record the clipboard text on the paste event, and read the collapse as the paste of that
   text** when the transaction is exactly what Obsidian builds from it; where no recorded text
   reproduces the change (the HTML case), read the inserted text as the payload. The first
   prototype, below. It reads one build's output, and a later build's rewrite would need its own
   reading.
4. **Take every paste over in outline mode.** It would also replace Obsidian's URL paste, file paste
   and the collapse of a lone item, for pastes the enforcement passes anyway. Not tried.
5. **Turn Smart lists off for outline-mode notes.** Private API, and a vault-wide setting ("What
   Smart lists reaches"). Not tried.
6. **Hold CI on 1.13.7** (#359). It keeps the required suites green and leaves every user on 1.14.4
   with Smart lists on exposed, since Obsidian updates itself.

## Taking the paste: the second prototype

A `paste` handler in `src/plugin/structural-paste.ts`, registered with the enforcement's extensions
(source below, as revised after round 1 of the review). For outline mode, outside a nested editor,
with one selection range, it takes the text in `handleDataTransfer`'s order, HTML through
`sanitizeHTMLToDom` and `htmlToMarkdown`, and returns false wherever Obsidian's paste would insert
something other than that text: files with no text, a lone image beside files, media Obsidian saves or
rewrites, a plain text linked to a different `text/uri-list`. It applies the state's
`clipboardInputFilter`s, and when `isStructuralBlockSequence(parse(text).children)` holds, it
dispatches `replaceSelection(text)` with `input.paste` and returns true. Otherwise it returns false.

The first version, measured in the tables below, gave up on any clipboard with files and on any HTML
with media, and applied no input filter; "Review round 1" has what that left out.

The same ⌘V on each build, logged at `cm.dispatch`. Every structural shape is dispatched by the
plugin's handler on both builds, and Obsidian's hook never dispatches for it:

| Shape | Change, both builds | Result, both builds |
| --- | --- | --- |
| Case 1 | 18 to 18, the clipboard whole | as 1.13.7 in "What goes wrong" |
| Sibling payload `  - a⏎  - b`, empty top-level item | 6 to 6 | `a`, `b` siblings |
| Deep payload `    - x⏎      - y`, empty top-level item | 6 to 6 | `y` one level under `x` |
| Empty task item `- [ ] `, `- a⏎- b` | 10 to 10 | `a`, `b` after the empty task item, which stays: against "Pasting into an empty list item replaces it", a defect older than this change (round 1) |
| Numbered empty item `2. `, `- a⏎  - b` | 8 to 8 | `- a` with `b` under it |
| Start of non-empty `beta`, `- p⏎  - q` | 6 to 6 | `p` after `beta`, `q` under `p` |
| First pasted line a task, `- [x] a⏎- b` | 6 to 6 | `- [x] a`, `- b` |
| HTML list `a` with a nested `b`, empty item two levels deep | 20 to 20, `- a⏎    - b` | `b` under `a` |

Each change is the one 1.13.7's own paste dispatches for the same shape, logged with no prototype in
or with the first, which dispatches nothing of its own; each result is 1.13.7's.

The pastes it leaves to Obsidian, whose result follows the build:

| Paste | 1.13.7 | 1.14.4 |
| --- | --- | --- |
| Lone childless item `- a`, empty item | `- - a` | `- a` |
| Two carets in two empty items, `- a⏎- b` | `- - a`, `- - b` | `- a`, `- b` |
| Plain lines with no block structure, mid-paragraph | inserted as typed | same |

With an `editor-paste` listener registered, on both builds: the listener runs first and sees the
event unhandled. When it leaves the paste, the plugin's handler dispatches it; when it calls
`preventDefault()` and inserts text of its own, only that text lands and the plugin's handler
dispatches nothing.

e2e with the prototype in, one run at a time:

| Run | 1.13.7 | 1.14.4 |
| --- | --- | --- |
| The three failing cases, desktop and mobile emulation | 6 of 6 | 6 of 6 |
| `clipboard` group, desktop | 205 of 207 | 205 of 207 |
| `clipboard` group, mobile emulation | not run | 187 of 189 |
| `drawn-cases`, desktop | 19 of 19 | 19 of 19 |

The failures are the two ~2000-line budget tests, and on 1.13.7 the zoom test that runs after the
budget test's 60 s timeout, which passes alone. Both budget tests fail the same way without the
prototype on this VM since its worker restarted: the zoom one times out on plain `main` on both
builds, and the verdict budget reads 3.6 and 3.5 ms against its 3 ms on plain `main` on 1.14.4 (3.4
and 3.5 ms with the prototype). The same group passed 207 of 207 with the first prototype before the
restart. The groups were run with the first version of this prototype; the revised version was run on
the shapes in this section and the next.

## Review round 1

The proposal review on #373 measured three shapes the first version handled differently from
Obsidian's paste. Each case below was run again here, ⌘V on the empty item of `- top` / `  - mid` /
`    - `, unless it says otherwise:

| Clipboard | No prototype | First version | Revised |
| --- | --- | --- | --- |
| HTML list `a` with a nested `b`, and an `<img>` from a web address | 1.13.7: `b` under `a`, the image an item after it; 1.14.4: collapsed, `b` beside `a`, the image a top-level paragraph | left to Obsidian, the same | taken on both builds: the 1.13.7 result |
| The same list without the image, beside an `image/png` | 1.13.7: `b` under `a`; 1.14.4: collapsed, `b` beside `a` | left to Obsidian, the same | taken on both builds: `b` under `a` |
| After a linewise copy of `- a` and `- b` (two carets, ⌘C), on the gap line under `- a`, after its two spaces | both builds insert at the line's start; the run lands after `a`'s subtree | taken: inserted at the caret, the run lands under `a` before its child | the same as the first version |

A list with a `javascript:` link, written to the clipboard with `navigator.clipboard.write`, already
arrives sanitized: Chromium's asynchronous clipboard strips the link's target on write, so through the
clipboard the first version and Obsidian gave the same text. The review measured the difference with a
synthetic `paste` event carrying the raw HTML; whether HTML copied in another application reaches a
paste event unsanitized was not measured. The revised version sanitizes as Obsidian does either way.

## Reading the rewrite instead: the first prototype

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
depth 2. The first two are the measurements behind recording the clipboard text rather than reading
the transaction alone.

## Not measured

- A real paste on iOS or Android. The mobile runs are Chromium's mobile emulation, which delivers the
  same `paste` event.
- A clipboard of files with no text, a lone image beside a file, Obsidian's properties, a `data:`
  image over 1000 characters, a resource-path image and a `text/uri-list`. The revised second
  prototype leaves each to Obsidian; no case here drives one. Whether office applications put an
  image file beside their HTML.
- The DOM observer flush CodeMirror's own paste makes and the handler cannot, on Android.
- "Convert pasted HTML to Markdown" turned off, under which the second prototype still converts a
  structural HTML paste, and whether a plain-text paste (⌘⇧V) carries any HTML.
- For the first prototype: a paste over a non-empty selection that starts at a content start, and a
  clipboard with `\r\n` line breaks, which its fallback would read from the inserted text.
- Which build introduced the method (above).

## Where the pin stands

The pin the issue's last step removes is #359's, on `main` since `4f06fe3`:
`env.obsidian-version: "1.13.7"` in `.github/workflows/ci.yml`, with a comment naming #372, read by
both e2e jobs in place of `latest`.

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

## The prototypes' source

The second, `src/plugin/structural-paste.ts`, as revised after round 1:

```ts
import { EditorView } from '@codemirror/view';
import { Platform, htmlToMarkdown, sanitizeHTMLToDom } from 'obsidian';
import { parse } from '../parse';
import { isStructuralBlockSequence } from '../classify';
import { isOutlineMode } from './outline-state';
import { isNestedEditor } from './nested-editor';

/** The comment Obsidian's copy puts at the head of the HTML it writes. */
const OBSIDIAN_HTML = '<!-- obsidian -->';

/** A media source Obsidian's paste saves as an attachment or rewrites to a vault
 * link, rather than converting as it stands. */
function rewrittenByObsidian(src: string): boolean {
  if (src.startsWith('data:') && src.length > 1000) return true;
  return Platform.isDesktopApp && src.startsWith(Platform.resourcePathPrefix);
}

/** The text Obsidian's paste would insert from this clipboard, in the order of its
 * `handleDataTransfer`, or `undefined` where its paste is not that text alone
 * (files, a link to a URL, media it saves or rewrites). */
export function pastedText(data: DataTransfer): string | undefined {
  if (data.getData('obsidian/properties')) return undefined;
  const html = data.getData('text/html');
  const plain = data.getData('text/plain');
  let chosen: string | null = null;
  if (html && html.includes(OBSIDIAN_HTML) && plain) {
    chosen = null;
  } else if (data.getData('text/markdown')) {
    chosen = data.getData('text/markdown');
  } else if (html) {
    const holder = createDiv();
    // eslint-disable-next-line no-restricted-syntax -- detached DOM: serialised here, as Obsidian's paste does, never mounted
    holder.appendChild(sanitizeHTMLToDom(html));
    if (data.files.length > 0 && /^<img [^>]+>$/.test(holder.innerHTML.trim())) {
      chosen = null;
    } else {
      const media = Array.from(holder.querySelectorAll<HTMLImageElement | HTMLMediaElement>('img, audio, video'));
      if (media.some((el) => rewrittenByObsidian(el.src))) return undefined;
      chosen = htmlToMarkdown(holder.innerHTML.trim());
    }
  } else if (data.getData('text/uri-list')) {
    const uri = data.getData('text/uri-list');
    if (!plain) return undefined;
    const same = uri.toLowerCase() === plain.toLowerCase() || decodeURIComponent(uri.toLowerCase()) === plain.toLowerCase();
    if (!same) return undefined;
  }
  if (chosen) return chosen;
  if (data.files.length > 0) return undefined;
  return plain || undefined;
}

/** Takes a structural paste in an outline-mode editor before Obsidian's own paste
 * hook can rewrite it, and inserts it over the selection. */
export const structuralPaste = EditorView.domEventHandlers({
  paste(event, view) {
    if (!isOutlineMode(view.state) || isNestedEditor(view) || !event.clipboardData) return false;
    if (view.state.selection.ranges.length !== 1) return false;
    const raw = pastedText(event.clipboardData);
    if (raw === undefined) return false;
    const text = view.state.facet(EditorView.clipboardInputFilter).reduce((t, filter) => filter(t, view.state), raw);
    if (!isStructuralBlockSequence(parse(text).children)) return false;
    view.dispatch(view.state.replaceSelection(text), { userEvent: 'input.paste', scrollIntoView: true });
    return true;
  },
});
```

and in `src/plugin/transaction-filter.ts`:

```diff
+import { structuralPaste } from './structural-paste';
@@
-  return [filter, vetoCue];
+  return [filter, vetoCue, structuralPaste];
```

The first, `src/plugin/smart-list-paste.ts`:

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
