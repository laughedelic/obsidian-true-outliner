# The in-note filter's spike: many visible spans through the hiding builder

`outline-filter` is built on zoom's block-replace hiding, generalised from one visible range to a
set. `docs/research/zoom-hiding-mechanism` measured that mechanism with one range and a gap on
either side; what a filter adds is the INTERIOR gap — one that both begins and ends beside a line
the view keeps — and the design assumed without measuring that every property carries over.

This note records what a real instance says. The probe is `e2e/specs/81-outline-filter.e2e.ts`,
run against a thousand-line note with fifty one-line islands spread the length of it, spans
dispatched through the plugin's own state rather than through a query the matcher has not yet
supplied.

## What held

**The boundary arithmetic carries to any number of gaps.** Fifty islands render, in document
order, with nothing between them. Which replace spec a gap takes is decided by where it begins —
only the head starts at offset 0 — and that rule never depended on there being one gap.

**A one-line island keeps its whole chrome.** The tightest case: a gap closes on the same line
from both sides at once, so head-side and tail-side arithmetic meet on one line rather than at
opposite ends of the document. Measured on the fifth island, away from the head gap zoom had
already covered, the line carries `HyperMD-list-line`, `to-decor-marker-sp`, `--to-depth` and
`--to-marker-gutter` — Obsidian's own list rendering and ours both intact.

**Clearing restores the note, and the file never moves.** Lines hidden behind fifty replacements
render again on a clear, and the buffer saved afterwards is byte-identical to the one opened.

## What did not, and what changed because of it

**The preamble span does not keep the properties block.** Design D1 said the filter must always
pass the document preamble as a visible span "since the spec requires the properties block to
render". It does not: the title and the properties block are siblings of the content inside
`.cm-sizer`, not document lines, so no line range reaches them either way. What hides them under a
zoom is `ZOOMED_CLASS` and its `display: none`, which a filter does not carry. Asserted both ways
in the probe — the block renders with the preamble passed and with it hidden.

What the span DOES buy is a stray empty line above the first match. Frontmatter's own lines render
as the properties widget rather than as `.cm-line`s, so the only real line in the preamble is the
blank one after the closing `---`, and passing the span keeps it rendered at the top of a
filtered view.

So the rule was doing nothing it was introduced for and one thing nobody asked for. D1 drops it:
the filter passes its matches and their ancestors, and the title and properties render because
only a zoom hides them.

**The viewport bounds what can be asserted about a large set.** Collapsing a thousand lines to
fifty leaves a document CodeMirror still virtualises — about forty lines render at the default
window. A probe over fifty islands can assert that every rendered line is an island, in order,
with nothing between; it cannot enumerate all fifty without scrolling. The builder still built
all fifty gaps, and the render is a prefix of them.

**A list item's bullet is Obsidian's, not ours.** Recorded because the first version of the
chrome probe looked for an injected marker element and reported a fully-chromed line as bare. What
this plugin contributes to a list line is the sizing that puts Obsidian's bullet in our gutter —
`to-decor-marker-sp` and `--to-marker-gutter` — so that is what a chrome assertion reads.

## The gesture catalogue under a frozen match set

`docs/research/zoom-editing-boundary` catalogued what each editing gesture does to a zoom's single
visible range. Re-asked of a filter's anchors, because design D2 claimed that mapping them through
a transaction's changes gives the visible set the spec asks for. For most gestures it does. For
four it does not, and those four are what the added-anchor rule exists for.

The walk is `tests/outline-filter-gestures.test.ts`, modelled as the changes each gesture
dispatches plus the caret it leaves — an anchor knows nothing about keystrokes, only about the
change set and where the caret came to rest.

| Row | Gesture | Mapping alone | Why |
| --- | --- | --- | --- |
| X5 | Type into a match | enough | the anchor is before the insertion and does not move |
| G1 | Paste inside a match | enough | same |
| B1 | Delete at a match's end, pulling a hidden node in | enough | the anchor's line survives and now carries both texts |
| — | Edit above a match | enough | the anchor maps down with the insertion |
| E2 | Delete a match with its subtree | enough | the anchor goes with it, which is what the spec asks |
| X6 | Enter in the MIDDLE of a match | **not enough** | the anchor stays with the first half; the far half holds none and goes hidden under the caret that made it |
| X2 | Enter at a match's end | **not enough** | the created node holds no anchor |
| A1 | Backspace at a match's content start, merging into a hidden node | **not enough** | the break and marker go, the anchor with them, and the reader's text lands in a node the filter has no anchor for — the view empties on a keystroke that only joined two lines |
| R7 | Mod-Backspace clearing a match | **cannot be rescued** | the marker goes with the text, so the line is blank and no node owns it |

**The rule the first three imply.** A change that touches what the filter is showing, and leaves
the caret in what it wrote, anchors whatever node the caret landed in. One rule covers all three,
because in all three the caret is exactly where the reader's text went. It declines when the
caret's line already carries an anchor, so typing inside a match does not add one per keystroke.

**What the rule must NOT do, and how it is kept from doing it.** A first version fired on any
deletion whose collapsed position the caret occupied, which resurrected the node following a
deleted subtree (E2) — a node that never matched. The separating test is whether the deleted range
took a whole line with it: a Backspace merge deletes a break and a marker and takes none, while a
deleted subtree takes lines. That check is `removesWholeLine`.

**A dead end the walk exposed, outside the catalogue.** Once mapping drops the last anchor, the
visible set is empty, and an empty set is a trap: the editor has no line, so no caret can be placed
in it and nothing the reader types can bring a match back — the rule above needs a visible line to
fire from. The filter therefore falls back to the whole note when its last anchor goes, which is
the same state it was in before a query matched. `outline-filter`'s spec says so now; it did not
before.

## What the apply pass changed in the design

Three of the design's decisions named a seam that turned out not to be the one, and each was
found by a test rather than by re-reading. Recorded together because the pattern is the point:
the zoom's machinery has more entry points than its design documents name, and a filter meets
all of them.

| Decision | Named | Actually |
| --- | --- | --- |
| D1 | the preamble span keeps the properties block | `ZOOMED_CLASS` does; the span only kept a stray blank line |
| D3 (caret) | `zoom-state.ts`'s visible-bounds resolver | that resolver answers the zoom's automatic exit; vertical motion is `keymap.ts`'s own walk, and every other selection is `transaction-filter.ts`'s clamp |
| D3 (selection) | the transaction filter | Shift+Arrow and Mod-A dispatch with no `userEvent`, which reads as programmatic, so the filter never sees them — the refusal sits beside the gestures |

**One answer for what is drawn.** The composition with a zoom began in the hiding builder alone,
and four other consumers — the marks, the caret's walk, the selection refusal, the panel's count —
read the filter's own spans instead. Inside a zoom those differ: the anchors run the whole note
while the scope draws one subtree, so the caret could step onto a match the zoom was hiding.
`shownSpans` is the single answer now, and the count reports what the reader can reach rather than
the anchor total.

**Zooming does not re-decide the match set.** The anchors are the note's; the scope narrows what is
drawn from them; zooming out widens it back. Simpler than recomputing per scope, and it keeps one
story about what freezing means — a match freezes once, when the query runs.

