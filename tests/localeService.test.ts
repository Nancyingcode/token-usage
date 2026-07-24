import i18next, { type i18n } from 'i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createLocaleService } from '../src/main/localeService';
import { createI18nOptions } from '../src/shared/i18n/resources';

describe('locale service', () => {
  let instance: i18n;

  beforeEach(async () => {
    instance = i18next.createInstance();
    await instance.init(createI18nOptions('en'));
  });

  it('commits a saved locale and notifies subscribers', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const service = createLocaleService({
      initialLocale: 'en',
      i18n: instance,
      store: { save },
    });
    const listener = vi.fn();
    service.subscribe(listener);

    await expect(service.setLocale('zh-CN')).resolves.toBe('zh-CN');
    expect(instance.resolvedLanguage).toBe('zh-CN');
    expect(save).toHaveBeenCalledWith('zh-CN');
    expect(listener).toHaveBeenCalledWith('zh-CN');
  });

  it('rolls back when persistence fails', async () => {
    const store = { save: vi.fn().mockRejectedValue(new Error('disk full')) };
    const service = createLocaleService({
      initialLocale: 'en',
      i18n: instance,
      store,
    });

    await expect(service.setLocale('zh-CN')).rejects.toThrow('disk full');
    expect(service.getLocale()).toBe('en');
    expect(instance.resolvedLanguage).toBe('en');
  });

  it('rejects unsupported locales before changing or saving', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const changeLanguage = vi.spyOn(instance, 'changeLanguage');
    const service = createLocaleService({
      initialLocale: 'en',
      i18n: instance,
      store: { save },
    });

    await expect(service.setLocale('fr')).rejects.toThrow('Unsupported locale');
    expect(changeLanguage).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('does not save unchanged locales and supports unsubscribe', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const service = createLocaleService({
      initialLocale: 'en',
      i18n: instance,
      store: { save },
    });
    const listener = vi.fn();
    const unsubscribe = service.subscribe(listener);

    await expect(service.setLocale('en')).resolves.toBe('en');
    unsubscribe();
    await service.setLocale('zh-CN');

    expect(save).toHaveBeenCalledTimes(1);
    expect(listener).not.toHaveBeenCalled();
  });
});
