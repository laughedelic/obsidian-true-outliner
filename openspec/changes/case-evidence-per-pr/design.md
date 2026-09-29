# Design

## Context

A case file runs in `e2e-tests/specs/98-drawn-cases.e2e.ts`: it arranges `before`, presses each
phase through `pressPhase`, reads the state through `readEditorState` and draws it through
`drawState`, and a difference from `expected` throws the drawing. The narrow runner
(`scripts/e2e-narrow.ts`) builds the plugin and runs one spec on either platform, and
`scripts/run-case.ts` names case files to it through `TO_CASE_FILES`. `e2e-tests/cdp.ts` reaches
the DevTools protocol of the page a spec drives. `.github/workflows/beta.yml` publishes a
prerelease per push to a pull request and deletes it when the request closes.
See the proposal for why the evidence is wanted.

`docs/research/case-evidence` is the measurement under the decisions below: the drawn cases of
#264, #270 and #274 run on `main` and on each PR, with a frame per key in both themes, on both
platforms, and a classification of the 11 manual steps they hand a tester.

## Goals / Non-Goals

**Goals:**

- A tester reads, on the PR, what `main` and the PR each do on every case, and decides whether a
  beta install is still needed.
- The steps of a run are ones a session can run, so the workflow holds no logic of its own.
- The recorder and the sheet need no dependency the repository does not already have.

**Non-Goals:**

- Anything in the proposal's Non-goals. In addition, no change to how an ordinary case is judged,
  and no change to the case-file format.

## Decisions

### D1. Frames, not clips

The issue asks for frames and a short clip per case, reusing draft #90's encoder. The measured
cases are one to three keys (`docs/research/case-evidence`), so a clip would show the same two to
four images in sequence. The steps of the waiting PRs that a frame answers, and a drawn state
cannot, are static: two quote rows against one (#264), reading view (#264, #270), a fold (#270), a
tag list open or not (#274). What moves is read elsewhere: the monitors read scroll and layout
shift after every case (#303), and the screencast catches a one-frame flash
(`docs/research/rendered-ui-observability`). A clip would also add ffmpeg to the jobs, which nothing
in the repository or `docs/cloud-sessions.md` provides.

Each frame's record carries its case, phase, keys and theme in order, which is the input an
encoder takes, so clips are a later addition to the publish job with no change to the recorder.
This is a departure from the issue's text, and the pull request says so.

### D2. What a frame is

One `Page.captureScreenshot` through `cdp.ts`, clipped to the view of the note the case runs in
(the `.view-content` of the most recent leaf) from its top to the last rendered line plus a
strip, and to the view's width. The measured regions are 680 × 281 px on desktop and 390 × 402 px
under mobile emulation, and a frame is about 16 kB.

The recorder installs one style and two fixed-position elements in the page, once per case:

- **The native caret is hidden** with `caret-color: transparent` on the editor's content.
  The native caret is painted and blinks, and eight frames of a static screen were two distinct
  images with it and one without, in each of the 12 measured runs.
- **A caret is drawn** as a 2 px bar at the DOM selection's rect, the rect Chromium paints. Where
  the DOM gives none (8 of 320 frames), `coordsAtPos` places it. Where both exist they agree to
  half a pixel except the caret at the end of a folded line (4 frames), where the DOM's rect is
  the painted one. No bar is drawn for a selection that is not empty, for an editor without focus
  (a block selection has none) or in reading view, since the native caret is not painted there
  either.
- **A caption badge** reads `<side> · <keys>` (`main · ⌘V`, `PR · before`), so a frame is
  understood alone, opened from the comment on a phone.

Each frame is taken after two animation frames and after a wait of 300 ms once per phase, before
its first theme's frame. The tag list of #274 appeared in a frame taken after about 60 ms, and the
PR's own spec waits 300 ms before it reads a suggester's absence, so a frame that must show its
absence waits as long. The second theme's frame follows the first without another wait. Light and
dark are the `theme-light` and `theme-dark` classes on `body`, which the suite's `setTheme`
already toggles and which repaints without touching the editor's state. The theme goes back to
light after each phase.

The badge sits in the strip under the content, over the footer's title. On a note taller than the
view it covers the last line. The measured cases are short, and a case file of a tall note is
unusual; the cost is accepted, and moving the badge is a change to one constant.

### D3. The PR side is the merge, and the base is laid under its harness

Each waiting PR predates the runner (13, 10 and 10 commits behind `main`), and `refs/pull/<n>/merge`
is only current when it is computed at the `pull_request` event. The `pull_request` event's
default checkout is that merge, which is what `ci.yml` tests, so the **PR side is the checked-out
merge** and needs no step of its own.

The **base side is the merge's first parent**, which for a test merge is the base branch's tip at
the event. Its worktree (`git worktree add`, with `node_modules` linked) has `e2e-tests/`,
`scripts/` and `test-vault/` from the merge copied over it. The base is then the merge's product
with the merge's harness: the case files, the arranging, the keys, the state read and the recorder
are the same bytes on both sides, and only `src/`, `styles/` and `manifest.json` differ.

Alternatives:

- **Swap `src/` and `styles/` in the merge checkout** (`git checkout <base> -- src styles`). It
  needs no worktree, and it overwrites a developer's uncommitted edits when the command is run
  locally, which it should be.
- **Run the base with its own harness.** It lacks the recorder until this change lands on `main`,
  and afterwards differs from the PR's harness whenever a PR changes the harness, so the two
  sides would stop being comparable exactly when a PR changes how a case is read.

A case that needs a product probe the base lacks (#311 adds `zoomState()` to `src/`) cannot arrange
on the base; that side records why and the other side runs (spec, "Each case runs on the base…").

### D4. Evidence is a mode of the case spec

`TO_CASE_EVIDENCE=<dir>` and `TO_EVIDENCE_SIDE=<side>` make `98-drawn-cases.e2e.ts` register, for
each case file, a case that arranges, presses and reads through the same functions and hands each
state to the recorder, in place of the case that compares. The spec passes its own `arrange`
to the recorder's loop, so the recorder holds no arranging of its own and #311's arranging of
folds and zoom, which edits that function, reaches it.

Alternatives:

- **A spec of its own.** A spec file is one Obsidian launch per CI job whatever it holds. In the
  `drawn-cases` job, whose one spec is a couple of seconds of cases after an Obsidian launch, a
  skipped second spec would add a launch to every run of every PR.
- **`--record`.** It writes a case file with results filled in; evidence needs the drawn state,
  the differences from `expected`, and frames, per phase, and it must not stop where a case stops.

The evidence case differs from the comparing one in one way: `compareState` decides, and
its result is recorded rather than thrown. It presses every phase even after a difference. A phase
that follows a difference is pressed from the state the app is in, which is what a tester with the
beta would see after the same keys.

The spec's second `describe`, which checks the state helper against arranged states, gains
a check of the recorder against a scratch note: the frames of a static screen, the drawn caret, and
a record for a case that differs.

### D5. The drawn state decides, the frame shows

A side's verdict is the recorded differences: none (matches the drawing), or the parts
(`text`, `caret`, `selection`, `block selection`) of the first phase that differs and the phases
after it that do. Two frames of one state differed by bytes in 5 of 32 measured pairs and looked
the same, so no verdict rests on a frame, and no frame is compared with another. The same functions
draw the state for the comment as for a failing case, so a drawn column in the comment is the one a
failing run prints.

### D6. One image per case, platform and theme, stitched without a dependency

The comment needs the two sides side by side, and a table of individual frames would put
`(phases + 1) × 4` images in the comment for a case, per platform, and hundreds of assets on a
beta for a PR with a few cases. The publish job stitches the frames into a sheet: the base's in a
left column, the PR's in a right one, a row per phase, a few pixels of gutter.

Stitching needs a PNG codec. Chromium's frames are non-interlaced 8-bit RGBA, and Node's `zlib`
inflates the data and computes the checksums (`zlib.crc32`, Node 22.2 and later), so a decoder
that undoes the five row filters, and an encoder that writes every row unfiltered, is a short
module with no dependency. Its unit test round-trips synthetic images and reads two of the
prototype's frames.

Alternatives:

- **A canvas in Obsidian's page,** run after both sides. It ties the sides' order and needs
  Obsidian in the publish job.
- **ImageMagick or `sharp`.** The first is a step the cloud session lacks and the second is a
  dependency with a native build, for a rectangle copy.
- **A Markdown table of frames.** Simple, and it fills the comment's 65,536 characters at about
  nine cases and puts the base and the PR in half-width columns on a phone.

The sheet is 2 × 680 px wide on desktop and 2 × 390 px on mobile, and GitHub shrinks it to the
page. The captions are inside the frames for that reason: tapping the image opens it whole.

### D7. Attached to the beta, after it exists

The images and `evidence.json` are uploaded to the PR's prerelease with `gh release upload`, named
`evidence-<platform>-<theme>-<case>.png`. Retention comes with the beta:
`scripts/beta-cleanup.ts` drops a PR's older betas on each push and all of them on close, and the
assets go with them. The comment is rewritten on every push and links the newest.

The jobs for one push run beside `publish`, and the publish-evidence job `needs` it, so the release
exists unless `publish` failed or found it existing already, in which case it exists too. The
workflow's `concurrency` group cancels a superseded push's jobs.

BRAT installs the assets it names, `main.js`, `manifest.json` and `styles.css`, and we assume it
ignores the others; the first beta with evidence attached is installed once to confirm it.

### D8. One sticky comment

A comment carries a marker, `<!-- case-evidence -->`, and the job looks a PR's comments up for it,
patching the one it finds and creating one if none. For each case and platform it shows a verdict
per side, the drawn states (`before`, `expected`, the base's, the PR's, per phase, as the notation
draws them, in the GitHub-safe block form `layout.ts` prints) and a `<picture>` whose dark source
is the dark sheet, so a reader sees their own theme with the other linked.

A comment is limited to 65,536 characters. The renderer adds cases in file order while the running
length stays under a budget below that, and lists the rest as a row each with verdicts and links.
The fixed closing line states what a run does not cover: a pointer gesture and the phone's own
app.

The verdict's wording is the decision aid: `matches the drawing`, or `differs in caret after ↑`,
for each side. Where the base differs and the PR matches, the case tells the two apart; where they
match each other, the case does not discriminate, and the reading-view frames of #270's case 4 were
that (`docs/research/case-evidence`).

### D9. No stack on #310 or #311

`git diff --name-only main...<branch>` for #310 and #311 lists documents, OpenSpec artifacts and a
research note; neither has code yet, and the file they share with this change is
`docs/research/index.md`, which merges by union. Their proposals say they will edit
`98-drawn-cases.e2e.ts`, `cases.ts`, `case-report.ts` and `wdio.shared.mts`; this change adds a
branch to the first and touches none of the others. Reading what each adds:

- **#307 known-failing cases.** A marked case whose `expected` is unmet is what the evidence
  shows: its sides are recorded, not judged, so the marker does not change a verdict here. The
  file counts as a case file like any other.
- **#308 folded and zoomed outlines.** The recorder reads through `readEditorState` and
  `drawState` and arranges through the spec's `arrange`, so the marks and the arranging arrive
  with #311 without work here, and a frame shows a fold or a zoom whether or not the notation can
  draw it.

The mechanical test in CLAUDE.md, overlapping files, lists the 98 spec once #311 or #310 has code.
It settles nothing today. The maintainers can stack this change on either; the reading above is
that neither is needed.

### D10. The jobs

In `beta.yml`, three jobs after the existing ones:

1. **scope**: the same `if` as `publish` (dependabot and forks left out). `gh api
   repos/{owner}/{repo}/pulls/{n}/files --paginate` lists the files; those under `e2e-tests/cases/`
   ending in `.case`, whose status is not `removed` and not a rename that changed nothing, are
   the output. No files means every later job is skipped, except the note that replaces an existing
   comment.
2. **evidence** (matrix: desktop, mobile): `ubuntu-latest`, the merge checkout with two commits of
   history, the Node and Obsidian cache steps of `.github/actions/e2e`, and one command under
   `xvfb-run`: `node scripts/case-evidence.ts run --platform <p> <files>`, which runs the PR side
   and then the base side and leaves records and frames in a directory that is uploaded as an
   artifact. A job's failure is its own.
3. **publish-evidence**: `ubuntu-slim`, `needs` the beta's `publish`, the scope and both legs, and
   `if: !cancelled()` so a leg that failed does not withhold the other's evidence. It downloads
   the artifacts, stitches, waits up to five minutes for the release, uploads, and writes the
   comment. Its permissions are `contents: write` and `pull-requests: write`.

The `drawn-cases` job in `ci.yml` is untouched, and the jobs are not among the checks the
`e2e-*-passed` gates read.

The steps duplicate about twenty lines of `.github/actions/e2e`, whose action runs a group of
specs. A parameter on that action that swaps its command would remove them and put the evidence
in the path of every e2e job's definition, which the change does not need.

### D11. One command

`node scripts/case-evidence.ts` has four subcommands, and the workflow calls no other code:

- `files`: the case files a PR carries, from the API's listing or from `git diff` against a base
  ref, for a session.
- `run --platform <p> [--side head|base] <files>`: one platform, both sides or the one named; the
  base worktree is created and removed by the command.
- `render <dir>`: the sheets, `evidence.json` and the comment's Markdown, from the records.
- `comment`: finds and updates the sticky comment, and replaces it with the note when no case is
  covered. The comment write is the only step that needs a token.

A session runs `run` and `render` locally and reads the comment before it exists.

## Risks / Trade-offs

- **A frame's badge covers the footer's title, and a tall note's last line** → the measured cases
  are short; D2 names the constant to move.
- **A comment image is a release asset URL, which redirects** → GitHub's image proxy follows
  redirects for release assets as far as we know; the first pushed checkpoint's comment shows it,
  and the fallback is the sheets linked as files.
- **BRAT might list or fetch the extra assets** → D7's one install.
- **The evidence runs on installer 1.5.8's Chrome 120**, the suite's default. It is what the
  suite tests, and the comment names the versions.
- **The caret's column disagrees with a drawing, and the comment says so on a PR whose fix is
  right** (#274's three) → the verdict names the part and the phase and draws both carets, and the
  decision is the reader's. It is the finding the evidence is for.
- **⌘ is Ctrl on Linux** and a drawing made on macOS can differ by key (#115 in
  `docs/research/drawn-case-files`) → the verdict says `differs`, the drawn columns show how, and
  the run's platform is in the comment.
- **A PR that edits `beta.yml`** runs its own version, as any workflow does. No mitigation.
- **The base cannot build** (a PR that stacks on an unmerged layer has that layer as its base) →
  the side records the failure, and the PR's column is shown alone.
- **Cost is unmeasured in CI.** In the cloud session a narrow run of a PR's cases took 11 to 15 s
  without frames and 18 to 22 s with them, launch included, and a cold first run 47 s. Two runs a
  leg, both legs in parallel; the first pushed checkpoint's job times are the figure.
- **Twenty-odd cases in one PR** → the runs take a second or two each, and the comment's size budget
  cuts the drawn states and keeps every verdict.
- **Frames are deleted with the beta**, so the evidence of a merged PR is gone from its page. The
  drawn states in the comment stay.

## Open Questions

- Whether a case file a PR changes in an existing spec's group (not only its own) should count
  when the change is to the file's `expected`. This change counts every changed case file.
- Whether the comment should carry a badge for a known-failing case once #310 lands. The
  verdicts already say `differs` for each side, so the answer can wait for the first such PR.
