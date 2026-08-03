import { describe, expect, it, vi } from 'vitest';
import {
  createUsageDataPathService,
  UsageDataPathServiceError,
  type UsageDataPathServiceDependencies,
} from '../src/main/usageDataPathService';
import { buildUsageSummary } from '../src/shared/usageMath';

const DEFAULT_DIRECTORY = 'C:\\Users\\tester\\.codex\\sessions';
const CUSTOM_DIRECTORY = 'D:\\Codex\\sessions';
const SCAN_RESULT = {
  sessionsDir: CUSTOM_DIRECTORY,
  scannedAt: '2026-08-04T00:00:00.000Z',
  summary: buildUsageSummary([]),
  warnings: [],
};

describe('usage data path service', () => {
  it.each([
    ['', 'path-required'],
    ['sessions', 'path-not-absolute'],
  ] as const)('rejects %j with %s', async (input, code) => {
    const harness = makeHarness();

    await expect(harness.service.update(input)).rejects.toMatchObject({ code });
    expect(harness.dependencies.store.save).not.toHaveBeenCalled();
  });

  it('rejects a path that is not a readable directory', async () => {
    const harness = makeHarness();
    harness.dependencies.validateDirectory.mockRejectedValueOnce(new Error('not a directory'));

    await expect(harness.service.update(CUSTOM_DIRECTORY)).rejects.toEqual(
      new UsageDataPathServiceError('path-unreadable')
    );
    expect(harness.dependencies.store.save).not.toHaveBeenCalled();
  });

  it('persists before switching the runtime and returns the refreshed result', async () => {
    const callOrder: string[] = [];
    const harness = makeHarness(callOrder);

    await expect(harness.service.update(`  ${CUSTOM_DIRECTORY}  `)).resolves.toEqual({
      settings: {
        sessionsDir: CUSTOM_DIRECTORY,
        defaultSessionsDir: DEFAULT_DIRECTORY,
        usingDefault: false,
      },
      result: SCAN_RESULT,
    });
    expect(callOrder).toEqual(['validate', 'save', 'refresh']);
    expect(harness.dependencies.store.save).toHaveBeenCalledWith(CUSTOM_DIRECTORY);
    expect(harness.dependencies.updateSessionsDir).toHaveBeenCalledWith(CUSTOM_DIRECTORY);
  });

  it('clears the override when restoring the default directory', async () => {
    const harness = makeHarness();
    await harness.service.update(CUSTOM_DIRECTORY);

    await harness.service.reset();

    expect(harness.dependencies.store.save).toHaveBeenLastCalledWith(undefined);
    expect(harness.dependencies.updateSessionsDir).toHaveBeenLastCalledWith(DEFAULT_DIRECTORY);
    expect(harness.service.getSettings()).toEqual({
      sessionsDir: DEFAULT_DIRECTORY,
      defaultSessionsDir: DEFAULT_DIRECTORY,
      usingDefault: true,
    });
  });

  it('rolls back the persisted and runtime directory when the new scan fails', async () => {
    const harness = makeHarness();
    harness.dependencies.updateSessionsDir
      .mockRejectedValueOnce(new Error('scan failed'))
      .mockResolvedValueOnce({ ...SCAN_RESULT, sessionsDir: DEFAULT_DIRECTORY });

    await expect(harness.service.update(CUSTOM_DIRECTORY)).rejects.toThrow('scan failed');

    expect(harness.dependencies.store.save).toHaveBeenNthCalledWith(1, CUSTOM_DIRECTORY);
    expect(harness.dependencies.store.save).toHaveBeenNthCalledWith(2, undefined);
    expect(harness.dependencies.updateSessionsDir).toHaveBeenNthCalledWith(1, CUSTOM_DIRECTORY);
    expect(harness.dependencies.updateSessionsDir).toHaveBeenNthCalledWith(2, DEFAULT_DIRECTORY);
    expect(harness.service.getSettings().usingDefault).toBe(true);
  });
});

interface ServiceHarness {
  dependencies: UsageDataPathServiceDependencies & {
    validateDirectory: ReturnType<typeof vi.fn<(sessionsDir: string) => Promise<void>>>;
    updateSessionsDir: ReturnType<
      typeof vi.fn<(sessionsDir: string) => Promise<typeof SCAN_RESULT>>
    >;
  };
  service: ReturnType<typeof createUsageDataPathService>;
}

const makeHarness = (callOrder: string[] = []): ServiceHarness => {
  const dependencies: ServiceHarness['dependencies'] = {
    defaultSessionsDir: DEFAULT_DIRECTORY,
    initialSessionsDir: DEFAULT_DIRECTORY,
    store: {
      load: vi.fn(async () => undefined),
      save: vi.fn(async () => {
        callOrder.push('save');
      }),
    },
    validateDirectory: vi.fn(async (_sessionsDir: string) => {
      callOrder.push('validate');
    }),
    updateSessionsDir: vi.fn(async (sessionsDir) => {
      callOrder.push('refresh');
      return { ...SCAN_RESULT, sessionsDir };
    }),
  };

  return {
    dependencies,
    service: createUsageDataPathService(dependencies),
  };
};
