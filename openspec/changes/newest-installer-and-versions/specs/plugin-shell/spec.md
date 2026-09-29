# Spec Delta

## ADDED Requirements

### Requirement: Dev builds state the runtime they run on

A dev build's status-bar stamp SHALL name the Obsidian app version and the full Chromium version the
app runs on, in the stamp's visible text, reading them only through APIs the plugin may use
(`obsidian.apiVersion` and the web platform's `navigator.userAgentData`, neither a Node or Electron
API nor a user-agent string). Where only the major version is exposed the stamp SHALL name that;
where none is, it SHALL name the app version and the kind of platform and omit the Chromium
version, not print a placeholder. A
release build SHALL carry no stamp and read neither.

#### Scenario: The stamp names the app and Chromium versions

- **WHEN** a dev build loads on desktop
- **THEN** the stamp's text names the app version and the full Chromium version the runtime
  reports, and the item's label names them as well

#### Scenario: The Chromium version arrives after the stamp is drawn

- **WHEN** the runtime reports its full Chromium version asynchronously
- **THEN** the stamp already shows the app version when it loads and gains the Chromium version
  when the report arrives, without waiting on it

#### Scenario: Only the major version is available

- **WHEN** the runtime names its Chromium major version but refuses the request for the full one
- **THEN** the stamp names the major version as reported

#### Scenario: A version the runtime does not expose is left out

- **WHEN** the runtime exposes no Chromium version at all
- **THEN** the stamp names the app version and the platform, and nothing is printed in place of
  the missing version

#### Scenario: Release build has no stamp

- **WHEN** a release build loads
- **THEN** no stamp item exists and nothing reads the runtime's versions
