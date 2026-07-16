# Airbnb Rules on ESLint 10 Migration Design

## Goal

Apply the complete practical Airbnb rule families to the Electron, React, and TypeScript codebase while retaining ESLint 10 and TypeScript ESLint 8. The migration must cover core JavaScript, modules, React, React Hooks, and JSX accessibility without changing application behavior.

## Compatibility Boundary

The current official package metadata establishes these constraints:

- `eslint-config-airbnb@19.0.4` declares ESLint 7 and 8 support.
- `eslint-plugin-import@2.32.0`, `eslint-plugin-react@7.37.5`, and `eslint-plugin-jsx-a11y@6.10.2` declare support through ESLint 9, not ESLint 10.
- `eslint-config-airbnb-typescript@18.0.0` requires ESLint 8 and TypeScript ESLint 7.

ESLint and TypeScript ESLint will not be downgraded. The project will use `FlatCompat` from `@eslint/eslintrc` to translate the classic Airbnb presets and `@eslint/compat` to adapt legacy plugin rules to the ESLint 10 rule API. Peer dependency installation will use `--legacy-peer-deps` because the upstream packages have not declared the selected ESLint version.

The migration will not claim to use `eslint-config-airbnb-typescript`. Instead, the official JavaScript/React Airbnb presets will provide the base rule set and TypeScript ESLint 8 will provide maintained TypeScript-aware equivalents.

If the compatibility layer cannot load or execute a required Airbnb plugin under ESLint 10, implementation stops and reports the exact plugin and error. It must not silently remove that rule family.

## Dependencies

Add development dependencies for:

- `@eslint/compat`
- `@eslint/eslintrc`
- `eslint-config-airbnb`
- `eslint-config-prettier`
- `eslint-import-resolver-typescript`
- `eslint-plugin-import`
- `eslint-plugin-jsx-a11y`
- `eslint-plugin-react`

Keep the existing ESLint 10, `@eslint/js` 10, TypeScript ESLint 8, React Hooks, React Refresh, and Prettier dependencies.

## Flat Config Architecture

Keep `eslint.config.js` as the single ESLint configuration entry point.

The configuration order will be:

1. Repository ignore patterns for dependencies, generated output, documentation, and build metadata.
2. Airbnb and `airbnb/hooks` translated through `FlatCompat` and wrapped with `fixupConfigRules`.
3. TypeScript ESLint recommended configurations for `src/**/*.{ts,tsx}` and `tests/**/*.ts`.
4. Project-specific TypeScript, React, import resolver, environment, and React Refresh settings.
5. Node/CommonJS overrides for Electron main, preload, tests, scripts, and configuration files.
6. Browser overrides for renderer files.
7. `eslint-config-prettier/flat` last, disabling only formatting rules that conflict with Prettier.

Airbnb semantic rules remain authoritative. Prettier owns whitespace, quotes, line wrapping, and trailing-comma output.

## TypeScript Rule Mapping

For TypeScript files, disable core rules that are superseded by type-aware or syntax-aware TypeScript ESLint equivalents. Enable the matching TypeScript rules at the same error severity, including:

- `no-unused-vars` -> `@typescript-eslint/no-unused-vars`
- `no-shadow` -> `@typescript-eslint/no-shadow`
- `no-use-before-define` -> `@typescript-eslint/no-use-before-define`
- `no-redeclare` -> `@typescript-eslint/no-redeclare`
- `no-dupe-class-members` -> `@typescript-eslint/no-dupe-class-members`
- `default-param-last` -> `@typescript-eslint/default-param-last`

Explicit `any` remains an error. The existing underscore ignore convention remains limited to deliberately unused parameters and the React namespace import required by `React.FC`.

Use `eslint-import-resolver-typescript` so Airbnb import rules resolve extensionless TypeScript imports against both project TypeScript configurations.

## Project Overrides

Overrides must be narrowly scoped and documented in `eslint.config.js`:

- Require arrow-function component definitions to comply with `AGENTS.md` and the existing `React.FC` convention.
- Disable `react/require-default-props` for TypeScript components because optionality is expressed by Props interfaces.
- Configure `import/extensions` so `.ts` and `.tsx` imports omit extensions while JavaScript module behavior remains Airbnb-compatible.
- Allow development dependencies only from tests, build/config files, and scripts.
- Keep the React Refresh export rule disabled because modules intentionally export component-adjacent formatting helpers where already established.
- Keep `react-hooks/set-state-in-effect` disabled because the initial read-only scan intentionally starts from the mount effect.

No file-level or line-level `eslint-disable` comments will be added to avoid ordinary Airbnb violations. Any additional global override discovered during implementation requires a concrete TypeScript, Electron, or Prettier compatibility reason and must be added to the design before use.

## Prettier Alignment

Update Prettier to match Airbnb's visible style where Prettier has an equivalent option:

- Single quotes for JavaScript and TypeScript.
- ES5-compatible trailing commas.
- Semicolons enabled.
- 100-character line width.

Run Prettier across all non-ignored source, test, script, and configuration files. Markdown, generated output, dependencies, and `package-lock.json` remain ignored.

## Source Remediation

Run the migrated lint configuration with `--max-warnings=0`, then fix violations by rule family:

1. Core JavaScript and TypeScript control-flow, naming, and expression rules.
2. Import resolution, ordering, extensions, and dependency-boundary rules.
3. React component, JSX, key, and property rules.
4. React Hooks rules.
5. JSX accessibility rules.
6. Prettier formatting.

Behavior-preserving transformations are required. Examples include replacing prohibited iteration forms with array operations, using stable keys instead of array indexes, and extracting expressions where Airbnb complexity or readability rules require it.

Do not change token calculations, JSONL parsing semantics, warning aggregation, UI copy, navigation behavior, IPC APIs, Electron security options, or menu environment behavior.

## Configuration Regression Test

Add a Vitest test that loads ESLint 10 programmatically and resolves configuration for representative TypeScript and TSX files. It must assert that the following rule families are active at error severity:

- Core: `eqeqeq`
- Imports: `import/no-unresolved`
- React: `react/jsx-no-target-blank`
- Hooks: `react-hooks/rules-of-hooks`
- Accessibility: `jsx-a11y/alt-text`
- TypeScript: `@typescript-eslint/no-shadow`

The test must also assert that the superseded core `no-shadow` rule and a representative Prettier-conflicting formatting rule are disabled for TypeScript/TSX files.

This test protects the compatibility bridge from silently dropping a plugin or changing layer order during future dependency updates.

## Verification

The implementation must pass:

- Focused ESLint configuration regression test.
- Full Vitest suite.
- `npm run lint` with `--max-warnings=0`.
- TypeScript checks for main and renderer configurations.
- Electron production build.
- A lint-staged hook simulation on representative staged TypeScript and TSX files.

Review `git diff --check` and the final staged file list before committing. The user's untracked `AGENTS.md` and `style-guide.md` remain untouched and unstaged.

## Success Criteria

- ESLint remains on major version 10 and TypeScript ESLint remains on major version 8.
- Airbnb core, module, React, Hooks, and JSX accessibility rule families load through the compatibility bridge.
- TypeScript uses maintained equivalent rules instead of incompatible `eslint-config-airbnb-typescript`.
- Lint runs with zero warnings and no broad suppression comments.
- Prettier output follows the agreed Airbnb-compatible quote and trailing-comma style.
- The configuration regression test proves all required rule families remain active.
- Application tests, type checks, and production build pass without behavior changes.
