import { builtinModules } from 'node:module';

import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier/flat';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import reactWebApi from 'eslint-plugin-react-web-api';
import regexp from 'eslint-plugin-regexp';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const TYPESCRIPT_FILES = ['src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}', '*.config.ts'];
const NODE_FILES = [
  'src/main/**/*.ts',
  'src/preload/**/*.ts',
  'tests/**/*.{ts,tsx}',
  'scripts/**/*.cjs',
  '*.config.{js,cjs,mjs,ts}',
];
const COMMONJS_FILES = ['scripts/**/*.cjs', '*.config.cjs'];
const RESTRICTED_REACT_DOM_IMPORTS = [
  {
    name: 'react-dom',
    importNames: ['flushSync'],
    message: 'Avoid flushSync because it can force synchronous rendering work.',
  },
];
const RESTRICTED_RENDERER_NODE_IMPORTS = [
  ...new Set(
    builtinModules.flatMap((moduleName) => {
      const bareModuleName = moduleName.replace(/^node:/, '');
      return [bareModuleName, `node:${bareModuleName}`];
    })
  ),
].map((name) => ({
  name,
  message: 'Renderer code must access privileged Node APIs through preload and typed IPC.',
}));
const RESTRICTED_RENDERER_DYNAMIC_IMPORTS = [
  {
    selector: 'ImportExpression[source.value="electron"]',
    message: 'Renderer code must access Electron APIs through preload and typed IPC.',
  },
  ...RESTRICTED_RENDERER_NODE_IMPORTS.map(({ message, name }) => ({
    selector: `ImportExpression[source.value="${name}"]`,
    message,
  })),
  {
    selector: 'ImportExpression[source.value=/\\/main\\//]',
    message: 'Renderer code must not import Electron main-process modules.',
  },
];
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
      '**/*.snap',
      '*.tsbuildinfo',
    ],
  },
  js.configs.recommended,
  ...TYPESCRIPT_CONFIGS,
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
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'react-web-api': reactWebApi,
      regexp,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      curly: ['error', 'all'],
      eqeqeq: ['error', 'always'],
      'func-style': ['error', 'expression'],
      'no-param-reassign': ['error', { props: true }],
      'no-restricted-imports': [
        'warn',
        {
          paths: RESTRICTED_REACT_DOM_IMPORTS,
        },
      ],
      'no-template-curly-in-string': 'error',
      'no-var': 'error',
      'object-shorthand': ['error', 'always'],
      'prefer-const': 'error',
      'prefer-template': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          fixStyle: 'inline-type-imports',
          prefer: 'type-imports',
        },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^React$',
        },
      ],
      'react-hooks/set-state-in-effect': 'off',
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-console': 'error',
      'no-magic-numbers': [
        'error',
        {
          enforceConst: true,
          ignore: [-1, 0, 1, 2],
          ignoreArrayIndexes: true,
          ignoreDefaultValues: true,
        },
      ],
      'prefer-promise-reject-errors': 'error',
      'regexp/no-super-linear-backtracking': 'error',
      'regexp/no-unused-capturing-group': 'error',
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
    // Renderer remains filesystem-free; privileged access belongs in main/preload typed IPC.
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            ...RESTRICTED_REACT_DOM_IMPORTS,
            {
              name: 'electron',
              message: 'Renderer code must access Electron APIs through preload and typed IPC.',
            },
            ...RESTRICTED_RENDERER_NODE_IMPORTS,
          ],
          patterns: [
            {
              group: ['**/main/**', 'src/main/**'],
              message: 'Renderer code must not import Electron main-process modules.',
            },
          ],
        },
      ],
      'no-restricted-syntax': ['error', ...RESTRICTED_RENDERER_DYNAMIC_IMPORTS],
      'react-web-api/no-leaked-event-listener': 'error',
    },
  },
  {
    files: ['tests/**/*.{ts,tsx}', 'scripts/**/*.{js,cjs,mjs,ts,tsx}'],
    rules: {
      'no-console': 'off',
      'prefer-promise-reject-errors': 'off',
    },
  },
  {
    files: ['tests/packagingConfig.test.ts', 'tests/uiStylePolicy.test.ts'],
    rules: {
      'no-template-curly-in-string': 'off',
    },
  },
  {
    files: ['src/renderer/**/*.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...RESTRICTED_RENDERER_DYNAMIC_IMPORTS,
        {
          selector: 'JSXExpressionContainer > ConditionalExpression[test.type="LogicalExpression"]',
          message:
            'Extract compound JSX conditions into a named boolean, pure function, or render model.',
        },
        {
          selector:
            'JSXExpressionContainer > LogicalExpression[operator="&&"][left.type="LogicalExpression"]:has(JSXElement)',
          message:
            'Extract compound JSX conditions into a named boolean, pure function, or render model.',
        },
        {
          selector:
            'JSXExpressionContainer > LogicalExpression[operator="&&"][left.type="LogicalExpression"]:has(JSXFragment)',
          message:
            'Extract compound JSX conditions into a named boolean, pure function, or render model.',
        },
        {
          selector:
            'JSXExpressionContainer > LogicalExpression[operator="&&"][right.type="LogicalExpression"]:has(JSXElement)',
          message:
            'Extract compound JSX conditions into a named boolean, pure function, or render model.',
        },
        {
          selector:
            'JSXExpressionContainer > LogicalExpression[operator="&&"][right.type="LogicalExpression"]:has(JSXFragment)',
          message:
            'Extract compound JSX conditions into a named boolean, pure function, or render model.',
        },
      ],
    },
  },
  prettierConfig
);
