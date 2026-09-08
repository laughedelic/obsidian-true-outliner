# Folding mechanics: what Obsidian's fold actually is, measured before designing on it

`better-folding-ux` rests on one question the design cannot answer by reasoning: is Obsidian's
folding a private mechanism we would have to replace, or CodeMirror's, which we can extend? The
answer decides whether "fold a paragraph" costs a provider function or a parallel fold engine
with its own chrome, its own commands and its own persistence.

Measured 8 September 2026, Obsidian 1.13.7 (installer 1.5.8, macOS), through a throwaway
`99-fold-probe.e2e.ts` driving a real instance, with the CM6 fold exports reached from a
temporary probe hung on the plugin instance (the renderer's own `require` resolves neither
`obsidian` nor `@codemirror/*`; only plugin module scope does). Fixture:

```markdown
# Top

Paragraph with children:

- one
  - nested a
  - nested b
- two

## Second

Tail para.
```

## Verdict: it is CodeMirror's fold, and the facet is open to us

Obsidian's fold state IS `@codemirror/language`'s — `foldedRanges`, `foldEffect` and
`unfoldEffect` read and write the same state the native chevron does, and `foldable()` answers
from a `foldService` facet that already holds **three** providers. A fourth, registered as an
ordinary editor extension, changes what Obsidian itself will fold.

What that one provider buys, measured rather than assumed:

| Capability | Without a provider | With one |
| --- | --- | --- |
| `foldable()` on a paragraph with attached list children | `null` | our range |
| Obsidian's own `editor:toggle-fold` on that paragraph | does nothing | folds it |
| Fold survives close + reopen | **no** | **yes** |
| Native fold chevron on that line | no | **still no** |

## The three findings that shape the design

### 1. Persistence is free, and it never touches the file

`app.foldManager.save`/`load` keeps fold info per file in workspace state, as
`{ folds: [{ from, to }], lines }` in **line numbers**. It saved a fold we had created with a raw
`foldEffect` over a paragraph subtree — but on reopen the fold did not come back. With the
`foldService` provider registered, the same sequence restored it. So the restore path validates a
saved fold against `foldable()`: Obsidian will only re-apply folds something still claims are
foldable, and the provider is what makes ours claimable.

This satisfies the clean-files invariant (Q3) with nothing to build: fold state lives in the
workspace, never in the note.

### 2. The chevron is NOT driven by `foldable()`

With the provider registered and `foldable()` returning a range for the paragraph line, the
rendered `.cm-fold-indicator` elements stayed on exactly the lines they were on before —
`# Top`, `- one`, `## Second`. Obsidian decides where to paint a fold indicator by its own rule
(heading and list lines), not by asking the fold service. So the affordance is the part we own:
the mechanism folds anything, the chrome offers it on two kinds out of three.

Two consequences. A fold affordance for paragraph-kind nodes has to be ours to draw — which is
also the opening for the folded-state indication, since the marker icon we already draw sits in
the same gutter the chevron is being pulled onto (`--to-chevron-dy`, `--to-chevron-dead-right`).
And a folded line's collapsed state is visible in the DOM: the indicator gains `is-collapsed`,
and the line gains a `<span class="cm-foldPlaceholder" title="unfold">…</span>`. Neither is a
class on the line itself, so a line-level signal is ours to add too.

### 3. A fold survives indent; a move destroys it

Same fold (`- one`'s two children hidden), two operations:

| Operation | Fold after |
| --- | --- |
| `indent-node` | **kept** — the line still renders `- one…` |
| `move-node-down` | **lost** — the subtree comes back unfolded |

Both go through the same minimal-changeset dispatch, so this is not a policy difference: indent
rewrites only the indentation prefix of each line, and CM6 maps the folded range through that
untouched; a move deletes a run of lines and inserts it elsewhere, and a range whose ends are
inside deleted text has nowhere to map to. Folding a subtree in order to move it as one unit is
the ordinary reason to fold, so this is a defect the change has to answer, and the answer is
positional: re-derive the fold from the node's new position after the operation, rather than
hoping the range maps.

Adjacent, same cause: Enter at the end of a folded node's line unfolds it and inserts the new
node **inside** the revealed subtree (measured: `- one`, `  - x`, `  - nested a`, …). What a
reader who folded a node expects from Enter is a sibling after the whole subtree.

## Also measured, in passing

- `editor:toggle-fold`, `editor:fold-all`, `editor:unfold-all`, `editor:fold-less`,
  `editor:fold-more` all exist as core commands, so our commands are additions beside a working
  native set, not replacements for a missing one. `foldHeading` and `foldIndent` both default to
  `true` and were left at their defaults throughout.
- Zoom's unfold-inside-scope requirement (`outline-zoom`, "Zooming into a folded node opens it")
  behaves as specified: zooming into a folded node renders the whole subtree, and clearing the
  zoom leaves it unfolded, as that spec deliberately states.
- Guides remain what [09](09-experiment-2-guide-lines.md) made them: a `--to-guides`
  repeating-linear-gradient painted on one `::after` per line, with each level's column at
  `depth × 1.75rem`. There is still no per-guide element to click — but the columns are stated in
  the same arithmetic our decorations already publish, so a pointer gesture can hit-test a click's
  x-offset against them without inventing an element. That is what unblocks the parking-lot entry
  in [12](12-decoration-follow-ups.md) ("Click on a guide → zoom into, or fold, the whole
  subtree"), which was gated on exactly this.

## How many kinds this is actually about

Three, not seven. `parse` gives children to a heading (its section), to a list item (by
indentation, in any notation — bullet, ordered, task), and to a paragraph (the attachment rule,
Q34). An ATOM is never a parent: a probe over a document with a list after a table, after a code
fence and after a quote puts each list at SIBLING level, never inside. So an atom has no folded
state to draw and no affordance to offer, and the "fold anything" ambition reduces to one missing
kind — the paragraph, which is exactly the kind Obsidian paints no chevron on.

### Declining is not a veto

A `foldService` provider that returns `null` does not make a line unfoldable — `foldable()` simply
asks the next provider, and then syntax folding. Measured across every atom kind in one note (code
fence, table, callout, quote, raw HTML, rule), the editor still reports exactly one of them as
foldable: a **raw HTML block** (`<div>` … `</div>`). No chevron is painted for it, consistent with
the finding above that the indicator follows Obsidian's own heading/list rule.

So "an atom is never foldable" is true of OUR rule and false of the editor's, and the two have to
be kept apart in the specs: the plugin offers no fold on an atom and draws no affordance there,
while whatever Obsidian does inside an atom's own notation is left alone. Anything that keyed our
affordance off `foldable()` rather than off our own answer would have surfaced that HTML fold with
a control Obsidian deliberately does not give it.

## The folded-node indication

Candidate treatments for a folded node's marker are drawn side by side, at the plugin's own
geometry and in both themes, in [24-fold-marker-mockup.html](24-fold-marker-mockup.html) — open
it in a browser. It is a mockup, not a measurement: what it settles is which treatment to build.

**Settled: the kind's own glyph in a solid weight, plus the count of hidden descendants.**
Everything drawn AROUND the glyph — halo, shaped halo, outline, dashed outline, underline — is
either too heavy in a 14px gutter the fold affordance already shares, or has to change shape per
kind to avoid cropping a wide glyph, which turns one state into several. The weight change is the
only treatment every mark carries identically, and the count is the only candidate that says how
much is hidden rather than only that something is. `better-folding-ux`'s design D6 records the
reasoning per candidate.

The page also carries a working model of the fold affordance (hover-revealed while unfolded,
persistent once folded) and of the guide-click gesture including its hit band, which is the
cheapest way to feel the tolerance question D7 leaves open.

## What was NOT measured

- Whether a fold of ours still works with Obsidian's `foldHeading` / `foldIndent` turned OFF.
  `foldable()` itself takes no notice of either setting, but whether Obsidian's own click and
  command paths consult them before asking is untested — and the claim that our folding is
  independent of those settings rests on it. First thing to put on the instrument.
- Whether overriding the native heading/list answers (our provider at higher precedence) changes
  any observable fold extent. Our subtree cover includes a node's trailing gap, which Obsidian's
  heading fold does not obviously do; the difference is a blank line at a fold's end and was not
  put on the instrument.
- The mobile chevron. Obsidian reveals the fold indicator on hover, and a touch device has no
  hover; the affordance question there is open and untouched by this pass.
- Anything in reading mode, which renders through the post-processor and has no CM6 fold at all.
