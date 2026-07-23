import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLocaleStore, type LocaleFileSystem } from '../src/main/localeStore';

const TEST_DIRECTORY_PREFIX = 'codex-locale-store-';

describe('locale store', () => {
  let testDirectory = '';
  let configPath = '';

  beforeEach(async () => {
    testDirectory = await mkdtemp(join(tmpdir(), TEST_DIRECTORY_PREFIX));
    configPath = join(testDirectory, 'locale-preferences.json');
  });

  afterEach(async () => {
    await rm(testDirectory, { recursive: true, force: true });
  });

  it('follows the system when no preference exists', async () => {
    const store = createLocaleStore(configPath);

    await expect(store.load('zh-HK')).resolves.toBe('zh-CN');
  });

  it('saves and reloads an explicit locale', async () => {
    const store = createLocaleStore(configPath);

    await store.save('en');

    await expect(store.load('zh-CN')).resolves.toBe('en');
    await expect(readFile(configPath, 'utf8')).resolves.toContain('"schemaVersion": 1');
  });

  it.each(['{', '{"schemaVersion":99,"locale":"zh-CN"}', '{"schemaVersion":1,"locale":"fr"}'])(
    'falls back for invalid persisted content',
    async (content) => {
      await writeFile(configPath, content, 'utf8');

      await expect(createLocaleStore(configPath).load('zh-CN')).resolves.toBe('zh-CN');
    }
  );

  it('does not replace the target when the temporary write fails', async () => {
    const rename = vi.fn<LocaleFileSystem['rename']>();
    const remove = vi.fn<LocaleFileSystem['rm']>().mockResolvedValue(undefined);
    const fileSystem: LocaleFileSystem = {
      readFile: vi.fn<LocaleFileSystem['readFile']>(),
      mkdir: vi.fn<LocaleFileSystem['mkdir']>().mockResolvedValue(undefined),
      writeFile: vi.fn<LocaleFileSystem['writeFile']>().mockRejectedValue(new Error('disk full')),
      rename,
      rm: remove,
    };

    await expect(createLocaleStore(configPath, fileSystem).save('zh-CN')).rejects.toThrow(
      'disk full'
    );
    expect(rename).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith(`${configPath}.tmp`, { force: true });
  });
});
