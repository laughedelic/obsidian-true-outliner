# Installation

True Outliner is not yet listed in Obsidian's community plugin directory. Until it is, install it from the GitHub releases, either through BRAT or by hand.

## Requirements

- Obsidian **1.5.0** or later. Settings are searchable from Obsidian's settings search on 1.13 and later.
- Desktop or mobile. The plugin is not marked desktop-only.
- **Restricted mode off** in the vault, as for any community plugin.

## With BRAT (recommended)

[BRAT](https://github.com/TfTHacker/obsidian42-brat) (Beta Reviewers Auto-update Tool) installs plugins straight from a GitHub repository and keeps them updated.

1. Install and enable **BRAT** from the community plugins directory.
2. Open BRAT's settings and choose **Add beta plugin**.
3. Enter the repository:

   ```text
   laughedelic/obsidian-true-outliner
   ```

4. Confirm. BRAT downloads the latest release and enables the plugin.
5. BRAT checks for new releases on startup and updates automatically. Turn that off per plugin in BRAT's settings if a pinned version is preferred.

## By hand

1. Open the [latest release](https://github.com/laughedelic/obsidian-true-outliner/releases/latest) and download `main.js`, `manifest.json` and `styles.css`.
2. In the vault, create the folder `.obsidian/plugins/true-outliner/` and put the three files in it. The folder name must be `true-outliner`.
3. Restart Obsidian, or reload plugins from **Settings → Community plugins**.
4. Enable **True Outliner** in the community plugins list.

Each release is built by GitHub Actions from the tagged commit, with a [build provenance attestation](https://docs.github.com/en/actions/security-for-github-actions/using-artifact-attestations/using-artifact-attestations-to-establish-provenance-for-builds) attached, so the files can be verified against the source they were built from.

## After enabling

New tabs open in outline mode by default. Open any note in Live Preview and the outline grid, guides and markers appear at once. Nothing is written to the vault: the plugin keeps its own settings in `.obsidian/plugins/true-outliner/data.json` and never adds anything to a note.

To start with outline mode off and switch it on per note instead, turn off **Open new tabs in outline mode** in the plugin's settings. See [Outline mode](./outline-mode).

## Coexistence with other outliner plugins

If **Outliner** (`obsidian-outliner`) or **Zoom** (`obsidian-zoom`) is enabled in the same vault, True Outliner shows a one-time notice on startup. Both plugins bind the same keys (Tab, Shift+Tab, Enter, Mod+Shift+Arrow) and both try to own list editing, so having them enabled together produces conflicting behaviour. Disable one or the other per vault. The notice is shown once and not repeated.

## Updating

- **BRAT** updates automatically, or on demand from its **Check for updates** command.
- **Manual installs** are updated by replacing the three files with the ones from the newer release. Settings in `data.json` are kept.

## Uninstalling

Disable or uninstall the plugin from **Settings → Community plugins**. Because the plugin stores nothing in notes, uninstalling leaves the vault exactly as it was.
