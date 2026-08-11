import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createThemeStore, type ThemeFileSystem } from '../src/main/themeStore';

const TEST_DIRECTORY_PREFIX = 'codex-theme-store-';

describe('theme store', () => {
  let testDirectory = '';
  let configPath = '';

  beforeEach(async () => {
    testDirectory = await mkdtemp(join(tmpdir(), TEST_DIRECTORY_PREFIX));
    configPath = join(testDirectory, 'theme-preferences.json');
  });

  afterEach(async () => {
    await rm(testDirectory, { recursive: true, force: true });
  });

  it('follows the system when no preference exists', async () => {
    await expect(createThemeStore(configPath).load()).resolves.toBe('system');
  });

  it('saves and reloads an explicit theme preference', async () => {
    const store = createThemeStore(configPath);

    await store.save('ocean-dark');

    await expect(store.load()).resolves.toBe('ocean-dark');
    await expect(readFile(configPath, 'utf8')).resolves.toContain('"schemaVersion": 1');
  });

  it.each([
    '{',
    '{"schemaVersion":99,"preference":"system"}',
    '{"schemaVersion":1,"preference":"unknown"}',
  ])('falls back for invalid persisted content', async (content) => {
    await writeFile(configPath, content, 'utf8');

    await expect(createThemeStore(configPath).load()).resolves.toBe('system');
  });

  it('rejects invalid preferences without replacing the target', async () => {
    await writeFile(configPath, '{"existing":true}', 'utf8');
    const store = createThemeStore(configPath);

    await expect(store.save('unknown' as never)).rejects.toThrow('Unsupported theme preference.');
    await expect(readFile(configPath, 'utf8')).resolves.toBe('{"existing":true}');
  });

  it('does not replace the target when the temporary write fails', async () => {
    const rename = vi.fn<ThemeFileSystem['rename']>();
    const remove = vi.fn<ThemeFileSystem['rm']>().mockResolvedValue(undefined);
    const fileSystem: ThemeFileSystem = {
      readFile: vi.fn<ThemeFileSystem['readFile']>(),
      mkdir: vi.fn<ThemeFileSystem['mkdir']>().mockResolvedValue(undefined),
      writeFile: vi.fn<ThemeFileSystem['writeFile']>().mockRejectedValue(new Error('disk full')),
      rename,
      rm: remove,
    };

    await expect(createThemeStore(configPath, fileSystem).save('sand-light')).rejects.toThrow(
      'disk full'
    );
    expect(rename).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith(`${configPath}.tmp`, { force: true });
  });
});
