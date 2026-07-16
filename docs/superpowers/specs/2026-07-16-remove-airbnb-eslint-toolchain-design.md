# Remove Airbnb ESLint Toolchain Design

## Goal

Remove the Airbnb ESLint configuration and its dedicated compatibility/plugin toolchain while retaining a focused ESLint 10 setup for JavaScript, TypeScript, React Hooks, React Refresh, and Prettier interoperability.

## Dependency Scope

Remove these direct development dependencies:

- `@eslint/compat`;
- `@eslint/eslintrc`;
- `eslint-config-airbnb`;
- `eslint-import-resolver-typescript`;
- `eslint-plugin-import`;
- `eslint-plugin-jsx-a11y`;
- `eslint-plugin-react`.

Retain:

- `eslint` 10;
- `@eslint/js`;
- `typescript-eslint` 8;
- `eslint-plugin-react-hooks`;
- `eslint-plugin-react-refresh`;
- `eslint-config-prettier`;
- `globals`.

`@eslint/eslintrc` may remain as a transitive lockfile dependency of ESLint tooling, but it must no longer be a direct dependency or imported by project configuration.

## Configuration

Replace the FlatCompat-based configuration with native ESLint flat configs:

1. project ignores;
2. `@eslint/js` recommended rules;
3. TypeScript ESLint recommended configs scoped to TypeScript and TSX files;
4. project TypeScript rules and React Hooks/Refresh plugins;
5. Node, CommonJS, and browser globals;
6. `eslint-config-prettier/flat` last.

Keep the existing project rules for explicit `any`, unused variables, React Hooks, React Refresh, and `no-var`. Remove Airbnb, import resolver, JSX accessibility, React style, and TypeScript replacements that existed only to override Airbnb core rules.

## Removed Code

- Remove `FlatCompat`, `fixupConfigRules`, Airbnb preset translation, React version settings, import resolver settings, and import rules from `eslint.config.js`.
- Delete `tests/eslintConfig.test.ts` because it exists specifically to prove Airbnb rule-family compatibility.
- Update `package.json` and `package-lock.json` through npm uninstall.

## Preserved Scope

- Do not revert application source refactors made while Airbnb rules were active.
- Do not alter lint, lint-staged, Prettier, Husky, or commitlint scripts.
- Do not delete or edit historical migration documentation or `style-guide.md`.
- Do not change runtime application behavior.

## Verification

- `package.json` contains none of the seven removed direct dependencies.
- `eslint.config.js` contains no Airbnb, FlatCompat, import resolver, JSX-a11y, or React style plugin configuration.
- The complete Vitest suite passes after deleting the Airbnb-specific test.
- ESLint reports zero warnings, Prettier passes, both TypeScript projects pass, and the Electron production build succeeds.
- The current pre-commit hook succeeds on the staged cleanup.
