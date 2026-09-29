# Spec Delta

## Purpose

Defines the evidence a pull request's drawn case files produce: the cases run on the base and on
the pull request, a painted frame after each key, and where the two sides are shown, so a tester
can decide from the pull request whether a beta install is still needed.

## ADDED Requirements

### Requirement: A pull request that carries case files gets evidence, and one that does not gets nothing

The repository SHALL produce evidence for a pull request that adds or changes a file ending in
`.case` under `e2e-tests/cases/`, on every push to it. A pull request that carries none SHALL run
none of the evidence jobs and receive no evidence comment. A pull request that carried case files
and no longer does SHALL have its evidence comment replaced with a note that says so.

The cases evidence covers SHALL be those files, and no others. A file the pull request only
moves, without changing its content, SHALL NOT count as changed.

#### Scenario: A pull request that adds a case file

- **WHEN** a push to a pull request adds `e2e-tests/cases/structural-operations/x.case`
- **THEN** the evidence jobs run for that file, and the pull request shows one evidence comment

#### Scenario: A pull request that changes only documentation

- **WHEN** a push touches no file under `e2e-tests/cases/`
- **THEN** no evidence job runs, and the pull request gets no evidence comment

#### Scenario: A push that removes the last case file

- **WHEN** a pull request whose evidence comment exists is pushed with its case files removed
- **THEN** the comment is replaced with a note that the head carries no case files

### Requirement: Each case runs on the base and on the pull request, on both platforms, with one harness

Each covered case SHALL run on desktop and under mobile emulation, on two sides: the **base**, the
first parent of the pull request's merge with its base branch, and the **pull request**, that merge.
Both sides SHALL run the case with the same harness, the merge's: the case file, the arranging, the
keys, the reading of the state and the recording of frames SHALL be identical, and the sides SHALL
differ in the plugin they build and in nothing else.

A side that cannot run a case (the `before` cannot be arranged, the plugin does not load, a probe
the harness needs is missing from the product) SHALL record why, and the other side SHALL still run.

#### Scenario: The head is behind the base

- **WHEN** a pull request's head does not contain the case runner the base has, because it
  branched before the runner landed
- **THEN** the pull request side runs the runner from the merge, and both sides run the same runner

#### Scenario: The base cannot run a case

- **WHEN** a case needs a product probe the base branch does not have
- **THEN** the evidence records that the base could not run the case and why, and shows the pull
  request's frames without a base column

### Requirement: An evidence run records what the app did and never fails a case

In an evidence run, a case SHALL NOT fail because its result differs from the drawn `expected`.
The run SHALL arrange the `before`, press every key phase in order, read the state after each,
and record, for each phase, the state drawn as the notation draws it and the parts that differ
from the drawn result (`text`, `caret`, `selection`, `block selection`). A difference SHALL NOT
stop the remaining phases: the keys after it SHALL still be pressed, from the state the app is in.
A `before` the editor does not hold SHALL be recorded, with what it holds, and the keys SHALL
still be pressed.

The verdict of a side SHALL be read from the recorded state and never from a frame.

#### Scenario: The base differs from the drawn result

- **WHEN** a case's drawn result is the fix's and the base does not have the fix
- **THEN** the run passes, and its record names the differing parts for the base and none for the
  pull request

#### Scenario: A case differs in its first phase and has a second

- **WHEN** the first phase's state differs from its drawn result
- **THEN** the second phase's keys are still pressed and its state and frames are recorded

#### Scenario: A case that waits on an issue

- **WHEN** a case file marked `known-failing` is run and the base's first differing phase gives the
  `actual` the file records
- **THEN** the record names the issue and says the base still fails as recorded, and the keys after
  that phase are still pressed

#### Scenario: A drawn caret that the app does not match

- **WHEN** the pull request's text matches a phase's drawn result and its caret does not
- **THEN** the record for that phase names `caret` and no other part

### Requirement: A frame follows `before` and every key phase, in light and in dark, with the caret drawn

An evidence run SHALL take a frame of the note's view after arranging `before` and after each key
phase, in the light theme and in the dark one, on both sides and both platforms. The view SHALL be
the note the case runs in, whether it is being edited or read, cropped to its content and to the
width of the view.

Chromium's own caret SHALL be hidden in a frame, and where the editor has focus and its selection
is empty a caret SHALL be drawn at the position of the DOM selection's rect, and at the position
CodeMirror reports for the selection's head when the DOM gives none. No caret SHALL be drawn for
a selection that is not empty, for an editor without focus, or in reading view. A frame SHALL carry
a caption naming the side and the phase's keys, and `before` for the first.

Frames of a screen that does not change SHALL be identical.

#### Scenario: A static screen

- **WHEN** eight frames are taken of an unchanged note with the caret in it
- **THEN** all eight are the same image

#### Scenario: Chromium's blinking caret

- **WHEN** the native caret is left visible and eight frames are taken of an unchanged note
- **THEN** the frames are not all the same image, which is why it is hidden

#### Scenario: A caret after a fold

- **WHEN** the caret is at the end of a folded line and the DOM's rect and CodeMirror's position for
  it differ
- **THEN** the drawn caret is at the DOM's rect

#### Scenario: A popup that opens after a key

- **WHEN** a key opens one of Obsidian's suggesters after a debounce
- **THEN** the frame for that phase is taken after the wait the suggester needs, and shows it open

#### Scenario: Reading view

- **WHEN** a phase toggles the note into reading view
- **THEN** the frame after it shows reading view, with no drawn caret

### Requirement: The two sides are shown as one image per case, platform and theme

Each covered case, platform and theme SHALL be one image: the base's frames in a left column and
the pull request's in a right one, one row per phase in order, `before` first. A case whose base
could not run SHALL be an image of the pull request's column alone.

#### Scenario: A case of two keys

- **WHEN** a case has two key phases
- **THEN** its image has three rows, `before` and each phase, and two columns

### Requirement: The images and a manifest are attached to the pull request's beta

The images and a manifest of every case's record SHALL be attached to the pull request's beta
prerelease for the pushed commit, once it exists, so they are kept and removed with it. They SHALL
NOT change the files BRAT installs from the release.

#### Scenario: The beta is published after the evidence is ready

- **WHEN** the evidence finishes before the beta prerelease for the same push exists
- **THEN** the evidence is attached once the release exists, and the run fails naming the release
  if it does not appear within the wait

#### Scenario: A later push

- **WHEN** a new push replaces the pull request's beta
- **THEN** the older beta's images go with it, and the comment links the new ones

### Requirement: One sticky comment shows the evidence, and says what it does not cover

A pull request with evidence SHALL carry one comment, identified by a marker, which each push
updates in place and never duplicates. It SHALL name the pull request's head commit, the base
commit it was merged with, the Obsidian and installer versions, and the beta's version.

For each case it SHALL show, on each platform, a verdict for each side (which drawn result it
matches, or the parts and phase where it first differs), the drawn states of `before`, `expected`,
the base and the pull request after each phase, and the image, in the theme the reader's page uses
with the other theme's image linked. The states SHALL be drawn as the notation draws them and
carry the measured caret.

The comment SHALL say, in a fixed line, what an evidence run does not cover: a pointer gesture,
and the phone's own app, where mobile emulation is the desktop app at a phone's viewport.

The comment SHALL NOT exceed the size GitHub accepts for one. Cases that do not fit SHALL be listed
with their verdicts and links to their images and no drawn states, in file order after those that
fit.

#### Scenario: A second push

- **WHEN** a pull request whose comment exists is pushed again
- **THEN** the same comment is updated, and no second evidence comment appears

#### Scenario: A case that differs on the pull request

- **WHEN** a case's caret after a key differs from the drawn result on the pull request
- **THEN** the comment names the case, the platform, the phase and `caret` in the pull request's
  verdict, and draws the expected and measured states

#### Scenario: More cases than fit in one comment

- **WHEN** the drawn states of all covered cases exceed the comment's size
- **THEN** the cases that fit are shown in full, and the rest as a row each with verdicts and links

### Requirement: The evidence does not change any other result

An evidence run SHALL be separate from the suites: it SHALL NOT change the result of any
existing check, and a failure of an evidence job SHALL NOT fail the pull request's required
checks. The `drawn-cases` job SHALL behave as it does without evidence.

#### Scenario: An evidence job fails

- **WHEN** an evidence job cannot run
- **THEN** the pull request's other checks are unaffected, and the failure is visible in the
  evidence job's own result
