# Design

## Context

The enforcement filter judges a transaction on `userChanges(...)`, the user's changes with Obsidian's
appended renumbering set aside. Those changes feed `classify`, and for a `boundary-crossing-edit`
the same changes feed the verdict, whose rewrite replaces the transaction wholesale. A paste is
recognised by shape: an insertion, or a type-over, whose inserted text parses as a block sequence
(`isMultiBlockInsertion`). That rule rejects a replacement made from a caret, which is what
Obsidian's Enter inside a quote dispatches (`docs/research/enter-inside-a-quote`).

Obsidian 1.14.4's paste hook dispatches exactly such a replacement for a list pasted at a list item's
content start, with "Smart lists" on. What it builds, from what, and what the first pasted line loses
are in `docs/research/obsidian-smart-list-paste`, "What Obsidian dispatches" and "What the transaction
no longer carries". See proposal.md for the failures.

## Goals / Non-Goals

**Goals:**
- A paste's class and verdict do not depend on whether Obsidian rewrote it.
- The tree a paste produces on 1.14.4 equals the one it produces on 1.13.7 for every shape measured
  in the note, including a clipboard whose first line is indented.

**Non-Goals:**
- Changing `classify`, the verdict layer or the rewrite. They receive the paste's changes and judge
  them as they already do.
- Reading anything else Obsidian rewrites. Only the one measured shape is recognised.

## Decisions

**Read the rewrite in the adapter, before classification.** `readCollapsedPaste` takes the changes
`userChanges` returns and, for the one shape, returns the plain paste in their place. Spans, facts
and the verdict are then built from its output, as they are for the renumbering, so the class and
the verdict stay a matched pair. A `pass` returns the transaction as dispatched, Obsidian's
replacement included; a `rewrite` replaces it wholesale and writes the paste's own result.

Relaxing `isMultiBlockInsertion`'s caret-replacement clause instead would read the replacement as
a paste where it is, but the clause exists because Enter inside a quote has the same shape with
different text: a caret, a one-character replacement that re-inserts what it removed. The clause is
about the caret, and a change that starts at a marker is not distinguishable from that one by the
clause alone. Setting the replacement aside in the verdict layer leaves the class `within-node-edit`,
which was the defect.

**Recover the payload from the paste event, not from the transaction.** The rewrite drops the first
pasted line's indentation, so two clipboards that differ only in it give the same transaction, and
the plugin reads them as different trees (the note's sibling and deep payloads: `b` becomes `a`'s
child; `y` sits six spaces in). Reading the transaction alone fixes the three failing cases, whose
payloads lose nothing, and regresses the rest to Obsidian's stock result. The clipboard text is in
`clipboardData` on the `paste` event, which fires before Obsidian's hook. A `paste` handler at the
highest precedence stores `text/markdown` and `text/plain` and returns false, so Obsidian handles the
event as before.

**A recorded text is used only when the transaction is exactly Obsidian's replacement for it.**
Obsidian's replacement is a function of the destination line and the text: the destination's marker,
its task box or the pasted line's, then the text without its first line's prefix, over the range from
the marker's start to the range's end. The reader rebuilds that and compares. A stale record, a
record of another paste or a converted clipboard fails the comparison and is not used, so the record
needs no expiry for correctness. It is dropped once the event's task ends, so the clipboard's text
is not kept.

**Where nothing matches, the inserted text is the payload.** A clipboard Obsidian converts from HTML
reaches it as markdown no entry of `clipboardData` holds. That text starts at depth 0, so nothing is
lost in taking the inserted text, which opens with the destination's marker, as the paste. This also
covers a plain text Obsidian normalises before collapsing.

**One shape, stated exactly.** The reader applies when the transaction is an `input.paste` with one
range and one change, the text before the range is a complete list prefix with a marker, the change
starts at the end of that prefix's indentation and ends at the range's end, and, in the fallback, the
inserted text starts with the destination's marker. The prefix pattern is Obsidian's own; a second
copy is kept only if none in the codebase is equal. Anything else returns the changes untouched.

**Alternatives considered.**
- *Take paste over in outline mode* with a higher-precedence paste hook that inserts the text. It
  preempts Obsidian's URL paste, HTML conversion and file paste, and the hook's text argument is the
  plain text. Not tried.
- *Turn "Smart lists" off for outline-mode notes.* It is a vault setting that also drives renumbering
  and Enter, and overriding it is #263's question.
- *Keep CI on 1.13.7.* #359 does that for the suites; users on 1.14.4 keep the defect.

## Risks / Trade-offs

- [Obsidian changes the rewrite's formula] → The comparison fails; the fallback applies if the
  change still starts at the marker and opens with the destination's marker, and the first line's
  indentation is then lost again. The three specs and the drawn cases fail on the weekly newest-build
  run and say so.
- [The record outlives its paste] → The comparison is exact, so a stale record can only match the
  same text pasted again, which is then the right answer. The record is cleared after the event.
- [Obsidian dispatches after the event's task, on a platform measured only in emulation] → The
  record is gone and the fallback reads the inserted text. The result differs from 1.13.7 only for a
  clipboard whose first line is indented.
- [A multi-range paste is left to Obsidian] → Its per-caret result is a pair of list items, and 1.13.7
  gave `- - a`. Not a regression, and not a structure violation.
- [The reader recognises a paste another plugin dispatched in the same shape] → It is a paste of that
  text, and the same reading is right.

## Migration Plan

None; there is no stored state. It ships as a patch. The CI pin is removed with it or, if #359 lands
after, by #359 (see tasks.md).

## Open Questions

- Whether a real paste on iOS and Android dispatches within the paste event's task, as the desktop
  and Chromium's emulation do. It decides how often the fallback is the path taken on a phone, not
  what the specs require.
