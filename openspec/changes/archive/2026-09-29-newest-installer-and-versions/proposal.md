# Proposal

## Why

Obsidian is two versions: the app bundle and the installer, which fixes Electron and so the Chrome
that renders the editor. The harness pins the installer to `'earliest'`, which for app 1.13.7 is
installer 1.5.8 with Chrome 120; a fresh install of 1.13.7 runs Chrome 150 (`docs/research/e2e-runtime-versions`,
"What `'earliest'` resolves to"). Nothing runs the suite on the newer one, and neither a CI job nor
a tester's report says which installer it ran on. Version skew between harness and tester has already
cost several rounds of misdiagnosis twice (`docs/research/open-questions` Q21, Q27), and the target
banner that came out of it names the app but not the installer
([#291](https://github.com/laughedelic/obsidian-true-outliner/issues/291), under
[#297](https://github.com/laughedelic/obsidian-true-outliner/issues/297)).

## What Changes

- `OBSIDIAN_INSTALLER_VERSION` selects the installer for both e2e configs, read the way
  `OBSIDIAN_VERSION` is: blank is unset, and a value the launcher cannot resolve fails before any
  Obsidian starts. The default stays the oldest compatible installer, for local runs and pull
  requests alike.
- Every run writes the build it resolved (app, installer, Electron, Chrome) to
  `.obsidian-cache/e2e-target.json`, and the target banner and each e2e job's step-summary row
  read from it. The row names the installer and its Chrome as well as the app, resolved rather than
  as requested (`latest` becomes a version number).
- A workflow runs both platforms and every group on the **newest compatible installer** weekly and
  on `workflow_dispatch`, with dispatch inputs for the app and installer versions. The newest
  installer is what a fresh install runs. The workflow does not gate pull requests.
- A red scheduled run is filed as an issue by the workflow, so it reaches the tracker where
  triage happens instead of an email to whoever last edited the cron line. One issue stays open
  while the run stays red, later runs comment on it, and a green run comments without closing it.
- The dev build's status-bar stamp names the app version and the full Chromium version, in the
  item's text so a screenshot carries them. Both come from APIs the plugin may use
  (`obsidian.apiVersion`, `navigator.userAgentData`): `process.versions` is a Node API and the
  lint bans the user-agent string, so the Electron version is not in the stamp. It is fixed by
  the Chromium version, and the harness's run record carries both
  (`docs/research/e2e-runtime-versions`, "What the plugin may read"). Where the runtime exposes no
  Chromium version, as on iOS, the stamp names the platform and says nothing more.
- Title prefix: `fix`. The stamp is dev-build UI, so a release build behaves as before, but the
  change edits `src/` and `scripts/check-landed.ts` treats that as shipping: it takes a patch bump
  (`docs/research/e2e-runtime-versions`, "Which prefix"). `feat` would spend a minor version on
  a surface no user sees; `chore` would pass the check unbumped and ship a changed `main.js` under
  the previous version number.

## Non-goals

- Running Obsidian betas in CI. The workflow holds no Catalyst credentials, so the app version it
  runs is public; a beta's versions reach a report through the stamp instead.
- Making the newest installer the default. It was tried: pull requests then ran on Chrome 150, and
  the mobile-emulation legs failed intermittently on two gap-click cases
  (`docs/research/e2e-runtime-versions`, "The first full runs on Chrome 150"). The oldest installer
  is also what a long-time user still runs, since Obsidian's auto-update replaces the app and
  leaves the installer alone. A regression only the newest Chrome shows is found up to a week
  after it merges, and a dispatch checks a suspicious change sooner.
- Diagnosing those two cases. The weekly run on the newest installer is where they keep showing.
- Testing old app versions. CI runs the newest public app, so the manifest's `minAppVersion` is
  untested by this change and by today's CI alike.
- Measuring what a real phone exposes. Mobile emulation reports the desktop runtime
  (`docs/research/e2e-runtime-versions`), so the Android and iOS answers stay unmeasured until a
  device reports one.
- Notifying anywhere but the tracker, and closing the issue automatically: a person decides that a
  red run was looked into.
- Putting the versions in the release build, which stays free of dev UI.

## Capabilities

### New Capabilities

### Modified Capabilities

- `e2e-verification`: the installer is selectable by environment variable and defaults to the
  oldest, every run records the build it resolved, and a scheduled run exercises the newest
  compatible installer.
- `plugin-shell`: a dev build's status-bar stamp names the runtime it runs on; a release build
  carries no stamp.

## Impact

- `e2e-tests/obsidian-target.mts`, `e2e-tests/wdio.conf.mts`, `e2e-tests/wdio.mobile-emulation.conf.mts`,
  `e2e-tests/wdio.shared.mts` and `e2e-tests/docker/docker-compose.yml` for the override and the
  record.
- `.github/actions/e2e/action.yml` for the input, the cache key and the summary row; a new
  `.github/workflows/newest-installer.yml` and `scripts/report-scheduled-run.ts`, which files the
  issue.
- `src/plugin/main.ts` and a new pure module beside it for the stamp; `manifest.json`,
  `versions.json`, `package.json` and `package-lock.json` for the patch bump.
- `docs/research/e2e-runtime-versions.md` and its row in `docs/research/index.md`.
