import { describe, expect, it } from 'vitest';
import {
  getNotificationReceiptKey,
  recordNotifications,
  selectPendingNotifications,
} from '../src/shared/notificationPolicy';
import type { BudgetAlert, NotificationReceipt } from '../src/shared/budgetTypes';

describe('notification policy', () => {
  it('does not notify the same threshold twice in one natural period', () => {
    const alert = makeAlert();
    const receipts: NotificationReceipt[] = [
      {
        key: getNotificationReceiptKey(alert),
        policyId: alert.policyId,
        periodStart: alert.periodStart,
      },
    ];

    expect(selectPendingNotifications([alert], receipts)).toEqual([]);
  });

  it('notifies the same threshold again in a new natural period', () => {
    const alert = makeAlert({ periodStart: '2026-07-21T00:00:00.000Z' });
    const receipts: NotificationReceipt[] = [
      {
        key: getNotificationReceiptKey(alert),
        policyId: alert.policyId,
        periodStart: '2026-07-20T00:00:00.000Z',
      },
    ];

    expect(selectPendingNotifications([alert], receipts)).toEqual([alert]);
  });

  it('records the latest period and removes deleted policy receipts', () => {
    const currentAlert = makeAlert({ policyId: 'active-policy' });
    const staleReceipt: NotificationReceipt = {
      key: 'deleted-policy:day:token:80',
      policyId: 'deleted-policy',
      periodStart: '2026-07-19T00:00:00.000Z',
    };

    expect(recordNotifications([staleReceipt], [currentAlert], ['active-policy'])).toEqual([
      {
        key: getNotificationReceiptKey(currentAlert),
        policyId: 'active-policy',
        periodStart: currentAlert.periodStart,
      },
    ]);
  });
});

const makeAlert = (overrides: Partial<BudgetAlert> = {}): BudgetAlert => ({
  id: 'policy-1:day:token:80:2026-07-20T00:00:00.000Z',
  policyId: 'policy-1',
  period: 'day',
  periodStart: '2026-07-20T00:00:00.000Z',
  metric: 'token',
  thresholdPercent: 80,
  severity: 'warning',
  ...overrides,
});
