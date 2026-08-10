import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const LEADING_FILE_HEADER_PATTERN = /^\/\*\*[\s\S]*?\*\//;
const VOLATILE_METADATA_PATTERN = /@(author|copyright|date|lastModified)\b/g;
const ALWAYS_REQUIRED_PREFIXES = [
  'src/main/',
  'src/preload/',
  'src/shared/',
  'src/renderer/hooks/',
] as const;
const COMPLEX_MODULE_PREFIXES = ['src/renderer/components/', 'src/renderer/utils/'] as const;
const TYPE_DECLARATION_PATH_PATTERN = /(?:Types\.ts|\.d\.ts)$/;
// Line count is a deterministic safety net for newly added renderer modules whose complexity is not encoded by directory.
const COMPLEX_MODULE_LINE_THRESHOLD = 120;

const readWorkspaceFile = (filePath: string): Promise<string> =>
  readFile(resolve(process.cwd(), filePath), 'utf8');

const getLeadingFileHeader = (source: string): string | undefined =>
  source.match(LEADING_FILE_HEADER_PATTERN)?.[0];

const normalizePath = (filePath: string): string => filePath.replaceAll('\\', '/');

const getSourceLineCount = (source: string): number => source.split(/\r?\n/).length;

const isFileHeaderRequired = (filePath: string, source: string): boolean => {
  const normalizedPath = normalizePath(filePath);

  if (TYPE_DECLARATION_PATH_PATTERN.test(normalizedPath)) {
    return false;
  }

  if (ALWAYS_REQUIRED_PREFIXES.some((prefix) => normalizedPath.startsWith(prefix))) {
    return true;
  }

  return (
    COMPLEX_MODULE_PREFIXES.some((prefix) => normalizedPath.startsWith(prefix)) &&
    getSourceLineCount(source) >= COMPLEX_MODULE_LINE_THRESHOLD
  );
};

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

  it('classifies architectural boundaries, shared logic, hooks, and complex renderer modules', () => {
    const longRendererModule = Array.from(
      { length: COMPLEX_MODULE_LINE_THRESHOLD },
      (_, index) => `const line${index} = ${index};`
    ).join('\n');
    const shortRendererModule = 'const label = "small";';

    expect(isFileHeaderRequired('src/main/newService.ts', shortRendererModule)).toBe(true);
    expect(isFileHeaderRequired('src/preload/newBridge.ts', shortRendererModule)).toBe(true);
    expect(isFileHeaderRequired('src/shared/newCalculation.ts', shortRendererModule)).toBe(true);
    expect(isFileHeaderRequired('src/shared/newTypes.ts', longRendererModule)).toBe(false);
    expect(isFileHeaderRequired('src/renderer/hooks/useExample.ts', shortRendererModule)).toBe(
      true
    );
    expect(isFileHeaderRequired('src/renderer/components/Small.tsx', shortRendererModule)).toBe(
      false
    );
    expect(isFileHeaderRequired('src/renderer/components/Large.tsx', longRendererModule)).toBe(
      true
    );
  });

  it('requires leading file headers on automatically classified modules', async () => {
    const sourceFilePaths = await getSourceFilePaths('src');
    const sources = await Promise.all(
      sourceFilePaths.map(async (filePath) => ({
        filePath,
        source: await readWorkspaceFile(filePath),
      }))
    );
    const missingHeaderPaths = sources
      .filter(
        ({ filePath, source }) =>
          isFileHeaderRequired(filePath, source) && getLeadingFileHeader(source) === undefined
      )
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
