# Tasks

## 1. The installer override and the run record

- [x] 1.1 Add `obsidian-launcher` to `devDependencies` at the version `wdio-obsidian-service`
      already resolves (`npm install --save-dev obsidian-launcher@3.2.1`). Verify `npm ls
      obsidian-launcher` shows one deduped copy and `npm run typecheck:e2e` passes.
- [x] 1.2 In `e2e-tests/obsidian-target.mts`, add `pinnedInstallerVersion()` (blank is unset), resolve
      the app/installer pair and the installer's Electron and Chrome with the launcher (D1), return
      the installer, and write `e2e-target.json` and the banner from one object (D2). An unknown value
      throws an error naming `OBSIDIAN_INSTALLER_VERSION` and the value. Verify with a vitest file
      over the pure parts (`pinnedInstallerVersion` blank/unset/set, the record's shape) and with
      `OBSIDIAN_INSTALLER_VERSION=nope npm run test:e2e:narrow -- 00-smoke` failing before any window
      opens; negative control: reading the variable without `.trim()` fails the whitespace case.
- [x] 1.3 Use the returned installer in `wdio.conf.mts` and `wdio.mobile-emulation.conf.mts`, add the
      record's path to `resetE2eReports` in `wdio.shared.mts`, and pass `OBSIDIAN_INSTALLER_VERSION`
      through `e2e-tests/docker/docker-compose.yml`. Verify: an unset run's banner and
      `.obsidian-cache/e2e-target.json` name 1.13.7/Chrome 150 and the smoke spec passes on desktop and
      with `--mobile`; an `OBSIDIAN_INSTALLER_VERSION=earliest` run names 1.5.8/Chrome 120; a run that
      fails in the resolver leaves no record. Negative control: hard-coding `latest` in one config
      makes that config's `earliest` run report Chrome 150.

## 2. CI: the summary row and the weekly run

- [ ] 2.1 In `.github/actions/e2e/action.yml`, add the `installer-version` input, pass it as
      `OBSIDIAN_INSTALLER_VERSION`, add `-installer-<value>` to the cache key and restore key, a blank input keyed as
      `latest`, and write the row's app, installer and Chrome from `e2e-target.json`, with
      `not resolved` when it is missing (D3, D4). Verify with `actionlint` if present and with a pull
      request run whose cache key and row are read from the job.
- [ ] 2.2 Add `.github/workflows/oldest-installer.yml` (D4), passing `earliest` on the schedule: weekly schedule, dispatch inputs, one
      platform × group matrix, its own concurrency group, comments naming `ci.yml` as the other holder
      of the node version and group list. Verify by dispatching it from the branch once it exists on
      the default branch's workflow list, or by `actionlint`, and by reading one job's summary row
      for `installer 1.13.7`. A workflow dispatched from a branch needs the file on the default branch
      first: if it cannot run before landing, say so in the PR.
- [x] 2.3 Add `scripts/report-scheduled-run.ts` (D8) over a pure `scripts/scheduled-run-issue.ts`, and a
      `report` job at the end of `oldest-installer.yml` with the permissions and condition the
      design states. Verify with `tests/scheduled-run-issue.test.ts` over each outcome and
      `--dry-run` against a real run id printing the issue it would open; negative control: treating
      `cancelled` as `failure` fails the do-nothing case. A dispatch files nothing by design, so the
      live path is first exercised by a scheduled run after the merge; say so in the pull request.

## 3. The stamp

- [ ] 3.1 Add `src/plugin/runtime-stamp.ts` (D5): the fragment and label from `{ appVersion,
      chromium, platform }`, omitting what is missing. Verify with `tests/runtime-stamp.test.ts`
      covering the full version, the major-only fallback, a missing version, and the platform
      fallback; negative control: printing `undefined` for a missing version fails the omission case.
- [ ] 3.2 In `showDevBuildStamp` (`src/plugin/main.ts`), read `apiVersion` and `userAgentData`, draw
      the app version at once, redraw when the full version settles, and compose the text in one place
      shared with the motion-probe readout. Nothing runs in a release build. Verify by `npm run
      typecheck`, `npm run lint` and a narrow run of the new spec; negative control: a build made
      with `--production` and no `--dev` shows no stamp.
- [ ] 3.3 Add `e2e-tests/specs/97-runtime-stamp.e2e.ts` asserting the stamp's app and Chromium
      versions equal `e2e-target.json`'s (D6), and that the motion-probe readout still appears after
      the redraw. Verify on `earliest` and `latest`, desktop and `--mobile`; negative control: dropping
      the redraw leaves the Chromium version out of the stamp and fails the spec.

## 4. Landing

- [ ] 4.1 Read this pull request's CI, the first full run of the suite on the newest installer, and
      dispatch `oldest-installer.yml` from the branch (or, if a workflow cannot run before it is on
      the default branch, run `OBSIDIAN_INSTALLER_VERSION=earliest` over the eight-spec sweep from
      `docs/research/e2e-runtime-versions`). Fix each regression the newest Chrome shows in this change,
      and note in the research note which of the 56 specs each installer ran. File any failure that is
      not this change's to fix as an issue with the user's go-ahead (AGENTS.md, "A follow-up is an
      issue").
- [ ] 4.2 Validate, sync and archive the change, and bump the patch version with `npm version patch`.
      Verify with `openspec validate newest-installer-and-versions --strict` and
      `node scripts/check-landed.ts origin/main "fix(e2e): name the installer and runtime versions in
      every run and report"` printing `landed`.
