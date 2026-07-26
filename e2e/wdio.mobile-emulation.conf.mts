import * as path from 'node:path';
import * as url from 'node:url';
import { resolveObsidianTarget } from './obsidian-target.mjs';

const e2eDir = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(e2eDir, '..');

/** Shared with wdio.conf.mts — see `./obsidian-target.mts`. Previously this
 * file had its own copy, which honored neither `OBSIDIAN_VERSION` nor a
 * configurable cache, so pinning a version silently applied to the desktop
 * suite only. */
const { browserVersion, cacheDir } = await resolveObsidianTarget(root, ' mobile');

/**
 * Mobile-emulation variant of wdio.conf.mts: identical plugin/vault/specs,
 * run under Obsidian's own `app.emulateMobile()` instead — still the
 * Electron desktop app under a phone-sized viewport, not the real
 * Capacitor mobile app. See README's "Mobile testing" section for what
 * this does and doesn't catch.
 */
export const config: WebdriverIO.Config = {
  runner: 'local',
  framework: 'mocha',
  specs: [path.join(e2eDir, 'specs/**/*.e2e.ts')],
  maxInstances: 1,

  capabilities: [
    {
      browserName: 'obsidian',
      browserVersion,
      'wdio:obsidianOptions': {
        installerVersion: 'earliest',
        plugins: [
          root,
          { path: path.join(e2eDir, 'fixtures/obsidian-outliner-stub'), enabled: false },
        ],
        vault: path.join(root, 'test-vault'),
        emulateMobile: true,
      },
      'goog:chromeOptions': {
        // Same anti-throttling flags as wdio.conf.mts — see the comment
        // there for the occluded-window screenshot-timeout flake they fix.
        args: [
          '--disable-renderer-backgrounding',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
        ],
        mobileEmulation: {
          // Phone-sized viewport; Obsidian's tablet UI switches in around
          // width/height >= 600, so this stays in "phone" mode. Push both
          // dimensions past 600 to spot-check the tablet layout instead.
          deviceMetrics: { width: 390, height: 844 },
        },
      },
    },
  ],

  services: ['obsidian'],
  reporters: ['obsidian'],

  cacheDir,
  mochaOpts: {
    ui: 'bdd',
    timeout: 60_000,
  },
  logLevel: 'warn',
};
