import * as path from 'node:path';
import * as url from 'node:url';

const e2eDir = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(e2eDir, '..');

export const config: WebdriverIO.Config = {
  runner: 'local',
  framework: 'mocha',
  specs: [path.join(e2eDir, 'specs/**/*.e2e.ts')],
  // Suites share one Obsidian instance/vault; parallelism is a later concern.
  maxInstances: 1,

  capabilities: [
    {
      browserName: 'obsidian',
      browserVersion: 'latest',
      // Keep Electron rendering at full rate even when the test window is
      // occluded or the machine's display is asleep — without these,
      // Chromium throttles frame production for background windows, and
      // screenshot capture (a renderer round-trip) times out while plain
      // script execution keeps working. This is the exact signature of the
      // "screenshot-heavy tests time out under local load, pass on a fresh
      // CI runner" flake documented in tasks.md 5.7 — reproduced locally
      // during the hardening pass on code that had passed the same spec
      // minutes earlier, with only the machine's session state changed.
      'goog:chromeOptions': {
        args: [
          '--disable-renderer-backgrounding',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
        ],
      },
      'wdio:obsidianOptions': {
        installerVersion: 'earliest',
        plugins: [
          root, // manifest.json + main.js (run `npm run build:plugin` first)
          // Conflicting-plugin stub for the coexistence warning test; starts
          // disabled, enabled by shell.e2e.ts.
          { path: path.join(e2eDir, 'fixtures/obsidian-outliner-stub'), enabled: false },
        ],
        vault: path.join(root, 'test-vault'),
      },
    },
  ],

  services: ['obsidian'],
  reporters: ['obsidian'],

  cacheDir: path.join(root, '.obsidian-cache'),
  mochaOpts: {
    ui: 'bdd',
    timeout: 60_000,
  },
  logLevel: 'warn',
};
