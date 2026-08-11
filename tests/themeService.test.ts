import { describe, expect, it, vi } from 'vitest';
import { createThemeService, type ThemeSystemSource } from '../src/main/themeService';

interface Harness {
  service: ReturnType<typeof createThemeService>;
  save: ReturnType<typeof vi.fn>;
  emitSystemUpdated: () => void;
  setSystemDark: (value: boolean) => void;
  unsubscribeSystem: ReturnType<typeof vi.fn>;
}

const createHarness = (
  initialPreference:
    'system' | 'mint-light' | 'emerald-dark' | 'ocean-dark' | 'sand-light' = 'system',
  initialDark = false
): Harness => {
  let dark = initialDark;
  let systemListener: (() => void) | undefined;
  const unsubscribeSystem = vi.fn();
  const systemSource: ThemeSystemSource = {
    shouldUseDarkColors: () => dark,
    subscribe: vi.fn((listener) => {
      systemListener = listener;
      return unsubscribeSystem;
    }),
  };
  const save = vi.fn(async () => undefined);
  const service = createThemeService({
    initialPreference,
    store: { save },
    systemSource,
  });

  return {
    service,
    save,
    emitSystemUpdated: () => systemListener?.(),
    setSystemDark: (value) => {
      dark = value;
    },
    unsubscribeSystem,
  };
};

describe('theme service', () => {
  it('persists a preference before publishing the resulting snapshot', async () => {
    const harness = createHarness();
    const listener = vi.fn();
    harness.service.subscribe(listener);

    await expect(harness.service.setPreference('ocean-dark')).resolves.toEqual({
      preference: 'ocean-dark',
      resolvedTheme: 'ocean-dark',
    });

    expect(harness.save).toHaveBeenCalledWith('ocean-dark');
    expect(listener).toHaveBeenCalledWith({
      preference: 'ocean-dark',
      resolvedTheme: 'ocean-dark',
    });
  });

  it('keeps the previous snapshot and does not publish when saving fails', async () => {
    const harness = createHarness();
    const listener = vi.fn();
    harness.save.mockRejectedValueOnce(new Error('disk full'));
    harness.service.subscribe(listener);

    await expect(harness.service.setPreference('sand-light')).rejects.toThrow('disk full');
    expect(harness.service.getSnapshot()).toEqual({
      preference: 'system',
      resolvedTheme: 'mint-light',
    });
    expect(listener).not.toHaveBeenCalled();
  });

  it('updates a system preference only when its resolved theme changes', () => {
    const harness = createHarness('system', false);
    const listener = vi.fn();
    harness.service.subscribe(listener);

    harness.emitSystemUpdated();
    expect(listener).not.toHaveBeenCalled();

    harness.setSystemDark(true);
    harness.emitSystemUpdated();
    expect(harness.service.getSnapshot()).toEqual({
      preference: 'system',
      resolvedTheme: 'emerald-dark',
    });
    expect(listener).toHaveBeenCalledOnce();
  });

  it('ignores system changes for an explicit preference', () => {
    const harness = createHarness('sand-light', false);
    const listener = vi.fn();
    harness.service.subscribe(listener);

    harness.setSystemDark(true);
    harness.emitSystemUpdated();

    expect(harness.service.getSnapshot()).toEqual({
      preference: 'sand-light',
      resolvedTheme: 'sand-light',
    });
    expect(listener).not.toHaveBeenCalled();
  });

  it('resolves the latest system appearance after persistence completes', async () => {
    let dark = false;
    let systemListener: (() => void) | undefined;
    let finishSave: (() => void) | undefined;
    const service = createThemeService({
      initialPreference: 'ocean-dark',
      store: {
        save: vi.fn(
          async () =>
            new Promise<void>((resolve) => {
              finishSave = resolve;
            })
        ),
      },
      systemSource: {
        shouldUseDarkColors: () => dark,
        subscribe: (listener) => {
          systemListener = listener;
          return () => undefined;
        },
      },
    });

    const update = service.setPreference('system');
    dark = true;
    systemListener?.();
    finishSave?.();

    await expect(update).resolves.toEqual({
      preference: 'system',
      resolvedTheme: 'emerald-dark',
    });
  });

  it('validates unknown input and releases the system listener on destroy', async () => {
    const harness = createHarness();

    await expect(harness.service.setPreference('unknown')).rejects.toThrow(
      'Unsupported theme preference.'
    );
    harness.service.destroy();

    expect(harness.unsubscribeSystem).toHaveBeenCalledOnce();
  });
});
