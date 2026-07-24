/**
 * @file 模型价格设置视图
 * @description
 * 展示模型计价信息，并提供价格覆盖项的新增、编辑、校验与重置交互。
 */
import React, { useEffect, useState } from 'react';
import type { TFunction } from 'i18next';
import { ExternalLink, Pencil, Plus, RotateCcw, Save, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type {
  ModelPricingEntry,
  UnpricedModelSummary,
  ValidationIssue,
} from '../../shared/budgetTypes';
import { isValidationIssue } from '../../shared/budgetValidation';
import { isRecord } from '../../shared/runtimeTypes';
import { ICON_SIZE_SMALL } from '../constants/ui';
import type { BudgetActions } from '../hooks/useBudgetSnapshot';
import { resolveRendererLocale } from '../i18n';
import {
  createPricingFormState,
  getPricingFormIssues,
  toPricingOverride,
  type PricingFormState,
} from '../utils/pricingForm';
import { formatNumber, formatShortDateTime, formatUsd } from '../utils/formatters';
import { translateValidationIssue } from '../utils/validationIssues';

interface ModelPricingViewProps {
  pricing: ModelPricingEntry[];
  unpricedModels: UnpricedModelSummary[];
  actions: BudgetActions;
  initialModelId?: string | null;
  onInitialModelConsumed?: () => void;
}

interface PricingEditorModel {
  entry?: ModelPricingEntry;
  detectedModelId?: string;
}

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const getActionIssues = (error: unknown): ValidationIssue[] => {
  if (isRecord(error) && Array.isArray(error.issues)) {
    return error.issues.filter(isValidationIssue);
  }

  const message = getErrorMessage(error);

  return [{ field: 'form', code: 'unexpected', details: message }];
};

const getIssueMessage = (
  issues: ValidationIssue[],
  field: string,
  t: TFunction<'budgets'>
): string | undefined => {
  const issue = issues.find((candidate) => candidate.field === field);
  return issue ? translateValidationIssue(issue, t) : undefined;
};

const PricingEditor: React.FC<{
  model: PricingEditorModel;
  actions: BudgetActions;
  onClose: () => void;
}> = ({ model, actions, onClose }) => {
  const { t } = useTranslation('budgets');
  const { t: tCommon } = useTranslation('common');
  const [state, setState] = useState<PricingFormState>(() =>
    createPricingFormState(model.entry, model.detectedModelId)
  );
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [saving, setSaving] = useState(false);
  const modelIdLocked = Boolean(model.entry);

  const updateField = (field: keyof PricingFormState, value: string): void => {
    setState((current) => ({ ...current, [field]: value }));
    setIssues([]);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const nextIssues = getPricingFormIssues(state);

    if (nextIssues.length > 0) {
      setIssues(nextIssues);
      return;
    }

    setSaving(true);
    try {
      await actions.savePricingOverride(toPricingOverride(state));
      onClose();
    } catch (error) {
      setIssues(getActionIssues(error));
    } finally {
      setSaving(false);
    }
  };

  const formIssue = getIssueMessage(issues, 'form', t);

  return (
    <aside className="budget-drawer">
      <form className="drawer-form" onSubmit={handleSubmit}>
        <div className="drawer-heading">
          <div>
            <h2>{model.entry ? t('pricing.edit') : t('pricing.editorAdd')}</h2>
            <p>{t('pricing.editorDescription')}</p>
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
          <span>{t('pricing.modelId')}</span>
          <input
            value={state.modelId}
            readOnly={modelIdLocked}
            onChange={(event) => updateField('modelId', event.target.value)}
          />
          {getIssueMessage(issues, 'modelId', t) ? (
            <small className="field-error">{getIssueMessage(issues, 'modelId', t)}</small>
          ) : null}
        </label>
        <label className="form-field">
          <span>{t('pricing.aliases')}</span>
          <input
            value={state.aliases}
            placeholder={t('pricing.aliasesPlaceholder')}
            onChange={(event) => updateField('aliases', event.target.value)}
          />
          {getIssueMessage(issues, 'aliases', t) ? (
            <small className="field-error">{getIssueMessage(issues, 'aliases', t)}</small>
          ) : null}
        </label>

        {PRICE_INPUTS.map((input) => {
          const issue = getIssueMessage(issues, input.field, t);
          return (
            <label className="form-field" key={input.field}>
              <span>{t(input.labelKey)}</span>
              <input
                type="number"
                min="0"
                step="0.0001"
                value={state[input.field]}
                onChange={(event) => updateField(input.field, event.target.value)}
              />
              {issue ? <small className="field-error">{issue}</small> : null}
            </label>
          );
        })}

        {formIssue ? <p className="form-error">{formIssue}</p> : null}
        <div className="drawer-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            {tCommon('action.cancel')}
          </button>
          <button type="submit" className="primary-button" disabled={saving}>
            <Save size={ICON_SIZE_SMALL} />
            {saving ? tCommon('action.saving') : t('pricing.savePrice')}
          </button>
        </div>
      </form>
    </aside>
  );
};

const PRICE_INPUTS: Array<{
  field: keyof Pick<
    PricingFormState,
    'inputUsdPerMillion' | 'cachedInputUsdPerMillion' | 'outputUsdPerMillion'
  >;
  labelKey: 'pricing.inputPrice' | 'pricing.cachedInputPrice' | 'pricing.outputPrice';
}> = [
  { field: 'inputUsdPerMillion', labelKey: 'pricing.inputPrice' },
  { field: 'cachedInputUsdPerMillion', labelKey: 'pricing.cachedInputPrice' },
  { field: 'outputUsdPerMillion', labelKey: 'pricing.outputPrice' },
];

const ModelPricingView: React.FC<ModelPricingViewProps> = ({
  pricing,
  unpricedModels,
  actions,
  initialModelId,
  onInitialModelConsumed,
}) => {
  const { t, i18n } = useTranslation('budgets');
  const { t: tCommon } = useTranslation('common');
  const locale = resolveRendererLocale(i18n.resolvedLanguage);
  const [editorModel, setEditorModel] = useState<PricingEditorModel | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const showUnpricedModels = unpricedModels.length > 0;

  useEffect(() => {
    if (!initialModelId) {
      return;
    }

    setEditorModel({ detectedModelId: initialModelId });
    onInitialModelConsumed?.();
  }, [initialModelId, onInitialModelConsumed]);

  const handleReset = async (modelId: string): Promise<void> => {
    try {
      await actions.resetPricingOverride(modelId);
      setActionError(null);
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  };

  const handleOpenSource = async (sourceUrl: string): Promise<void> => {
    try {
      await window.codexUsage.openExternal(sourceUrl);
      setActionError(null);
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  };

  const editor = editorModel ? (
    <PricingEditor model={editorModel} actions={actions} onClose={() => setEditorModel(null)} />
  ) : null;

  return (
    <section className="model-pricing-view">
      <div className="pricing-heading">
        <div>
          <h3>{t('pricing.title')}</h3>
          <p>{t('pricing.description')}</p>
        </div>
        <button
          type="button"
          className="primary-button icon-command"
          onClick={() => setEditorModel({})}
        >
          <Plus size={ICON_SIZE_SMALL} />
          {t('pricing.addPrice')}
        </button>
      </div>

      {showUnpricedModels ? (
        <div className="unpriced-model-list">
          <strong>{t('pricing.unpricedModels')}</strong>
          {unpricedModels.map((model) => {
            const canAddPrice = Boolean(model.modelId);
            return (
              <div key={model.modelId ?? 'unknown-model'}>
                <span>
                  {t('pricing.unpricedTokens', {
                    model: model.modelId ?? tCommon('value.unknownModel'),
                    tokens: formatNumber(model.totalTokens, locale),
                  })}
                </span>
                {canAddPrice ? (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setEditorModel({ detectedModelId: model.modelId })}
                  >
                    {t('pricing.addPrice')}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {actionError ? <p className="form-error">{actionError}</p> : null}

      <div className="pricing-table">
        <div className="pricing-table-row pricing-table-head">
          <span>{t('pricing.model')}</span>
          <span>{t('pricing.input')}</span>
          <span>{t('pricing.cachedInput')}</span>
          <span>{t('pricing.output')}</span>
          <span>{t('pricing.effective')}</span>
          <span>{t('pricing.source')}</span>
          <span>{t('pricing.actions')}</span>
        </div>
        {pricing.map((entry) => {
          const isOverride = entry.sourceKind === 'override';
          const canRestoreDefault = isOverride && Boolean(entry.sourceUrl);
          const sourceUrl = entry.sourceUrl;
          const sourceAction = sourceUrl ? (
            <button
              type="button"
              className="icon-button"
              title={t('pricing.openOfficial')}
              aria-label={t('pricing.openOfficial')}
              onClick={() => void handleOpenSource(sourceUrl)}
            >
              <ExternalLink size={ICON_SIZE_SMALL} />
            </button>
          ) : null;
          const resetAction = isOverride ? (
            <button
              type="button"
              className="secondary-button compact-button"
              onClick={() => void handleReset(entry.modelId)}
            >
              <RotateCcw size={ICON_SIZE_SMALL} />
              {canRestoreDefault ? t('pricing.restoreDefault') : t('pricing.removeCustom')}
            </button>
          ) : null;

          return (
            <div className="pricing-table-row" key={entry.modelId}>
              <div className="pricing-model-cell">
                <strong>{entry.modelId}</strong>
                <span>{entry.aliases.join(', ') || t('pricing.noAliases')}</span>
              </div>
              <span>{formatUsd(entry.inputUsdPerMillion, locale)}</span>
              <span>{formatUsd(entry.cachedInputUsdPerMillion, locale)}</span>
              <span>{formatUsd(entry.outputUsdPerMillion, locale)}</span>
              <span>
                {formatShortDateTime(entry.effectiveAt, locale, tCommon('value.unknownDate'))}
              </span>
              <div className="pricing-source-cell">
                <span className={`pricing-source ${entry.sourceKind}`}>
                  {isOverride ? t('pricing.custom') : t('pricing.builtIn')}
                </span>
                {sourceAction}
              </div>
              <div className="pricing-actions">
                <button
                  type="button"
                  className="icon-button"
                  title={t('pricing.edit')}
                  aria-label={t('pricing.edit')}
                  onClick={() => setEditorModel({ entry })}
                >
                  <Pencil size={ICON_SIZE_SMALL} />
                </button>
                {resetAction}
              </div>
            </div>
          );
        })}
      </div>
      {editor}
    </section>
  );
};

export default ModelPricingView;
