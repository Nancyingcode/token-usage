import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint({ cwd: process.cwd() });
const FIXTURE_PATH = 'src/renderer/CompoundConditionFixture.tsx';

const lintSource = async (source: string): Promise<string[]> => {
  const [result] = await eslint.lintText(source, { filePath: FIXTURE_PATH });
  return result.messages.map(({ ruleId }) => ruleId ?? 'unknown');
};

describe('JSX compound condition lint policy', () => {
  it('warns when React flushSync is imported', async () => {
    const rules = await lintSource(`
      import { flushSync } from 'react-dom';
      flushSync(() => undefined);
    `);

    expect(rules).toContain('no-restricted-imports');
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
