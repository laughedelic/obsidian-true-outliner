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
- A pasted list item never repeats the marker of the item it lands at, on any build.

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

**Which pastes it takes.** Outline mode on; not a nested table-cell editor; one selection range; a
clipboard whose paste Obsidian would make the text below; text that is a structural block sequence by
the same `isStructuralBlockSequence(parse(text).children)` the classifier applies. Everything else
returns false and continues as today, unless the marker rule below rewrites it. These are the
pastes "Structural pastes splice at node boundaries" rewrites, so taking them changes which code
builds the transaction and nothing about how it is judged. One range only, because the enforcement
passes a paste over several ranges anyway; such a paste is taken only by the marker rule.

**The text Obsidian's paste would take**, in the order of its `handleDataTransfer`, identical on both
builds (the note, "A version-independent entry point"):

1. Obsidian's own copy, marked by `<!-- obsidian -->` in its HTML beside a plain text: no text of its
   own, so the plain text below.
2. `text/markdown`.
3. Other HTML, sanitized with the public `sanitizeHTMLToDom` and serialized: a lone image beside
   files gives no text; otherwise the public `htmlToMarkdown` of it. Obsidian's code also holds a
   loop meant to rewrite resource paths and save large `data:` images as attachments, but it runs
   over the sanitized fragment after the fragment has been moved into the element that is
   serialized, so on both builds it changes nothing and media stays in the text as it was (round 2
   of the review).
4. Without HTML, a `text/uri-list`: with no plain text, or one that differs from it, Obsidian makes a
   URL or a link of it, and the paste stays Obsidian's.
5. With no text chosen, files leave the paste to Obsidian; otherwise the plain text. On 1.13.7
   Obsidian then inserts the files. On 1.14.4 its collapse runs first, so a structural plain text
   at a list item's content start is inserted without its first line's indentation and without the
   file (proposal, Non-goals).

Obsidian converts HTML only when its "Convert pasted HTML to Markdown" setting is on, which a plugin
reads only through the private `vault.getConfig`. Converting always is the choice here: a structural
paste is the one kind whose structure the outline exists to keep.

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
is. The text is distributed across ranges as CodeMirror and Obsidian both do: a line each when the
lines match the ranges one for one, the whole text in each otherwise. If no range meets the rule,
the paste stays Obsidian's.

The formula is the one 1.14.4's `tryCollapseListMarker` writes, so on 1.14.4 the result is what
Obsidian gives today, and on 1.13.7 it is the same instead of `- - a` (the note's fourth prototype).
It applies only where the enforcement passes the paste, so the indentation the formula drops cannot
change a structure the enforcement would have kept. The transaction it dispatches is a replacement
made from a caret, which classifies as an ordinary edit and passes, as Obsidian's own does on 1.14.4.

- *Read a lone item as a node*, replacing an empty item and landing as a sibling at a non-empty
  item's start. At `- beta`'s start that gives `- a` above `- beta` instead of `- abeta`; on an empty
  item the two agree. It would make a lone item structural, a change to "Structural pastes splice at
  node boundaries" that the decision did not ask for.
- *Rewrite only on an empty item.* It leaves `- - abeta` at a non-empty item's start on 1.13.7, where
  1.14.4 gives `- abeta`.

**The text choice is checked against Obsidian's own paste.** Rounds 1 and 2 of the review each found
a branch of `handleDataTransfer` read wrong by hand. A differential check settles the choice as a
whole: generated clipboards (plain text, Markdown, HTML, `text/uri-list`, files, in combination) are
pasted into an empty note with outline mode off, Obsidian's paste being the oracle, and with outline
mode on, and the text the handler takes must equal the oracle's. An empty note has no list prefix, so
1.14.4's collapse does not reach the oracle. The check uses Obsidian's behaviour, not its code, so it
needs no private API, and it runs on whatever build the suites run on. The sweep, 672 clipboards on
each build, is in the note ("The differential check"); it becomes an e2e spec (tasks.md).

**Alternatives considered.**
- *Read 1.14.4's rewrite back as the paste*, with the clipboard text recorded at the event. Measured
  and working on 1.14.4 (the note), rejected as a per-build reading.
- *Take every paste in outline mode.* It would also replace Obsidian's handling of URLs over a
  selection and of a lone item pasted on an empty item, for pastes the enforcement passes anyway.
- *Turn "Smart lists" off for outline-mode notes.* Its value is read and written only through
  `vault.getConfig` and `vault.setConfig`, both private, and it is one vault-wide setting that also
  drives Enter and renumbering in every other note.

## Risks / Trade-offs

- [The user turned "Convert pasted HTML to Markdown" off] → A structural HTML paste in outline mode
  is converted anyway. Whether a plain-text paste (⌘⇧V) carries no HTML, and so stays unconverted,
  is not measured.
- [A plugin hooks Obsidian's paste below `editor-paste`, through its hook or CodeMirror's built-in
  handler] → It no longer sees a structural paste in outline mode. The documented route,
  `editor-paste`, runs first and is unaffected.
- [The marker rule meets a copy made with empty selections] → CodeMirror's linewise paste inserts
  each line at its caret line's start; the rule writes it at the range instead. Unmeasured for several
  ranges; for one range, the design's "Inserted at the selection" applies.
- [A future Obsidian moves its paste handling into a DOM handler that runs after ours, or stops
  firing `editor-paste` before it] → The prototype measured the order on 1.13.7 and 1.14.4 only; the
  weekly newest-build run and the drawn cases on both builds show a change.
- [A real paste on iOS or Android arrives differently] → Unmeasured; Chromium's mobile emulation
  delivers the same `paste` event.
- [A non-structural paste away from a marker, and a structural paste over several ranges, stay
  Obsidian's] → The builds give the same result for them (the note's fourth prototype); a pasted
  `- a` inside an item's text is written as text.
- [CodeMirror's own paste flushes the DOM observer before it dispatches; the handler cannot, since
  `view.observer` is not public API] → A change still pending in the DOM when the paste event arrives
  (during a composition, on Android) would meet a state that does not hold it yet. Unmeasured.
- [A structural plain text beside a file, with no HTML, stays Obsidian's] → The builds differ there,
  1.13.7 inserting the file and 1.14.4 collapsing the text (proposal, Non-goals).

## Migration Plan

None; there is no stored state. It ships as a patch, and the CI pin #359 added is removed in the
same change (tasks.md).

## Open Questions

- Whether a real paste on iOS and Android reaches the editor's `paste` handler as it does on desktop
  and in emulation. It decides whether the phone gets the build-independent path, not what the specs
  require.
