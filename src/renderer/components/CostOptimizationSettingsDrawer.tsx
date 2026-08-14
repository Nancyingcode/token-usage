/**
 * @file 成本优化设置抽屉
 * @description 提供可访问的分析参数编辑、客户端校验和结构化 IPC 错误映射。
 */
import React, { useState } from 'react';
import type { TFunction } from 'i18next';
import { Save, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type {
  CostOptimizationSettings,
  CostOptimizationValidationIssue,
} from '../../shared/costOptimizationTypes';
import { ICON_SIZE_SMALL } from '../constants/ui';
import { useExitTransition } from '../hooks/useExitTransition';
import { useOverlayFocus } from '../hooks/useOverlayFocus';
import {
  createCostOptimizationSettingsForm,
  getCostOptimizationIpcIssues,
  getCostOptimizationSettingsFormIssues,
  toCostOptimizationSettings,
  updateCostOptimizationSettingsForm,
  type CostOptimizationSettingsForm,
  type CostOptimizationSettingsFormField,
} from '../utils/costOptimizationSettingsForm';
import SelectMenu from './SelectMenu';

interface CostOptimizationSettingsDrawerProps {
  settings: CostOptimizationSettings;
  availableCandidateModelIds: string[];
  onClose: () => void;
  onSave: (settings: CostOptimizationSettings) => Promise<unknown>;
  onSaved?: () => void;
}

type NumericFieldTranslationKey =
  | 'drawer.anomalyHistoryWindow'
  | 'drawer.anomalyMinimumSamples'
  | 'drawer.anomalySensitivity'
  | 'drawer.forecastMinimumHistoryDays'
  | 'drawer.minimumSavingsUsd'
  | 'drawer.targetCachePercentage'
  | 'drawer.minimumPricingCoveragePercentage';

interface NumericFieldDefinition {
  field: Exclude<CostOptimizationSettingsFormField, 'candidateModelIds' | 'forecastHorizonDays'>;
  labelKey: NumericFieldTranslationKey;
  min: string;
  max?: string;
  step: string;
}

const PRIMARY_NUMERIC_FIELD_COUNT = 3;
const NUMERIC_FIELDS: NumericFieldDefinition[] = [
  {
    field: 'anomalyHistoryWindow',
    labelKey: 'drawer.anomalyHistoryWindow',
    min: '7',
    max: '90',
    step: '1',
  },
  {
    field: 'anomalyMinimumSamples',
    labelKey: 'drawer.anomalyMinimumSamples',
    min: '3',
    step: '1',
  },
  {
    field: 'anomalySensitivity',
    labelKey: 'drawer.anomalySensitivity',
    min: '1',
    max: '10',
    step: '0.1',
  },
  {
    field: 'forecastMinimumHistoryDays',
    labelKey: 'drawer.forecastMinimumHistoryDays',
    min: '7',
    max: '28',
    step: '1',
  },
  {
    field: 'minimumSavingsUsd',
    labelKey: 'drawer.minimumSavingsUsd',
    min: '0',
    step: '0.01',
  },
  {
    field: 'targetCachePercentage',
    labelKey: 'drawer.targetCachePercentage',
    min: '0',
    max: '100',
    step: '1',
  },
  {
    field: 'minimumPricingCoveragePercentage',
    labelKey: 'drawer.minimumPricingCoveragePercentage',
    min: '0',
    max: '100',
    step: '1',
  },
];

const getIssueMessage = (
  issues: CostOptimizationValidationIssue[],
  field: string,
  t: TFunction<'costOptimization'>
): string | undefined => {
  const issue = issues.find((candidate) => candidate.field === field);
  return issue ? t(`validation.${issue.code}`) : undefined;
};

const getErrorMessage = (error: unknown): string => {
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }

  return error instanceof Error ? error.message : String(error);
};

const CostOptimizationSettingsDrawer: React.FC<CostOptimizationSettingsDrawerProps> = ({
  settings,
  availableCandidateModelIds,
  onClose,
  onSave,
  onSaved,
}) => {
  const { t } = useTranslation('costOptimization');
  const { t: tCommon } = useTranslation('common');
  const [form, setForm] = useState<CostOptimizationSettingsForm>(() =>
    createCostOptimizationSettingsForm(settings)
  );
  const [issues, setIssues] = useState<CostOptimizationValidationIssue[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { state, requestExit, handleAnimationEnd } = useExitTransition(onClose);
  const dialogRef = useOverlayFocus<HTMLElement>(requestExit);
  const availableCandidateIdSet = new Set(availableCandidateModelIds);
  const displayedModelIds = [
    ...availableCandidateModelIds,
    ...settings.candidateModelIds.filter((modelId) => !availableCandidateIdSet.has(modelId)),
  ];
  const forecastHorizonOptions = React.useMemo(
    () => [
      { value: '7', label: t('drawer.sevenDays') },
      { value: '30', label: t('drawer.thirtyDays') },
    ],
    [t]
  );

  const updateField = (field: CostOptimizationSettingsFormField, value: string): void => {
    setForm((current) => updateCostOptimizationSettingsForm(current, field, value));
    setIssues([]);
    setSaveError(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const nextIssues = getCostOptimizationSettingsFormIssues(form, availableCandidateModelIds);

    if (nextIssues.length > 0) {
      setIssues(nextIssues);
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      await onSave(toCostOptimizationSettings(form));
      onSaved?.();
      requestExit();
    } catch (error) {
      const ipcIssues = getCostOptimizationIpcIssues(error);

      if (ipcIssues.length > 0) {
        setIssues(ipcIssues);
      } else {
        setSaveError(getErrorMessage(error));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <aside
      ref={dialogRef}
      className="drawer-shell budget-drawer cost-optimization-drawer"
      data-state={state}
      role="dialog"
      aria-modal="true"
      aria-labelledby="cost-optimization-settings-title"
      onAnimationEnd={handleAnimationEnd}
    >
      <form className="drawer-form" onSubmit={handleSubmit}>
        <div className="drawer-heading">
          <div>
            <h2 id="cost-optimization-settings-title">{t('drawer.title')}</h2>
            <p>{t('drawer.description')}</p>
          </div>
          <button
            type="button"
            className="icon-button"
            title={tCommon('action.close')}
            aria-label={tCommon('action.close')}
            onClick={requestExit}
          >
            <X size={ICON_SIZE_SMALL} />
          </button>
        </div>

        {NUMERIC_FIELDS.slice(0, PRIMARY_NUMERIC_FIELD_COUNT).map((definition) => {
          const issue = getIssueMessage(issues, definition.field, t);

          return (
            <label className="form-field" key={definition.field}>
              <span>{t(definition.labelKey)}</span>
              <input
                type="number"
                min={definition.min}
                max={definition.max}
                step={definition.step}
                value={form[definition.field]}
                onChange={(event) => updateField(definition.field, event.target.value)}
              />
              {issue ? <small className="field-error">{issue}</small> : null}
            </label>
          );
        })}

        <label className="form-field">
          <span>{t('drawer.forecastHorizonDays')}</span>
          <SelectMenu
            value={form.forecastHorizonDays}
            options={forecastHorizonOptions}
            ariaLabel={t('drawer.forecastHorizonDays')}
            loadingLabel={tCommon('state.loadingOptions')}
            emptyLabel={tCommon('state.noOptions')}
            onChange={(value) => updateField('forecastHorizonDays', value)}
          />
          {getIssueMessage(issues, 'forecastHorizonDays', t) ? (
            <small className="field-error">
              {getIssueMessage(issues, 'forecastHorizonDays', t)}
            </small>
          ) : null}
        </label>

        {NUMERIC_FIELDS.slice(PRIMARY_NUMERIC_FIELD_COUNT).map((definition) => {
          const issue = getIssueMessage(issues, definition.field, t);

          return (
            <label className="form-field" key={definition.field}>
              <span>{t(definition.labelKey)}</span>
              <input
                type="number"
                min={definition.min}
                max={definition.max}
                step={definition.step}
                value={form[definition.field]}
                onChange={(event) => updateField(definition.field, event.target.value)}
              />
              {issue ? <small className="field-error">{issue}</small> : null}
            </label>
          );
        })}

        <fieldset>
          <legend>{t('drawer.candidateModels')}</legend>
          <div className="cost-optimization-model-options">
            {displayedModelIds.map((modelId) => {
              const candidateUnavailable = !availableCandidateIdSet.has(modelId);

              return (
                <label key={modelId}>
                  <input
                    type="checkbox"
                    checked={form.candidateModelIds.includes(modelId)}
                    onChange={() => updateField('candidateModelIds', modelId)}
                  />
                  <span>{modelId}</span>
                  {candidateUnavailable ? <small>{t('drawer.candidateUnavailable')}</small> : null}
                </label>
              );
            })}
          </div>
          {getIssueMessage(issues, 'candidateModelIds', t) ? (
            <small className="field-error">{getIssueMessage(issues, 'candidateModelIds', t)}</small>
          ) : null}
        </fieldset>

        {saveError ? <p className="form-error">{saveError}</p> : null}

        <div className="drawer-actions">
          <button type="button" className="secondary-button" onClick={requestExit}>
            {tCommon('action.cancel')}
          </button>
          <button type="submit" className="primary-button" disabled={saving}>
            <Save size={ICON_SIZE_SMALL} />
            {saving ? tCommon('action.saving') : tCommon('action.save')}
          </button>
        </div>
      </form>
    </aside>
  );
};

export default CostOptimizationSettingsDrawer;
