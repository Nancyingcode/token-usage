/**
 * @file 预算编辑抽屉
 * @description
 * 提供预算策略与告警阈值表单，负责字段校验和保存交互，不持有全局预算快照。
 */
import React, { useReducer, useState } from 'react';
import { Save, X } from 'lucide-react';
import type {
  BudgetPeriod,
  BudgetPolicy,
  BudgetScope,
  BudgetThresholds,
  ValidationIssue,
} from '../../shared/budgetTypes';
import { getBudgetPolicyIssues, getThresholdIssues } from '../../shared/budgetValidation';
import { isRecord } from '../../shared/runtimeTypes';
import { ICON_SIZE_SMALL } from '../constants/ui';
import type { BudgetActions } from '../hooks/useBudgetSnapshot';
import { budgetFormReducer, createBudgetFormState, toBudgetPolicyInput } from '../utils/budgetForm';

export type BudgetDrawerModel = { kind: 'policy'; policy?: BudgetPolicy } | { kind: 'thresholds' };

interface BudgetDrawerProps {
  model: BudgetDrawerModel;
  thresholds: BudgetThresholds;
  actions: BudgetActions;
  onClose: () => void;
}

const PERIOD_OPTIONS: Array<{ value: BudgetPeriod; label: string }> = [
  { value: 'day', label: 'Daily' },
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
];

const SCOPE_OPTIONS: Array<{ value: BudgetScope; label: string }> = [
  { value: 'global', label: 'Global' },
  { value: 'project', label: 'Project' },
];

const getActionIssues = (error: unknown): ValidationIssue[] => {
  if (isRecord(error) && Array.isArray(error.issues)) {
    return error.issues.filter(
      (issue): issue is ValidationIssue =>
        isRecord(issue) && typeof issue.field === 'string' && typeof issue.message === 'string'
    );
  }

  return [
    {
      field: 'form',
      message: error instanceof Error ? error.message : String(error),
    },
  ];
};

const getIssueMessage = (issues: ValidationIssue[], fields: string[]): string | undefined =>
  issues.find(({ field }) => fields.includes(field))?.message;

const PolicyForm: React.FC<BudgetDrawerProps> = ({ model, actions, onClose }) => {
  const policy = model.kind === 'policy' ? model.policy : undefined;
  const [state, dispatch] = useReducer(budgetFormReducer, policy, createBudgetFormState);
  const [saving, setSaving] = useState(false);
  const showProjectPath = state.scope === 'project';
  const title = policy ? 'Edit budget' : 'Add budget';
  const projectIssue = getIssueMessage(state.issues, ['projectPath']);
  const tokenIssue = getIssueMessage(state.issues, ['tokenLimit']);
  const costIssue = getIssueMessage(state.issues, ['costLimitUsd']);
  const formIssue = getIssueMessage(state.issues, ['limits', 'businessKey', 'form']);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const input = toBudgetPolicyInput(state);
    const issues = getBudgetPolicyIssues(input);

    if (issues.length > 0) {
      dispatch({ type: 'save-failed', issues });
      return;
    }

    setSaving(true);
    try {
      await actions.savePolicy(input);
      onClose();
    } catch (error) {
      dispatch({ type: 'save-failed', issues: getActionIssues(error) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="drawer-form" onSubmit={handleSubmit}>
      <div className="drawer-heading">
        <div>
          <h2>{title}</h2>
          <p>Set token and estimated cost limits independently.</p>
        </div>
        <button type="button" className="icon-button" title="Close" onClick={onClose}>
          <X size={ICON_SIZE_SMALL} />
        </button>
      </div>

      <fieldset>
        <legend>Scope</legend>
        <div className="segmented-control">
          {SCOPE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={state.scope === option.value ? 'active' : undefined}
              aria-pressed={state.scope === option.value}
              onClick={() => dispatch({ type: 'scope-changed', scope: option.value })}
            >
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>

      {showProjectPath ? (
        <label className="form-field">
          <span>Project path</span>
          <input
            value={state.projectPath}
            placeholder="C:\\path\\to\\project"
            onChange={(event) =>
              dispatch({ type: 'project-changed', projectPath: event.target.value })
            }
          />
          {projectIssue ? <small className="field-error">{projectIssue}</small> : null}
        </label>
      ) : null}

      <fieldset>
        <legend>Period</legend>
        <div className="segmented-control three">
          {PERIOD_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={state.period === option.value ? 'active' : undefined}
              aria-pressed={state.period === option.value}
              onClick={() => dispatch({ type: 'period-changed', period: option.value })}
            >
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="limit-setting">
        <label className="toggle-field">
          <input
            type="checkbox"
            checked={state.tokenEnabled}
            onChange={(event) => dispatch({ type: 'token-enabled', enabled: event.target.checked })}
          />
          <span>Token limit</span>
        </label>
        {state.tokenEnabled ? (
          <input
            type="number"
            min="1"
            step="1"
            value={state.tokenLimit}
            placeholder="1000000"
            aria-label="Token limit value"
            onChange={(event) =>
              dispatch({ type: 'token-limit-changed', value: event.target.value })
            }
          />
        ) : null}
        {tokenIssue ? <small className="field-error">{tokenIssue}</small> : null}
      </div>

      <div className="limit-setting">
        <label className="toggle-field">
          <input
            type="checkbox"
            checked={state.costEnabled}
            onChange={(event) => dispatch({ type: 'cost-enabled', enabled: event.target.checked })}
          />
          <span>Estimated cost limit</span>
        </label>
        {state.costEnabled ? (
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={state.costLimitUsd}
            placeholder="25.00"
            aria-label="Estimated cost limit value"
            onChange={(event) =>
              dispatch({ type: 'cost-limit-changed', value: event.target.value })
            }
          />
        ) : null}
        {costIssue ? <small className="field-error">{costIssue}</small> : null}
      </div>

      {formIssue ? <p className="form-error">{formIssue}</p> : null}

      <div className="drawer-actions">
        <button type="button" className="secondary-button" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="primary-button" disabled={saving}>
          <Save size={ICON_SIZE_SMALL} />
          {saving ? 'Saving' : 'Save budget'}
        </button>
      </div>
    </form>
  );
};

const ThresholdForm: React.FC<BudgetDrawerProps> = ({ thresholds, actions, onClose }) => {
  const [warningPercent, setWarningPercent] = useState(String(thresholds.warningPercent));
  const [criticalPercent, setCriticalPercent] = useState(String(thresholds.criticalPercent));
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [saving, setSaving] = useState(false);
  const thresholdIssue = getIssueMessage(issues, ['thresholds', 'form']);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const input = {
      warningPercent: Number(warningPercent),
      criticalPercent: Number(criticalPercent),
    };
    const nextIssues = getThresholdIssues(input);

    if (nextIssues.length > 0) {
      setIssues(nextIssues);
      return;
    }

    setSaving(true);
    try {
      await actions.updateThresholds(input);
      onClose();
    } catch (error) {
      setIssues(getActionIssues(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="drawer-form" onSubmit={handleSubmit}>
      <div className="drawer-heading">
        <div>
          <h2>Alert thresholds</h2>
          <p>These percentages apply to every token and cost budget.</p>
        </div>
        <button type="button" className="icon-button" title="Close" onClick={onClose}>
          <X size={ICON_SIZE_SMALL} />
        </button>
      </div>

      <label className="form-field">
        <span>Warning percentage</span>
        <input
          type="number"
          min="1"
          max="99"
          value={warningPercent}
          onChange={(event) => setWarningPercent(event.target.value)}
        />
      </label>
      <label className="form-field">
        <span>Critical percentage</span>
        <input
          type="number"
          min="2"
          max="100"
          value={criticalPercent}
          onChange={(event) => setCriticalPercent(event.target.value)}
        />
      </label>
      {thresholdIssue ? <p className="form-error">{thresholdIssue}</p> : null}

      <div className="drawer-actions">
        <button type="button" className="secondary-button" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="primary-button" disabled={saving}>
          <Save size={ICON_SIZE_SMALL} />
          {saving ? 'Saving' : 'Save thresholds'}
        </button>
      </div>
    </form>
  );
};

const BudgetDrawer: React.FC<BudgetDrawerProps> = (props) => {
  const content =
    props.model.kind === 'policy' ? <PolicyForm {...props} /> : <ThresholdForm {...props} />;

  return <aside className="budget-drawer">{content}</aside>;
};

export default BudgetDrawer;
