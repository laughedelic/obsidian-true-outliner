# e2e-verification Specification

## Purpose
TBD - created by archiving change e2e-harness. Update Purpose after archive.
## Requirements
### Requirement: Sandboxed real-Obsidian harness

The project SHALL provide an automated end-to-end harness that launches a
real Obsidian instance with the built plugin installed and a throwaway copy
of `test-vault/`, runnable with a single command (`npm run test:e2e`). The
harness MUST NOT modify the checked-in `test-vault/` and MUST NOT affect the
plugin bundle, the vitest suite, or the plugin typecheck.

#### Scenario: One-command run against a sandbox

- **WHEN** a developer runs `npm run test:e2e`
- **THEN** the plugin is rebuilt, Obsidian launches against a sandboxed copy
  of `test-vault/` with the plugin enabled, all e2e specs run, and after the
  run `git status` shows no changes under `test-vault/`

#### Scenario: Harness excluded from bundle and unit tests

- **WHEN** `npm run build:plugin`, `npm test`, and `npm run build` execute
- **THEN** none of them compile, bundle, or run any file under `e2e/`

### Requirement: Outline mode e2e verification

The harness SHALL verify outline-mode lifecycle end-to-end: toggling by
command id shows a notice and leaves file bytes and mtime unchanged; mode
survives an app restart with no trace in note content; mode follows renames;
deletion prunes the path from plugin data; structural commands are absent on
non-outline notes.

#### Scenario: Toggle leaves file untouched

- **WHEN** the toggle command runs on an open note and the buffer is saved
- **THEN** a notice appears and the note's on-disk bytes and mtime equal
  their pre-toggle values

#### Scenario: Mode persists across restart

- **WHEN** outline mode is enabled for a note and Obsidian is restarted
  preserving state
- **THEN** the note is still in outline mode (grammar keys act) and its
  content contains no mode marker

#### Scenario: Rename follows, delete prunes

- **WHEN** an outline note is renamed, and separately when one is deleted
- **THEN** `data.json` lists the new path after rename and no longer lists
  the deleted path after delete

#### Scenario: Commands gated to outline notes

- **WHEN** command availability is checked on a non-outline note
- **THEN** the four structural commands report unavailable, and on an
  outline note they report available

### Requirement: Structural command e2e verification

The harness SHALL verify the four structural commands (indent, outdent,
move up, move down) invoked by command id against real notes: text
transforms match the spec'd behavior, cursor lands correctly, every accepted
operation is a single undo step restoring the exact prior text, and every
rejection shows its message while leaving the document byte-identical.

#### Scenario: Indent/outdent round-trip with undo

- **WHEN** a paragraph under a paragraph is indented and then outdented
- **THEN** it becomes a `- item` with the cursor after `- `, the outdent
  restores the original text exactly, and one undo keystroke reverses each
  step

#### Scenario: Heading demote keeps links resolving

- **WHEN** a heading section with an incoming `[[note#Heading]]` link is
  demoted
- **THEN** subtree `#` markers shift, body lines are untouched, and the link
  still resolves via the metadata cache

#### Scenario: Skip-level outdent in two steps

- **WHEN** outdent runs twice on `### x` nested under `# y`
- **THEN** the first invocation yields `## x` without moving it and the
  second yields `# x` as a sibling of `# y`

#### Scenario: Moves swap wholesale and renumber

- **WHEN** move up/down runs on a same-level heading section and on an item
  in an ordered list
- **THEN** heading sections swap wholesale and ordered list runs renumber

#### Scenario: Every rejection cue is inert

- **WHEN** each rejection case runs (h6 indent, h1 outdent, top-level
  outdent, indent with nothing above, indent after code fence, outdent of
  section content, cross-kind move)
- **THEN** the matching rejection notice text appears and the buffer is
  byte-identical to before the command

### Requirement: Keyboard grammar e2e verification

The harness SHALL verify the outline keyboard grammar with real key events:
Tab/Shift+Tab indent/outdent at the cursor node, Alt+Up/Down move nodes,
Enter splits per node kind, Shift+Enter continues an item as one node, atom
interiors behave stock, keys behave stock when mode is off, and a mode
toggle takes effect on the very next keypress. Each accepted grammar
operation MUST be one undo step; each rejected one MUST change nothing but
show its cue.

#### Scenario: Off-mode keys are stock

- **WHEN** Tab, Enter, Shift+Enter, and Alt+arrows are pressed in a list in
  a non-outline note
- **THEN** the buffer changes match stock Obsidian behavior (no grammar
  transforms, no notices)

#### Scenario: Toggle applies to the next keypress

- **WHEN** outline mode is toggled while the note is open and a grammar key
  is pressed immediately after
- **THEN** the keypress follows the new mode

#### Scenario: Tab family and moves

- **WHEN** Tab / Shift+Tab / Alt+Up / Alt+Down are pressed at a node
- **THEN** the node indents/outdents/moves per the grammar, the cursor lands
  at content start (for indents), and ordered runs renumber

#### Scenario: Enter split semantics per kind

- **WHEN** Enter is pressed mid-item, at item end, at paragraph end, and on
  a heading
- **THEN** respectively: the item splits with children staying up; an empty
  `- ` sibling appears with the cursor after the marker; a blank line plus
  cursor appears and typed text becomes the sibling; an empty line appears
  below the heading and typed text becomes a child paragraph

#### Scenario: Shift+Enter keeps one node

- **WHEN** Shift+Enter is pressed inside an item and a structural op then
  targets that item
- **THEN** an aligned continuation line is inserted and the op treats the
  item plus continuation as a single node

#### Scenario: Atom interiors are stock

- **WHEN** Enter, Shift+Enter, and Tab are pressed inside a code fence in an
  outline note
- **THEN** stock editing behavior applies, while the same keys on the
  fence's first line perform whole-fence operations

### Requirement: Shell behavior e2e verification

The harness SHALL verify plugin shell behaviors: disabling the plugin
removes its commands, and the coexistence warning for conflicting plugins
fires once and is not repeated after restart.

#### Scenario: Clean unload

- **WHEN** the plugin is disabled at runtime
- **THEN** its commands are no longer registered

#### Scenario: Coexistence warning fires once

- **WHEN** a conflicting plugin id is enabled and the plugin loads, and
  Obsidian is then restarted
- **THEN** the warning notice appears on the first load and does not appear
  after the restart

### Requirement: Manual protocol reduced to residue

`openspec/changes/editor-core/verification.md` SHALL be rewritten so each
automated checklist item points to the e2e spec covering it, leaving only
genuinely manual checks (mobile smoke, visual polish) as a short manual
residue list.

#### Scenario: Checklist items map to specs

- **WHEN** a reader opens `verification.md` after this change
- **THEN** every previously manual, now-automated item names the e2e spec
  file that covers it, and the remaining manual items are explicitly listed
  as residue

