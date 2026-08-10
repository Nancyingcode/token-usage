import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const CHECKER_PATH = resolve(process.cwd(), 'scripts/check-docs.cjs');
const temporaryDirectories: string[] = [];

const createTemporaryDirectory = async (): Promise<string> => {
  const directoryPath = await mkdtemp(join(tmpdir(), 'token-usage-docs-'));
  temporaryDirectories.push(directoryPath);
  return directoryPath;
};

const runDocumentationCheck = (filePath: string) =>
  spawnSync(process.execPath, [CHECKER_PATH, filePath], {
    encoding: 'utf8',
  });

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directoryPath) => rm(directoryPath, { recursive: true, force: true }))
  );
});

describe('documentation policy checker', () => {
  it('accepts balanced Markdown with valid inline and reference links', async () => {
    const directoryPath = await createTemporaryDirectory();
    const targetPath = join(directoryPath, 'target.md');
    const documentPath = join(directoryPath, 'document.md');
    await writeFile(targetPath, '# Target\n', 'utf8');
    await writeFile(
      documentPath,
      '# Document\n\n[inline](./target.md)\n\n[reference]: ./target.md\n\n`[inline-code]: ignored`\n\n```ts\nconst flags: { [flag]: true } = { feature: true };\n```\n',
      'utf8'
    );

    const result = runDocumentationCheck(documentPath);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Documentation checks passed (1 files).');
  });

  it('reports missing local targets and unclosed code fences', async () => {
    const directoryPath = await createTemporaryDirectory();
    const documentPath = join(directoryPath, 'invalid.md');
    await writeFile(documentPath, '# Invalid\n\n[missing](./missing.md)\n\n```ts\n', 'utf8');

    const result = runDocumentationCheck(documentPath);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('missing local link target ./missing.md');
    expect(result.stderr).toContain('unclosed fenced code block');
  });
});
