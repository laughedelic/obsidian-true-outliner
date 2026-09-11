# Structured backlinks

Below every note in outline mode, a **Structured backlinks** section lists everything in the vault that refers to it. Where Obsidian's own backlinks show a line of context, this footer shows each reference **in the tree of the note it came from**: the ancestors above it, the node itself, and its children. A reference from a journal entry reads as "2026-07-12 › Kitchen › tile delivery › *call the reclaimed yard about [[Kitchen renovation]]*", with the outline's own markers and numbering, and clicking it opens that note at that exact node.

This is the backlinks view that outliners such as Roam, Logseq and Tana are known for, built on Obsidian's own link index. It works with every note, needs no IDs or properties, and never writes anything.

<Shot name="backlinks-footer" alt="The structured backlinks footer, with two referencing notes and their lineage rows" caption="Two referencing notes: one carrying subtrees, folded past a depth; one with a reference of every kind." />

## What counts as a reference

Four kinds, all from Obsidian's own metadata:

| Kind | Example |
| --- | --- |
| **Note** link | `[[Kitchen renovation]]` |
| **Anchor** link | `[[Kitchen renovation#Plan]]`, `[[Kitchen renovation#^abc123]]` |
| **Embed** | `![[Kitchen renovation]]`, marked with an *embed* tag and shown as a link rather than re-rendered |
| **Property** | `related: "[[Kitchen renovation]]"` in front matter, shown with the property name and no lineage |

The index follows the vault live: a link typed in another pane, a renamed note or a deleted file is reflected without a reload.

## Reading the footer

- **The header** names the section, gives the totals (*12 references · 4 notes*), and folds the whole section on click. A note nobody links to shows a single quiet line reading *0 references*.
- **Groups** are one per referencing note, with the note's name, its folder and its count.
- **Rows** show the reference in its lineage: each ancestor with its marker, then the referencing node, then one level of its children. Deeper subtrees are folded behind a *Show N hidden* control.
- **Long groups** are capped by height and say so, with a *Show more* control per group, and the footer as a whole stops after a set number of references with a *Load more* rung that says how much remains. The totals in the header are always the true totals.
- The footer paints what it knows first and fills in context as the index resolves, so a large vault does not block the note.

## Following a reference

**Click** a row to open the source note with the caret on that node, scrolled into view. **Mod+click**, or **Mod+Enter** on a focused row, opens it in a new pane. Links and controls inside a row keep their own behaviour.

## Sorting and filtering

The header carries the footer's own controls; they do not fold the section.

**Sort** by *Recently modified* (default), *Oldest first*, *Note name* or *Most references*. The choice is remembered.

**Filters** opens a row with a search box (*Filter by note name…*) and three facets: **kind** (note, anchor, embed, property), **folder** and **tag**. Selecting nothing on a facet admits everything; selecting several values within one facet shows any of them; different facets combine. Each option shows how many notes it would leave given the other facets, so an empty result is never a surprise. **Reset** clears everything at once. The filter state belongs to the tab and is dropped when the tab closes.

## Obsidian's own section

Obsidian can show its own "Backlinks" section at the bottom of a note. In notes where the footer renders, that section is hidden by default (**Backlinks: hide Obsidian's own in-document section**), so there are not two lists of the same links. Obsidian's section also lists *unlinked mentions*, which the footer does not reproduce; turn the setting off to see them again. The Backlinks **pane** in the sidebar is unaffected either way.

## Appearance

The footer draws with the same grid, markers and guides as the editor, so a lineage row looks like the note it came from. Three settings are footer-specific: how many ancestors on a row carry a marker, whether ancestors are separated by a chevron, and whether guide lines are drawn down the rows. The height cap per note and the overall reference cap are settings too. See [Settings](../reference/settings#structured-backlinks).

The footer is read-only. Nothing in it edits the note it sits under or the notes it lists, and it adds nothing to undo history.
