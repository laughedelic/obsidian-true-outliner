# Dev-vault verification (task 4.1)

As of the e2e-harness change, this protocol is automated: `npm run test:e2e`
launches a real (sandboxed) Obsidian against a copy of `test-vault/` and runs
the checks below. First run downloads Obsidian into `.obsidian-cache/`.
Historical note: the original manual run (2026-07, recorded in git history)
passed everything it covered before automation.

## Automated coverage

### Outline mode → `e2e/specs/10-outline-mode.e2e.ts`

- Toggle via command: notice; file bytes and mtime unchanged
- Restart: mode still on; no trace in note content
- Rename: mode follows the new path; delete: path pruned from `data.json`
- Structural commands absent from non-outline notes

(The right-click menu entry itself is exercised manually; the command path it
shares is automated.)

### Structural commands → `e2e/specs/20-structural-commands.e2e.ts`

- Indent/outdent paragraph round-trip, cursor placement, one undo step each
- Heading demote/promote; `[[note#Heading]]` still resolves
- Skip-level outdent (re-level in place, then move)
- Move up/down: section swaps, ordered-run renumbering
- All seven rejection cues fire with the right message, document untouched
- Multi-line selection: command uses the cursor head line, no crash

### Keyboard grammar → `e2e/specs/30-keyboard-grammar.e2e.ts`

- Off-mode: keys behave stock; toggle governs the very next keypress
- Tab/Shift+Tab, Alt+arrows (with children, with renumbering)
- Enter splits per node kind; Shift+Enter continuation stays one node
- Atom interiors stock; whole-fence ops from the first line
- Single-step undo; rejected ops inert with cue

### Shell → `e2e/specs/40-shell.e2e.ts`

- Clean unload: disable removes commands
- Coexistence warning (via stub `obsidian-outliner` plugin): once, not after
  restart

## Manual residue

- [ ] Mobile smoke (optional this change): plugin loads on iOS/Android
      without errors — wdio-obsidian-service supports Android/emulation if we
      ever want to automate this
- [ ] Right-click editor menu entry appears and toggles (visual/UX check)
- [ ] Debug cross-check sweep: setting on, run ops across corpus-style notes,
      console clean of `[true-outliner] parse disagreement` (automatable
      later by reading the console through the harness; any hit → task 4.2)
- [ ] Notice appearance/timing feels right (pure UX judgment)
