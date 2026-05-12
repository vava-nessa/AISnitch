import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import globals from 'globals';

const typescriptFiles = ['src/**/*.ts', 'src/**/*.tsx', 'tsup.config.ts'];
const clientTypescriptFiles = ['packages/client/src/**/*.ts'];

const typescriptRules = {
  ...tsPlugin.configs['recommended-type-checked'].rules,
  'no-undef': 'off',
  'no-unused-vars': 'off',
  '@typescript-eslint/consistent-type-imports': [
    'error',
    {
      prefer: 'type-imports',
      fixStyle: 'separate-type-imports',
    },
  ],
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/no-unused-vars': [
    'error',
    {
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
    },
  ],
};

export default [
  {
    ignores: ['coverage/**', 'dist/**', 'docs/**', 'tasks/**', '**/dist/**', 'examples/**/dist/**'],
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
  },
  js.configs.recommended,
  {
    files: typescriptFiles,
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: typescriptRules,
  },
  {
    files: clientTypescriptFiles,
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './packages/client/tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: typescriptRules,
  },
];
