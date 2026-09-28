# Proposal

## Why

Obsidian is two versions: the app bundle and the installer, which fixes Electron and so the Chrome
that renders the editor. The harness pins the installer to `'earliest'`, which for app 1.13.7 is
installer 1.5.8 with Chrome 120; a fresh install of 1.13.7 runs Chrome 150 (`docs/research/e2e-runtime-versions`,
"What `'earliest'` resolves to"). Nothing runs the suite on the newer one, and neither a CI job nor a
tester's report says which installer it ran on. Version skew between harness and tester has already
cost several rounds of misdiagnosis twice (`docs/research/open-questions` Q21, Q27), and the target
banner that came out of it names the app but not the installer
([#291](https://github.com/laughedelic/obsidian-true-outliner/issues/291), under
[#297](https://github.com/laughedelic/obsidian-true-outliner/issues/297)).

## What Changes

- `OBSIDIAN_INSTALLER_VERSION` selects the installer for both e2e configs, read the way
  `OBSIDIAN_VERSION` is: blank is unset, the default stays the oldest compatible installer, and a
  value the launcher cannot resolve fails before any Obsidian starts.
- Every run writes the build it resolved (app, installer, Electron, Chrome) to
  `.obsidian-cache/e2e-target.json`, and the target banner and each e2e job's step-summary row
  read from it. The row names the installer and its Chrome as well as the app, resolved rather than
  as requested (`latest` becomes a version number).
- A workflow runs both platforms and every group on the newest installer weekly and on
  `workflow_dispatch`, with dispatch inputs for the app and installer versions. It does not gate
  pull requests.
- The dev build's status-bar stamp names the app version and the Electron and Chrome versions
  where the platform exposes them, in the item's text so a screenshot carries them. Mobile names
  what it can read and says so when it can read nothing further.
- Title prefix: `fix`. The stamp is dev-build UI, so a release build behaves as before, but the
  change edits `src/` and `scripts/check-landed.ts` treats that as shipping: it takes a patch bump
  (`docs/research/e2e-runtime-versions`, "Which prefix"). `feat` would spend a minor version on
  a surface no user sees; `chore` would pass the check unbumped and ship a changed `main.js` under
  the previous version number.

## Non-goals

- Running Obsidian betas in CI. The workflow holds no Catalyst credentials, so the app version it
  runs is public; a beta's versions reach a report through the stamp instead.
- Making the default installer the newest one. Pull requests keep the oldest compatible installer,
  the floor of what a user can have; the newest runs beside it.
- Reading the versions on a real mobile device. The stamp reads what a mobile WebView exposes; what
  a phone actually exposes is unmeasured here.
- A failure notification for the scheduled run beyond what GitHub sends for a failed workflow.
- Putting the versions in the release build, which stays free of dev UI.

## Capabilities

### New Capabilities

### Modified Capabilities

- `e2e-verification`: the installer is selectable by environment variable, every run records the
  build it resolved, and a scheduled run exercises the newest installer.
- `plugin-shell`: a dev build's status-bar stamp names the runtime it runs on; a release build
  carries no stamp.

## Impact

- `e2e-tests/obsidian-target.mts`, `e2e-tests/wdio.conf.mts`, `e2e-tests/wdio.mobile-emulation.conf.mts`,
  `e2e-tests/wdio.shared.mts` and `e2e-tests/docker/docker-compose.yml` for the override and the
  record.
- `.github/actions/e2e/action.yml` for the input, the cache key and the summary row; a new
  `.github/workflows/newest-installer.yml`.
- `src/plugin/main.ts` and a new pure module beside it for the stamp; `manifest.json`,
  `versions.json`, `package.json` and `package-lock.json` for the patch bump.
- `docs/research/e2e-runtime-versions.md` and its row in `docs/research/index.md`.
