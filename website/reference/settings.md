# Settings

Every setting, in the order it appears under **Settings → True Outliner**. On Obsidian 1.13 and later they are also found by Obsidian's settings search. Settings take effect immediately in every open pane unless noted.

## General

| Setting | Choices | Default |
| --- | --- | --- |
| **Open new tabs in outline mode** | on / off | on |
| **Show outline mode in the status bar** | Nothing · An icon · Words | An icon |

**Open new tabs in outline mode** decides whether a note opens outlined or as stock Obsidian. It applies to notes opened from then on, in a new tab or in a tab that switches notes, and never retoggles a tab that is already open. See [Outline mode](../guide/outline-mode).

**Show outline mode in the status bar** picks what the status bar chip shows for the active tab: an icon, the words *Outline on* / *Outline off*, or nothing at all. Desktop only.

## Folding

| Setting | Choices | Default |
| --- | --- | --- |
| **Remember folds** | on / off | on |

**Remember folds** decides whether a note reopens with the nodes that were folded when it was left. Fold state lives in Obsidian's workspace data, never in the note, so a file is byte-identical however much of it is folded. Off, every note opens fully expanded.

## Structured backlinks

| Setting | Choices | Default |
| --- | --- | --- |
| **Show structured backlinks below notes** | on / off | on |
| **Backlinks: how many references to show** | 25 · 50 · 100 · No limit | 50 references |
| **Backlinks: how tall one note's references may be** | Compact · Standard · Tall · Uncapped | Standard |
| **Backlinks: hide Obsidian's own in-document section** | on / off | on |
| **Backlinks: markers on a lineage row** | Every ancestor · Only the row's own marker · No markers | Every ancestor |
| **Backlinks: what separates ancestors** | Nothing · A chevron | Nothing |
| **Backlinks: draw guide lines in the footer** | on / off | off |

**How many references to show** bounds the whole footer. Notes are added whole, in sort order, until the next one would cross the bound; the header still reports the true total, and a *Load more* rung shows the rest on demand.

**How tall one note's references may be** caps a single referencing note's group before the rest folds behind a *Show more* control. A height rather than a count, because a reference's height depends on how it wraps.

**Hide Obsidian's own in-document section** removes Obsidian's built-in backlinks section, unlinked mentions included, from notes where the footer renders. Obsidian's Backlinks pane is unaffected, and turning this off restores the section at once.

**Markers on a lineage row**, **what separates ancestors** and **draw guide lines in the footer** shape how a reference's ancestor chain is drawn. Zoom's breadcrumb trail always separates its crumbs, whatever the separator setting.

The footer's **sort order** is chosen from its own dropdown and remembered, not from the settings tab.

## Appearance

| Setting | Choices | Default |
| --- | --- | --- |
| **Outline width** | Auto · Compact · Balanced · Roomy · Wide | Auto |
| **Which indentation guides to draw** | Every level · The levels the cursor is inside · The levels inside the current node · None | Every level |
| **Hide the outermost guide under a single root** | on / off | off |
| **Guide line strength** | Subtle · Normal · Strong | Subtle |
| **Debug: block marker visibility (experiment 5a)** | All eligible kinds · Only nodes that have children · Only headings and paragraphs | All eligible kinds |
| **Highlight guides at the cursor's position** | No highlight · Whole guide of every ancestor · Only the part leading down to the cursor | Whole guide of every ancestor |
| **Highlight markers at the cursor's position** | No highlight · The current node only · The current node and all its ancestors | The current node only |

**Outline width** is the size of one level's step, in the editor and the footer alike. *Auto* is Compact on a phone or tablet and Roomy on a desktop. A CSS snippet setting `--to-decor-unit` overrides whatever is chosen here.

**Which indentation guides to draw** is the base visibility of guides. The two middle choices follow the caret. Obsidian's own indent guides stay hidden in outline mode whichever is chosen.

**Hide the outermost guide under a single root** drops the depth-zero guide where the whole note, or the whole zoomed view, hangs off one node.

**Guide line strength** sets guide contrast as a proportion of the theme's faintest text, so it holds up in light and dark themes.

**Block marker visibility** chooses which nodes get an icon. It never affects a list item's bullet or number, and gutter space is reserved either way so text never shifts. Takes effect on the next edit or note switch.

**Highlight guides** and **Highlight markers at the cursor's position** are the two position indicators described under [Appearance](../guide/appearance#where-the-caret-is).

## Debugging

| Setting | Choices | Default |
| --- | --- | --- |
| **Debug: cross-check parser against metadata cache** | on / off | off |

Logs disagreements between the plugin's parser and Obsidian's metadata to the developer console when a structural command runs. Useful when reporting a bug about a note that behaves unexpectedly; otherwise leave it off.

## Where settings are stored

In `.obsidian/plugins/true-outliner/data.json`. Values are checked when loaded; anything unrecognised falls back to its default. Nothing is ever stored in a note.
