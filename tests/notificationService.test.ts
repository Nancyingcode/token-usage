import i18next from 'i18next';
import { describe, expect, it, vi } from 'vitest';
import { createMainI18n } from '../src/main/i18n';
import { createNotificationService } from '../src/main/notificationService';
import type { BudgetAlert } from '../src/shared/budgetTypes';

const ALERT: BudgetAlert = {
  id: 'policy-1:day:token:100:period',
  policyId: 'policy-1',
  period: 'day',
  periodStart: '2026-07-20T00:00:00.000Z',
  metric: 'token',
  thresholdPercent: 100,
  severity: 'over',
};

describe('notification service', () => {
  it('returns false when system notifications are unavailable', async () => {
    const i18n = await createMainI18n('en');
    const service = createNotificationService(
      vi.fn(),
      {
        isSupported: () => false,
        create: vi.fn(),
      },
      i18n
    );

    expect(service.notify(ALERT)).toBe(false);
  });

  it.each([
    [
      'en' as const,
      {
        title: 'Token budget alert',
        body: 'Token budget reached 100%.',
      },
    ],
    [
      'zh-CN' as const,
      {
        title: 'Token 预算提醒',
        body: 'Token 预算已达到 100%。',
      },
    ],
  ])(
    'shows a %s notification and navigates to its policy when clicked',
    async (locale, expected) => {
      const i18n = await createMainI18n(locale);
      const onNavigate = vi.fn();
      const show = vi.fn();
      const create = vi.fn(() => ({
        onClick: (listener: () => void) => {
          clickListener = listener;
        },
        show,
      }));
      let clickListener = (): void => undefined;
      const service = createNotificationService(
        onNavigate,
        {
          isSupported: () => true,
          create,
        },
        i18n
      );

      expect(service.notify(ALERT)).toBe(true);
      expect(create).toHaveBeenCalledWith(expected);
      expect(show).toHaveBeenCalledOnce();

      clickListener();
      expect(onNavigate).toHaveBeenCalledWith('policy-1');
    }
  );

  it('falls back to English when selected-locale initialization fails', async () => {
    const failingInstance = i18next.createInstance();
    const fallbackInstance = i18next.createInstance();
    vi.spyOn(failingInstance, 'init').mockRejectedValueOnce(new Error('initialization failed'));
    const factory = vi
      .fn()
      .mockReturnValueOnce(failingInstance)
      .mockReturnValueOnce(fallbackInstance);

    const i18n = await createMainI18n('zh-CN', factory);

    expect(i18n.language).toBe('en');
    expect(factory).toHaveBeenCalledTimes(2);
  });
});
