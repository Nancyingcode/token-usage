import { fixupConfigRules } from '@eslint/compat';
import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier/flat';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import tseslint from 'typescript-eslint';

const CONFIG_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const TYPESCRIPT_FILES = ['src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}', '*.config.ts'];
const NODE_FILES = [
  'src/main/**/*.ts',
  'src/preload/**/*.ts',
  'tests/**/*.ts',
  'scripts/**/*.cjs',
  '*.config.{js,cjs,mjs,ts}',
];
const COMMONJS_FILES = ['scripts/**/*.cjs', '*.config.cjs'];
const DEVELOPMENT_DEPENDENCY_FILES = [
  'tests/**',
  'scripts/**',
  'src/main/**',
  'src/preload/**',
  '**/*.config.{js,cjs,mjs,ts}',
];

const compat = new FlatCompat({
  baseDirectory: CONFIG_DIRECTORY,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

const AIRBNB_CONFIGS = fixupConfigRules(compat.extends('airbnb', 'airbnb/hooks'));
const TYPESCRIPT_CONFIGS = tseslint.configs.recommended.map((config) => ({
  ...config,
  files: TYPESCRIPT_FILES,
}));

export default tseslint.config(
  {
    ignores: [
      '.husky/_/**',
      'coverage/**',
      'dist/**',
      'docs/**',
      'node_modules/**',
      'out/**',
      '*.tsbuildinfo',
    ],
  },
  ...AIRBNB_CONFIGS,
  ...TYPESCRIPT_CONFIGS,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    settings: {
      react: {
        version: 'detect',
      },
      'import/resolver': {
        typescript: {
          project: ['./tsconfig.node.json', './tsconfig.web.json'],
        },
        node: {
          extensions: ['.js', '.jsx', '.ts', '.tsx'],
        },
      },
    },
    rules: {
      'import/extensions': [
        'error',
        'ignorePackages',
        {
          js: 'never',
          jsx: 'never',
          ts: 'never',
          tsx: 'never',
        },
      ],
      'import/no-extraneous-dependencies': [
        'error',
        {
          devDependencies: DEVELOPMENT_DEPENDENCY_FILES,
        },
      ],
    },
  },
  {
    files: TYPESCRIPT_FILES,
    languageOptions: {
      ecmaVersion: 'latest',
      globals: {
        ...globals.es2021,
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      'react-refresh': reactRefresh,
    },
    rules: {
      'default-param-last': 'off',
      '@typescript-eslint/default-param-last': 'error',
      'no-dupe-class-members': 'off',
      '@typescript-eslint/no-dupe-class-members': 'error',
      'no-redeclare': 'off',
      '@typescript-eslint/no-redeclare': 'error',
      'no-shadow': 'off',
      '@typescript-eslint/no-shadow': 'error',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^React$',
        },
      ],
      'no-use-before-define': 'off',
      '@typescript-eslint/no-use-before-define': [
        'error',
        {
          classes: true,
          functions: false,
          typedefs: true,
          variables: true,
        },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      'react/function-component-definition': [
        'error',
        {
          namedComponents: 'arrow-function',
          unnamedComponents: 'arrow-function',
        },
      ],
      'react/jsx-filename-extension': ['error', { extensions: ['.jsx', '.tsx'] }],
      'react/prop-types': 'off',
      'react/require-default-props': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    files: NODE_FILES,
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: COMMONJS_FILES,
    languageOptions: {
      sourceType: 'commonjs',
    },
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
  prettierConfig
);
