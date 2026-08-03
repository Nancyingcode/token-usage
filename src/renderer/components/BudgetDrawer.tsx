/**
 * @file 预算编辑抽屉
 * @description
 * 提供预算策略与告警阈值表单，负责字段校验和保存交互，不持有全局预算快照。
 */
import React, { useReducer, useState } from 'react';
import type { TFunction } from 'i18next';
import { Save, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type {
  BudgetPeriod,
  BudgetPolicy,
  BudgetScope,
  BudgetThresholds,
  ValidationIssue,
} from '../../shared/budgetTypes';
import {
  getBudgetPolicyIssues,
  getThresholdIssues,
  isValidationIssue,
} from '../../shared/budgetValidation';
import { isRecord } from '../../shared/runtimeTypes';
import { ICON_SIZE_SMALL } from '../constants/ui';
import type { BudgetActions } from '../hooks/useBudgetSnapshot';
import { useOverlayFocus } from '../hooks/useOverlayFocus';
import { budgetFormReducer, createBudgetFormState, toBudgetPolicyInput } from '../utils/budgetForm';
import { translateValidationIssue } from '../utils/validationIssues';
import type { BudgetModelOption } from '../utils/budgetModelOptions';
import BudgetModelCombobox from './BudgetModelCombobox';

export type BudgetDrawerModel = { kind: 'policy'; policy?: BudgetPolicy } | { kind: 'thresholds' };

interface BudgetDrawerProps {
  model: BudgetDrawerModel;
  modelOptions: BudgetModelOption[];
  thresholds: BudgetThresholds;
  actions: BudgetActions;
  onClose: () => void;
  onSaved?: () => void;
}

const PERIOD_OPTIONS: BudgetPeriod[] = ['day', 'week', 'month'];

const SCOPE_OPTIONS: BudgetScope[] = ['global', 'project'];

const getActionIssues = (error: unknown): ValidationIssue[] => {
  if (isRecord(error) && Array.isArray(error.issues)) {
    return error.issues.filter(isValidationIssue);
  }

  const message = error instanceof Error ? error.message : String(error);

  return [{ field: 'form', code: 'unexpected', details: message }];
};

const getIssueMessage = (
  issues: ValidationIssue[],
  fields: string[],
  t: TFunction<'budgets'>
): string | undefined => {
  const issue = issues.find(({ field }) => fields.includes(field));
  return issue ? translateValidationIssue(issue, t) : undefined;
};

const PolicyForm: React.FC<BudgetDrawerProps> = ({
  model,
  modelOptions,
  actions,
  onClose,
  onSaved,
}) => {
  const { t } = useTranslation('budgets');
  const { t: tCommon } = useTranslation('common');
  const policy = model.kind === 'policy' ? model.policy : undefined;
  const [state, dispatch] = useReducer(budgetFormReducer, policy, createBudgetFormState);
  const [saving, setSaving] = useState(false);
  const showProjectPath = state.scope === 'project';
  const title = policy ? t('drawer.editTitle') : t('drawer.addTitle');
  const projectIssue = getIssueMessage(state.issues, ['projectPath'], t);
  const tokenIssue = getIssueMessage(state.issues, ['tokenLimit'], t);
  const costIssue = getIssueMessage(state.issues, ['costLimitUsd'], t);
  const modelIssue = getIssueMessage(state.issues, ['modelId'], t);
  const formIssue = getIssueMessage(state.issues, ['limits', 'businessKey', 'form'], t);

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
      onSaved?.();
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
          <h2 id="budget-drawer-title">{title}</h2>
          <p>{t('drawer.policyDescription')}</p>
        </div>
        <button
          type="button"
          className="icon-button"
          title={t('drawer.close')}
          aria-label={t('drawer.close')}
          onClick={onClose}
        >
          <X size={ICON_SIZE_SMALL} />
        </button>
      </div>

      <fieldset>
        <legend>{t('drawer.scope')}</legend>
        <div className="segmented-control">
          {SCOPE_OPTIONS.map((scope) => (
            <button
              key={scope}
              type="button"
              className={state.scope === scope ? 'active' : undefined}
              aria-pressed={state.scope === scope}
              onClick={() => dispatch({ type: 'scope-changed', scope })}
            >
              {t(`scope.${scope}`)}
            </button>
          ))}
        </div>
      </fieldset>

      {showProjectPath ? (
        <label className="form-field">
          <span>{t('drawer.projectPath')}</span>
          <input
            value={state.projectPath}
            placeholder={t('drawer.projectPlaceholder')}
            onChange={(event) =>
              dispatch({ type: 'project-changed', projectPath: event.target.value })
            }
          />
          {projectIssue ? <small className="field-error">{projectIssue}</small> : null}
        </label>
      ) : null}

      <fieldset>
        <legend>{t('drawer.period')}</legend>
        <div className="segmented-control three">
          {PERIOD_OPTIONS.map((period) => (
            <button
              key={period}
              type="button"
              className={state.period === period ? 'active' : undefined}
              aria-pressed={state.period === period}
              onClick={() => dispatch({ type: 'period-changed', period })}
            >
              {t(`period.${period}`)}
            </button>
          ))}
        </div>
      </fieldset>

      <BudgetModelCombobox
        value={state.modelTarget}
        options={modelOptions}
        label={t('drawer.modelId')}
        allModelsLabel={t('drawer.allModels')}
        unknownModelLabel={t('drawer.unknownModel')}
        error={modelIssue}
        onChange={(modelTarget) => dispatch({ type: 'model-target-changed', modelTarget })}
      />

      <div className="limit-setting">
        <label className="toggle-field">
          <input
            type="checkbox"
            checked={state.tokenEnabled}
            onChange={(event) => dispatch({ type: 'token-enabled', enabled: event.target.checked })}
          />
          <span>{t('drawer.tokenLimit')}</span>
        </label>
        {state.tokenEnabled ? (
          <input
            type="number"
            min="1"
            step="1"
            value={state.tokenLimit}
            placeholder="1000000"
            aria-label={t('drawer.tokenLimitValue')}
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
          <span>{t('drawer.costLimit')}</span>
        </label>
        {state.costEnabled ? (
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={state.costLimitUsd}
            placeholder="25.00"
            aria-label={t('drawer.costLimitValue')}
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
          {tCommon('action.cancel')}
        </button>
        <button type="submit" className="primary-button" disabled={saving}>
          <Save size={ICON_SIZE_SMALL} />
          {saving ? tCommon('action.saving') : t('drawer.saveBudget')}
        </button>
      </div>
    </form>
  );
};

const ThresholdForm: React.FC<BudgetDrawerProps> = ({ thresholds, actions, onClose, onSaved }) => {
  const { t } = useTranslation('budgets');
  const { t: tCommon } = useTranslation('common');
  const [warningPercent, setWarningPercent] = useState(String(thresholds.warningPercent));
  const [criticalPercent, setCriticalPercent] = useState(String(thresholds.criticalPercent));
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [saving, setSaving] = useState(false);
  const thresholdIssue = getIssueMessage(issues, ['thresholds', 'form'], t);

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
      onSaved?.();
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
          <h2 id="budget-drawer-title">{t('drawer.thresholdsTitle')}</h2>
          <p>{t('drawer.thresholdsDescription')}</p>
        </div>
        <button
          type="button"
          className="icon-button"
          title={t('drawer.close')}
          aria-label={t('drawer.close')}
          onClick={onClose}
        >
          <X size={ICON_SIZE_SMALL} />
        </button>
      </div>

      <label className="form-field">
        <span>{t('drawer.warningPercentage')}</span>
        <input
          type="number"
          min="1"
          max="99"
          value={warningPercent}
          onChange={(event) => setWarningPercent(event.target.value)}
        />
      </label>
      <label className="form-field">
        <span>{t('drawer.criticalPercentage')}</span>
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
          {tCommon('action.cancel')}
        </button>
        <button type="submit" className="primary-button" disabled={saving}>
          <Save size={ICON_SIZE_SMALL} />
          {saving ? tCommon('action.saving') : t('drawer.saveThresholds')}
        </button>
      </div>
    </form>
  );
};

const BudgetDrawer: React.FC<BudgetDrawerProps> = (props) => {
  const drawerRef = useOverlayFocus<HTMLElement>(props.onClose);
  const content =
    props.model.kind === 'policy' ? <PolicyForm {...props} /> : <ThresholdForm {...props} />;

  return (
    <aside
      ref={drawerRef}
      className="drawer-shell budget-drawer"
      role="dialog"
      aria-modal="true"
      aria-labelledby="budget-drawer-title"
    >
      {content}
    </aside>
  );
};

export default BudgetDrawer;
