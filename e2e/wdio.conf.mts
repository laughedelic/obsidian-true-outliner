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
