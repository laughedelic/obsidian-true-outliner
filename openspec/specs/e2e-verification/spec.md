# e2e-verification Specification

## Purpose
Defines the automated end-to-end verification harness: a real (sandboxed) Obsidian
instance driven against a throwaway copy of `test-vault/` to exercise behavior that only
exists in a live app — command dispatch, keyboard grammar, on-disk byte fidelity, and
persistence across restarts — replacing the manual dev-vault checklist it supersedes.

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

- **WHEN** `npm run build`, `npm test`, and `npm run typecheck` execute
- **THEN** none of them compile, bundle, or run any file under `e2e-tests/`

### Requirement: Outline mode e2e verification

The harness SHALL verify outline-mode lifecycle end-to-end: toggling by command id leaves file
bytes and mtime unchanged, from every view mode; the toggle acts on the
active tab only; the global default survives an app restart while a tab's manual state does
not; a fresh install starts with the default on; no per-path mode state is stored; structural
commands are gated per tab; the indicator surfaces state and toggle the active tab's mode and
follow tab switches; and toggling on from reading view enters editing, over an off default and
over a manual off alike.

#### Scenario: Toggle leaves file untouched

- **WHEN** the toggle command runs on an open note and the buffer is saved
- **THEN** the note's on-disk bytes and mtime equal their pre-toggle values

#### Scenario: Toggle is offered in reading view

- **WHEN** the toggle command's availability is checked while the active view is in reading
  view
- **THEN** the command reports available, and invoking it enters outlined editing

#### Scenario: Toggle acts on the active tab only

- **WHEN** the toggle runs in one tab while a second tab is open on another note, and a third
  note is opened in a new tab afterwards
- **THEN** the second tab's state is unchanged and the third follows the global default

#### Scenario: Mode persists across restart

- **WHEN** the default is switched off, one tab is manually switched on, and Obsidian is
  restarted preserving state
- **THEN** notes opened afterwards are stock (the setting persisted, no mode marker ever in
  note content), and the manually outlined tab reopens stock

#### Scenario: A tab's manual state resets with its editor state

- **WHEN** a tab is manually switched off outline mode, and then switches to another note and
  back, and separately round-trips through reading view
- **THEN** the note switch leaves it outlined again — the default, with no toggle invoked —
  and the reading round-trip leaves it off, the state the tab was left in

#### Scenario: Fresh install is on by default

- **WHEN** the plugin loads with no stored plugin data and a note is opened
- **THEN** the note is in outline mode without any toggle having been invoked

#### Scenario: Rename and delete leave the store with nothing to follow or prune

- **WHEN** notes are opened, renamed, and deleted with the default on, and the plugin data
  store is read after each
- **THEN** it records the default value and no per-path entries — a rename changes nothing
  about any tab's mode, a deletion prunes nothing because there is nothing to prune; a store
  written by a previous version loses its per-path entries on the next save

#### Scenario: Commands gated to outline notes

- **WHEN** command availability is checked on a stock tab, and again on an outlined tab —
  including the same note open once in each state
- **THEN** the four structural commands report unavailable for the stock tab and available for
  the outlined one

#### Scenario: Indicators state and toggle the active tab's mode

- **WHEN** the status bar item and the ribbon icon are read and activated, on desktop and
  under mobile emulation, with two tabs in different states
- **THEN** each states the active tab's mode before activation, toggles that tab on
  activation, and both restate the mode when the active tab switches; the status bar chip takes
  each of its three configured forms; on mobile no status bar item exists

#### Scenario: Toggling on from reading view enters editing

- **WHEN** the active pane is in reading view and the toggle is invoked — with the default on,
  separately with it off, and separately from a tab the user had manually switched off
- **THEN** the pane enters the editing mode it was last in (Live Preview when it records
  none) showing the outline decorations in all three cases

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
Tab/Shift+Tab indent/outdent at the cursor node, the move-node default
hotkey (Mod+Shift+Up/Down) moves nodes,
Enter splits per node kind, Shift+Enter continues an item as one node, atom
interiors behave stock, keys behave stock when mode is off, and a mode
toggle takes effect on the very next keypress. Each accepted grammar
operation MUST be one undo step; each rejected one MUST change nothing but
show its cue.

#### Scenario: Off-mode keys are stock

- **WHEN** Tab, Enter, and Shift+Enter are pressed in a list in
  a non-outline note
- **THEN** the buffer changes match stock Obsidian behavior (no grammar
  transforms, no notices)

#### Scenario: Toggle applies to the next keypress

- **WHEN** outline mode is toggled while the note is open and a grammar key
  is pressed immediately after
- **THEN** the keypress follows the new mode

#### Scenario: Tab family and moves

- **WHEN** Tab / Shift+Tab / Mod+Shift+Up / Mod+Shift+Down are pressed at a node
- **THEN** the node indents/outdents/moves per the grammar, the cursor lands
  at content start (for indents), and ordered runs renumber

#### Scenario: Enter split semantics per kind

- **WHEN** Enter is pressed mid-item (childless), mid-item (with children), at
  item end, at paragraph end, and on a heading
- **THEN** respectively: the childless item splits into siblings; the parent
  item's remainder becomes its new first child above the existing children; an
  empty `- ` sibling appears with the cursor after the marker; a blank line plus
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

### Requirement: DevTools-protocol access from a spec

The harness SHALL let a spec reach the DevTools protocol of the page its WebDriver session is
driving, on the desktop run and on the mobile-emulation run, without installing a dependency. A
spec SHALL be able to send a command and read its result, subscribe to an event, and release the
connection when its case ends. The connection SHALL reach the page WebDriver is driving and no
other, and SHALL be resolved each time it is opened, so that a reload of Obsidian never leaves a
spec connected to an endpoint that no longer exists. A command that cannot complete SHALL fail
with an error naming the command, and SHALL NOT wait out the case's budget. The harness's
WebDriver commands SHALL keep working while a connection is open and after it closes.

#### Scenario: An evaluation reads the page WebDriver drives

- **WHEN** a spec evaluates the viewport's width and height over the protocol, and reads the same
  two values through WebDriver
- **THEN** the two readings are equal, on the desktop run and under mobile emulation

#### Scenario: A key sent over the protocol reaches the editor

- **WHEN** a note `- a` / `- b` is open with the caret at the end of the second item, and a spec
  sends the key `x` over the protocol
- **THEN** the buffer WebDriver reads is `- a` / `- bx`

#### Scenario: A screenshot is the size of the viewport

- **WHEN** a spec takes a screenshot over the protocol
- **THEN** the image's width and height are the viewport's times its device pixel ratio, so a
  mobile-emulation run's image is phone-sized

#### Scenario: A subscribed event reaches the spec

- **WHEN** a spec subscribes to console output and a script run through WebDriver logs a message
- **THEN** the subscriber receives that message

#### Scenario: A window handle with a prefix still finds the page

- **WHEN** a spec opens a connection with WebDriver's window handle given a `CDwindow-` prefix
- **THEN** the connection reaches the page, and an evaluation of the viewport equals WebDriver's
  reading

#### Scenario: A handle that matches no target fails by name

- **WHEN** a spec opens a connection with a window handle that no page target carries
- **THEN** the connection is rejected with an error that names that handle and the targets that
  were listed

#### Scenario: A new connection follows an Obsidian reload

- **WHEN** Obsidian is reloaded through the harness and a spec then opens a connection and
  evaluates the viewport
- **THEN** the evaluation succeeds and reads the same values WebDriver reads

#### Scenario: A command on a released connection fails by name

- **WHEN** a spec sends a command on a connection it has already released
- **THEN** the command is rejected with an error that names it, and the WebDriver session is
  unaffected

#### Scenario: A command that outlasts its limit fails by name

- **WHEN** a spec sends a command that takes longer than the limit it gave that command, and a
  later command is sent on the same connection
- **THEN** the first is rejected with an error that names it, and the later command completes

### Requirement: The Obsidian installer is selectable

Both e2e configurations (desktop and mobile emulation) SHALL take the installer version from the
`OBSIDIAN_INSTALLER_VERSION` environment variable, a blank value counting as unset, and SHALL
default to the oldest installer compatible with the app under test. The variable SHALL accept
`earliest`, `latest` or an exact version. A value that names no installer SHALL fail the run before
any Obsidian starts, naming the value.

#### Scenario: Unset or blank selects the oldest compatible installer

- **WHEN** `OBSIDIAN_INSTALLER_VERSION` is unset, and separately when it is set to the empty string
- **THEN** the run resolves the oldest installer compatible with the app under test, on desktop and
  under mobile emulation, as it did before the variable existed

#### Scenario: The newest installer is selected on both platforms

- **WHEN** `OBSIDIAN_INSTALLER_VERSION=latest` is set for a desktop run and for a mobile-emulation
  run
- **THEN** each run launches the newest installer compatible with the app under test, and the
  running app reports the Chrome version of that installer

#### Scenario: An unknown installer fails before launch

- **WHEN** `OBSIDIAN_INSTALLER_VERSION` names a version that does not exist
- **THEN** the run stops before starting Obsidian, and the error names the value

### Requirement: Every run records the build it ran on

Each e2e run SHALL resolve the Obsidian target once, in the launching process, and record the app
version, the installer version and that installer's Electron and Chrome versions, resolved rather
than as requested, in `.obsidian-cache/e2e-target.json`. The target banner and the step-summary
row each CI e2e job writes SHALL name the same values. A record left by an earlier run SHALL NOT
survive into a run that fails before it writes its own.

#### Scenario: The record resolves aliases

- **WHEN** a run is started with `OBSIDIAN_VERSION=latest` and
  `OBSIDIAN_INSTALLER_VERSION=latest`
- **THEN** the record holds exact version numbers, not the words `latest`, and the banner prints
  the same numbers

#### Scenario: The step-summary row names the installer

- **WHEN** a CI e2e job finishes, passing or failing
- **THEN** its step-summary row names the app version, the installer version and the Chrome
  version the job ran on, read from the record

#### Scenario: A stale record does not outlive a failed start

- **WHEN** a run fails before Obsidian starts, after an earlier run left a record
- **THEN** no record from the earlier run remains

### Requirement: A scheduled run on the newest installer

CI SHALL run every spec group, on desktop and under mobile emulation, on the newest installer
compatible with the newest public app weekly and on `workflow_dispatch`, which SHALL also accept
an app version and an installer version. The run SHALL NOT be part of the checks a pull request
waits on, and a pull request SHALL run on the oldest compatible installer.

#### Scenario: Weekly run

- **WHEN** the weekly schedule fires
- **THEN** every group runs on both platforms with the newest compatible installer for the newest
  public app, and each job's step-summary row names them

#### Scenario: Dispatch pins the versions

- **WHEN** the workflow is dispatched with an app version and an installer version
- **THEN** the jobs run that pair, and the cache they use does not serve a build for a different
  pair

#### Scenario: Pull requests are unaffected

- **WHEN** a pull request runs CI
- **THEN** its e2e jobs run on the oldest compatible installer, and the scheduled workflow neither
  starts nor is required

### Requirement: A red scheduled run is filed in the tracker

When a scheduled run on the newest installer fails, the workflow SHALL open one issue in the
repository's tracker naming the failed jobs, the run and the versions requested, carrying a
`kind/`, an `area/`, a priority and a `needs/` label from the declared set. While an issue from an
earlier red run is open, a further red run SHALL comment on it and SHALL NOT open another. A green
scheduled run SHALL comment on an open issue and SHALL NOT close it. A cancelled run, and a run
started by `workflow_dispatch`, SHALL file nothing.

#### Scenario: The first red run opens an issue

- **WHEN** a scheduled run finishes with a failed job and no such issue is open
- **THEN** one issue is opened listing the failed platform and group jobs and linking the run, with
  the reproduction command for the newest installer

#### Scenario: A repeated red run comments

- **WHEN** a scheduled run fails while an issue from an earlier red run is open
- **THEN** the run is added to that issue as a comment and no second issue exists

#### Scenario: A green run leaves the issue open

- **WHEN** a scheduled run passes while such an issue is open
- **THEN** a comment says the run passed, and the issue stays open

#### Scenario: Dispatched and cancelled runs file nothing

- **WHEN** a run is started by `workflow_dispatch`, or a scheduled run is cancelled
- **THEN** no issue is opened and no comment is added

### Requirement: The rendered editor is read around every case, and the reading is reported

The harness SHALL read the rendered editor around every e2e case, on desktop and under mobile
emulation, without any case asking. It SHALL read:

- **the painted caret**: that it agrees with the position CodeMirror reports for the selection's
  head, on either side of the head, lies inside the editor's scroller, and is what a hit test
  finds at its centre;
- **the scroll position**, frame by frame: a position that leaves and returns within the case, and
  a large step in one frame while the caret was in view before and after it;
- **the grid**: that each rendered line other than a quote has its text begin on its depth's
  column plus the marker gutter on every visual row, that a quote's marker begins there and its
  text hangs at one column, within a pixel, on every row after the marker, and that each mark is centred on its
  column within half a pixel;
- **the height map**: that the coordinates of each rendered line resolve back to that line, other
  than an empty line that stands before a widget;
- **layout shift** on lines of the editor that the case's edits did not touch, an edit being a
  change to the text;
- **errors**: uncaught errors, unhandled rejections and `console.error`;
- **notices** the case neither waited for nor read.

A reading SHALL be REPORT-ONLY: it SHALL NOT fail, retry or delay a case, and a run's status SHALL
NOT depend on it. A monitor that cannot read — no editor, no focus, a page reloaded during the
case, no answer within its budget — SHALL say so in the report, with the reason, instead of
reporting nothing. A case that failed or timed out SHALL NOT be read, since the editor is in
whatever state the failure left.

Each run SHALL write one report that names, for every monitor, how many cases it read and why it
did not read the rest, and for every rule it saw broken, the number of observations and cases and
the first examples with their spec and case. The report SHALL be printed at the end of the run and
rendered into the CI job's step summary.

A case that arranges a deliberately odd state SHALL be able to exempt itself from a monitor, and
the exemption SHALL require a reason. The report SHALL list every exemption with its reason.

#### Scenario: A caret clipped out of sight is reported

- **WHEN** a case ends with the caret in a line whose box clips it, so that the element at the
  caret's centre is not the caret's own line
- **THEN** the report lists a caret observation for that case, and the case still passes

#### Scenario: A caret beside a widget is read against either side

- **WHEN** a case ends with the caret at the end of a folded item, where `coordsAtPos` at the head
  measures the fold widget's edge and the caret is painted on the text before it
- **THEN** the report lists no caret observation

#### Scenario: A caret that neither side accounts for is reported

- **WHEN** a case ends with the caret painted away from both sides of its head
- **THEN** the report lists a caret observation

#### Scenario: A scroll position that leaves and returns is reported

- **WHEN** a case moves the scroller away from its position by more than a quarter of its height
  and back before the case ends
- **THEN** the report lists a scroll observation with the distance and how long it took

#### Scenario: A line off the grid is reported

- **WHEN** a case ends with a rendered list line whose text begins away from its column plus the
  gutter
- **THEN** the report lists a grid observation naming the line and the distance

#### Scenario: A wrapped quote is on the grid

- **WHEN** a case ends with a quote whose paragraph wraps, at the top of a note and nested
- **THEN** the report lists no grid observation, and a quote moved off its column is still listed

#### Scenario: A mark's half-pixel guide offset is not reported

- **WHEN** a mark is centred on its column, the guide beside it being drawn half a pixel to its
  right
- **THEN** the report lists no observation for that mark

#### Scenario: An empty line ahead of a widget is not round-tripped

- **WHEN** a case ends with a note that opens with a table, whose first source line stays ahead of
  the table's widget with no text
- **THEN** the report lists no height-map observation for that line

#### Scenario: A line the edit did not touch moving sideways is reported

- **WHEN** a case edits one line and a line elsewhere in the note moves sideways in the same
  frame
- **THEN** the report lists a layout-shift observation for the line that moved, and none for a
  line below the edit that moved only down

#### Scenario: A change that leaves the text as it was is not an edit

- **WHEN** a case replaces the buffer with the text it already holds, edits nothing else, and a
  line moves afterwards
- **THEN** the layout-shift monitor says the case edited no document

#### Scenario: An unexpected notice is reported and an awaited one is not

- **WHEN** a notice appears during a case that neither waited for it nor read the notices on
  screen, and another appears during a case that waited for it by its text
- **THEN** the report lists the first and not the second

#### Scenario: A case that did not pass is not read

- **WHEN** a case fails, times out or is skipped
- **THEN** every monitor's record for it says the case did not run to a pass, and no observation is
  listed

#### Scenario: An exemption names its reason

- **WHEN** a case exempts itself from the grid monitor with a reason
- **THEN** that case's grid monitor is not read, its other monitors are, and the report lists the
  exemption with the reason; an exemption with a blank reason fails the case that made it

#### Scenario: A monitor that cannot read says so

- **WHEN** a case ends with the editor not the page's active element
- **THEN** the caret monitor's record says the editor was not the active element, and the other monitors are
  read as usual

### Requirement: A wait for the caret, used where a real click's selection lands late

The harness SHALL let a spec wait for the editor's caret to reach a document position, and a wait
that gives up SHALL reject at about its limit, with an error naming the position it waited for and
the last position it read. The two gap-click cases that read the caret straight after a real
click, `65-content-space-caret` D1 and the code-fence D8 of `66-content-space-caret-manual-pass`
("a gap click before it lands on the previous node"), SHALL read the caret through that wait,
because under mobile emulation the click's selection update can land after the WebDriver call that
sent the click returns. The double-click case of `61-selection-enforcement` ("double-click word
selection is untouched") SHALL wait for its selection to be a word before it reads it, for the same
reason.

#### Scenario: A gap click's caret is awaited

- **WHEN** a note `Alpha one.` / gap / `Bravo two.` is open in outline mode with the caret at its
  start, and a spec clicks the gap line and waits for the caret
- **THEN** the caret is at the end of `Alpha one.` once the wait returns, whether the selection
  update landed before or after the click's WebDriver call returned

#### Scenario: A double click's word selection is awaited

- **WHEN** a note `First paragraph.` / gap / `Second paragraph.` is open in outline mode, and a spec
  double-clicks inside `First`
- **THEN** the spec reads a selection on line 0 whose ends differ, whether the word selection
  landed before or after the double click's WebDriver call returned

#### Scenario: A caret that arrives after the wait began is awaited

- **WHEN** a spec starts waiting for a position, and the caret reaches it 300 ms later
- **THEN** the wait resolves

#### Scenario: A caret that never arrives fails with where it was

- **WHEN** a spec waits, with a limit of 300 ms, for a position the caret never reaches
- **THEN** the wait rejects at about that limit, and its message names the position and the last
  caret position read

#### Scenario: A caret already there resolves

- **WHEN** a spec waits, with a limit of 300 ms, for the position the caret is at
- **THEN** the wait resolves
