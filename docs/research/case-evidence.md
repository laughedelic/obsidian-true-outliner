# Case evidence: what a PR's drawn cases show without a beta install

What the drawn manual-test cases of the three fix PRs waiting on a manual pass (#264, #270, #274)
run to, on `main` and on each PR, and what a painted frame after each key adds to the drawn state.
It is the measurement `openspec/changes/case-evidence-per-pr` starts from, and the input to #296.
Measured on 2026-09-29 in a Claude cloud session on `main` at `a52c495`: Obsidian 1.13.7 on
installer 1.5.8 (Chrome 120.0.6099.283), under Xvfb, 4 vCPUs, software rendering, the desktop
config and mobile emulation. The environment is the one `rendered-ui-observability.md` and
`drawn-case-files.md` describe. The case files, scripts and sample frames are in
`docs/research/prototypes/case-evidence/`.

The short answer is that 9 of the 11 manual steps the three PRs hand a tester run as case files
and show their result in a painted frame, on both platforms and in both themes, without an
install; 8 of the 9 run against a drawing, and the ninth is a control with none. The other two are
drags. The run also found something no manual step asks a tester to look for: three of the carets
#274 draws are not where the app puts them.

## The heads carry no runner

None of the three PR heads contains `scripts/run-case.ts`, `e2e-tests/cases.ts` or
`e2e-tests/cdp.ts`: each branched before #300 and is 13 (#264), 10 (#270) and 10 (#274) commits
behind `main`. Running their cases through the runner therefore takes a merge of `main` into the
head. All three merge cleanly, and `git diff --stat origin/main` of the merge equals each PR's own
diff (7, 13 and 6 files). GitHub's `refs/pull/<n>/merge` does not serve, read some time after a
push: it was computed against `94306c8`, eight commits behind `main`, and lacked the runner too
(132 to 137 files differ from `main`). A merge ref taken at the `pull_request` event is fresh, and is what
`ci.yml` tests.

The heads measured: #264 `008c08e`, #270 `411d534`, #274 `37c0032`. Everything below ran on
`main`'s tree (`a52c495`) for the `main` column and on that tree merged with the head for the PR
column.

## What the drawings hold, and how many run

The three bodies hold 15 drawn blocks: 6 in #264, 4 in #270, 5 in #274. Eleven of the 15 ran as
case files:

| PR | Blocks | Ran | Did not run |
| --- | --- | --- | --- |
| #264 | 6 | 4: the reproduction's paste and cases 1, 2, 4 | the reproduction's drag and case 3, a drag |
| #270 | 4 | 3: cases 1, 3, 4 | case 2, a drag |
| #274 | 5 | 4: the reproduction and cases 1, 2, 3 | a follow-up's drawing of the tag list open after ⇥, whose point is a popup |

Converting them took `layout.ts --read` for the columns and four additions the drawings do not
carry:

- a `keys` line, on all 11. #274 draws a column per key and #264 and #270 name ⌘V in the
  sentence above the block;
- a `before` and the unchanged rows of the result, on #270's cases 3 and 4, which draw only the
  pasted lines and say "the same paste as case 1". A first run of these two failed on text because
  the conversion took the drawn rows for the whole note; the head produced what the PR describes;
- a phase per key group in #274 (`⇧⏎ ⇧⇥ | ↑`), so each drawn column is compared with the state
  after its own keys;
- for #270's control, and for #274's "also with ↓", a case built from the sentence alone, since no
  drawing exists. The control (paste at a lone `- a`) has no result column, and the runner accepts
  such a file only under `--record`: `npm run case` without it refused all four of #270's files
  until the control was left out.

The drawn carets: #264 and #270 draw none in their results ("the caret after each paste was not
measured"), so none of their 7 cases compared a caret. #274 draws 8.

### On the PR's head

| | Desktop | Mobile emulation |
| --- | --- | --- |
| Cases run | 11 | 11 |
| Text matches the drawn result | 11 | 11 |
| Drawn carets that match (of 8, all #274) | 5 | 5 |

The three that differ are the caret after an arrow key, and they are the same on both platforms:
after ↑ in the reproduction and in case 1, and after ↓ in case 2. In each the app puts the caret
at the start of the line where the PR draws its end.

before
```
## Foo┃
body
## Bar
text
```

drawn ⇧⏎ ⇧⇥ ↑
```
## Foo
body┃
## Bar
text
```

measured
```
## Foo
┃body
## Bar
text
```

The PR's own e2e case asserts the line after the arrow and not the column, so nothing before this
run compared the two. The driver (`npm run drive`, which sends keys through `Input.dispatchKeyEvent`
where the runner uses WebDriver) read the same `┃body` on the merged head. The text is right and
the caret is not what is drawn; whether the drawing or the caret is the wrong one is for the
maintainers, and we did not diagnose it.

### On `main`

Every one of the 11 cases differs from the drawn result on `main`, in text, in at least one phase
and on both platforms. The cases tell the two sides apart.

A run that shows only the last key's column would have missed the difference in 2 of #274's 5
cases on desktop: in the reproduction and in case 1, the state after ↑ is the same on `main` and on
the PR, while the state after the keys before it differs. We did not diagnose why the two sides
meet again there. On mobile emulation the last column differs in all five.

## What a painted frame adds

A frame here is a screenshot after `before` and after each key phase, of the note's view only, with
Chromium's own caret hidden and one drawn from the selection's rect, and the phase's keys in a
badge. The prototype (`frames.e2e.ts.txt`) took 336 of them: 12 runs (3 PRs, `main` and the PR,
two platforms), light and dark after each step.

| | Desktop | Mobile emulation |
| --- | --- | --- |
| Frames | 168 | 168 |
| Page-side preparation, median | 26.5 ms | 15 ms |
| `Page.captureScreenshot`, median | 46 ms | 48 ms |
| PNG size, median (largest) | 15.8 kB (20.0 kB) | 17.0 kB (24.8 kB) |
| Region, median | 680 × 281 px | 390 × 402 px |
| Total | 2.6 MB | 2.8 MB |

A whole narrow invocation of a PR's cases took 18.5 to 21.8 s with frames and 11.3 to 15.0 s
without (one run took 18.2 s), each including an Obsidian launch; the runs with frames also took
the static control below.

**The drawn caret is stable and the native one is not.** Eight frames of a static screen, 150 ms
apart, were 1 distinct image with the drawn caret and 2 with the native one, in each of the 12
runs. This is the blink `rendered-ui-observability.md` measured, through the same pipeline.

**The DOM selection's rect is the caret to draw.** Of the 320 frames in an editing view (16 are
reading view), 312 had a DOM rect and 8 had none and used `coordsAtPos`. Where both existed they
agreed to half a pixel in all but 4 frames, the caret after a fold: the DOM rect sat 4.75 px left
of `coordsAtPos` and was 2.9 px shorter, 1.0 px lower at the top and 1.9 px higher at the bottom.
The DOM rect is what Chromium paints; in the fold frame the drawn caret sits against `n`, where
the text ends.

**A hash cannot say two frames are the same.** In 5 of 32 step-0 pairs (`main` and the PR, light
theme, all desktop) the two frames arranged from the same `before` differed by a few bytes and
looked identical. The state, not the pixels, has to decide whether a side differs.

**What the frame shows that the drawn state does not.** Each is a manual step from the PRs:

- #264 case 1, "Two quote rows show in the outline, not one": one quote with two lines on `main`
  ([frame](prototypes/case-evidence/frames/pr264-case1-main.png)), two quote rows on the PR
  ([frame](prototypes/case-evidence/frames/pr264-case1-pr.png)). The drawn state has a blank line
  between two quotes.
- #264 case 4, "Reading view draws `below` inside the quote": `⌘E` reaches the app under the
  runner's keys, reading view is a frame like any other, and `below` sits outside the quote on
  `main` ([frame](prototypes/case-evidence/frames/pr264-case4-reading-main.png)) and inside it on the PR
  ([frame](prototypes/case-evidence/frames/pr264-case4-reading-pr.png)).
- #270 case 1, "fold `- n` and `m` should hide with it": `⌘⌥↑` on `- n` folds it, and the frame
  shows `n … 1` with `m` hidden
  ([frame](prototypes/case-evidence/frames/pr270-fold-pr.png)). A case file cannot yet draw a fold
  (#308), and a frame draws it without any change to the notation.
- #274 case 1, "After ⇧⇥, no tag list opens": the frame after ⇧⏎ ⇧⇥ shows Obsidian's tag list
  open on `main` ([frame](prototypes/case-evidence/frames/pr274-case1-main.png)) and no list on
  the PR ([frame](prototypes/case-evidence/frames/pr274-case1-pr.png)). The frame waited about
  60 ms and two animation frames and still caught it; the PR's own spec waits 300 ms before it
  reads a suggester's absence, which is the wait a frame should use.

The first frame of a case reads as `before` and the last as the drawn `after`, so the frame per
key is also the drawn state's history: in #274 the state between ⇧⇥ and ↑ is a frame of its own.

Two limits of the frame as taken. The badge sits in a strip under the content and covers the
footer's title, and on a note taller than the view it would cover the last line. And the mobile
frame includes the floating view buttons above the note.

## The manual steps, and what covers them

11 steps: #264's 4 cases, #270's 4 steps, #274's 3 cases. "Drawn state" is the runner's text and
caret; "frame" is the painted frame above.

| Step | Drawn state | Frame | Left to a tester |
| --- | --- | --- | --- |
| #264 case 1, a pasted quote keeps the quote below | yes | two quote rows | |
| #264 case 2, a pasted comment over a list | yes | `- x` and `below` are rows of their own | |
| #264 case 3, a dragged child keeps every node below | no: a drag | no | the drag |
| #264 case 4, a flush quote; reading view | yes | outline rows; reading view through `⌘E` | |
| #270 step 1, paste, then fold `- n` | yes | the fold through `⌘⌥↑` | |
| #270 step 2, drag `- p` below `- c` | no: a drag | no | the drag |
| #270 step 3, a quote in reading view | yes | reading view: one quote | |
| #270 step 4, the control paste | recorded, not checked: no drawing | | |
| #274 case 1, ⇧⏎ ⇧⇥ ↑ | text yes; caret differs | no tag list | the caret's column |
| #274 case 2, an empty heading, ⇧⇥ ↓ | text yes; caret differs | | the caret's column |
| #274 case 3, a title's spacing | yes | | |

Eight steps are covered by the drawn state and a frame on both platforms and in both themes. The
two drags are not. The control has no drawing, so the runner records what it did (the clipboard's
text landed as `- p`, a sibling of `- a`, identical on `main` and on the PR) and cannot check it.

What is not covered for any of the 11:

- **Drags.** A case file does not drive a pointer, and neither does the frame. `e2e-tests/dragging.ts`
  drives one in a spec (`81-node-dragging`); the two drag steps would be a spec, not a case file.
- **The phone's own app.** Mobile emulation is the desktop Electron app at a phone's viewport
  (`rendered-ui-observability.md`, "Coverage the harness does not have"). A paste through a phone's
  clipboard, a touch and the on-screen keyboard are not in it, and the three PRs' steps name none.
- **How it feels**, which no run reads.

In `src/`, the three PRs change only `ops.ts`, `parse.ts` and `reencode.ts` (#297). No step of
theirs concerns geometry, focus, scroll or a theme, which are what the manual passes have found
(`rendered-ui-observability.md`, "What reaches the manual pass"). For these three, an install
would add the two drags and the phone's clipboard, and the frames answer the rest before one.

## What the measurements mean for the design

- **The PR side is a merge.** A head lacks the runner, and a merge ref is only fresh at the event.
- **The two sides share one harness.** The cases, the recorder and the notation are the merge's;
  only the product (`src/`, `styles/`) differs between `main` and the PR.
- **A run never fails a case.** `main` differs from the drawn result by design, and the caret
  differs on the PR; the run continues through every key after a difference and records it.
- **The drawn state decides, the frame shows.** Frames are not compared.
- **No clip.** The cases are one to three keys, and the frames tell the same story a clip would.
  What moves (a flicker, a scroll) is read by the monitors and the screencast, not by a clip.
- **Reading view, folds and a popup are reachable by keys**, which the case-file format already
  carries. `⌘E` and `⌘⌥↑` need no format change.

## Re-running

The case files are in `prototypes/case-evidence/cases/`, one directory per PR; `extra/` holds the
three probes for reading view and a fold. The probe spec is `frames.e2e.ts.txt`, copied to
`e2e-tests/specs/99-zz-case-evidence-probe.e2e.ts` in a checkout that carries the runner:

```bash
git worktree add --detach ../wt-264 origin/main && (cd ../wt-264 && git merge --no-edit origin/fix/promoted-paragraph-seam)
# text: pass ("check") or the app's own result ("--record")
npm run case -- docs/research/prototypes/case-evidence/cases/pr264/*.case [--mobile] [--record]
# frames
TO_FRAMES_DIR=$PWD/frames/pr264 TO_FRAMES_SIDE=head TO_CASE_FILES=<files joined by :> E2E_MONITORS=off \
  sh e2e-tests/docker/start-xvfb-and-run.sh npm run test:e2e:narrow -- 99-zz-case-evidence-probe [--mobile]
node docs/research/prototypes/case-evidence/analyze.mjs <root>        # text, head against main against the drawing
node docs/research/prototypes/case-evidence/frame-stats.mjs <root>    # cost, caret source, stability
```

Redirect a run's output to a file, as `docs/cloud-sessions.md` says.
