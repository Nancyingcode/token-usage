import React from 'react';
import { AlertTriangle, CircleDollarSign, X } from 'lucide-react';
import type { BudgetAlert, UnpricedModelSummary } from '../../shared/budgetTypes';
import { ICON_SIZE_SMALL } from '../constants/ui';
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
  const showUnpricedAlert = unpricedModels.length > 0;

  return (
    <div className="budget-alert-stack" aria-label="Budget alerts">
      {alerts.map((alert) => (
        <div className={getAlertClassName(alert)} key={alert.id}>
          <AlertTriangle size={ICON_SIZE_SMALL} />
          <div>
            <strong>{alert.message}</strong>
            <span>{alert.period} budget</span>
          </div>
          <button
            type="button"
            className="icon-button quiet"
            title="Dismiss alert"
            onClick={() => onDismiss(alert.id)}
          >
            <X size={ICON_SIZE_SMALL} />
          </button>
        </div>
      ))}
      {showUnpricedAlert ? (
        <div className="budget-alert neutral unpriced-alert">
          <CircleDollarSign size={ICON_SIZE_SMALL} />
          <div>
            <strong>Unpriced models</strong>
            {unpricedModels.map(({ modelId, totalTokens }) => {
              const canAddPrice = Boolean(modelId && onAddPrice);
              return (
                <span className="unpriced-alert-row" key={modelId ?? 'unknown-model'}>
                  <span>
                    {modelId ?? 'Unknown model'} ({formatNumber(totalTokens)} tokens)
                  </span>
                  {canAddPrice ? (
                    <button
                      type="button"
                      className="secondary-button compact-button"
                      onClick={() => onAddPrice?.(modelId ?? '')}
                    >
                      Add price
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
