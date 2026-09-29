# Spec Delta

## ADDED Requirements

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
