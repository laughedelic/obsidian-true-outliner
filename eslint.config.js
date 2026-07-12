import tseslint from 'typescript-eslint';

// NOTE: eslint-plugin-obsidianmd is installed and will be enabled in the
// change that introduces the actual plugin surface — its recommended config
// requires a manifest.json, which the pure mapping-core library doesn't
// have. Tracked in openspec/changes/mapping-core/design.md (D6).
export default tseslint.config(
  ...tseslint.configs.recommendedTypeChecked,
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
  { ignores: ['node_modules/**', 'eslint.config.js'] },
);
