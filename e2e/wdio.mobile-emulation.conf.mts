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

  /**
   * Arm the notice recorder before any spec acts. Notices live ~1500ms and
   * `waitForNotice` polls over WebDriver, so a notice produced by the very
   * action a spec is waiting on can vanish between polls; recording from
   * session start removes that race even for specs that produce a notice
   * before touching any note helper (see `armNoticeRecorder`).
   */
  before: async function () {
    const { armNoticeRecorder } = await import('./helpers.js');
    await armNoticeRecorder();
  },

  services: ['obsidian'],
  reporters: ['obsidian'],

  cacheDir,
  mochaOpts: {
    ui: 'bdd',
    timeout: 60_000,
  },
  logLevel: 'warn',
};
