/**
 * @file 系统预算通知服务
 * @description 将预算告警转换为本地化系统通知，并在点击后触发应用内导航。
 */
import type { i18n } from 'i18next';
import type { BudgetAlert } from '../shared/budgetTypes';

export interface NotificationService {
  notify: (alert: BudgetAlert) => boolean;
}

export interface SystemNotification {
  onClick: (listener: () => void) => void;
  show: () => void;
}

export interface SystemNotificationAdapter {
  isSupported: () => boolean;
  create: (options: { title: string; body: string }) => SystemNotification;
}

export interface ElectronNotificationInstance {
  on: (event: 'click', listener: () => void) => void;
  show: () => void;
}

export interface ElectronNotificationConstructor {
  isSupported: () => boolean;
  new (options: { title: string; body: string }): ElectronNotificationInstance;
}

export const createElectronNotificationAdapter = (
  NotificationClass: ElectronNotificationConstructor
): SystemNotificationAdapter => ({
  isSupported: () => NotificationClass.isSupported(),
  create: (options) => {
    const notification = new NotificationClass(options);

    return {
      onClick: (listener) => notification.on('click', listener),
      show: () => notification.show(),
    };
  },
});

export const createNotificationService = (
  onNavigate: (policyId: string) => void,
  adapter: SystemNotificationAdapter,
  i18n: Pick<i18n, 't'>
): NotificationService => ({
  notify: (alert) => {
    if (!adapter.isSupported()) {
      return false;
    }

    const metric = i18n.t(`notifications:metric.${alert.metric}`);
    const notification = adapter.create({
      title: i18n.t('notifications:title'),
      body: i18n.t(
        alert.usesUnknownModelPricing
          ? 'notifications:reachedWithUnknownAssumption'
          : 'notifications:reached',
        {
          metric,
          thresholdPercent: alert.thresholdPercent,
        }
      ),
    });
    notification.onClick(() => onNavigate(alert.policyId));
    notification.show();
    return true;
  },
});
