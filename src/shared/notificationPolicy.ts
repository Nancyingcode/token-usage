/**
 * @file 预算通知去重策略
 * @description 根据策略、周期、指标和阈值生成回执键，并筛选与记录待发送通知。
 */
import type { BudgetAlert, NotificationReceipt } from './budgetTypes';

export const getNotificationReceiptKey = (alert: BudgetAlert): string =>
  `${alert.policyId}:${alert.period}:${alert.metric}:${alert.thresholdPercent}`;

export const selectPendingNotifications = (
  alerts: BudgetAlert[],
  receipts: NotificationReceipt[]
): BudgetAlert[] => {
  const lastPeriodByKey = new Map(receipts.map((receipt) => [receipt.key, receipt.periodStart]));

  return alerts.filter(
    (alert) => lastPeriodByKey.get(getNotificationReceiptKey(alert)) !== alert.periodStart
  );
};

export const recordNotifications = (
  receipts: NotificationReceipt[],
  alerts: BudgetAlert[],
  activePolicyIds: string[]
): NotificationReceipt[] => {
  const nextReceipts = new Map(receipts.map((receipt) => [receipt.key, receipt]));

  alerts.forEach((alert) => {
    const key = getNotificationReceiptKey(alert);
    nextReceipts.set(key, { key, policyId: alert.policyId, periodStart: alert.periodStart });
  });

  const activePolicyIdSet = new Set(activePolicyIds);
  return [...nextReceipts.values()].filter((receipt) => activePolicyIdSet.has(receipt.policyId));
};
