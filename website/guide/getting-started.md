# Getting started

Five minutes with any existing note is enough to see what the plugin does. This page walks through that; the rest of the guide goes deeper on each step.

## 1. Open a note in Live Preview

With the plugin enabled, open a note that has some structure: a couple of headings, a paragraph or two, a nested list. The **Kitchen renovation** note below is the kind of thing that works well.

```markdown
# Kitchen renovation

The 2026 project. Sarah leads design, I lead logistics.

## Plan

1. demolition weekend
2. electrics and plumbing rough-in
3. floor patch, then tile
4. cabinets

## Materials

- tile: reclaimed terracotta
- handles: undecided
	- brass ages well but shows prints
	- steel matches the range
```

Outline mode is on for new tabs by default, so the note is already drawn as an outline: the headings, the paragraph under the title, the ordered list and the bullet list all sit on one indentation grid, with a marker beside each block and guide lines running down from each heading to what it contains.

If the note looks like stock Obsidian instead, outline mode is off for that tab. Click the **list-tree icon in the ribbon**, or run **Toggle outline mode** from the command palette.

## 2. Move things with Tab and Shift+Tab

Put the caret anywhere in `brass ages well` and press **Shift+Tab**. The item outdents to sit beside `handles`, and `steel matches the range`, which used to follow it, comes along as its child, because that is the only way markdown can encode the result. Press **Tab** to put it back.

Now put the caret in `## Materials` and press **Tab**. The heading becomes `### Materials`, the section it holds moves with it, and it is now a child of `## Plan`. Headings indent and outdent by changing level; everything else moves between parents. Either way the whole subtree travels together. The [structural editing](./structural-editing) page has every rule.

Press **Mod+Shift+ArrowUp** with the caret in `## Materials` to swap the whole section above **Plan**.

## 3. Split with Enter

Put the caret at the end of `cabinets` and press **Enter**. A new empty item `5.` appears, numbered for its place in the list. Type `counters last`, then press Enter again on an item with no text in it: an empty item outdents rather than piling up blank bullets, and at the top level it turns back into a paragraph.

Put the caret between `floor patch,` and ` then tile` and press Enter. The item splits in two and the list renumbers itself. Undo (Mod+Z) reverses each of these as a single step.

## 4. Select whole nodes

Put the caret in `handles: undecided` and press **Mod+A** repeatedly. The selection climbs a ladder: the item's text, then the item with its two children, then the whole **Materials** list, then the section, then the whole note. Press **Shift+ArrowDown** from any caret position instead to extend the selection one node at a time. A selection that covers whole nodes is drawn as a block, and Tab, Shift+Tab and the move commands act on everything it covers.

Try to drag a selection from the middle of `brass` to the middle of `steel`. It snaps outward to cover both items whole: a selection can never start or end inside a node boundary in a way that would let a deletion break the tree.

## 5. Zoom in

Click the **marker** beside `## Plan` (the small icon in the gutter, or a list item's bullet). The editor now shows only that section, with a breadcrumb trail above it: the note's name, then the ancestors. Editing works exactly as before, but confined to what is visible. Click the note's name in the trail to zoom back out.

## 6. Look below the note

At the bottom of the note, below the last line, the **Structured backlinks** section lists every note that links here. Each reference is shown in the tree of the note it came from, ancestors and all, and clicking one opens that note at that exact node. See [Structured backlinks](./backlinks).

## 7. Switch it off

Run **Toggle outline mode** again, or click the ribbon icon. The note returns to stock Obsidian, and because nothing was ever written to the file that Obsidian would not have written itself, the markdown is exactly what it would have been anyway.

## Where next

- [How a note becomes an outline](./how-notes-become-outlines) explains the mapping, including the two rules that surprise people most: a list after a paragraph belongs to that paragraph, and one blank line decides whether indented text is a continuation or a child.
- [Appearance](./appearance) shows how to tune the grid, guides and markers, and how to override any of it from a CSS snippet.
- [Settings](../reference/settings) and [Commands and keys](../reference/commands-and-keys) list everything there is.
