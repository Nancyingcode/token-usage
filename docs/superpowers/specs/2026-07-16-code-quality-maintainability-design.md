# Code Quality and Maintainability Optimization Design

## Goal

Align the Electron, React, and TypeScript codebase with the repository's `AGENTS.md` requirements while reducing clear duplication and dead code. Preserve all existing UI behavior, IPC contracts, scan results, and token aggregation rules.

## Scope

The optimization covers five focused areas:

1. Formatting and lint integration.
2. Consistent React component and Props declarations.
3. Named constants instead of repeated or unexplained values.
4. Shared pure helpers for derived usage metrics and session identifiers.
5. Removal of unused renderer state and filtering logic.

It does not include UI redesign, new functionality, parser behavior changes, concurrency changes, dependency framework migrations, or full adoption of every Airbnb ESLint rule.

## Tooling

Add Prettier as a development dependency and define repository formatting rules that preserve the existing double-quote and semicolon style. Add a Prettier ignore file for generated output, dependencies, and documentation artifacts that should not be reformatted as part of this change.

Update scripts so:

- `npm run lint` checks ESLint and Prettier without modifying files.
- `npm run lint:fix` applies ESLint fixes and Prettier formatting.
- `lint-staged` applies both tools to supported staged source and configuration files.

The project continues to use npm because `package-lock.json` and the existing scripts establish npm as the repository package manager. The pre-commit hook remains the automatic formatting gate through `lint-staged`.

ESLint must continue rejecting explicit `any`, unused values, and `var`. No broad lint-rule expansion will be introduced if it produces unrelated repository-wide churn.

## React Structure

Renderer components will use `React.FC<Props>` declarations. Existing Props types remain `interface` declarations, and inline object types used by helper components will be replaced with named Props interfaces.

Export style will remain compatible with current imports: default-exported components stay default exports. The refactor changes declarations, not component behavior or rendered markup.

`App.tsx` currently creates an immutable empty query, derives filtered sessions from it, and retains a query matching helper despite having no query input. Remove that state, memoization, and helper, then pass the existing session list directly to `SessionsView`.

## Shared Domain Helpers

Create a focused shared metrics module for pure derived calculations used across overview and performance views:

- Estimated token cost using one named rate constant.
- Cache percentage.
- Total session warning count.
- Warning rate percentage.

The helpers consume existing `UsageSummary` or numeric inputs and return numbers. Formatting such as decimal places and currency symbols remains in renderer components.

Create a focused session identifier helper that extracts the Codex session ID from either a rollout filename or full path. Both `sessionParser.ts` and `usageScanner.ts` will use it, removing their duplicate regular expressions and fallback behavior.

These helpers stay pure and independent of Electron, React, and filesystem APIs so they can be tested directly.

## Constants and Naming

Module-level constants use `UPPER_CASE_SNAKE_CASE` as required by `AGENTS.md`. Replace descriptive lower-case constants such as chart color arrays and navigation metadata.

Extract repeated domain and chart geometry values when a name explains their role, including token pricing, chart dimensions, history limits, activity-cell counts, donut geometry, and percentage scaling. Small values that are structurally obvious in a one-off expression are not extracted solely to eliminate every numeric literal.

The goal is explanatory naming, not a global constants module. Constants remain close to the component or helper that owns them.

## Data Flow and Error Handling

Filesystem scanning, JSONL parsing, IPC exposure, and renderer loading state remain unchanged. Shared helpers receive already-normalized data and do not introduce new error paths.

Invalid or absent values retain current behavior:

- Empty input totals produce a zero cache percentage.
- No sessions produce a zero warning rate.
- Non-rollout filenames fall back to the filename without `.jsonl`.
- Existing malformed-line warnings and file-read warnings remain unchanged.

## Testing

Use test-driven development for new shared helpers:

- Cost, cache percentage, warning count, and warning rate tests.
- Session ID extraction from a rollout filename, a full Windows path, and a non-rollout filename.

Existing parser and aggregation tests must remain green. Final verification consists of:

- `npm test`
- `npm run lint`
- `npm run typecheck`
- `npm run build`

Prettier will format touched source files. Formatting unrelated application files is outside the scope of this change unless required for the repository-wide formatting check to pass.

## Success Criteria

- The repository uses both Prettier and ESLint through documented npm scripts and pre-commit staged-file checks.
- Renderer component declarations and Props types follow `AGENTS.md`.
- Repeated derived metrics and session ID parsing have one implementation each.
- Dead query state and filtering code are removed.
- Named constants replace targeted magic values and follow the required naming convention.
- No visible UI, IPC, scan, or aggregation behavior changes.
- Tests, lint, type checking, and production build all pass.
