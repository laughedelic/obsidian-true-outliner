# Design

## Context

The enforcement recognises a paste by the transaction it receives: an insertion, or a type-over,
whose text parses as a structural block sequence. It never sees the clipboard. On 1.13.7 a paste
arrives as CodeMirror's stock insertion of the clipboard's text; on 1.14.4, for a list pasted at a
list item's content start, it arrives as Obsidian's replacement of the item's marker, which drops the
first pasted line's indentation and which `classify` reads as an ordinary edit. See proposal.md for
the failures.

What is the same on both builds is where Obsidian's paste handling starts and how it picks the text:
`docs/research/obsidian-smart-list-paste`, "A version-independent entry point". In short, Obsidian's
own DOM `paste` handler fires the public `editor-paste` event and stops if a listener handled it; the
paste itself happens later, in CodeMirror's built-in paste handler, through a hook where Obsidian
converts HTML, links a URL over a selection, inserts files and, on 1.14.4, rewrites list pastes.

## Goals / Non-Goals

**Goals:**
- The enforcement receives the same transaction for a structural paste on every Obsidian build, and
  it is the one it already judges correctly: the clipboard's text inserted over the selection.
- Nothing in the plugin recognises a particular build's output.
- A list item pasted at an item's marker never repeats the marker, on any build or setting.

**Non-Goals:**
- Changing `classify`, the verdict layer or the rewrite.
- Taking pastes the enforcement would pass anyway, other than the ones the marker rule rewrites
  (proposal, Non-goals).

## Decisions

**Take the paste before Obsidian's paste hook, rather than read what the hook dispatches.** Two
requirements read on 1.14.4's transaction and disagree. transaction-classification's "A replacement
synthesized around a caret is not a paste" makes it `within-node-edit`, so it passes.
node-edit-enforcement's "Structural pastes splice at node boundaries" ("Pasting into an empty list
item replaces it") requires the user's paste rewritten, "preserving the copied content's own relative
nesting exactly", a nesting the transaction no longer holds. The new requirement settles it for a
structural paste by taking it before the hook, so the second requirement governs it; for a paste left
to Obsidian, the first keeps governing what Obsidian dispatches (proposal, Non-goals).

The entry point and the text choice are identical on 1.13.7 and 1.14.4; the hook's output is not,
and the next build's need not be either. A paste taken there reaches the enforcement as an insertion
of the clipboard's text on every build, so the existing paste rules apply unchanged. Reading the
output was the first plan and is measured in the note ("Reading the rewrite instead"): it fixes
1.14.4, needs the clipboard text from the event anyway, and has to learn each new rewrite.

**A CodeMirror `paste` handler at default precedence, registered with the enforcement's
extensions.** CodeMirror runs DOM event handlers in precedence order and its built-in handler last.
Obsidian's own `paste` handler is among its local extensions, which come before every plugin's, so
at equal precedence it runs first: it fires `editor-paste`, and a listener that handles the paste
stops the event before ours runs. Ours then dispatches and returns true, and CodeMirror skips its
built-in paste, where Obsidian's hook lives. The handler receives the `EditorView`, whose state says
whether outline mode is on.

- *Obsidian's `editor-paste` event* is public and documented for exactly this, but it hands over an
  Obsidian `Editor`; reaching the view from it is the private `editor.cm`, and a listener there runs
  in registration order among other plugins' rather than after them.
- *`Prec.highest`* would run before Obsidian's own handler and before `editor-paste`, taking the
  paste from plugins that handle it the documented way.

**Which pastes it takes.** Outline mode on; not a nested table-cell editor; an editor that is not
read-only, since CodeMirror's own paste refuses one (round 4 of the review); one selection range; a
clipboard with a text chosen as below; text that is a structural block sequence by the same
`isStructuralBlockSequence(parse(text).children)` the classifier applies. These are the pastes
"Structural pastes splice at node boundaries" rewrites, so taking them changes which code builds the
transaction and nothing about how it is judged. One range only, because the enforcement passes a
paste over several ranges anyway. Beyond these, the handler takes a paste the marker rule rewrites,
and every paste of converted HTML (below). Everything else returns false and continues as today.

**The text Obsidian's paste would take**, in the order of its `handleDataTransfer`, identical on both
builds (the note, "A version-independent entry point"):

1. Obsidian's own copy, marked by `<!-- obsidian -->` in its HTML beside a plain text: no text of its
   own, so the plain text below.
2. `text/markdown`.
3. Other HTML, sanitized with the public `sanitizeHTMLToDom` and serialized: a lone image beside
   files gives no text, so the plain text below; otherwise the public `htmlToMarkdown` of it.
   Obsidian's code also holds a loop meant to rewrite resource paths and save large `data:` images
   as attachments, but it runs over the sanitized fragment after the fragment has been moved into
   the element that is serialized, so on both builds it changes nothing and media stays in the text
   as it was (round 2 of the review).
4. Without HTML, a `text/uri-list`: with no plain text, or one that differs from it, Obsidian makes a
   URL or a link of it, and the paste stays Obsidian's.
5. With no text chosen, the plain text; beside files, only a plain text whose first line is a list
   item. Obsidian's paste inserts the files there instead on 1.13.7; on 1.14.4 its collapse runs
   first, and it reaches exactly such a text, which at a list item's content start it inserts
   without its first line's indentation and without the file (round 2 of the review). The handler
   takes the text when it is structural or when the marker rule below rewrites it, and leaves any
   other paste beside files to Obsidian, which inserts the files: a list beside a file lands as
   text, without the file, on both builds, and two paragraphs beside a file give the file on both
   (the maintainer's decisions, 2026-10-08, for a clipboard with no HTML and for one whose HTML is
   the image's own `<img>`; round 4 of the review).

**Every HTML paste is taken as converted.** Obsidian converts HTML only when its "Convert pasted HTML
to Markdown" setting is on, which a plugin reads only through the private `vault.getConfig`; with
it off, Obsidian's paste takes the plain text instead, which on 1.14.4 its collapse rewrites at a
list item. The maintainer chose public API and one behaviour over the setting (2026-10-07 and
2026-10-08): in outline mode the handler converts HTML whatever the setting says, and takes every
paste whose text is converted HTML, not only a structural one, so a paste never falls back to a
plain text that Obsidian's paste would then insert differently on each build. It inserts the text
as Obsidian's paste does with the setting on: with `replaceSelection`, the whole text in each range,
`input.paste`, and no `scrollIntoView`. With the setting on, its result is Obsidian's; with it off,
it is what the setting on would give. That includes a URL over a selection, which Obsidian's paste
writes as links (`tryPasteUrl`) from the converted text with the setting on and from the plain text
with it off (round 4 of the review): where some range is not empty, none spans lines, and the text
is a URL, no space and accepted by the URL parser, or a URL a line with a line for each range, the
handler writes the selected text of each range linked to its URL, and the URL itself at an empty
range, as `tryPasteUrl` does. A plain or Markdown URL over a selection stays Obsidian's, which
links it the same way on both builds and under either setting. A lone image beside files gives no
converted text (step 3), so it falls to the plain text, and Obsidian inserts the files unless that
text is a list.

CodeMirror's `clipboardInputFilter`s, public API another plugin may register, apply to the plain
text of the last step only. That is the one branch Obsidian's paste sends through CodeMirror's own
paste, where the filters run; Markdown and HTML text it inserts with `editor.replaceSelection`, which
no filter reaches (round 2 of the review).

The choice is a pure function in a module of its own, `src/paste-text.ts`, with the HTML inspection
(sanitize, serialize, say whether it is a lone image) and the converter passed in as functions of
strings. The unit suite, which has no DOM and cannot load Obsidian's runtime, tests it with stand-ins
for both; the DOM side is the e2e rows of task 2.3.

**Inserted at the selection.** `state.replaceSelection(text)` with `userEvent: 'input.paste'`, the
transaction Obsidian's paste builds for one range on every branch, with `scrollIntoView` where it sets
it: on the plain-text branch, which goes through CodeMirror's paste, and not on the Markdown and HTML
branches, which go through `editor.replaceSelection` (round 2 of the review). The enforcement reads
neither the flag nor which branch it was. The one place they differ is after a linewise copy, a copy
made with empty selections, when CodeMirror's paste inserts the plain text at the start of the
caret's line instead, from state it does not expose. On a gap line the two land in different places, and the selection is the
place "A paste on the blank line under a node lands inside it" asks for; on a node's own line they
gave the same result (round 1 of the review, and the note). For every other shape measured, the
prototype's dispatches equal 1.13.7's own change for change (the note's table).

**A pasted list item does not repeat its destination's marker.** The maintainer's decision
(2026-10-07): `- - a` has no use in an outline, and outline mode gives one result on every build. For
a paste the handler does not take as structural, each range whose line holds nothing before it but a
list prefix with a marker, and whose text's first line starts with a list prefix of its own, is
written from the start of the item's marker as: the item's marker, the pasted line's task box or else
the item's, then the pasted text after its first line's prefix. Other ranges get their text as it
is. The text is the handler's own choice above, and is distributed across ranges as Obsidian's
paste distributes it: a plain text, which goes through CodeMirror's own paste, a line each when the
lines match the ranges one for one and the whole text in each otherwise; Markdown and converted
HTML, which go through `replaceSelection`, the whole text in each. If no range meets the rule, the
paste stays Obsidian's, unless its text is converted HTML. The rule applies whatever "Smart
lists" says: with it off, 1.14.4 writes `- - a` as 1.13.7 does, and outline mode writes `- a` on
both.

The formula is the one 1.14.4's `tryCollapseListMarker` writes, so with "Smart lists" on, 1.14.4's
result is the one it gives today for every paste whose text its collapse and the handler agree on,
and 1.13.7's is the same instead of `- - a` (the note's fourth prototype). They disagree in three
places, and the handler follows the text Obsidian's paste chooses, as 1.13.7 inserts it: the collapse
takes a plain text without CodeMirror's input filters; it splits a CRLF text across carets on `\n`
alone, leaving a stray line (round 3 of the review); and it deals the lines of any text a line to
each caret when their counts match, where Obsidian's `replaceSelection` gives Markdown and converted
HTML whole to each caret (round 4). Every other range's line is the one
Obsidian's paste writes. Where the rule's range is a selection across nodes, the enforcement then
rewrites the edit as it rewrites the same paste without the rule, and the two results are the same
(round 3). The transaction it dispatches from a caret is a replacement, which classifies as an
ordinary edit and passes, as Obsidian's own does on 1.14.4.

- *Read a lone item as a node*, replacing an empty item and landing as a sibling at a non-empty
  item's start. At `- beta`'s start that gives `- a` above `- beta` instead of `- abeta`; on an empty
  item the two agree. It would make a lone item structural, a change to "Structural pastes splice at
  node boundaries" that the decision did not ask for.
- *Rewrite only on an empty item.* It leaves `- - abeta` at a non-empty item's start on 1.13.7, where
  1.14.4 gives `- abeta`.

**The text choice and the rules are checked against Obsidian's own paste.** Rounds 1 to 3 of the
review each found a branch of `handleDataTransfer`, a setting or a destination read wrong by hand. A
differential check settles them as a whole: generated clipboards (plain text, Markdown, HTML,
`text/uri-list`, files, in combination) are pasted with outline mode off and on, into an empty note,
onto the empty item of `- A` / `- `, and over a word selected in a paragraph and an item's text
selected, those three under the four combinations of "Smart lists" and "Convert pasted HTML to
Markdown". The oracle is Obsidian's paste into an empty note with
outline mode off and the conversion on, of the clipboard, or of its plain text alone where Obsidian's
paste would insert the files and that text opens with a list item; an empty note has no list
prefix, so 1.14.4's collapse does not reach it. Each paste is held, by its oracle and its clipboard's
entries, to one of the rules above: a URL over a selection is linked, a structural text is taken
with the oracle's text, a list item at the marker is written by the marker rule, other converted
HTML is inserted as it is, and anything else is left to Obsidian. Outline mode's result must also be the
same on both builds, and for a paste it takes, under every setting. The check uses Obsidian's
behaviour, not its code, so it needs no private API in the plugin, and it runs on whatever build the
suites run on. The sweeps are in the note ("The extended check", "The check after round 4"): they
found the image, conversion and link gaps the decisions above close, and with the seventh prototype,
over 1300 clipboards and 5000 pastes at each destination on each build, no paste against its rule
and no difference between the builds. It becomes an e2e spec (tasks.md).

**Alternatives considered.**
- *Read 1.14.4's rewrite back as the paste*, with the clipboard text recorded at the event. Measured
  and working on 1.14.4 (the note), rejected as a per-build reading.
- *Take every paste in outline mode.* It would also replace Obsidian's handling of a URL over a
  selection, of files, and of every non-structural plain text away from a marker, for pastes the
  enforcement passes anyway and the builds paste alike.
- *Read "Convert pasted HTML to Markdown" through `vault.getConfig`* and take the plain text when it
  is off. It keeps a code editor's list a list with the setting off, at the cost of a private API;
  the maintainer chose public API (2026-10-08).
- *Turn "Smart lists" off for outline-mode notes.* Its value is read and written only through
  `vault.getConfig` and `vault.setConfig`, both private, and it is one vault-wide setting that also
  drives Enter and renumbering in every other note.

## Risks / Trade-offs

- [The user turned "Convert pasted HTML to Markdown" off] → Every HTML paste in outline mode is
  converted anyway. A list copied from a code editor, whose HTML holds a `<div>` a line, converts to
  a list item and a paragraph, where Obsidian's own paste with the setting off takes the plain text
  and keeps the list (the note, "The extended check"); outline mode off is the way to the stock
  paste. A plain-text paste (⌘⇧V, and the context menu's "Paste as plain text") carries only the
  plain text, so it stays unconverted (round 4 of the review).
- [A plugin hooks Obsidian's paste below `editor-paste`, through its hook or CodeMirror's built-in
  handler] → It no longer sees a structural paste in outline mode. The documented route,
  `editor-paste`, runs first and is unaffected.
- [A paste that arrives without a paste event: a text drop, and the mobile app's Paste command and
  its context menu] → Obsidian inserts their text with a dispatch that carries no user event, which
  the classifier reads as programmatic, so neither this handler nor the enforcement sees a paste: a
  structural text is not spliced and a lone item repeats the marker, on every build, as before this
  change. Outside this change (proposal, Non-goals; #377).
- [A list item pasted onto a code line that starts with a list prefix] → The pasted prefix is
  dropped, as 1.14.4's collapse drops it today: the rule reads the line's text, as the collapse does.
  The same on both builds.
- [The marker rule meets a copy made with empty selections] → CodeMirror's linewise paste inserts
  each line at its caret line's start; the rule writes it at the range instead. Unmeasured for several
  ranges; for one range, the design's "Inserted at the selection" applies.
- [A future Obsidian moves its paste handling into a DOM handler that runs after ours, or stops
  firing `editor-paste` before it] → The prototype measured the order on 1.13.7 and 1.14.4 only; the
  weekly newest-build run and the drawn cases on both builds show a change.
- [A real paste on iOS or Android arrives differently] → Unmeasured; Chromium's mobile emulation
  delivers the same `paste` event.
- [A non-structural plain paste away from a marker, and a structural plain paste over several
  ranges, stay Obsidian's] → The builds give the same result for them (the note's fourth prototype);
  a pasted `- a` inside an item's text is written as text. A plain text beside a different
  `text/uri-list`, which Obsidian writes as a link, is the exception over several carets with "Smart
  lists" on: 1.13.7 writes the link at each caret, and 1.14.4's collapse deals its lines to the
  carets (round 4 of the review).
- [CodeMirror's own paste flushes the DOM observer before it dispatches; the handler cannot, since
  `view.observer` is not public API] → A change still pending in the DOM when the paste event arrives
  (during a composition, on Android) would meet a state that does not hold it yet. Unmeasured.
- [A list beside a file, with no HTML or Markdown or only the image's `<img>`, is taken as text] →
  The file is not inserted, on either build. A copy that puts a list in its plain text beside an
  image is rare; Obsidian's own choices were the file on 1.13.7 and the collapsed text on 1.14.4.

## Migration Plan

None; there is no stored state. It ships as a patch, and the CI pin #359 added is removed in the
same change (tasks.md).

## Open Questions

- Whether a real paste on iOS and Android reaches the editor's `paste` handler as it does on desktop
  and in emulation. It decides whether the phone gets the build-independent path, not what the specs
  require.
