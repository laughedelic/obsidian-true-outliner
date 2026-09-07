# plugin-shell Specification

## Purpose
Defines the Obsidian plugin shell requirements: community-plugin conformance (manifest,
build, registration, linting), restriction to documented public APIs, and coexistence
behavior with other outliner-style plugins.

## Requirements
### Requirement: Community-plugin conformance
The plugin SHALL ship a valid `manifest.json` (`isDesktopOnly: false`), bundle to
`main.js` via esbuild with `obsidian` and `@codemirror/*` as externals, register all
event handlers/commands through the `Plugin` register APIs for automatic cleanup, use no
Node/Electron APIs, and pass `eslint-plugin-obsidianmd` recommended rules in the lint
gate.

#### Scenario: Clean unload
- **WHEN** the plugin is disabled
- **THEN** no commands, event handlers, or intervals remain registered

#### Scenario: Lint gate
- **WHEN** `npm run lint` runs in CI or locally
- **THEN** the obsidianmd recommended ruleset passes with zero errors

### Requirement: No private API access
The plugin SHALL use only documented public Obsidian APIs: no monkey-patching, no
`(editor as any).cm`-style casts into internals, no `workspace.activeLeaf` access.

#### Scenario: Static check
- **WHEN** the source is searched for `as any` casts targeting Obsidian objects or
  private-member access patterns
- **THEN** none exist (enforced by lint configuration and review)

### Requirement: Coexistence warning
On load, if `obsidian-outliner` or `obsidian-zoom` is enabled, the plugin SHALL show a
one-time notice (per vault) warning about overlapping keybindings/behavior. It SHALL NOT
disable or modify the other plugins.

The plugin MAY suppress the *rendering* of Obsidian's own in-document backlinks section within
notes it decorates, where that section would otherwise duplicate the plugin's own backlinks
footer. Such suppression SHALL be presentational only and SHALL observe all of the following:

- It SHALL NOT read, write, enable, or disable any other plugin's configuration, core or
  community. The other feature remains enabled and fully functional everywhere the plugin does
  not render.
- It SHALL be governed by a setting the user can turn off at any time, restoring the suppressed
  section immediately.
- It SHALL be confined to notes the plugin is decorating; a note the plugin is not decorating
  SHALL render exactly as it does without the plugin installed.
- It SHALL be reversed entirely when the plugin is disabled or uninstalled, leaving no residue.

This permission extends to Obsidian's own core features only, and does not license suppressing
another community plugin's UI.

#### Scenario: One-time warning
- **WHEN** the plugin loads in a vault with obsidian-outliner enabled for the first time
- **THEN** a warning notice appears once, and not on subsequent loads

#### Scenario: Suppression is reversible from settings
- **WHEN** the user turns off the setting that suppresses Obsidian's in-document backlinks
- **THEN** that section renders again, without a reload

#### Scenario: Suppression does not reach other notes
- **WHEN** suppression is enabled and a note the plugin does not decorate is opened
- **THEN** Obsidian's own in-document backlinks section renders there as usual

#### Scenario: No other plugin's configuration is touched
- **WHEN** suppression is enabled and later disabled
- **THEN** the configuration of every other plugin, core and community, is byte-identical to
  what it was before

#### Scenario: Uninstalling leaves no residue
- **WHEN** the plugin is disabled
- **THEN** every note renders exactly as it would if the plugin had never been installed
