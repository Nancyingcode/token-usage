import { ESLint } from 'eslint';
import type { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

const ERROR_SEVERITY = 2;
const OFF_SEVERITY = 0;

describe('eslint configuration', () => {
  it('loads every required Airbnb rule family for TSX', async () => {
    const eslint = new ESLint({ cwd: process.cwd() });
    const config = await eslint.calculateConfigForFile('src/renderer/App.tsx');

    expect(ruleSeverity(config.rules?.eqeqeq)).toBe(ERROR_SEVERITY);
    expect(ruleSeverity(config.rules?.['import/no-unresolved'])).toBe(ERROR_SEVERITY);
    expect(ruleSeverity(config.rules?.['react/jsx-no-target-blank'])).toBe(ERROR_SEVERITY);
    expect(ruleSeverity(config.rules?.['react-hooks/rules-of-hooks'])).toBe(ERROR_SEVERITY);
    expect(ruleSeverity(config.rules?.['jsx-a11y/alt-text'])).toBe(ERROR_SEVERITY);
    expect(ruleSeverity(config.rules?.['@typescript-eslint/no-shadow'])).toBe(ERROR_SEVERITY);
    expect(ruleSeverity(config.rules?.['no-shadow'])).toBe(OFF_SEVERITY);
    expect(ruleSeverity(config.rules?.['comma-dangle'])).toBe(OFF_SEVERITY);
  });

  it('parses modern syntax in the flat configuration file', async () => {
    const eslint = new ESLint({ cwd: process.cwd() });
    const config = await eslint.calculateConfigForFile('eslint.config.js');

    expect(config.languageOptions?.ecmaVersion).toBe(2026);
  });
});

function ruleSeverity(rule: Linter.RuleEntry | undefined): Linter.RuleSeverity | undefined {
  return Array.isArray(rule) ? rule[0] : rule;
}
