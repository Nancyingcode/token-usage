import { describe, expect, it, vi } from 'vitest';
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
  message: 'Token budget reached 100%.',
};

describe('notification service', () => {
  it('returns false when system notifications are unavailable', () => {
    const service = createNotificationService(vi.fn(), {
      isSupported: () => false,
      create: vi.fn(),
    });

    expect(service.notify(ALERT)).toBe(false);
  });

  it('shows a notification and navigates to its policy when clicked', () => {
    const onNavigate = vi.fn();
    const show = vi.fn();
    let clickListener = (): void => undefined;
    const service = createNotificationService(onNavigate, {
      isSupported: () => true,
      create: vi.fn(() => ({
        onClick: (listener: () => void) => {
          clickListener = listener;
        },
        show,
      })),
    });

    expect(service.notify(ALERT)).toBe(true);
    expect(show).toHaveBeenCalledOnce();

    clickListener();
    expect(onNavigate).toHaveBeenCalledWith('policy-1');
  });
});
