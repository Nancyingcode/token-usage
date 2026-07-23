/**
 * @file 预算状态列表
 * @description
 * 按状态组展示令牌和成本预算进度，并将编辑、删除操作交由上层处理。
 */
import React from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import type {
  BudgetPolicy,
  BudgetPolicyStatus,
  BudgetProgress,
  BudgetSeverity,
} from '../../shared/budgetTypes';
import { ICON_SIZE_SMALL } from '../constants/ui';
import type { BudgetStatusGroup } from '../utils/budgetViewModel';
import { formatNumber, formatPercent, formatUsd } from '../utils/formatters';

const MAX_PROGRESS_PERCENT = 100;

interface BudgetListProps {
  groups: BudgetStatusGroup[];
  onEdit?: (policy: BudgetPolicy) => void;
  onDelete?: (policy: BudgetPolicy) => void;
}

type CostCellModel =
  | { kind: 'unset' }
  | { kind: 'complete'; progress: BudgetProgress }
  | { kind: 'incomplete'; progress: BudgetProgress; unpricedTokens: number };

const getCostCellModel = (status: BudgetPolicyStatus): CostCellModel => {
  if (!status.cost) {
    return { kind: 'unset' };
  }

  return status.cost.incomplete
    ? { kind: 'incomplete', progress: status.cost, unpricedTokens: status.unpricedTokens }
    : { kind: 'complete', progress: status.cost };
};

const getProgressWidth = (percent: number): string =>
  `${Math.min(Math.max(percent, 0), MAX_PROGRESS_PERCENT)}%`;

const getStatusSeverity = (status: BudgetPolicyStatus): BudgetSeverity => {
  const severities = [status.token?.severity, status.cost?.severity];

  if (severities.includes('over')) {
    return 'over';
  }
  if (severities.includes('critical')) {
    return 'critical';
  }
  return severities.includes('warning') ? 'warning' : 'normal';
};

const ProgressBar: React.FC<{ progress: BudgetProgress }> = ({ progress }) => (
  <div className={`budget-progress ${progress.severity}`}>
    <i style={{ width: getProgressWidth(progress.percent) }} />
  </div>
);

const TokenCell: React.FC<{ progress?: BudgetProgress }> = ({ progress }) => {
  if (!progress) {
    return <span className="budget-unset">Not set</span>;
  }

  return (
    <div className="budget-progress-cell">
      <div>
        <strong>{formatPercent(progress.percent)}</strong>
        <span>
          {formatNumber(progress.used)} / {formatNumber(progress.limit)}
        </span>
      </div>
      <ProgressBar progress={progress} />
    </div>
  );
};

const CostCell: React.FC<{ model: CostCellModel }> = ({ model }) => {
  if (model.kind === 'unset') {
    return <span className="budget-unset">Not set</span>;
  }

  const incomplete = model.kind === 'incomplete';

  return (
    <div className="budget-progress-cell">
      <div>
        <strong>{formatPercent(model.progress.percent)}</strong>
        <span>
          {formatUsd(model.progress.used)} / {formatUsd(model.progress.limit)}
        </span>
      </div>
      <ProgressBar progress={model.progress} />
      {incomplete ? (
        <small>Pricing incomplete · {formatNumber(model.unpricedTokens)} tokens</small>
      ) : null}
    </div>
  );
};

const BudgetRow: React.FC<{
  status: BudgetPolicyStatus;
  onEdit?: BudgetListProps['onEdit'];
  onDelete?: BudgetListProps['onDelete'];
}> = ({ status, onEdit, onDelete }) => {
  const costModel = getCostCellModel(status);
  const severity = getStatusSeverity(status);
  const scopeLabel = status.policy.scope === 'global' ? 'All projects' : status.policy.projectPath;
  const editAction = onEdit ? (
    <button
      type="button"
      className="icon-button"
      title="Edit budget"
      onClick={() => onEdit(status.policy)}
    >
      <Pencil size={ICON_SIZE_SMALL} />
    </button>
  ) : null;
  const deleteAction = onDelete ? (
    <button
      type="button"
      className="icon-button danger"
      title="Delete budget"
      onClick={() => onDelete(status.policy)}
    >
      <Trash2 size={ICON_SIZE_SMALL} />
    </button>
  ) : null;

  return (
    <div className="budget-table-row">
      <div className="budget-scope-cell">
        <strong>{scopeLabel}</strong>
        <span>{status.policy.scope}</span>
      </div>
      <span className="budget-period-cell">{status.policy.period}</span>
      <TokenCell progress={status.token} />
      <CostCell model={costModel} />
      <span className={`budget-status ${severity}`}>{severity}</span>
      <div className="budget-row-actions">
        {editAction}
        {deleteAction}
      </div>
    </div>
  );
};

const BudgetList: React.FC<BudgetListProps> = ({ groups, onEdit, onDelete }) => {
  if (groups.length === 0) {
    return (
      <section className="budget-empty">
        <h3>No budgets match these filters</h3>
        <p>Change the scope or period filter to see configured policies.</p>
      </section>
    );
  }

  return (
    <div className="budget-groups">
      {groups.map((group) => (
        <section className="budget-group" key={group.key}>
          <div className="budget-group-heading">
            <h3>{group.label}</h3>
            <span>{group.statuses.length}</span>
          </div>
          <div className="budget-table">
            <div className="budget-table-row budget-table-head">
              <span>Scope</span>
              <span>Period</span>
              <span>Tokens</span>
              <span>Estimated cost</span>
              <span>Status</span>
              <span>Actions</span>
            </div>
            {group.statuses.map((status) => (
              <BudgetRow
                key={status.policy.id}
                status={status}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
};

export default BudgetList;
