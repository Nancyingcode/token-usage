import React from 'react';
import { AlertTriangle, CircleDollarSign, X } from 'lucide-react';
import type { BudgetAlert, UnpricedModelSummary } from '../../shared/budgetTypes';
import { ICON_SIZE_SMALL } from '../constants/ui';
import { formatNumber } from '../utils/formatters';

interface BudgetAlertBannerProps {
  alerts: BudgetAlert[];
  unpricedModels: UnpricedModelSummary[];
  onDismiss: (alertId: string) => void;
}

const getAlertClassName = (alert: BudgetAlert): string =>
  alert.severity === 'warning' ? 'budget-alert warning' : 'budget-alert danger';

const BudgetAlertBanner: React.FC<BudgetAlertBannerProps> = ({
  alerts,
  unpricedModels,
  onDismiss,
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
        <div className="budget-alert neutral">
          <CircleDollarSign size={ICON_SIZE_SMALL} />
          <div>
            <strong>Unpriced models</strong>
            <span>
              {unpricedModels
                .map(
                  ({ modelId, totalTokens }) =>
                    `${modelId ?? 'Unknown model'} (${formatNumber(totalTokens)} tokens)`
                )
                .join(', ')}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default BudgetAlertBanner;
