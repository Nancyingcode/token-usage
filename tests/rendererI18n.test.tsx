import i18next from 'i18next';
import { describe, expect, it, vi } from 'vitest';
import { createRendererI18n } from '../src/renderer/i18n';

describe('renderer i18n', () => {
  it('initializes the requested locale with React integration', async () => {
    const i18n = await createRendererI18n('zh-CN');

    expect(i18n.resolvedLanguage).toBe('zh-CN');
    expect(i18n.t('common:navigation.overview')).toBe('概览');
    expect(i18n.t('common:navigation.group.insights')).toBe('洞察');
    expect(i18n.t('common:navigation.group.control')).toBe('控制');
    expect(i18n.t('common:navigation.tools')).toBe('项目');
    expect(i18n.t('common:navigation.wrapped')).toBe('设置');
  });

  it('falls back to English when selected-locale initialization fails', async () => {
    const failingInstance = i18next.createInstance();
    const fallbackInstance = i18next.createInstance();
    vi.spyOn(failingInstance, 'init').mockRejectedValueOnce(new Error('initialization failed'));
    const factory = vi
      .fn()
      .mockReturnValueOnce(failingInstance)
      .mockReturnValueOnce(fallbackInstance);

    const i18n = await createRendererI18n('zh-CN', factory);

    expect(i18n.resolvedLanguage).toBe('en');
    expect(factory).toHaveBeenCalledTimes(2);
  });
});
