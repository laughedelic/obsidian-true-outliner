/**
 * Where a case's budget has to be set for WebdriverIO's wrapper to see it.
 *
 * Runs mocha programmatically with its BDD functions wrapped exactly as
 * `@wdio/mocha-framework` wraps them (`wrapGlobalTestMethod` from `@wdio/utils`,
 * called once per interface function on `pre-require`), so every row goes
 * through the real `executeAsync` without launching Obsidian or a browser.
 *
 * The figures are scaled down: the default budget stands in for
 * `mochaOpts.timeout` (60 s in both wdio configs), every body outlives it, and
 * every raise asks for enough to cover the body.
 *
 *   node docs/research/prototypes/e2e-case-budget/case-budget-probe.mjs
 */

import Mocha from 'mocha';
import { wrapGlobalTestMethod } from '@wdio/utils';

const DEFAULT = 1000; // stands in for mochaOpts.timeout
const BODY = 1500; // outlives DEFAULT
const RAISED = 4000; // covers BODY
const LOWERED = 300;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function runSuite(title, wrapped, define) {
  const mocha = new Mocha({ timeout: DEFAULT, ui: 'bdd', reporter: function () {} });
  mocha.suite.on('pre-require', (context) => {
    if (!wrapped) return;
    // What `setupEnv` in @wdio/mocha-framework does for the bdd interface.
    const hookArgs = (ctx) => [{ ...ctx.test, parent: ctx.test?.parent?.title }, ctx];
    for (const fn of ['it', 'specify', 'before', 'beforeEach', 'after', 'afterEach']) {
      const isTest = fn === 'it' || fn === 'specify';
      wrapGlobalTestMethod(isTest, [], hookArgs, [], hookArgs, fn, '0-0', context);
    }
  });
  mocha.suite.emit('pre-require', globalThis, null, mocha);
  globalThis.describe(title, define);
  return new Promise((resolve) => {
    const rows = [];
    const runner = mocha.run(() => resolve(rows));
    const started = new Map();
    runner.on('test', (t) => started.set(t, Date.now()));
    runner.on('hook', (h) => started.set(h, Date.now()));
    runner.on('pass', (t) =>
      rows.push({ title: t.title, state: 'passed', ms: Date.now() - started.get(t), error: '' }),
    );
    runner.on('fail', (t, err) =>
      rows.push({
        title: t.title,
        state: 'failed',
        ms: Date.now() - (started.get(t) ?? Date.now()),
        error: String(err?.message ?? err).split('\n')[0],
      }),
    );
  });
}

const all = [];

// A: the control. Mocha alone honours a raise from inside the body.
all.push(
  ...(await runSuite('unwrapped', false, function () {
    globalThis.it('A. in-body raise, no wdio wrapper', async function () {
      this.timeout(RAISED);
      await sleep(BODY);
    });
  })),
);

let bleed = 0;
all.push(
  ...(await runSuite('wrapped', true, function () {
    // B: the form every affected spec uses today.
    globalThis.it('B. in-body raise', async function () {
      this.timeout(RAISED);
      await sleep(BODY);
      bleed = Date.now();
    });
    // B': the case after B, which starts while B's body is still running.
    globalThis.it("B'. the next case, watching for B's body", async function () {
      const from = Date.now();
      await sleep(800);
      if (bleed >= from) throw new Error(`B's body finished ${bleed - from} ms into this case`);
    });
    // C: the negative control `docs/research/e2e-ci-budgets` recorded.
    globalThis.it('C. in-body lower', async function () {
      this.timeout(LOWERED);
      await sleep(LOWERED * 2);
    });
    // D: set at declaration, on the Test mocha's `it` returns through the wrapper.
    globalThis
      .it('D. declared on the case', async function () {
        await sleep(BODY);
      })
      .timeout(RAISED);
  })),
);

// E: at describe level, before the case is declared, so the Test inherits it.
all.push(
  ...(await runSuite('wrapped, suite budget', true, function () {
    this.timeout(RAISED);
    globalThis.it('E. set on the describe', async function () {
      await sleep(BODY);
    });
  })),
);

// E': at describe level AFTER the case is declared, which mocha 12 copies onto
// the cases the suite already holds (mochajs/mocha#5422).
all.push(
  ...(await runSuite('wrapped, suite budget after the case', true, function () {
    globalThis.it("E'. set on the describe, after the case", async function () {
      await sleep(BODY);
    });
    this.timeout(RAISED);
  })),
);

// F: a hook is wrapped by the same `executeAsync`.
all.push(
  ...(await runSuite('wrapped, hook', true, function () {
    globalThis.before(async function () {
      this.timeout(RAISED);
      await sleep(BODY);
    });
    globalThis.it('F. (after an in-body raise in `before`)', async function () {});
  })),
);

console.log(`budget ${DEFAULT} ms, body ${BODY} ms, raised to ${RAISED} ms\n`);
console.log('| case | result | after | error |');
console.log('| --- | --- | --- | --- |');
for (const r of all) {
  console.log(`| ${r.title} | ${r.state} | ${r.ms} ms | ${r.error ? '`' + r.error + '`' : ''} |`);
}
