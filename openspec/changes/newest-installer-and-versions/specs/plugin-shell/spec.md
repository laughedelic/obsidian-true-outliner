# Spec Delta

## ADDED Requirements

### Requirement: Dev builds state the runtime they run on

A dev build's status-bar stamp SHALL name the Obsidian app version and the Chromium version the
app runs on, in the stamp's visible text, and the Electron version as well where the platform
exposes it through APIs the plugin may use. Where a version is not exposed the stamp SHALL say the
platform it is running on and omit the version, not print a placeholder. A release build SHALL
carry no stamp.

#### Scenario: Desktop stamp names the runtime

- **WHEN** a dev build loads on desktop
- **THEN** the stamp's text names the app version and the Chromium version the app reports, and
  the item's label names them in full

#### Scenario: Mobile emulation follows the platform it emulates

- **WHEN** a dev build loads under mobile emulation
- **THEN** the stamp names only what the emulated platform exposes, and shows no Electron version
  that a real mobile app would not have

#### Scenario: A version the platform does not expose is left out

- **WHEN** the runtime exposes no Chromium version
- **THEN** the stamp names the app version and the platform, and no version is invented

#### Scenario: Release build has no stamp

- **WHEN** a release build loads
- **THEN** no stamp item exists and nothing reads the runtime's versions
