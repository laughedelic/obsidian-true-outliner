import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Property-based tests (fast-check) run hundreds of cases, some of them
    // quadratic in the size of a generated tree, and the hosted runner shares
    // its CPU across every test file at once. The default 5 s was too tight
    // there; so was 20 s, which one property or another crossed on a busy
    // runner while passing in half that time alone.
    testTimeout: 60_000,

    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        // Obsidian plugin bootstrap: App/Editor/settings-tab wiring that needs
        // a live Obsidian instance to run at all. Exercised by e2e, not unit
        // tests, so it has no meaningful unit-coverage number to report.
        'src/plugin/main.ts',
        'src/plugin/virtual-build-stamp.d.ts',
      ],
      thresholds: {
        // src/*.ts is the framework-agnostic mapping library: pure functions,
        // fully reachable from unit tests. These track a few points under its
        // current numbers as a regression floor.
        //
        // src/plugin/** is deliberately unscoped here: it's a mix of pure
        // logic (well unit-tested) and CM6/Obsidian wiring that only runs
        // inside a live editor, so it's exercised by e2e instead. An aggregate
        // percentage over that mix would measure the unit/e2e split, not a
        // real regression.
        'src/*.ts': {
          statements: 90,
          branches: 80,
          functions: 90,
          lines: 95,
        },
      },
    },
  },
});
