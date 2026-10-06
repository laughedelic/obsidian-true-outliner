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

**Non-Goals:**
- Changing `classify`, the verdict layer or the rewrite.
- Taking pastes the enforcement would pass anyway (proposal, Non-goals).

## Decisions

**Take the paste before Obsidian's paste hook, rather than read what the hook dispatches.** The
entry point and the text choice are identical on 1.13.7 and 1.14.4; the hook's output is not, and the
next build's need not be either. A paste taken there reaches the enforcement as the stock insertion
on every build, so the existing paste rules apply unchanged. Reading the output was the first plan
and is measured in the note ("Reading the rewrite instead"): it fixes 1.14.4, needs the clipboard
text from the event anyway, and has to learn each new rewrite.

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
clipboard whose paste is text (no files, no Obsidian properties, no HTML media); text that is a
structural block sequence by the same `isStructuralBlockSequence(parse(text).children)` the
classifier applies. Everything else returns false and continues as today. These are the pastes
"Structural pastes splice at node boundaries" rewrites, so taking them changes which code builds the
transaction and nothing about how it is judged. One range only, because CodeMirror's own paste
splits a clipboard across several ranges by line and, after a linewise copy, inserts at line starts,
with state it does not expose.

**The text Obsidian's paste would take.** In the order of Obsidian's `handleDataTransfer` (identical
on both builds): Obsidian's own copy, marked by `<!-- obsidian -->` in its HTML, is pasted as its
plain text; else `text/markdown`; else HTML converted to Markdown with the public `htmlToMarkdown`;
else the plain text. Obsidian converts HTML only when its "Convert pasted HTML to Markdown" setting is
on, which a plugin reads only through the private `vault.getConfig`. Converting always is the choice
here: a structural paste is the one kind whose structure the outline exists to keep. The choice is a
pure function of the clipboard's entries with the converter passed in, so the unit suite, which
cannot load Obsidian's runtime, tests it.

**Inserted as CodeMirror's stock paste.** `state.replaceSelection(text)` with `userEvent:
'input.paste'` and `scrollIntoView`, which is what CodeMirror's own paste dispatches for one range.
The prototype's dispatches equal 1.13.7's stock ones change for change (the note's table).

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
- [A future Obsidian moves its paste handling into a DOM handler that runs after ours, or stops
  firing `editor-paste` before it] → The prototype measured the order on 1.13.7 and 1.14.4 only; the
  weekly newest-build run and the drawn cases on both builds show a change.
- [A real paste on iOS or Android arrives differently] → Unmeasured; Chromium's mobile emulation
  delivers the same `paste` event.
- [Non-structural and multi-range pastes still differ between builds] → They are Obsidian's results
  for pastes the enforcement passes; the proposal names the measured difference.

## Migration Plan

None; there is no stored state. It ships as a patch, and the CI pin #359 added is removed in the
same change (tasks.md).

## Open Questions

- Whether a real paste on iOS and Android reaches the editor's `paste` handler as it does on desktop
  and in emulation. It decides whether the phone gets the build-independent path, not what the specs
  require.
