import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REQUIRED_FILE_HEADER_PATHS = [
  'src/main/main.ts',
  'src/main/budgetRuntime.ts',
  'src/main/sessionParser.ts',
  'src/main/usageScanner.ts',
  'src/shared/budgetEvaluation.ts',
  'src/shared/budgetValidation.ts',
  'src/shared/pricing.ts',
  'src/shared/usageMath.ts',
  'src/renderer/components/BudgetDrawer.tsx',
  'src/renderer/components/BudgetList.tsx',
  'src/renderer/components/BudgetsView.tsx',
  'src/renderer/components/ModelPricingView.tsx',
  'src/renderer/components/Overview.tsx',
  'src/renderer/components/PerformanceView.tsx',
  'src/renderer/hooks/useBudgetSnapshot.ts',
] as const;
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const LEADING_FILE_HEADER_PATTERN = /^\/\*\*[\s\S]*?\*\//;
const VOLATILE_METADATA_PATTERN = /@(author|copyright|date|lastModified)\b/g;

const readWorkspaceFile = (filePath: string): Promise<string> =>
  readFile(resolve(process.cwd(), filePath), 'utf8');

const getLeadingFileHeader = (source: string): string | undefined =>
  source.match(LEADING_FILE_HEADER_PATTERN)?.[0];

const getSourceFilePaths = async (directoryPath: string): Promise<string[]> => {
  const absoluteDirectoryPath = resolve(process.cwd(), directoryPath);
  const entries = await readdir(absoluteDirectoryPath, { withFileTypes: true });
  const nestedPaths = await Promise.all(
    entries.map(async (entry): Promise<string[]> => {
      const absoluteEntryPath = join(absoluteDirectoryPath, entry.name);

      if (entry.isDirectory()) {
        return getSourceFilePaths(relative(process.cwd(), absoluteEntryPath));
      }

      return SOURCE_EXTENSIONS.has(extname(entry.name))
        ? [relative(process.cwd(), absoluteEntryPath)]
        : [];
    })
  );

  return nestedPaths.flat();
};

const getVolatileMetadataTags = (header: string): string[] =>
  [...header.matchAll(VOLATILE_METADATA_PATTERN)].map(([tag]) => tag);

describe('file header policy', () => {
  it('links AGENTS.md to the dedicated file header guideline', async () => {
    const agents = await readWorkspaceFile('AGENTS.md');

    expect(agents).toContain('[文件头规范](./rules/file-header.md)');
  });

  it('requires leading file headers on core and complex modules', async () => {
    const sources = await Promise.all(
      REQUIRED_FILE_HEADER_PATHS.map(async (filePath) => ({
        filePath,
        source: await readWorkspaceFile(filePath),
      }))
    );
    const missingHeaderPaths = sources
      .filter(({ source }) => getLeadingFileHeader(source) === undefined)
      .map(({ filePath }) => filePath);

    expect(missingHeaderPaths).toEqual([]);
  });

  it('recognizes volatile metadata fields', () => {
    const header = '/** @author Example @date 2026-07-23 @lastModified 2026-07-24 */';

    expect(getVolatileMetadataTags(header)).toEqual(['@author', '@date', '@lastModified']);
  });

  it('keeps volatile metadata out of source file headers', async () => {
    const sourceFilePaths = await getSourceFilePaths('src');
    const sources = await Promise.all(
      sourceFilePaths.map(async (filePath) => ({
        filePath,
        source: await readWorkspaceFile(filePath),
      }))
    );
    const violations = sources.flatMap(({ filePath, source }) => {
      const header = getLeadingFileHeader(source);

      return header === undefined
        ? []
        : getVolatileMetadataTags(header).map((tag) => `${filePath}: ${tag}`);
    });

    expect(violations).toEqual([]);
  });
});
