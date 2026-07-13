# Manual dev-vault verification protocol (task 4.1)

Install: copy/symlink `manifest.json` + `main.js` into
`<vault>/.obsidian/plugins/true-outliner/`, enable in Community plugins.
(`npm run dev` for watch mode.) Record results inline: [ ] → [x] pass / [!] fail + note.

## Outline mode

- [ ] Toggle via command palette on a note: notice appears; file bytes and mtime
      unchanged (check with `ls -l` / git diff)
- [ ] Toggle via editor right-click menu entry
- [ ] Restart Obsidian: mode still on for that note; note content has no trace
- [ ] Rename the note: mode follows the new path
- [ ] Delete the note: path pruned from `data.json`
- [ ] Command palette on a non-outline note: the four structural commands absent

## Structural commands (bind temporary hotkeys first)

- [ ] Indent paragraph under paragraph → becomes `- item`; cursor after `- `
- [ ] Outdent it back → paragraph restored byte-identically; one undo step each way
- [ ] Heading demote/promote: subtree `#` markers shift; body lines untouched;
      `[[note#Heading]]` link elsewhere still resolves
- [ ] Skip-level outdent (`### x` under `# y`): first outdent → `## x` (no move),
      second → `# x` (sibling)
- [ ] Move up/down: same-level heading sections swap wholesale; ordered list runs
      renumber
- [ ] Each rejection cue fires with the right message, document untouched:
      h6 indent, h1 outdent, top-level outdent, indent with nothing above,
      indent after code fence, outdent of section content, cross-kind move
- [ ] Undo after any accepted op restores the exact prior text (single step)
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
