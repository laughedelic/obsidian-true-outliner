# Compared to Org-mode

Org-mode is the oldest living relative: an Emacs mode in which a plain-text file's heading tree supports promote, demote, move, fold and narrow as first-class operations, with the markup itself as the only source of truth. Much of what this plugin does to headings is org-mode's idea, applied to markdown.

Checked September 2026.

## What org-mode got right

Org-mode showed that a plain-text file can be edited as a tree, and drawn as one, without anything added to it.

- **Structure editing on plain text, for decades.** The file is text a person can read without Emacs.
	- Promote and demote shift a heading's level and its whole subtree.
	- Move up and down swap sections.
- **Narrowing.** Show one subtree as if it were the buffer.
	- Our zoom is narrowing with a breadcrumb trail.
- **Drawing hierarchy without touching the file.** `org-indent-mode` renders depth as indentation while the file stays flat.
	- Our outline grid is the same idea, generalised to every block kind.

## Where it falls short

The tree stops at headings, and some of its state goes into the file.

- **Body text is not a node.** In org-mode, paragraphs and lists are the content of a heading, not nodes of their own.
	- Structure editing moves headings, and a list after a paragraph has no relationship to it.
	- Ours makes every block a node, so a paragraph with the list under it moves as a unit.
- **Fold state in the file.** `STARTUP` keywords and `VISIBILITY` properties persist folds by writing them into the document.
	- Ours keeps fold state in plugin data.
- **Region selection is plain text.** Selecting across headings and deleting can take half a subtree.
	- Ours escalates a selection to whole nodes.
- **Emacs.** Org-mode is a way of using Emacs.
	- Its files are org, not markdown.
	- The mobile story is a set of third-party apps.

## What we take from it

Three mechanisms and one conviction:

- Promote and demote as level shifts on headings, with the subtree following.
- Narrowing.
- Virtual indentation.
- The confidence that a plain-text file can be a first-class outline.

## What we leave aside

The places where org-mode's tree stops short, writes to the file, or spends a key differently:

- Structure editing that stops at headings.
- Fold state in the file.
- Tab as visibility cycling.
	- Ours keeps Tab for indenting.

## Head to head

| | Org-mode | Obsidian + True Outliner |
| --- | --- | --- |
| Notes are plain files | ✓, org | ✓, markdown |
| Nodes | headings; body text is content | every markdown block |
| Promote and demote with subtree | ✓ | ✓, on headings; reparent elsewhere |
| Selection by node | – | ✓ |
| Narrowing and zoom | narrowing | zoom with a trail |
| Fold, remembered | in the file | in plugin data, per note |
| Backlinks with structure | – | ✓ |
| Editor | Emacs | Obsidian, desktop and mobile |
