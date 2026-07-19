import tseslint from 'typescript-eslint';
import obsidianmd from 'eslint-plugin-obsidianmd';

export default tseslint.config(
  ...tseslint.configs.recommendedTypeChecked,
  ...obsidianmd.configs.recommended,
  {
    // Tests run in Node and never ship to mobile.
    files: ['tests/**/*.ts'],
    rules: {
      'obsidianmd/no-nodejs-modules': 'off',
      'no-undef': 'off',
    },
  },
  {
    // Guard the two documented DOM invariants from the outline-decorations
    // hardening pass (openspec/changes/outline-decorations tasks.md 5.2,
    // full story in src/plugin/decorations.ts's module doc comment):
    // (a) never append a child into a plain `.cm-line` — confirmed to peg
    //     CM6's renderer at 100%+ CPU via its mutation-observer feedback
    //     loop; plain-line DOM goes through CM6's own Decoration.widget
    //     path instead;
    // (b) direct injection into widget-replaced atom subtrees
    //     (table/callout/hr/html) is sanctioned ONLY because Obsidian never
    //     re-diffs those opaque subtrees — an undocumented-to-Obsidian
    //     invariant that must stay visible at every new call site.
    // Every DOM-insertion call in plugin code therefore needs a targeted
    // eslint-disable with a justification comment (detached-DOM
    // construction, or a sanctioned widget-atom injection) — the point is
    // that a future refactor can't add one silently.
    files: ['src/plugin/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.property.name=/^(append|appendChild|prepend|insertBefore|before|after)$/]",
          message:
            'DOM insertion in plugin code is guarded (outline-decorations hardening 5.2): never append into a plain .cm-line (CM6 mutation-observer feedback loop, 100%+ CPU — confirmed), and widget-atom injection relies on Obsidian never re-diffing those subtrees. If this site is genuinely safe (detached DOM before mount, or a sanctioned widget-atom injection), add a targeted eslint-disable-next-line with a justification comment — see decorations.ts for the pattern.',
        },
      ],
    },
  },
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  { ignores: ['node_modules/**', 'eslint.config.js', 'esbuild.config.mjs', 'main.js'] },
);
