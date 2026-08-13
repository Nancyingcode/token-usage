import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readPreCommitHook = (): string =>
  readFileSync(resolve(process.cwd(), '.husky/pre-commit'), 'utf8').replace(/\r\n/g, '\n');

describe('Git hook encoding policy', () => {
  it('uses a UTF-8 Windows console before lint-staged writes diagnostics', () => {
    const hook = readPreCommitHook();

    expect(hook).toContain('MINGW*|MSYS*|CYGWIN*');
    expect(hook).toContain('chcp.com 65001');
    expect(hook).toContain('export LANG=C.utf8');
    expect(hook).toContain('export LC_ALL=C.utf8');
  });

  it('continues to run the repository lint-staged script', () => {
    expect(readPreCommitHook()).toContain('npm run lint:staged');
  });
});
