---
type: "research"
description: "Why three paste cases fail on Obsidian 1.14.4 and pass on 1.13.7 (#372): with Smart lists on, 1.14.4's own paste hook (`tryCollapseListMarker`) turns a list pasted at a list item's content start into a replacement of the item's marker, which our classifier reads as an ordinary within-node edit and passes; the two transactions side by side, which pastes it reaches, and what it drops (the first pasted line's indentation); where Obsidian's paste handling starts and how it picks the text, the same code on both builds, and the CodeMirror handler order that lets a plugin take a paste after `editor-paste` and before Obsidian's hook; everything Smart lists reaches and what public API can and cannot do about it; the prototypes measured on both builds, desktop and mobile emulation, with what four review rounds found in the text choice, the settings and the destinations; the rule that writes a pasted list item without repeating its destination's marker; a differential check of over 1300 generated clipboards against Obsidian's own paste, at an empty note, an empty list item and two selections, under both paste settings and as a drop, which found the gaps the maintainer's decisions close (a list beside a file taken as text, every HTML paste taken as converted, its links included) and then none on either build; how a text drop and the mobile Paste command reach the editor; a structural paste over a selection that loses text on main (#378); how to run a 1.14.4 build in a cloud session when the harness's own download fails"
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
   target among other things. Nothing when the result is a lone image beside files. Otherwise the
   serialized HTML is converted to Markdown. A loop between the two is written to rewrite media
   under the desktop resource prefix to vault links and to save `data:` sources over 1000 characters
   as attachments, but it walks the sanitized fragment after the fragment has been appended to the
   element that is serialized, which empties it: on both builds it finds nothing and media stays in
   the text as it was (measured in round 2 of the review: a 1200-character `data:` image stays
   inline and no file is saved);
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
   above inserts the clipboard's text, chosen in `handleDataTransfer`'s order, through the
   transaction `state.replaceSelection` builds, as Obsidian's paste does, for the pastes the
   enforcement treats as structural, and leaves every other paste to
   Obsidian. The same transaction reaches the enforcement on every build. The second prototype,
   below, its review rounds, and the differential check.
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

A `paste` handler in `src/plugin/structural-paste.ts`, registered with the enforcement's extensions,
and the text choice in `src/paste-text.ts` (source below, as revised after rounds 1 and 2 of the
review). For outline mode, outside a nested editor, with one selection range, it takes the text in
`handleDataTransfer`'s order, HTML through `sanitizeHTMLToDom` and `htmlToMarkdown`, and returns
false wherever Obsidian's paste would insert something other than that text: files with no text, a
lone image beside files, a plain text linked to a different `text/uri-list`. On the plain-text branch
only, it applies the state's `clipboardInputFilter`s and sets `scrollIntoView`, as Obsidian's paste
does. When `isStructuralBlockSequence(parse(text).children)` holds, it dispatches
`replaceSelection(text)` with `input.paste` and returns true. Otherwise it returns false.

The first version, measured in the tables below, gave up on any clipboard with files and on any HTML
with media, and applied no input filter; "Review round 1" and "Review round 2" have what it and the
next version left out.

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

## Review round 2

The light review of the round-1 response measured that Obsidian's media loop changes nothing, that
Obsidian's paste filters only its plain-text branch, and that a plain structural text beside a file
is decided differently by the two builds. Run again here with the third version, ⌘V on the empty item
of `- top` / `  - mid` / `    - `:

| Clipboard | 1.13.7 | 1.14.4 |
| --- | --- | --- |
| HTML list `a` with a nested `b`, and a 1200-character `data:` image | taken: `b` under `a`, the image inline in an item after it | the same |
| Plain `- a⏎  - b` beside an `image/png` | left to Obsidian: the file embedded, the text dropped | left to Obsidian: collapsed to `    - a` / `  - b`, so `b` lands under `top` beside `mid`, no file |
| Plain `- a⏎  - b`, with a registered `clipboardInputFilter` | taken, filtered, as outline mode off filters it | taken, filtered; outline mode off collapses it unfiltered |
| HTML list, with the same filter | taken, not filtered, as outline mode off | taken, not filtered; outline mode off collapses it |

## The differential check

After two rounds of the review each found a branch of `handleDataTransfer` read wrong by hand, the
text choice was checked against Obsidian's own paste as a whole. The probe
(`docs/research/prototypes/paste-differential/`) generates 672 clipboards from seven plain texts,
Markdown or none, eight HTML clipboards, three `text/uri-list` values and a file or none, and pastes
each, as a synthetic `paste` event, into an empty note with outline mode off, where Obsidian's paste
is the oracle, and into one with outline mode on. An empty note has no list prefix, so 1.14.4's
collapse reaches neither side. A `clipboardInputFilter` appending `⟦F⟧` is registered throughout, so
each row shows its branch. The third prototype and the fourth (below) gave the same verdicts, on each
build:

| Verdict | 1.13.7 | 1.14.4 |
| --- | --- | --- |
| Taken, and the text equals Obsidian's | 548 | 548 |
| Taken, and the text differs | 0 | 0 |
| Taken where Obsidian inserts a file | 0 | 0 |
| Left to Obsidian, which inserts non-structural text or a file | 116 | 116 |
| Left to Obsidian, which inserts structural text | 8 | 8 |

The 8 rows are a plain text beside a different `text/uri-list`, which Obsidian writes as a link,
`[- a⏎  - b](https://example.com/other)`, and which parses as more than one block. The link text
does not open with a list prefix, so 1.14.4's collapse does not reach it, and both builds insert the
same text. No row differs between the two builds in any field. Of the 548 taken, the 32 on the
plain-text branch carry `scrollIntoView`, as Obsidian's paste sets it there, and the 516 others do
not.

## Repeated markers: the fourth prototype

The maintainer's decision (2026-10-07): a list item pasted right after a list item's marker is
written without its own marker, on every build. The fourth prototype adds that rule to the handler
for pastes it does not take as structural, per range, with 1.14.4's formula: from the start of the
item's marker, the item's marker, the pasted line's task box or else the item's, then the pasted
text after its first line's prefix. The same ⌘V on each build:

| Paste | Without the rule, 1.13.7 | Fourth prototype, both builds |
| --- | --- | --- |
| `- a` on the empty item of `- A` / `- ` | `- - a` | `- a`, the caret after `a` |
| `- a` after the box of an empty `- [ ] ` | not run | `- [ ] a` |
| `- [x] a` on an empty `- ` | not run | `- [x] a` |
| `- a` on the empty item of `1. A` / `2. ` | not run | `2. a` |
| `- a` at the content start of `- beta` | not run | `- abeta`, the caret after `a` |
| `- a⏎- b` with a caret in each of two empty items | `- - a`, `- - b` | `- a`, `- b` |
| `- a` in the middle of `beta` | `- be- ata` | left to Obsidian: `- be- ata` on both |
| `- a` in the middle of a paragraph | inserted as typed | left to Obsidian, the same on both |

Without the rule, 1.14.4 already gives the second column wherever its collapse applies. Case 1 and
the sibling payload, run again with the fourth prototype, are unchanged on both builds.

## Review round 3

The light review of the differential check and the marker rule reproduced the probe's counts on both
builds, and ran the delta's marker scenarios with and without the rule. It found where the rule,
which the check did not reach, falls short of one result on every build: a lone item beside a file
(1.13.7 inserted the file, 1.14.4 the text); "Smart lists" off (1.14.4's own paste then writes
`- - a`, as 1.13.7 does); "Convert pasted HTML to Markdown" off (the handler converted a lone HTML
item that Obsidian pastes as its plain text); a text drop and the mobile app's Paste command, which
fire no `paste` event; and a code line that starts with `- `, where the rule drops the pasted
marker, as 1.14.4's collapse does. It measured two places where 1.14.4's collapse and the handler
take a different text: the collapse takes a plain text without CodeMirror's input filters, and splits
a CRLF text across carets on `\n` alone, leaving a stray line. And task 2.2's deep payload,
`    - x` / `      - y`, keeps its tree through 1.14.4's collapse, so it could not fail without the
handler.

How a drop and the mobile command insert, read in `app.js` of both builds: Obsidian's `handleDrop`
fires `editor-drop`, takes `handleDataTransfer` of the drop, and dispatches
`state.replaceSelection(text)` with no user event; when it chooses no text, CodeMirror's own drop
inserts the plain text as `input.drop`. The mobile `editor:paste` command calls
`editor.replaceSelection(await navigator.clipboard.readText())`, which dispatches with no user event
either. `classify` reads a dispatch with no user event as programmatic.

The maintainer's choices at the step-back (2026-10-08): extend the generated check to the empty item,
the two settings and a drop before round 4; take a list beside a file as text; convert HTML whatever
the setting says, with no private API; leave the drop and the mobile routes to an issue. The extended
check (next) then found two more gaps, and the maintainer chose to take a list beside an image's
`<img>` as text too, and to take every HTML paste as converted.

## The extended check: the empty item, the settings and a drop

The probe now pastes each clipboard at two destinations, an empty note and the empty item of `- A` /
`- `, with outline mode off and on; at the empty item under the four combinations of "Smart lists"
and "Convert pasted HTML to Markdown"; and drops it on the empty item with the defaults. The oracle
is a third editor: Obsidian's paste into an empty note, outline mode off and the conversion on, of
the clipboard, or of its plain text alone where Obsidian's paste would insert the files. That is the
text outline mode is to take under the maintainer's choices. Each paste is held, by its oracle, to
one rule:

- a structural text is taken, and the text the handler inserts equals the oracle;
- a non-structural text whose first line is a list item lands on the empty item as the marker rule
  writes it;
- other converted HTML is inserted as it is;
- anything else is left to Obsidian.

Outline mode's result for each paste must also be the same on both builds and, for a paste it takes,
the same under every setting. Two HTML clipboards joined the axes: a lone list item in bold, and a
code editor's copy, a `<div>` a line in the shape VS Code writes. That is 840 clipboards and 3360
pastes at the empty item, about 7 minutes a build, the first 840 into seven editors at once.

The first run, with the fifth prototype (the marker rule, and a plain list beside a file taken as
text), corrected the probe's own oracle for Obsidian's copy beside a file, and found two gaps, on
the empty item:

| Clipboard | 1.13.7 | 1.14.4 |
| --- | --- | --- |
| An image's `<img>` and its file, with `- a` as the plain text | left to Obsidian: the file | left to Obsidian: its collapse inserts `- a`, no file |
| "Convert pasted HTML to Markdown" off: an image's `<img>`, no file, with `- a` as the plain text | left to Obsidian, which pastes the plain text: `- - a` | left to Obsidian, collapsed: `- a` |
| The same with `  - a⏎  - b` | the enforcement splices the plain paste: `a` and `b` siblings | collapsed: `b` under `a` |

The first is the shape the maintainer had decided for a clipboard with no HTML, and was decided the
same way. The other two are what converting regardless of the setting leaves: with it off, a paste
the handler does not take falls back to the plain text, which each build's paste writes its own way.
The maintainer chose public API and one behaviour: take every HTML paste as converted (the sixth
prototype). With the sixth, on each build:

| Verdict | 1.13.7 | 1.14.4 |
| --- | --- | --- |
| Empty item: structural, taken, the text equal | 2872 | 2872 |
| Empty item: the marker rule, as expected | 244 | 244 |
| Empty item: other HTML, inserted as converted | 84 | 84 |
| Empty item: left to Obsidian, the same as outline mode off | 128 | 128 |
| Empty item: left to Obsidian, rewritten by the enforcement | 32 | 32 |
| Empty note: structural, taken, the text equal | 718 | 718 |
| Empty note: other HTML, inserted as converted | 63 | 63 |
| Empty note: left to Obsidian, the same as outline mode off | 53 | 53 |
| Empty note: left to Obsidian, rewritten by the enforcement | 6 | 6 |
| Against the rule it is held to | 0 | 0 |
| A taken paste whose result depends on the settings | 0 | 0 |

No paste's outline-mode result differs between the builds, at either destination or in a drop. The
pastes rewritten after Obsidian inserted them are the plain texts beside a different `text/uri-list`:
Obsidian writes a link whose text spans lines, `[- a⏎  - b](https://example.com/other)`, the handler
leaves it, and the enforcement then judges the inserted lines as it does without the handler,
re-indenting the second (`[- a⏎→ - b](…)` on the item, a blank line before it on the empty note).

The drops, with the defaults, the same on both builds: 650 of the 840 leave a repeated marker in
outline mode, as with it off. A Markdown or HTML drop inserts with no user event, so a structural
text is not spliced (`- - a⏎    - b` on the empty item); a plain text alone goes through CodeMirror's
drop and is spliced (32 drops differ from outline mode off), but a lone item there repeats the
marker.

A code editor's copy, ⌘V on the empty item of `- top` / `  - mid` / `    - `:

| | 1.13.7 | 1.14.4 |
| --- | --- | --- |
| Outline mode off, conversion off | `    - - a⏎  - b` | `    - a⏎  - b` |
| Outline mode off, conversion on | `    - - a`, a blank line, then a paragraph of a no-break space, a space and `- b` | `    - a`, then the same |
| Outline mode on, either setting | `    - a⏎⏎    - - b` | the same |

Converted, the copy is a list item and a paragraph; with the setting off, Obsidian's own paste keeps
the list. Outline mode converts whatever the setting says, the cost the maintainer accepted: outline
mode off gives the stock paste.

## Review round 4

The light review of the extended check reproduced its table to the digit on both builds, and ran a
sweep of its own beyond the check's reach: 28 destinations (selections, task and numbered items, a
quote, a heading, a code fence, a gap line, several carets, a tab-indented vault) by 28 clipboards,
under the four settings. It found:

- the handler's predicate for a plain text beside a file was "structural", where the maintainer's
  decision and half the artifacts said "a list": two paragraphs beside a file were taken and the
  file dropped. The predicate is now a plain text whose first line is a list item, the text 1.14.4's
  collapse reaches;
- the HTML branch's one exit to Obsidian, a URL over a selection, read the conversion setting on
  Obsidian's side: with it off, Obsidian pasted the plain text instead of the link, and a `- a`
  plain text over an item's text gave `- - a` on 1.13.7 and `- a` on 1.14.4. The handler now writes
  the links itself, as `tryPasteUrl` does, for converted HTML;
- the handler inserted into a read-only editor, which CodeMirror's own paste refuses
  (`if (view.state.readOnly) return true` in its handler); it now leaves one alone;
- the check's analysis read any converted link as Obsidian's own `text/uri-list` link, so a web link,
  the commonest browser clipboard, would have been reported against the rule; "left to Obsidian" is
  now decided from the clipboard's entries, and the axes hold a web link, Google Docs' wrapper, a
  table and a `StartFragment` copy;
- a third place where 1.14.4's collapse and the handler differ: the collapse deals any text's lines
  to the carets, where Obsidian's `replaceSelection` gives Markdown and HTML whole to each; and a
  plain text beside a different `text/uri-list` over two carets, which 1.14.4 deals and 1.13.7 links
  at each;
- that a plain-text paste (⌘⇧V, and the menu's "Paste as plain text", `pasteAndMatchStyle`) fires a
  `paste` whose clipboard holds only `text/plain`;
- that a drawn case's clipboard column ends in a newline unless it ends in `∅`, which pushed the
  item's text onto a line of its own in the marker cases.

Outside the change, while extending the check to selections: a structural paste over a selection
inside a node loses the node's unselected text, and, in a paragraph, everything after it (#378). On `main`,
with no handler, real ⌘V, 1.13.7 and 1.14.4 alike:

| Before | After ⌘V of `- a⏎  - b` |
| --- | --- |
| `x «see» y` / (blank) / `- other` | `- a` / `    - b`, the whole note |
| `- first` / `- x «see» y` / `- other` | `- first` / `- a` / `    - b` / `- other` |
| `x se┃e y` / (blank) / `- other` (a caret) | the list after the paragraph, as the spec says |

⌘Z restores the note. The handler inserts the same transaction 1.13.7's paste does, so it neither
causes nor changes this.

## The check after round 4

The probe's third version adds the two selection destinations, the word `see` selected in `x see y`
and `beta` selected in `- beta`, both under the four settings; five HTML clipboards (a web link, a
link whose text is its URL, Google Docs' wrapper, a table, a `StartFragment` copy); an oracle that
leaves files out only for a plain text opening with a list item; and an analysis that reads "left to
Obsidian" from the clipboard's entries and holds a URL over a selection to `tryPasteUrl`'s link.
1260 clipboards, 5040 pastes at each of the three destinations, about 22 minutes a build with the
seventh prototype. Both builds give every count below, and no outline-mode result differs between
them:

| Verdict | Empty item | `x «see» y` | `- «beta»` |
| --- | --- | --- | --- |
| Structural, taken, the text equal | 4004 | 4004 | 4004 |
| The marker rule, as expected | 244 | — | 244 |
| Other HTML, inserted as converted | 588 | 756 | 588 |
| A URL over the selection, linked | — | 32 | 32 |
| Left to Obsidian, the same as outline mode off | 172 | 216 | 140 |
| Left to Obsidian, rewritten by the enforcement | 32 | 32 | 32 |
| Against the rule it is held to | 0 | 0 | 0 |
| A taken paste whose result depends on the settings | 0 | 0 | 0 |

Converted HTML links come out as `[x](https://example.com/x)`, never a bare URL, so no clipboard on
those axes meets the link test with converted text. A sixteenth HTML clipboard, a URL as text
(`<span>https://example.com/x</span>`), ran in a sweep of its own, 168 clipboards on each build: over
both selections it is linked under all four settings, `x [see](https://example.com/x) y`, where
outline mode off with the conversion off pastes the plain text instead (`x - a⏎  - b⟦F⟧ y`); no
paste against its rule, none differing between the builds. The probe now holds it among its axes.

The structural pastes over `x «see» y` are taken with the oracle's text, and the enforcement then
replaces the whole note with them, as it does without the handler (#378).

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
- Real clipboards from other applications: the check's are synthetic. Whether office applications
  put an image file beside their HTML, whether HTML copied from Obsidian's reading view carries
  resource-path images, and what VS Code writes beyond the shape the check copies. Obsidian's
  properties, a `.webloc` file, a second file and a file that is not an image are not on its axes.
- The DOM observer flush CodeMirror's own paste makes and the handler cannot, on Android.
- The mobile app's Paste command and its menu on a device: read in `app.js`, where they are
  registered only when `Platform.isMobileApp`, which the emulation is not.
- The marker rule under an active zoom, and a copy made with empty selections over several ranges.
- In the check, destinations beyond the empty note, the empty item and the two selections: round 4
  of the review swept 28 by hand, and zoom, folding and Live Preview against Source mode were not
  among them.
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

The second, in its seventh version (after rounds 1 to 4 of the review and the maintainer's choices
of 2026-10-08: the marker rule, a list beside a file taken as text, and every HTML paste taken as
converted, its links included): `src/paste-text.ts`,

```ts
/**
 * The text Obsidian's paste takes from a clipboard, read in the order of its
 * `handleDataTransfer`, with the DOM work passed in so it runs without a DOM.
 */

/** The comment Obsidian's copy puts at the head of the HTML it writes. */
const OBSIDIAN_HTML = '<!-- obsidian -->';

/** What the paste reads from a clipboard: a `DataTransfer` has both. */
export interface ClipboardEntries {
  getData(type: string): string;
  readonly files: { readonly length: number };
}

/** Sanitized HTML, serialized, and whether it is a lone image. */
export interface HtmlInspection {
  readonly html: string;
  readonly loneImage: boolean;
}

/** The text a paste in outline mode takes, and where it came from: Obsidian's paste sends
 * the plain text through CodeMirror's own paste, and inserts Markdown and converted HTML
 * with `replaceSelection`. */
export interface PastedText {
  readonly text: string;
  readonly source: 'plain' | 'markdown' | 'html';
}

/** The text Obsidian's paste would insert from this clipboard, in the order of its
 * `handleDataTransfer`, with HTML converted whatever its setting says, or `undefined` where
 * its paste makes a URL or a link of the clipboard, or inserts its files. Where Obsidian's
 * paste would insert the files, a plain text that opens with a list item is returned instead:
 * the outline takes a list as text. The DOM work is passed in, so this runs without one. */
export function pastedText(
  data: ClipboardEntries,
  inspect: (html: string) => HtmlInspection,
  toMarkdown: (html: string) => string,
): PastedText | undefined {
  if (data.getData('obsidian/properties')) return undefined;
  const html = data.getData('text/html');
  const plain = data.getData('text/plain');
  const markdown = data.getData('text/markdown');
  if (html && html.includes(OBSIDIAN_HTML) && plain) {
    // Obsidian's own copy: its plain text.
  } else if (markdown) {
    return { text: markdown, source: 'markdown' };
  } else if (html) {
    const seen = inspect(html);
    const converted = data.files.length > 0 && seen.loneImage ? '' : toMarkdown(seen.html);
    if (converted) return { text: converted, source: 'html' };
  } else if (data.getData('text/uri-list')) {
    const uri = data.getData('text/uri-list');
    if (!plain) return undefined;
    const same = uri.toLowerCase() === plain.toLowerCase() || decodeURIComponent(uri.toLowerCase()) === plain.toLowerCase();
    if (!same) return undefined;
  }
  if (!plain || (data.files.length > 0 && !opensWithListItem(plain))) return undefined;
  return { text: plain, source: 'plain' };
}

/** A list line's prefix, as Obsidian's paste reads it: indentation and `>` quotes,
 * a bullet or number marker, then an optional task box. */
const LIST_PREFIX = /^([>\s]*)(([*+-] |(\d+)([.)] ))(?:\[(.)\] )?)?/;

/** Whether a text's first line is a list item, the text Obsidian's collapse rewrites. */
function opensWithListItem(text: string): boolean {
  return Boolean(LIST_PREFIX.exec(text.split(/\r\n?|\n/, 1)[0]!)?.[2]);
}

/** Where a list item pasted at an item's content start is written without its own
 * marker: from the start of the item's marker, the item's marker, the pasted task box
 * (or the item's), then the pasted text after its first line's prefix. `before` is the
 * line's text up to the insertion point. */
export function withoutRepeatedMarker(before: string, text: string): { readonly from: number; readonly insert: string } | undefined {
  const dest = LIST_PREFIX.exec(before);
  if (!dest?.[2] || dest[0] !== before) return undefined;
  const pasted = LIST_PREFIX.exec(text.split('\n', 1)[0]!);
  if (!pasted?.[2]) return undefined;
  const box = pasted[6] ?? dest[6];
  return { from: dest[1]!.length, insert: dest[3]! + (box ? `[${box}] ` : '') + text.slice(pasted[0].length) };
}

/** The text each range of a paste receives. CodeMirror's own paste, which takes the plain
 * text, gives a line each when the lines match the ranges one for one; Obsidian's
 * `replaceSelection`, which takes Markdown and converted HTML, gives the whole text to each. */
export function textPerRange(text: string, ranges: number, plain: boolean): readonly string[] {
  const lines = text.split(/\r\n?|\n/);
  return plain && ranges > 1 && lines.length === ranges ? lines : Array.from({ length: ranges }, () => text);
}

/** Whether Obsidian's paste reads a text as a URL: no space, and the URL parser takes it. */
function isUrl(text: string): boolean {
  if (!text || text.includes(' ')) return false;
  try {
    return Boolean(new URL(text));
  } catch {
    return false;
  }
}

/** A selection range, as Obsidian's paste reads it before making links of a URL. */
export interface RangeShape {
  readonly empty: boolean;
  readonly oneLine: boolean;
}

/** The URL each range receives where Obsidian's paste makes links of the text over the
 * selection, or `undefined` where it does not: a range is not empty, none spans lines, and the
 * text is a URL, or a URL a line with one line for each range. An empty range takes the URL
 * itself, any other a link over its text, as Obsidian's `tryPasteUrl` writes them. */
export function linkPerRange(ranges: readonly RangeShape[], text: string): readonly string[] | undefined {
  if (!ranges.some((r) => !r.empty) || !ranges.every((r) => r.empty || r.oneLine)) return undefined;
  if (!text.includes('\n')) return isUrl(text) ? ranges.map(() => text) : undefined;
  const lines = text.split('\n');
  return lines.length === ranges.length && lines.every(isUrl) ? lines : undefined;
}
```

`src/plugin/structural-paste.ts`,

```ts
import { EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { htmlToMarkdown, sanitizeHTMLToDom } from 'obsidian';
import { parse } from '../parse';
import { isStructuralBlockSequence } from '../classify';
import { isOutlineMode } from './outline-state';
import { isNestedEditor } from './nested-editor';
import { linkPerRange, pastedText, textPerRange, withoutRepeatedMarker, type HtmlInspection } from '../paste-text';

function inspectHtml(html: string): HtmlInspection {
  const holder = createDiv();
  // eslint-disable-next-line no-restricted-syntax -- detached DOM: serialised here, as Obsidian's paste does, never mounted
  holder.appendChild(sanitizeHTMLToDom(html));
  const serialized = holder.innerHTML.trim();
  return { html: serialized, loneImage: /^<img [^>]+>$/.test(serialized) };
}

/** Takes a structural paste in an outline-mode editor before Obsidian's own paste
 * hook can rewrite it, and inserts it over the selection as Obsidian's paste would;
 * writes a list item pasted at an item's content start without repeating the item's
 * marker; and inserts HTML, and the links Obsidian makes of it, converted whatever
 * Obsidian's setting says. The same on every build. */
export const structuralPaste = EditorView.domEventHandlers({
  paste(event, view) {
    if (!isOutlineMode(view.state) || isNestedEditor(view) || view.state.readOnly || !event.clipboardData) return false;
    const choice = pastedText(event.clipboardData, inspectHtml, htmlToMarkdown);
    if (choice === undefined) return false;
    const state = view.state;
    const ranges = state.selection.ranges;
    const shapes = ranges.map((r) => ({ empty: r.empty, oneLine: state.doc.lineAt(r.from).number === state.doc.lineAt(r.to).number }));
    const links = linkPerRange(shapes, choice.text);
    if (links !== undefined) {
      // Obsidian's paste writes these links from the converted HTML only while its conversion is on.
      if (choice.source !== 'html') return false;
      const changes = ranges.map((r, i) => ({
        from: r.from,
        to: r.to,
        insert: r.empty ? links[i]! : `[${state.sliceDoc(r.from, r.to)}](${links[i]!})`,
      }));
      view.dispatch({ changes, userEvent: 'input.paste' });
      return true;
    }
    const plain = choice.source === 'plain';
    const text = plain
      ? state.facet(EditorView.clipboardInputFilter).reduce((t, filter) => filter(t, state), choice.text)
      : choice.text;
    if (ranges.length === 1 && isStructuralBlockSequence(parse(text).children)) {
      view.dispatch(state.replaceSelection(text), { userEvent: 'input.paste', scrollIntoView: plain });
      return true;
    }
    const pieces = textPerRange(text, ranges.length, plain);
    let rewritten = false;
    let i = 0;
    const spec = state.changeByRange((range) => {
      const piece = pieces[i++]!;
      const line = state.doc.lineAt(range.from);
      const marker = withoutRepeatedMarker(state.sliceDoc(line.from, range.from), piece);
      if (marker) {
        rewritten = true;
        const from = line.from + marker.from;
        return { changes: { from, to: range.to, insert: marker.insert }, range: EditorSelection.cursor(from + marker.insert.length) };
      }
      return { changes: { from: range.from, to: range.to, insert: piece }, range: EditorSelection.cursor(range.from + piece.length) };
    });
    if (!rewritten && choice.source !== 'html') return false;
    view.dispatch(spec, { userEvent: 'input.paste', scrollIntoView: plain });
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
