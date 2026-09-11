# Known limitations

An honest list of what does not work yet, what works differently from a dedicated outliner, and what is on the way. Anything missing from it is welcome in the [issue tracker](https://github.com/laughedelic/obsidian-true-outliner/issues).

## Not yet built

- **Drag and drop** of nodes with depth indicators.
- **Block references and mirrors.** Obsidian's native `[[note#^id]]` links keep working as usual, and the footer lists them.
- **Search results with outline context.**
- **Editable backlinks.** The footer is read-only; click through to edit at the source.
- **Reading view.** Outline chrome is drawn in Live Preview and source mode only. Reading view renders as stock Obsidian.

## Works differently

- **Outline mode is per tab, with no per-note memory.** A note reopened later starts from the default. Zoom is likewise forgotten when the tab closes or switches notes.
- **Ordinary typing is never enforced.** Deleting a `- ` marker or typing `# ` at the start of a paragraph changes the node's kind, exactly as in stock Obsidian. Enforcement applies to edits that cross node boundaries.
- **A list after a paragraph belongs to that paragraph**, and a blank line between an item and indented text turns a continuation into a child. See [the mapping page](../guide/how-notes-become-outlines).
- **Folding is independent of Obsidian's own fold settings in intent, not yet in evidence.** Whether *Fold heading* and *Fold indent* being off changes anything in outline mode has not been settled; nothing in the plugin reads them.
- **Task items are not zoomed by clicking**, because their mark is Obsidian's checkbox. Use the command, the right-click menu or a hotkey.
- **Multiple carets** fall back to native behaviour for the structural keys and the motion keys. Shift+Arrow extension and Mod+A handle every caret.
- **Right-to-left text.** Within a line, movement is native and correct; crossing a line boundary with the arrow keys lands at the logical start or end rather than the visual one.
- **Indent and outdent from the command palette** infer the indent unit from the note rather than from Obsidian's *Indent using tabs* setting, which is not readable from a command. Tab and Shift+Tab use the setting.
- **Hiding Obsidian's own backlinks section** also hides unlinked mentions, which the footer does not show. Turn that setting off to see them.
- **Inside a table cell's editor** nothing of the outline applies.

## Rough edges

- Two settings and one command carry a *Debug:* label. They are safe to use; the label marks choices that are still being evaluated.
- Some appearance settings (marker visibility, position highlights, the single-root guide) redraw the active pane at once and other panes on their next edit.
- A one-time notice appears if the **Outliner** or **Zoom** community plugin is enabled alongside True Outliner; the two bind the same keys.

## Compatibility

- Obsidian 1.5.0 or later; settings search needs 1.13.
- Desktop and mobile, tested on both in automation for every change.
- Any theme. Colours derive from the theme's own variables.
