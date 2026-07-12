# Manual dev-vault verification protocol (task 4.1)

Install: copy/symlink `manifest.json` + `main.js` into
`<vault>/.obsidian/plugins/true-outliner/`, enable in Community plugins.
(`npm run dev` for watch mode.) Record results inline: [ ] → [x] pass / [!] fail + note.

## Outline mode

- [x] Toggle via command palette on a note: notice appears; file bytes and mtime
      unchanged (check with `ls -l` / git diff)
- [x] Toggle via editor right-click menu entry
- [x] Restart Obsidian: mode still on for that note; note content has no trace
- [x] Rename the note: mode follows the new path
- [x] Delete the note: path pruned from `data.json`
- [x] Command palette on a non-outline note: the four structural commands absent

## Structural commands (bind temporary hotkeys first)

- [x] Indent paragraph under paragraph → becomes `- item`; cursor after `- `
- [x] Outdent it back → paragraph restored byte-identically; one undo step each way
- [x] Heading demote/promote: subtree `#` markers shift; body lines untouched;
      `[[note#Heading]]` link elsewhere still resolves
- [x] Skip-level outdent (`### x` under `# y`): first outdent → `## x` (no move),
      second → `# x` (sibling)
- [x] Move up/down: same-level heading sections swap wholesale; ordered list runs
      renumber
- [x] Each rejection cue fires with the right message, document untouched:
      h6 indent, h1 outdent, top-level outdent, indent with nothing above,
      indent after code fence, outdent of section content, cross-kind move
- [x] Undo after any accepted op restores the exact prior text (single step)
- [ ] Multi-cursor / selection edge: command uses cursor head line; no crash

## Shell

- [ ] Clean unload: disable plugin → commands and menu entry gone
- [ ] Coexistence: enable obsidian-outliner → one-time warning on next load; not
      repeated after restart
- [ ] Debug cross-check setting on: run ops across the corpus-style notes; console
      shows no `[true-outliner] parse disagreement` warnings (any hit → task 4.2)
- [ ] Mobile smoke (optional this change): plugin loads on iOS/Android without errors

## Results

Manual dev-vault run performed on the stacked branch `feat/outline-grammar` (PR open);
automated e2e coverage of the same scenarios added on `feat/e2e-harness` (PR open). See
those branches/PRs for the actual checklist results and any corpus fixtures/open-questions
updates filed from findings — not duplicated here.

## Keyboard grammar (outline-grammar change)

Scenarios below are covered by the automated e2e suite on `feat/e2e-harness`; see that
branch for actual results rather than duplicating a manual checklist here.

- Off-mode: Tab in a list, Enter, Shift+Enter, Alt+arrows all behave stock
- Toggle mode with note open: very next keypress follows the new mode
- Tab/Shift+Tab indent/outdent the node at cursor; cursor at content start
- Alt+Up/Down move nodes/sections; ordered runs renumber
- Enter mid-item splits into two items; children stay with the upper
- Enter at item end: empty `- ` sibling, cursor after marker
- Enter at paragraph end: blank line + cursor; typing creates the sibling node
- Enter on a heading: empty line below, typed text becomes a child paragraph
- Shift+Enter in an item: aligned continuation line, still one node (check by
  toggling outline off/on or via a structural op treating it as one)
- Atom interiors: Enter/Shift+Enter/Tab inside a code fence behave stock
  (whole-fence ops only from its first line)
- Each grammar op is one undo step; rejected ops change nothing but show the cue
