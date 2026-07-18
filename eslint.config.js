import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier/flat';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
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
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      curly: ['error', 'all'],
      eqeqeq: ['error', 'always'],
      'func-style': ['error', 'expression'],
      'no-param-reassign': ['error', { props: true }],
      'no-var': 'error',
      'object-shorthand': ['error', 'always'],
      'prefer-const': 'error',
      'prefer-template': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
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
      'no-magic-numbers': [
        'error',
        {
          enforceConst: true,
          ignore: [-1, 0, 1, 2],
          ignoreArrayIndexes: true,
          ignoreDefaultValues: true,
        },
      ],
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
  {
    files: ['src/renderer/**/*.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'JSXExpressionContainer > ConditionalExpression[test.type="LogicalExpression"]',
          message:
            'Extract compound JSX conditions into a named boolean, pure function, or render model.',
        },
        {
          selector:
            'JSXExpressionContainer > LogicalExpression[left.type="LogicalExpression"]:has(JSXElement)',
          message:
            'Extract compound JSX conditions into a named boolean, pure function, or render model.',
        },
        {
          selector:
            'JSXExpressionContainer > LogicalExpression[left.type="LogicalExpression"]:has(JSXFragment)',
          message:
            'Extract compound JSX conditions into a named boolean, pure function, or render model.',
        },
        {
          selector:
            'JSXExpressionContainer > LogicalExpression[right.type="LogicalExpression"]:has(JSXElement)',
          message:
            'Extract compound JSX conditions into a named boolean, pure function, or render model.',
        },
        {
          selector:
            'JSXExpressionContainer > LogicalExpression[right.type="LogicalExpression"]:has(JSXFragment)',
          message:
            'Extract compound JSX conditions into a named boolean, pure function, or render model.',
        },
      ],
    },
  },
  prettierConfig
);
