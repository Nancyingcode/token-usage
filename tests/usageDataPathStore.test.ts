import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createUsageDataPathStore,
  type UsageDataPathFileSystem,
} from '../src/main/usageDataPathStore';

const TEST_DIRECTORY_PREFIX = 'codex-usage-data-path-store-';

describe('usage data path store', () => {
  let testDirectory = '';
  let configPath = '';

  beforeEach(async () => {
    testDirectory = await mkdtemp(join(tmpdir(), TEST_DIRECTORY_PREFIX));
    configPath = join(testDirectory, 'usage-data-path.json');
  });

  afterEach(async () => {
    await rm(testDirectory, { recursive: true, force: true });
  });

  it('uses no override when the configuration is missing or invalid', async () => {
    await expect(createUsageDataPathStore(configPath).load()).resolves.toBeUndefined();

    await writeFile(configPath, '{"schemaVersion":99,"sessionsDir":"C:\\\\sessions"}');
    await expect(createUsageDataPathStore(configPath).load()).resolves.toBeUndefined();
  });

  it('round-trips a custom directory and can clear the override', async () => {
    const store = createUsageDataPathStore(configPath);

    await store.save('D:\\Codex\\sessions');
    await expect(store.load()).resolves.toBe('D:\\Codex\\sessions');
    await expect(readFile(configPath, 'utf8')).resolves.toContain('"schemaVersion": 1');

    await store.save(undefined);
    await expect(store.load()).resolves.toBeUndefined();
  });

  it('does not replace the target when the temporary write fails', async () => {
    const rename = vi.fn<UsageDataPathFileSystem['rename']>();
    const remove = vi.fn<UsageDataPathFileSystem['rm']>().mockResolvedValue(undefined);
    const fileSystem: UsageDataPathFileSystem = {
      readFile: vi.fn<UsageDataPathFileSystem['readFile']>(),
      mkdir: vi.fn<UsageDataPathFileSystem['mkdir']>().mockResolvedValue(undefined),
      writeFile: vi
        .fn<UsageDataPathFileSystem['writeFile']>()
        .mockRejectedValue(new Error('disk full')),
      rename,
      rm: remove,
    };

    await expect(
      createUsageDataPathStore(configPath, fileSystem).save('D:\\Codex\\sessions')
    ).rejects.toThrow('disk full');
    expect(rename).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith(`${configPath}.tmp`, { force: true });
  });
});
