# Outline mode

Outline mode is the switch that turns everything else on. With it on, a note is drawn on the outline grid, the keyboard grammar and selection rules apply, zoom is available and the backlinks footer renders. With it off, the note is stock Obsidian.

<Clip name="outline-toggle" caption="One tab, toggled off and on. Only the rendering changes; the note does not." />

## Per tab, not per note

Outline mode is a property of the **tab**, not of the note or the vault:

- Two panes showing the same note can be in different modes.
- Switching a tab to another note resets it to the default. There is no per-note memory: a note reopened tomorrow starts from the default like any other.
- The mode survives a round trip through reading view. Toggling reading view on and off keeps the tab's outline mode.
- Closing the tab forgets it.

The mode is never written to the note, its front matter or its metadata.

## The default

**Open new tabs in outline mode** (on by default) decides how a freshly opened note starts. Changing the setting affects notes opened from then on, in a new tab or in an existing tab that switches notes. It never retoggles a tab that is already open, which is how Obsidian's own default view mode setting behaves too.

Leave it on to treat every note as an outline. Turn it off to keep stock Obsidian by default and opt individual tabs in.

## Four ways to toggle

All four do the same thing to the active tab.

| Where | What |
| --- | --- |
| **Command palette** | **Toggle outline mode**. Available whenever a markdown note is active, in any view mode. No default hotkey; assign one under Settings → Hotkeys. |
| **Editor right-click menu** | **Enable outline mode** or **Disable outline mode**, named for the state of the editor that was right-clicked. |
| **Ribbon** | The list-tree icon. Its tooltip is **Toggle outline mode**, and it is highlighted while the active tab is in outline mode. Present on desktop and mobile. |
| **Status bar** | A chip on the right of the status bar, click or focus-and-press-Enter to toggle. Desktop only. |

Toggling shows no notice: the ribbon icon and the status bar chip already say what state the tab is in. When no markdown tab is active both indicators go blank.

### From reading view

Toggling outline mode **on** while a tab is in reading view also switches the tab into its editing mode (Live Preview or source, whichever the tab was last in), so the outline is visible immediately. Toggling **off** from reading view changes nothing visible, since reading view never draws outline chrome.

## What the status bar shows

**Show outline mode in the status bar** chooses between **An icon** (default), **Words** ("Outline on" or "Outline off") and **Nothing**. Obsidian lets the ribbon icon be hidden from the ribbon's own right-click menu but has no equivalent for a plugin's status bar item, so this setting is where the chip is turned off. There is no status bar on mobile, so the setting has no effect there.

## Where outline mode applies

- **Live Preview** and **source mode**, in the main editor, in split panes, and in pop-out windows.
- Not in **reading view**. Reading view renders exactly as stock Obsidian.
- Not inside the **cell editor of a table**. The small editor Obsidian opens for a table cell is left alone entirely: no grid, no keys, no zoom.

Turning outline mode off in a tab that is zoomed in also clears the zoom.
