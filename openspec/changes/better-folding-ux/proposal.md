## Why

Folding is the outliner gesture we never built. What a note folds today is whatever Obsidian
folds — headings and list items — through chrome Obsidian paints, on a rule that is not our tree:
a paragraph with children cannot fold at all, there is no hotkey, a folded node looks almost
exactly like an unfolded one, and a folded subtree loses its fold the moment it is moved. For a
plugin whose whole claim is that every block is a node, "some nodes collapse" is the visible edge
of the abstraction.

The mechanism turned out to be open. Measured against a real instance
([28-fold-mechanics.md](../../../docs/research/28-fold-mechanics.md)), Obsidian's fold IS
CodeMirror's fold: the state is `@codemirror/language`'s, and what is foldable comes from a
`foldService` facet that already holds three providers and accepts a fourth. One provider that
answers from our tree makes every node with children foldable, makes Obsidian's own fold command
work on it, and makes the fold persist and restore per file — none of which needs a parallel fold
engine, and none of which writes to the note.

## What Changes

- **One fold rule for every node with children.** A `foldService` provider answers from the
  mapping-core tree, at a precedence above the native providers, so every node that HAS children
  folds the same subtree cover. Three kinds can: a heading, a list item (bullet, ordered or task),
  and a paragraph carrying attached children — an atom is never a parent in the tree, which is
  what makes the paragraph the one kind Obsidian cannot fold and we must. Folding stops depending
  on Obsidian's "Fold heading" / "Fold indent" settings.
- **Three commands with default hotkeys** — fold node (`Mod+Alt+ArrowUp`), unfold node
  (`Mod+Alt+ArrowDown`), toggle fold (`Mod+Alt+Period`) — plus document-wide fold all, unfold all,
  and fold to level, scoped to our tree rather than to what Obsidian's own fold-all reaches.
- **A fold affordance on every foldable node, whoever draws it.** Obsidian's own chevron follows
  the provider — a paragraph gets one for free — but it disappears from every line when a user
  turns "Fold heading" or "Fold indent" off, while the fold itself keeps working. The plugin draws
  its own wherever a node we fold has no native chevron, in the gutter our markers and the
  repositioned chevron already share.
- **A folded node reads as folded.** The marker itself carries the state: the kind's own glyph,
  solid, with the count of hidden descendants after the node's text. Chosen from a rendered
  mockup ([28-fold-marker-mockup.html](../../../docs/research/28-fold-marker-mockup.html)) against
  six alternatives — halos, outlines and underlines all read as either too heavy at 14px or
  inconsistent across the marks, and the count is the only candidate that says how much is
  hidden rather than merely that something is.
- **Clicking a guide toggles the subtree under it.** The default action for the guide column at
  depth *d*: fold, or unfold, every child of the node that guide belongs to. Configurable later;
  one action now.
- **Fold state survives the operations that move a node.** A move currently destroys the fold that
  an indent preserves; the fold is re-derived from the node's new position instead of being left
  to map through a delete-and-insert.
- **Enter and Backspace respect a folded node.** Enter at the end of a folded node's line creates a
  sibling after the whole subtree instead of unfolding it and inserting inside; deleting a folded
  node takes its hidden children with it.
- **Fold and unfold in the backlinks footer**, both ways, with the same chrome and the same
  gesture as the editor — replacing the footer's own one-way chevron and the two defects recorded
  against it in [12-decoration-follow-ups.md](../../../docs/research/12-decoration-follow-ups.md).
- **Persistence, with a setting.** Fold state already survives close and reopen through Obsidian's
  per-file workspace state once a fold is `foldable()`; the setting decides whether we keep it,
  and the note file is never involved either way.

## Capabilities

### New Capabilities
- `outline-folding`: what folds and what a fold covers; the commands and their default hotkeys;
  the fold affordance and the folded-state indication; the guide-column gesture; fold state
  through structural operations, zoom and reload; and the persistence setting.

### Modified Capabilities
- `outline-decorations`: a folded node's marker states that it is folded and how much it hides,
  and lines whose kind Obsidian paints no chevron on receive our own fold affordance in the
  marker gutter.
- `outline-keyboard-grammar`: Enter and Backspace against a FOLDED node — a sibling after the
  subtree rather than a child inside it, and a deletion that takes the hidden descendants.
- `editor-structural-commands`: an accepted operation carries the operand's fold state to the
  operand's new position.
- `backlinks-footer`: a row's fold affordance folds and unfolds, and is the editor's fold chrome
  rather than one the footer draws for itself.

## Non-goals

- **Reading mode.** Outline chrome is Live-Preview-only by construction; reading view renders
  through a post-processor with no CM6 fold to extend.
- **Obsidian's core Backlinks pane.** The footer is ours; the pane is a separate renderer with no
  public surface, and bringing folding to it is its own change.
- **Making the guide gesture configurable.** One default action now, stated so a setting can be
  added later without changing what the gesture means.
- **A new fold persistence store.** Fold state stays in Obsidian's workspace state, where it
  already is; the plugin adds no file of its own for it, and nothing is written to the note.
- **Fold state as document text.** No `collapsed::` property, no `^block-id` written on fold — the
  clean-files invariant (Q3) is unchanged.
- **Rebuilding the fold engine.** We register a provider into CodeMirror's; we do not replace
  Obsidian's fold state, its placeholder, or its own fold commands.

## Impact

- **New**: a fold module under `src/plugin/` (the `foldService` provider, the fold/unfold/toggle
  commands, the guide-column pointer gesture), and its e2e specs in a group of their own.
- **Modified**: `src/plugin/decorations.ts` (folded-state marker treatment, the affordance for
  kinds Obsidian skips, hidden-descendant count), `src/plugin/keymap.ts` (Enter/Backspace against
  a folded node), `src/plugin/main.ts` (commands, hotkeys, the persistence setting),
  `src/plugin/backlinks-footer.ts` (two-way row folding on shared chrome), `styles.css`.
- **Dependencies**: `@codemirror/language`'s `foldService`, `foldEffect`, `unfoldEffect`,
  `foldedRanges`, `foldable` — already an external dependency of the bundle, already used by
  `zoom-view.ts`.
- **Obsidian surface**: `app.foldManager`'s save/load path is exercised but not called by us; the
  native `editor:toggle-fold` keeps working and starts working on kinds it previously ignored.
