# What the rendered editor lets us observe

Why the manual pass gates most fixes, what reaches it that the harness misses, and how much of
the rendered editor an automated run can read. Measured on 2026-09-28 in a Claude cloud session
on `main` at `94306c8`: Obsidian 1.13.7 on installer 1.5.8 (Chrome 120.0.6099.283), under Xvfb,
4 vCPUs, software rendering, a 1024×800 window at device pixel ratio 1.

The short answer is that a cloud session sees nearly everything a tester looks at: the painted
caret, scroll position frame by frame, every painted frame, input latency per keystroke, IME
composition, and screenshots it can read itself. What it cannot see is the real mobile app, an
operating system's input method, and how the editor feels to use.

## What reaches the manual pass

Read from the tracker and the PR history (79 issues from #115 on, 180 PRs) and the notes that
predate the tracker:

- 19 of the 61 bug issues came from manual or real-vault use, and 2 more were split from such a
  finding. Property tests, fuzzers and sweeps found 9, almost all in text or structure.
- About 23 of the 55 product-fix PRs started from manual or real-vault use. Before the tracker
  existed, those finds were mostly visual: decoration geometry in about 16 PRs, the drawn caret in
  #63, #128 and #140, focus in #25, #32 and #69/#71, flicker in #148, scroll in #143 and the fold
  jump, themes in #80 and #118.
- 29 issues and PRs say the carets they draw were not measured. The tester checks values the
  author predicted.
- Twice, in #28 and #31, a misdiagnosis ran for several rounds because the harness and the tester
  ran different Obsidian builds. In `docs/research/open-questions` Q27, Home never reached the
  plugin on the tester's build, and 5 of 8 Home tests still passed with Home unbound.
- About 15 to 19 changes failed more than one manual round; about 7 of them were fix PRs.
- 12 PRs since #132 carry a manual-test section, with a median of about 33 lines of drawn cases.
- A report reaches the repository through the agent that received it, in chat. GitHub holds the
  paraphrase.

The notes say the same thing from the inside. `outline-decorations-postmortem.md` records 198
unit and 33 e2e tests green on a visibly broken feature; every one of experiment 5b's eight bugs
was caught by a person looking at a screenshot (`experiment-5-block-markers.md`); the synthetic
corpus "missed all three real bugs" (`decoration-lessons.md`).

## What the harness reads today

- **Document and selection** from CodeMirror state: `getBuffer`, `getCursor`, `getSelection`.
- **Geometry** from `getBoundingClientRect`, `Range.getClientRects` and `coordsAtPos`, asserted
  as relationships with tolerances (`56-list-grid`, `63-selection-visual-treatment`); computed
  style, pseudo-elements included; hit-testing with `elementFromPoint` in a few specs.
- **DOM text baselines**, 100 files under `e2e-tests/baselines/decorations/`: what the layer
  decides, not how it renders.
- **Screenshots**, saved by capture passes for a person to look at and never compared. CI uploads
  only failure screenshots.
- **Scroll**, asserted in three specs (`80`, `81`, `51`). No spec checks that a keystroke leaves
  the scroll alone.
- **Touch**, as `TouchEvent`s dispatched in the page. **IME**, not at all.

## Measurements

| Probe | Result |
| --- | --- |
| Narrow run of `00-smoke` (`start-xvfb-and-run.sh npm run test:e2e:narrow`) | 40 s in all, 21 s inside the spec |
| `browser.saveScreenshot`, whole window / one element | 68 ms / 100 ms; ten `takeScreenshot` calls in 594 ms |
| One Obsidian kept running, driven over the DevTools protocol | about 5 ms per key or evaluation, 42–49 ms per screenshot |
| `node scripts/build.ts production --dev`, then hot reload into the running app | 0.24 s, then 0.73 s until the new build stamp showed |
| Painted caret (the DOM selection's rect) against `coordsAtPos(head)` | equal in all three readings, to the hundredth of a pixel |
| Eight screenshots of a static screen, 150 ms apart | two distinct images, 3 and 5: the caret's blink |
| An rAF sampler on `scrollDOM.scrollTop` | 36 samples over a caret move and two keys; the move's scroll landed in one frame, 0 to 963 |
| Layout Instability API (`layout-shift`) | works; each entry names the node that moved and by how much |
| Event Timing API (`event`) | works; per-keystroke processing time, see below |
| `Input.imeSetComposition` over the DevTools protocol | a full composition session through Chromium's own path, see below |
| `Page.startScreencast` | caught a flash that lasted one frame (16.7 ms), see below |
| A wdio session's capabilities | carry `goog:chromeOptions.debuggerAddress`; `browser.getPuppeteer()` wants `puppeteer-core` installed; both ways in are measured under "From inside a spec" |

### The painted caret

Obsidian draws the browser's native caret; `.cm-cursorLayer` stays empty. The DOM selection's
rect is therefore the painted caret, and it agreed with `coordsAtPos(head)` in every reading, as
it did in the eight readings `decoration-follow-ups.md` records. What `coordsAtPos` does not say
is whether the caret can be seen: #128's caret was placed right and clipped by an
`overflow: hidden` box. `elementFromPoint` at the caret's centre, and the caret's rect against
the scroller's, answer that.

The blink is a problem for anything that compares pixels. Three of eight screenshots of an
unchanged screen had no caret. A pixel comparison needs the native caret hidden
(`caret-color: transparent`) and, where the caret matters, one drawn from the measured rect.

### Every painted frame

`Page.startScreencast` sends a frame only when the screen changes. Over one second with nothing
else happening, a line's background was set red for exactly one animation frame (16.7 ms): the
screencast delivered five frames, and the red one was among them. A flicker therefore shows up
as a frame sequence A, B, A where one repaint was expected. `open-questions.md` Q32 left #148's
residual flicker to the reporter because an rAF counter "cannot distinguish painted from about to
paint"; the screencast reports painted frames.

### IME composition

`docs/research/open-questions` (IME non-interference) and `experiment-5-block-markers.md` record
composition as out of the harness's reach. Over the DevTools protocol, with the caret at the end
of `\t\t- delta`, `Input.imeSetComposition` with `k`, `ka` and `かき`, then `Input.insertText`
with `柿`, produced `compositionstart`, four `compositionupdate`s each followed by a
`beforeinput` of type `insertCompositionText`, and `compositionend`; the line read back from the
state as `\t\t- delta柿`. An operating system's input method is still out of reach, and so is the
`keydown` (key code 229) one sends first, which is where #147 loses its keystroke. #284 carries
the details.

### Input latency

The Event Timing API gives each keydown's processing time. Over 24 structural keystrokes on a
nine-line outline, the median was 62 ms with outline mode on and 11 ms with it off; a production
build read 73 ms. A CPU profile puts about 40 ms of each keystroke in three layout reads made
synchronously inside the decorations' `docViewUpdate`. The figures are the VM's, not a real
machine's; #283 carries the profile and a way to measure on real hardware.

### What a model reads off a screenshot

A fresh agent, told only that some bullets might be shifted, judged eight shuffled screenshots of
one outline with the level-2 bullets moved 0, 1, 2 or 4 px, four at 1× and four as 3× crops.

| Shift | 1× | 3× crop |
| --- | --- | --- |
| 0 px | none seen | "about 1 px left", 50% |
| 1 px | missed | missed |
| 2 px | missed | "about 1 px right", 50% |
| 4 px | "about 2 px right", 60% | "about 3 px right", 80% |

It read the caret's line and character (`le┃eks`) correctly in all five shots where the caret
was visible. A model is reliable for where the caret is and for breakage of several pixels or
more: a missing bullet, an overlap, clipped text. Alignment to a pixel stays with measurement.

### Coverage the harness does not have

- **Installer.** `wdio.conf.mts` asks for `installerVersion: 'earliest'`, which is 1.5.8 and
  Chrome 120. The 1.13.7 installer ships Electron 43 and Chrome 150, which is what a fresh install
  runs.
- **Android.** `obsidian-launcher download apk` fetches the mobile app, and
  `wdio-obsidian-service` documents running specs on it through Appium and an Android virtual
  device. The emulator needs KVM: the cloud VM has no `/dev/kvm` and no `vmx`/`svm` CPU flags,
  while GitHub's hosted Linux runners provide it.
- **iOS.** The app is distributed through the App Store only, so no simulator build exists to
  drive.
- **WebKit.** The VM's Playwright cache holds Chromium and its headless shell only.
- **Video.** Playwright's bundled ffmpeg has no capture device (`-devices` lists none); frames
  come from screenshots or the screencast.

## What this makes possible

Grouped by the job it takes off the tester: reading a case, installing a build, looking for
what is wrong, and reporting it back.

### Measuring what nobody measures today

- **Ambient invariants.** Monitors installed in a global `beforeEach` and checked in `afterEach`,
  so every existing case contributes: the painted caret equals `coordsAtPos(head)` and can be
  seen; no scroll jump while the caret stays in view; every rendered line on the grid
  (`contentLeft + depth × unit + gutter`), continuation lines included; no layout shift on lines
  the edit did not touch; the height map round-trips (today only in spec 59); no uncaught error;
  no refusal notice a case did not expect (`refused-commands-in-e2e.md` asks for this one).
  Report-only at first, with a per-case opt-out that names its reason.
- **The same monitors in a beta build**, so every beta in use collects violations with the state
  attached.
- **Ink probes.** A 2–3× crop of a mark, the bounding box of its non-background pixels, compared
  against the column. It measures the ink rather than the wrapper, which is what
  `experiment-position-indicators.md` found a test must do after one reported 0.0 px error on
  broken output.
- **Flicker** from the screencast's frame sequence, **latency** from Event Timing per case,
  **IME** from `Input.imeSetComposition` (#284), **touch** from `Input.dispatchTouchEvent` in the
  mobile run in place of in-page events.

### Evidence in place of installs

- **An evidence pack per PR.** The PR's cases run on `main` and on the head, desktop and mobile,
  light and dark, one frame per key with the key captioned and the caret drawn from its rect.
  The frames are uploaded to the PR's beta prerelease and linked from the PR. Draft #90's capture
  spec and encoder already turn frames into clips.
- **A screenshot gallery** of the decoration fixtures, compared inside the Linux container only,
  where fonts do not move, and posted as the images that changed.
- **A playground per PR**, built on draft #89's in-browser editor, with the cases preloaded and
  reachable from a phone's browser. The editor there is not Obsidian; it serves as a first look.

### Cases that run in both directions

- **Drawn case files.** `layout.mjs` already reads a machine format; a keys line and a runner
  make the drawings executable, and the runner prints the actual column from the real app. The
  reverse, state to drawing, takes a few lines: the caret inserted at `head`, piped through
  `layout.mjs`. An issue's repro then runs as written, a bug's first step is the real rendering
  put to the reporter, and a PR's manual cases carry measured carets.
- **A recorder in beta builds.** A ring buffer of input events, transactions, selection and
  scroll, exported with the drawn before and after, and replayed by the harness. The stats ring
  buffer already holds 200 transactions' classes and timings without their state.
- **A tester plugin**, outside the community directory since it downloads and runs builds: it
  lists the PR betas, installs one and reloads, loads the PR's cases into scratch notes, and
  attaches the recorder's trace to a failure. It runs on a phone too.

### Agents that look at the app

- **A driver** for one Obsidian kept running: keys, text, evaluation, screenshots, state. An edit
  reaches the screen in about a second, where a narrow run takes 40.
- **A second pass by a fresh agent** that varies the cases against the driver and returns what it
  finds as case files.
- **Vision review** of evidence frames for what a model reads reliably: caret placement and
  breakage of several pixels.

### Generated input

- **Model-based runs in the real app.** fast-check commands as real keys, paste, fold and
  composition over `arbTree` documents, with the ambient invariants checked after every step and
  metamorphic checks between steps: Tab then Shift+Tab restores the text, the caret's pixel and
  the scroll; undo restores the caret and the scroll. Nightly, with failures written out as case
  files.
- **Real corpora.** A public vault of real notes in CI, and a maintainer's own vault run locally,
  which is the real-vault pass the notes keep returning to, automated.
- **Model-written notes** in the shapes that broke before: tables under lists, callouts, block
  ids, ordered runs across a digit boundary, wrapped paragraphs, right-to-left and CJK text.

### Coverage

A job on the latest installer and on the Obsidian version the tester runs; a sweep over community
themes (`obsidian-launcher` installs them by name), zoom levels, readable line length and narrow
windows; Android through Appium on a hosted runner; a macOS leg.

### Process

The manual pass required by risk, read from the paths a change touches, rather than for every
`feat` and `fix`; one beta combining every PR that awaits a pass, with a failure bisected across
them through the case files; the reproduction confirmed at the start of a fix rather than at its
end.

## Where each runs

| | Effort | Cloud session | CI | Only on a tester's machine |
| --- | --- | --- | --- | --- |
| Ambient invariants, flicker, latency, IME, touch | small to medium | yes | yes | – |
| Ink probes, screenshot gallery | medium | yes | yes, in the container | – |
| Case files, driver, second-pass agent | small to medium | yes | yes | – |
| Evidence pack | medium | yes, with ffmpeg added to the setup script | yes | – |
| Playground | medium to large | yes | Pages | a phone's browser |
| Monitors in betas, recorder, tester plugin | medium to large | – | – | desktop and phone |
| Model-based runs | medium to large | yes | nightly | – |
| Real corpora | small to medium | a public vault | yes | a private vault |
| Installer, version and theme sweeps | small | yes | weekly | – |
| Android | a spike | no | yes | yes |
| iOS app | not possible | – | – | – |
| macOS | small | no | yes | yes |

## From inside a spec

Measured on 2026-09-28 in the same cloud session, on `main` at `685d3f8`, from a probe spec run
under `npm run test:e2e:narrow`, once on the desktop config and once under mobile emulation. The
probes are in `docs/research/prototypes/cdp-in-a-spec/`. Each figure is one reading from a fresh
session, the first of its kind in that session, so it does not compare one-for-one with the
warm readings in the table above.

| Reading | Desktop | Mobile emulation |
| --- | --- | --- |
| Page targets in `http://<debuggerAddress>/json` | 1 | 1 |
| `browser.getWindowHandle()` against that target's `id` | equal | equal |
| Node's global `WebSocket` (Node 22.22.2) | present | present |
| `/json` request | 7.3 ms | 7.9 ms |
| WebSocket open | 6.8 ms | 5.0 ms |
| `Runtime.evaluate` of the viewport | 4.7 ms: 1024×800, device pixel ratio 1, no touch points, `document.hasFocus()` true | 17.1 ms: 390×844, device pixel ratio 1, one touch point, `document.hasFocus()` true |
| `Input.dispatchKeyEvent` down and up for `x` | 31.4 ms; `- b` read back as `- bx` | 35.3 ms; the same |
| `Page.captureScreenshot`, whole page | 95 ms, 1024×800 | 62.8 ms, 390×844 |
| The same with `clip` 200×100 at `scale: 2` | 36.1 ms, 400×200 | 63.5 ms, 400×200 |
| `Runtime.enable`, then a `console.log` from a WebDriver script | events arrived | events arrived |
| WebDriver commands with the socket open, and after it closed | both answered | both answered |
| Socket close | 2.4 ms | 2.2 ms |

- **The window handle is the target id.** WebDriver's handle for the session's one window equals
  the `id` of its page target, so a spec picks its own page without guessing which target is it.
  It needs no `CDwindow-` prefix removed here.
- **Emulation reaches the second client.** Under mobile emulation the socket reads a 390×844
  viewport with one touch point, and a screenshot through it is 390×844. The emulation applies to
  the page, not only to the session chromedriver holds.
- **A reload changes both the address and the handle.** Under mobile emulation, after
  `browser.reloadObsidian()` the capabilities read `localhost:40769` where they had read
  `localhost:43987`, and the handle changed with the target. `/json` listed only the new page.
  Neither value survives a reload, so neither can be read once and kept.
- **`puppeteer-core` works and costs more.** Under mobile emulation, `browser.getPuppeteer()`
  connected in 133 ms once `puppeteer-core@24` was installed, read the page's own viewport
  (`viewport()` was `null`, so it applied no override), and screenshotted it at 390×844 in 54 ms.
  The 133 ms is the whole call, module load and target discovery included, where the raw socket's
  5.0 ms in the table is the open alone; the two come from different probe files. The install
  added 7 packages, removed 2 and changed 11, and `npm view` puts `puppeteer-core` at about 8.9 MB
  unpacked; the raw socket adds nothing.

The launcher's starter, `sh e2e-tests/docker/start-xvfb-and-run.sh`, leaves Xvfb running after the
command it wraps has finished, holding whatever stdout it was started with. Piped into `tail`, the
first probe run returned no output for 400 s after its results had been written, and finished only
when Xvfb was killed by hand. Redirecting the output to a file avoids it.

## Re-running the probes

The app, launched with a debugging port on a copy of the test vault:

```bash
cp -r test-vault "$SCRATCH/vault"
Xvfb :77 -screen 0 1280x900x24 &
DISPLAY=:77 npx obsidian-launcher launch -c /opt/obsidian-cache "$SCRATCH/vault" -- \
  --remote-debugging-port=9333 --no-sandbox &
```

Node 22's global `WebSocket` is enough to drive it. The page target comes from
`http://127.0.0.1:9333/json`; each command is one message.

```js
const [page] = (await (await fetch('http://127.0.0.1:9333/json')).json()).filter((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
// Runtime.evaluate { expression, awaitPromise: true, returnByValue: true }
// Input.dispatchKeyEvent { type: 'rawKeyDown' | 'keyUp', key, code, windowsVirtualKeyCode, modifiers }
// Input.insertText { text }, Input.imeSetComposition { text, selectionStart, selectionEnd }
// Page.captureScreenshot { format: 'png', clip: { x, y, width, height, scale } }
// Page.startScreencast { format: 'png', everyNthFrame: 1 }, acknowledging each frame
// Profiler.start / Profiler.stop, for a CPU profile
```

The readings themselves are page scripts:

```js
// The painted caret, against CodeMirror's reading
const cm = app.workspace.activeEditor.editor.cm;
const painted = getSelection().getRangeAt(0).getClientRects()[0];
const logical = cm.coordsAtPos(cm.state.selection.main.head);

// Scroll, every frame
const samples = [];
const tick = () => { samples.push(cm.scrollDOM.scrollTop); requestAnimationFrame(tick); };
requestAnimationFrame(tick);

// Keydown processing time
new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === 'keydown')
  console.log(e.processingEnd - e.processingStart); }).observe({ type: 'event', durationThreshold: 16 });
```

Inside a spec, the same endpoint is `browser.capabilities['goog:chromeOptions'].debuggerAddress`.
