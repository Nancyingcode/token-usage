import React from 'react';
import { AlertTriangle, CircleDollarSign, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { BudgetAlert, UnpricedModelSummary } from '../../shared/budgetTypes';
import { ICON_SIZE_SMALL } from '../constants/ui';
import { resolveRendererLocale } from '../i18n';
import { formatNumber } from '../utils/formatters';

interface BudgetAlertBannerProps {
  alerts: BudgetAlert[];
  unpricedModels: UnpricedModelSummary[];
  onDismiss: (alertId: string) => void;
  onAddPrice?: (modelId: string) => void;
}

const getAlertClassName = (alert: BudgetAlert): string =>
  alert.severity === 'warning' ? 'budget-alert warning' : 'budget-alert danger';

const BudgetAlertBanner: React.FC<BudgetAlertBannerProps> = ({
  alerts,
  unpricedModels,
  onDismiss,
  onAddPrice,
}) => {
  const { t, i18n } = useTranslation('budgets');
  const { t: tCommon } = useTranslation('common');
  const locale = resolveRendererLocale(i18n.resolvedLanguage);
  const showUnpricedAlert = unpricedModels.length > 0;

  return (
    <div className="budget-alert-stack" aria-label={t('alerts.label')}>
      {alerts.map((alert) => {
        const metric = t(`alerts.metric.${alert.metric}`);
        const period = t(`period.${alert.period}`);

        return (
          <div className={getAlertClassName(alert)} key={alert.id}>
            <AlertTriangle size={ICON_SIZE_SMALL} />
            <div>
              <strong>
                {t('alerts.reached', {
                  metric,
                  thresholdPercent: alert.thresholdPercent,
                })}
              </strong>
              <span>{t('alerts.periodBudget', { period })}</span>
            </div>
            <button
              type="button"
              className="icon-button quiet"
              title={t('alerts.dismiss')}
              aria-label={t('alerts.dismiss')}
              onClick={() => onDismiss(alert.id)}
            >
              <X size={ICON_SIZE_SMALL} />
            </button>
          </div>
        );
      })}
      {showUnpricedAlert ? (
        <div className="budget-alert neutral unpriced-alert">
          <CircleDollarSign size={ICON_SIZE_SMALL} />
          <div>
            <strong>{t('alerts.unpricedModels')}</strong>
            {unpricedModels.map(({ modelId, totalTokens }) => {
              const canAddPrice = Boolean(modelId && onAddPrice);
              return (
                <span className="unpriced-alert-row" key={modelId ?? 'unknown-model'}>
                  <span>
                    {t('alerts.unpricedTokens', {
                      model: modelId ?? tCommon('value.unknownModel'),
                      tokens: formatNumber(totalTokens, locale),
                    })}
                  </span>
                  {canAddPrice ? (
                    <button
                      type="button"
                      className="secondary-button compact-button"
                      onClick={() => onAddPrice?.(modelId ?? '')}
                    >
                      {t('alerts.addPrice')}
                    </button>
                  ) : null}
                </span>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default BudgetAlertBanner;
