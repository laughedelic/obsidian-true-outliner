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
