# Design

## Context

Both e2e configs call `resolveObsidianTarget` (`e2e-tests/obsidian-target.mts`) for the app version
and hard-code `installerVersion: 'earliest'`. `OBSIDIAN_VERSION` is read there through
`pinnedVersion`, blank counting as unset because Actions expands an absent dispatch input to the
empty string. CI passes it from the `e2e` action, whose step-summary row prints the requested value.
What `'earliest'` and `'latest'` resolve to, what a running app can say about itself, and the API
constraints on that are measured in `docs/research/e2e-runtime-versions`. See `proposal.md` for the
motivation.

## Goals / Non-Goals

**Goals:**

- One place resolves the target, and the run, the banner, the record and the summary row all read
  what it resolved, so none can disagree with the Obsidian that started.
- The harness runs on the installer a fresh install has, by default, and the oldest supported one
  runs on a schedule without changing what a pull request waits on.

**Non-Goals:**

- Choosing the installer per spec or per group.
- Any change to which app version runs by default.

## Decisions

**D1. The installer is resolved once, in the launcher process, and handed to the service as an
exact version.** `resolveObsidianTarget` reads `OBSIDIAN_INSTALLER_VERSION` through a
`pinnedInstallerVersion` twin of `pinnedVersion` (blank is unset; default `latest`), resolves the
pair with the launcher, and returns the resolved installer for both configs to put in
`installerVersion`. Handing over the exact number is what makes the record true: the service
resolves an exact version to itself, so it cannot pick another installer than the one written down.
The launcher throws `No Obsidian installer <value> found` for an unknown value, which is the
fail-fast in the spec; the error is caught and re-thrown naming the variable. The launcher is
constructed with the harness's `cacheDir`, as `obsidianBetaAvailable` already is, so no second
metadata fetch is needed on a warm cache.

*Alternative: pass the requested word through and let the service resolve it.* Simpler, and the
record would then have to repeat the resolution to know the number. Two resolutions can disagree if
the metadata refreshes between them.

*Dependency:* `obsidian-launcher` becomes a direct dev dependency at the version the service already
pulls in. `getInstallerInfo` (Electron and Chrome per installer) is only on its class; the service
re-exports the deprecated `resolveObsidianVersions` and `parseObsidianVersions`, which return
versions and no runtime. Reading `obsidian-versions.json` directly, as `isPubliclyDownloadable`
does, would bind the harness to the launcher's file layout for a second field set.

**D2. The record is a file, written by the launcher process and cleared with the other reports.**
`.obsidian-cache/e2e-target.json` holds `{ app, installer, electron, chrome, requested }`, where
`requested` keeps the words the run was asked for (`latest`, `earliest`, blank). `resetE2eReports`
removes it first, so a run that fails before writing leaves none behind, for the reason it already
removes `e2e-summary.json`. The banner is printed from the same object. A file rather than a
step output because the resolution happens inside wdio's launcher, after the workflow step started,
and the same file serves a local run (`cat`, like `e2e-summary.json`) and a spec.

**D3. The step-summary row reads the record with `jq`.** The action's row gains an installer column
and shows the resolved app, installer and Chrome. When the record is absent (a start that failed) the
row says `not resolved` and keeps the requested app version, so a red job still says what it
was asked to run. `jq` is on the hosted runners; the row is composed in the step that already
writes it.

**D4. The scheduled run is its own workflow.** `oldest-installer.yml` has a weekly `schedule` and
`workflow_dispatch` with `obsidian-version` and `installer-version` inputs (blank meaning `latest`
for the app and `earliest` for the installer), and one job over a platform × group matrix calling
the `e2e` action, which the schedule feeds `earliest`. The desktop and
mobile jobs are two trees in `ci.yml` only so mobile can have a softer gate; this workflow has
no gate to differ on. Separate from `ci.yml` because a `schedule` trigger there would start lint,
unit tests and the directory scan as well, or need an `if` on each; a separate concurrency group
keeps a push to `main` from cancelling or displacing the weekly run; and the checks a pull request
waits on stay exactly as they are. The cost is the group-list job and the node version repeated in
a second file, which a comment in each points at.

The action gains an `installer-version` input, passed as `OBSIDIAN_INSTALLER_VERSION`. Its cache key
gains `-installer-<value>` always, with a blank input keyed as `latest`. No existing entry matches
the new key, deliberately: what a `latest` key holds changes from installer 1.5.8 to the newest, and a
restored 1.5.8 cache would only be carried along as dead weight. So every run misses and downloads
until a push to `main` saves the entry (a pull request's cache is visible to that pull request
only, and it may restore from `main`'s), after which pull requests restore it as before. The key
carries the installer and the week, and `restore-keys` stays within one installer, so a dispatch of
one installer cannot restore a build for another.

**D5. The stamp is a pure function of what the runtime reports, and the reads stay in
`main.ts`.** `src/plugin/runtime-stamp.ts` takes `{ appVersion, chromium, platform }` and returns
the visible fragment and the label line; it does the formatting and the omission rule, and has unit
tests. `showDevBuildStamp` reads `obsidian.apiVersion` and `navigator.userAgentData`:
`getHighEntropyValues(['fullVersionList'])` for the full Chromium version, falling back to the
`Chromium` brand's major, and to nothing when either is missing or rejects. The item draws with the
app version at once and redraws when the promise settles; the redraw shares one composer with the
motion-probe readout, which currently rebuilds the text from `base`, so the two cannot overwrite each
other. The platform in the fallback comes from `Platform`. The typing for `userAgentData` is a local
interface at the call site, since the DOM library shipped with our TypeScript does not declare it.

The fragment reads `app 1.13.7 · Chromium 150.0.7871.212`. The Electron version is left out for the
reason in the research note ("What the plugin may read"); it follows from the full Chromium version,
and the harness record carries both.

*Alternatives:* `process.versions` (a Node API, absent on mobile, and against `plugin-shell`);
the user-agent string (banned by `obsidianmd/platform`, and an inline disable would sit in the
source the directory scan reads); a version table in the plugin (goes stale with each Electron).

**D8. A red scheduled run is filed by a script, from a last job.** `oldest-installer.yml` ends with a
`report` job that `needs` the matrix and runs `if: always() && github.event_name == 'schedule'`,
so a dispatch, watched by whoever started it, files nothing. It has `issues: write` and
`actions: read`, and calls `scripts/report-scheduled-run.ts` with the matrix result and the run id;
the script is TypeScript under `scripts/` like the other tooling. It reads the failed jobs from
`GET /repos/{repo}/actions/runs/{run_id}/jobs`, and finds an earlier issue by a fixed title among the
open issues labelled `area/ci`. Three outcomes follow from `(result, open issue?)`: `failure` with no
issue opens one; `failure` with one comments; `success` with one comments and leaves it open;
everything else, including `cancelled`, does nothing. That decision is a pure function with unit
tests; the script's `--dry-run` prints the API calls it would make.

The issue takes `kind/bug`, `area/ci`, `area/testing`, `p2` and `needs/diagnosis`, all in the declared
set, and needs no new label. `p2` follows the `triage` skill's rule of taking the lower rung where two
are arguable: one red weekly run does not make every change pay, and whoever triages can raise
it. `needs/diagnosis` says the failure reproduced in CI and its cause is not yet located. The body
names the versions *requested* (`latest` app, `earliest` installer) and links the run, whose jobs
each carry the resolved versions in their summary rows; the resolved record stays in the jobs
because it is written on their runners and the report job runs on another.

*Alternatives:* the default email (goes to whoever last edited the cron line, and only there);
closing the issue on a green run (a transient pass would hide a flake, and looking into a red run is
the person's call, not the workflow's); a new `ci-failure` label (the label set is declared in one
file and the existing four axes already say everything the issue needs).

**D6. The stamp is verified against the record.** A spec asserts the stamp's app and Chromium
versions equal the ones in `e2e-target.json`. That ties three sources to each other, the launcher's
table, the process that started, and the plugin's own reading, and is what makes the weekly run's
installer visible in its result rather than only in its summary. A unit spec cannot check this, since
the value is the running runtime.

**D7. The prefix is `fix`, a patch bump** (`docs/research/e2e-runtime-versions`, "Which prefix").
`manifest.json`, `versions.json`, `package.json` and `package-lock.json` move together through
`npm version patch`, on the branch, in the landing step.

## Risks / Trade-offs

- **Known flakes will open an issue now and then** (`docs/research/e2e-ci-budgets`). The failed-job
  list on the issue and one comment per further red run show whether the same group fails again,
  which separates a flake from a regression without re-running anything.
- **The report job runs with a write token on a schedule.** It is limited to `issues: write` and
  `actions: read`, runs no code from a pull request, and reads only job names and results.

- **Pull requests now gate on the newest installer, and 48 of 56 spec files have not run on it (the new DevTools-protocol spec, #299, is one of them: its design names Chrome 150 as the risk).**
  Eight passed under both installers, none failed. This pull request's own CI is the first full
  run on Chrome 150, so a red group shows here before the default reaches any other pull request.
  A failure that is a real regression on the newer Chrome is fixed in this change, since it would
  otherwise block every pull request.
- **A regression only the oldest Chrome shows is found up to a week after it merges.** The weekly
  run bounds the delay, and a dispatch checks a suspicious change sooner. Nothing checks the app
  version below the newest, before or after this change.
- **Exact installer handed to the service skips its compatibility guard.** `resolveVersion` for
  `latest` and `earliest` already restricts to installers compatible with the app, so the record's
  installer is one the service would have chosen. An exact dispatch value outside the app's range
  still gets the launcher's incompatible-versions warning.
- **Two workflows now carry the node version and the group list.** Kept in step by a comment at
  each; moving them into a reusable workflow is the follow-up if a third caller appears.
- **`userAgentData` on real mobile is unmeasured.** The omission rule is the mitigation: the stamp
  never prints a version it did not read.
