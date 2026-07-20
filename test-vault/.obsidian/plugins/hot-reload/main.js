const { Plugin, Notice } = require('obsidian');

// Dev-only hot reload: watches every OTHER plugin's main.js/manifest.json/
// styles.css for on-disk changes and disables+re-enables it automatically,
// the same "raw vault event → toggle the plugin" trick the community
// "Hot Reload" plugin (pjeby/hot-reload) has used for years. Vendored here
// (not installed from the community registry) to avoid a network/third-
// party dependency for something this small — see manifest.json.
//
// Opt-in per vault via a `.hotreload` marker file at the vault root, so
// this never activates in a vault where it wasn't deliberately placed.

const WATCHED_FILE_RE = /^\.obsidian\/plugins\/([^/]+)\/(main\.js|manifest\.json|styles\.css)$/;
const DEBOUNCE_MS = 300;

module.exports = class HotReloadPlugin extends Plugin {
  timers = new Map();

  async onload() {
    const marker = await this.app.vault.adapter.exists('.hotreload');
    if (!marker) return; // inert unless explicitly opted in for this vault

    this.registerEvent(
      this.app.vault.on('raw', (changedPath) => {
        const match = WATCHED_FILE_RE.exec(changedPath);
        if (!match) return;
        const pluginId = match[1];
        if (pluginId === this.manifest.id) return; // never reload self
        this.scheduleReload(pluginId);
      }),
    );
  }

  onunload() {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  scheduleReload(pluginId) {
    const existing = this.timers.get(pluginId);
    if (existing) clearTimeout(existing);
    this.timers.set(
      pluginId,
      setTimeout(() => {
        this.timers.delete(pluginId);
        void this.reload(pluginId);
      }, DEBOUNCE_MS),
    );
  }

  async reload(pluginId) {
    const plugins = this.app.plugins;
    if (!plugins.enabledPlugins.has(pluginId)) return; // don't force-enable a disabled plugin
    await plugins.disablePlugin(pluginId);
    await plugins.enablePlugin(pluginId);
    new Notice(`Hot-reloaded: ${pluginId}`, 1500);
  }
};
