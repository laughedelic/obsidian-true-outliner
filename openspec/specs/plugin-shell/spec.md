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

#### Scenario: One-time warning
- **WHEN** the plugin loads in a vault with obsidian-outliner enabled for the first time
- **THEN** a warning notice appears once, and not on subsequent loads
