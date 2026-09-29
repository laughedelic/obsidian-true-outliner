# Which Obsidian the e2e suite runs on, and what a running app says about itself

Measured on 2026-09-28 in a Claude cloud session (Linux x64, Xvfb, 4 vCPUs, `E2E_MAX_INSTANCES=2`)
on `main` at `685d3f8`, with the launcher's version metadata dated 2026-09-15. It backs the
`newest-installer-and-versions` change ([#291](https://github.com/laughedelic/obsidian-true-outliner/issues/291),
under [#297](https://github.com/laughedelic/obsidian-true-outliner/issues/297)).

## What `'earliest'` resolves to

Obsidian is two versions: the app bundle, and the installer, which fixes Electron and so Chrome.
Both wdio configs pass `installerVersion: 'earliest'`. Resolved through the launcher's
`resolveVersion` for app 1.13.7, with each installer's Electron and Chrome from `getInstallerInfo`:

| `installerVersion` | Installer | Electron | Chrome |
| --- | --- | --- | --- |
| `earliest` | 1.5.8 | 28.2.3 | 120.0.6099.283 |
| `latest` | 1.13.7 | 43.3.0 | 150.0.7871.212 |

`earliest` is the oldest installer the app supports, so it is the floor of what a user can run;
`latest` is what a fresh install runs. The two differ by fifteen Electron majors. Both are real
users: Obsidian's self-update replaces the app bundle and leaves the installer alone
(`wdio-obsidian-service`'s README, "Obsidian App vs Installer Versions"), so a long-time user runs
the newest app on the installer they first installed. We have no figures for how many that is. The installer
1.13.7 is 339 MB on disk beside 278 MB for 1.5.8, and its chromedriver (Electron 43.3.0) is fetched
on first use.

## Does the suite run on the newer Chrome

Eight spec files chosen for rendering and caret work, each run once under each installer, in this
order, through `npm run test:e2e:narrow` with the installer read from an environment variable
(a throwaway edit, since replaced by the change):

| Spec | Cases | Chrome 120 | Chrome 150 |
| --- | --- | --- | --- |
| `00-smoke` | 3 | pass | pass |
| `50-decorations` | 16 | pass | pass |
| `53-decoration-contracts` | 3 | pass | pass |
| `65-content-space-caret` | 49 | pass | pass |
| `63-selection-visual-treatment` | 22 | pass | pass |
| `93-fold-chrome` | 15 | pass | pass |
| `80-outline-zoom` | 76 | pass | pass |
| `73-footer-render` | 9 | pass | pass |

All 193 cases passed under both, desktop only. The mobile-emulation config was probed, not
swept. Chrome 150 finished each file faster (for example `80-outline-zoom`, 171 s against 114 s of
test time), but each pair ran earliest first on one VM, so the order is not controlled and the
figure is not a claim about Chrome. Eight of 55 spec files is not the suite: whether the whole suite is
green on Chrome 150 is unknown until it runs.

## The first full runs on Chrome 150

The change made the newest installer the default, so CI's matrix (56 spec files, desktop and mobile
emulation, four instances per job) was the first run of the whole suite on Chrome 150. Two commits
of the pull request gave two runs:

| Run | Result |
| --- | --- |
| `b67d393` | 4 jobs red: the `position-indicators` and `selection` groups, on both platforms |
| `9f678cb` | all 38 checks green, with the position-indicator fix below |

- **`position-indicators`, 11 cases, both platforms.** `55-position-indicators.e2e.ts` counted a
  line's guide colours by matching `rgb(…)` and `rgba(…)` in the computed `background-image`. Chrome
  150 writes the translucent grey stop as `color(srgb 0.670588 0.670588 0.670588 / 0.35)`, so the
  count came back one short. The plugin's drawing is unchanged; the spec now reads both spellings.
  Reproduced locally (11 failing on Chrome 150, 33 passing on Chrome 120), and 33 pass on both after
  the change.
- **`selection`, one or two cases per job, different cases on each platform.** Desktop failed a
  table-row Home/End parity case in `66-content-space-caret-manual-pass`. Mobile failed a code-fence
  vertical-motion case in the same spec and a gap-click case in another. It did not reproduce: the
  group passed twice locally at four instances on Chrome 150, and again in the second CI run. We do
  not know why it failed once. If it fails again on either installer it is a defect to diagnose, not
  a flake to re-run.

With the final code, the `selection`, `position-indicators` and `shell` groups also pass on the
oldest installer, locally at four instances. The workflow that runs every group on it cannot be
dispatched before it is on the default branch.

## What a running app says about itself

A probe spec read the renderer through `browser.executeObsidian` and `browser.executeAsync`:

| Source | Desktop, 1.5.8 | Desktop, 1.13.7 | Mobile emulation, 1.13.7 |
| --- | --- | --- | --- |
| `obsidian.apiVersion` | not read | 1.13.7 | 1.13.7 |
| `navigator.userAgentData` brands | Chromium 120 | Chromium 150 | Chromium 150 |
| `getHighEntropyValues(['fullVersionList'])` | 120.0.6099.283 | 150.0.7871.212 | 150.0.7871.212 |
| `userAgentData.mobile` | false | false | false |
| `window.process.versions` | electron 28.2.3, chrome 120.0.6099.283 | electron 43.3.0, chrome 150.0.7871.212 | present |
| `navigator.userAgent` | `obsidian/1.5.8 Chrome/120… Electron/28.2.3` | `obsidian/1.13.7 Chrome/150… Electron/43.3.0` | same |

- `apiVersion` is the app version and is a public export of `obsidian`. The `obsidian/x.y.z` token
  in the user agent is the **installer**, not the app: on the 1.5.8 installer it read 1.5.8 while the
  app was 1.13.7.
- `userAgentData` is present in a secure context (`app://obsidian.md`), and its full version list
  resolves asynchronously. It carries no Electron version.
- Mobile emulation changes the viewport and Obsidian's own platform flags, not the runtime: it reports
  the same desktop `userAgentData` and still has `process.versions`. What a real phone exposes is
  unmeasured. Capacitor's Android WebView is Chromium and should answer `userAgentData`; iOS's is
  WebKit and should not.

### What the plugin may read

`plugin-shell` requires the plugin to use no Node or Electron APIs, so `process.versions` is out.
`eslint-plugin-obsidianmd`'s `platform` rule bans `navigator.userAgent` and `navigator.platform`
(`dist/lib/rules/platform.js`), so the user agent is out. That leaves `apiVersion` for the app and
`userAgentData` for Chromium. The Electron version is therefore not readable from the plugin. It is
determined by the full Chromium version: the launcher's table maps 150.0.7871.212 to Electron
43.3.0, and the harness's run record (which does read the launcher) carries both.

## Which prefix

`scripts/check-landed.ts` counts any file under `src/` or `styles/` as shipping. A `feat` that ships
takes a minor bump, a `fix` at least a patch, and a `chore` takes none, whatever it touches. The
stamp is dev-build UI (`BUILD_STAMP.dev`), so the release bundle behaves as before, but its
`main.js` still differs by the new module. `chore` would merge unversioned and ship a changed bundle
under the previous number; `feat` would spend a minor version on something no user sees. `fix`
fits: the defect is that a report does not say which runtime it was seen on, and it takes a patch.
