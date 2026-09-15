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
