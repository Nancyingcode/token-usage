import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint({ cwd: process.cwd() });
const FIXTURE_PATH = 'src/renderer/CompoundConditionFixture.tsx';
const TEST_FIXTURE_PATH = 'tests/EslintPolicyFixture.test.ts';
const TEMPLATE_LITERAL_TEST_FIXTURE_PATH = 'tests/packagingConfig.test.ts';

const lintSource = async (source: string, filePath = FIXTURE_PATH): Promise<string[]> => {
  const [result] = await eslint.lintText(source, { filePath });
  return result.messages.map(({ ruleId }) => ruleId ?? 'unknown');
};

describe('ESLint policy', () => {
  it('enforces type-only imports', async () => {
    const rules = await lintSource(`
      import { Example } from './example';
      export type Alias = Example;
    `);

    expect(rules).toContain('@typescript-eslint/consistent-type-imports');
  });

  it('rejects console calls and non-Error promise rejections in production code', async () => {
    const rules = await lintSource(`
      console.log('debug');
      export const load = () => Promise.reject('failed');
    `);

    expect(rules).toContain('no-console');
    expect(rules).toContain('prefer-promise-reject-errors');
  });

  it('allows console calls and flexible promise rejections in tests', async () => {
    const rules = await lintSource(
      `
        console.log('debug');
        export const load = () => Promise.reject('failed');
      `,
      TEST_FIXTURE_PATH
    );

    expect(rules).not.toContain('no-console');
    expect(rules).not.toContain('prefer-promise-reject-errors');
  });

  it('rejects super-linear regular expressions and unused capturing groups', async () => {
    const rules = await lintSource(`
      export const hasRepeatedA = (value: string) => /(a+)+$/.test(value);
      export const hasPrefix = (value: string) => /(prefix)-value/.test(value);
    `);

    expect(rules).toContain('regexp/no-super-linear-backtracking');
    expect(rules).toContain('regexp/no-unused-capturing-group');
  });

  it('rejects event listeners without lifecycle cleanup', async () => {
    const rules = await lintSource(`
      import { useEffect } from 'react';

      const handleResize = () => undefined;
      const Example = () => {
        useEffect(() => {
          window.addEventListener('resize', handleResize);
        }, []);
        return null;
      };

      export default Example;
    `);

    expect(rules).toContain('react-web-api/no-leaked-event-listener');
  });

  it('protects the renderer filesystem and Electron process boundary', async () => {
    const rules = await lintSource(`
      import { ipcRenderer } from 'electron';
      import { readFile } from 'node:fs/promises';
      import { join } from 'path';
      import { scanUsage } from '../main/usageScanner';
      export const loadOs = () => import('node:os');
      export { ipcRenderer, join, readFile, scanUsage };
    `);

    expect(rules.filter((rule) => rule === 'no-restricted-imports')).toHaveLength(4);
    expect(rules).toContain('no-restricted-syntax');
  });

  it('rejects accidental template interpolation in ordinary strings', async () => {
    const rules = await lintSource(`
      export const message = 'Hello, \${name}';
    `);

    expect(rules).toContain('no-template-curly-in-string');
  });

  it('allows literal template placeholders in configuration policy tests', async () => {
    const rules = await lintSource(
      `
        export const artifactName = 'Setup-\${version}.exe';
      `,
      TEMPLATE_LITERAL_TEST_FIXTURE_PATH
    );

    expect(rules).not.toContain('no-template-curly-in-string');
  });

  it('warns when React flushSync is imported', async () => {
    const rules = await lintSource(`
      import { flushSync } from 'react-dom';
      flushSync(() => undefined);
    `);

    expect(rules).toContain('no-restricted-imports');
  });

  it('enforces eslint-react rules for TypeScript components', async () => {
    const rules = await lintSource(`
      const Example = () => <>{['first', 'second'].map((label) => <span>{label}</span>)}</>;
      export default Example;
    `);

    expect(rules).toContain('@eslint-react/no-missing-key');
  });

  it('rejects compound ternary and direct rendering conditions', async () => {
    const ternaryRules = await lintSource(`
      const Example = ({ ready, visible }: { ready: boolean; visible: boolean }) => (
        <>{ready && visible ? <span>Ready</span> : null}</>
      );
      export default Example;
    `);
    const directRules = await lintSource(`
      const Example = ({ ready, visible }: { ready: boolean; visible: boolean }) => (
        <>{ready && visible && <span>Ready</span>}</>
      );
      export default Example;
    `);

    expect(ternaryRules).toContain('no-restricted-syntax');
    expect(directRules).toContain('no-restricted-syntax');
  });

  it('allows single conditions and value fallbacks', async () => {
    const singleConditionRules = await lintSource(`
      const Example = ({ visible }: { visible: boolean }) => (
        <>{visible ? <span>Visible</span> : null}</>
      );
      export default Example;
    `);
    const fallbackRules = await lintSource(`
      const Example = ({ primary, secondary }: { primary?: string; secondary?: string }) => (
        <>{primary || secondary || <span>Unknown</span>}</>
      );
      export default Example;
    `);

    expect(singleConditionRules).not.toContain('no-restricted-syntax');
    expect(fallbackRules).not.toContain('no-restricted-syntax');
  });
});
