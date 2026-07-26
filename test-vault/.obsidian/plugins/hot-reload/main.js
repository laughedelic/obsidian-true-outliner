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
  lastNotice = null;

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
    this.lastNotice?.hide();
    this.lastNotice = null;
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

    // PERSISTENT (timeout 0 — dismissed by clicking), not a 1.5s toast. A
    // toast you have to be looking at cannot answer "did my rebuild actually
    // reach the app?": miss it and a successful reload is indistinguishable
    // from one that never happened. The reloaded plugin's status bar stamp is
    // the always-visible counterpart; this is the event.
    //
    // Reads the stamp BAKED INTO the reloaded bundle, not
    // `plugins.manifests[id].version`: manifest.json is copied verbatim into
    // the vault and cached by Obsidian at plugin-scan time, so it only ever
    // reports the base package version and would name every build identically.
    const pad = (n) => String(n).padStart(2, '0');
    const now = new Date();
    const at = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const stamp = plugins.plugins?.[pluginId]?.buildStamp;
    const built = stamp ? `${stamp.buildId} (built ${stamp.clock})` : '';
    // Replace rather than stack. A timeout of 0 never auto-dismisses, so without
    // this a watch session accumulates one permanent notice per save and buries
    // the UI. Only the latest reload is worth showing — that is the whole point
    // of it being persistent.
    this.lastNotice?.hide();
    this.lastNotice = new Notice(
      `Hot-reloaded ${pluginId} at ${at}\n${built}\n(click to dismiss)`.replace(/\n\n/, '\n'),
      0,
    );
  }
};
