/**
 * @file 模型价格设置视图
 * @description
 * 展示模型计价信息，并提供价格覆盖项的新增、编辑、校验与重置交互。
 */
import React, { useEffect, useMemo, useState } from 'react';
import type { TFunction } from 'i18next';
import { ExternalLink, Pencil, Plus, RotateCcw, Save, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type {
  ModelPricingEntry,
  UnknownModelPricing,
  UnknownModelPricingInput,
  UnpricedModelSummary,
  ValidationIssue,
} from '../../shared/budgetTypes';
import { getUnknownModelPricingIssues, isValidationIssue } from '../../shared/budgetValidation';
import { isRecord } from '../../shared/runtimeTypes';
import { ICON_SIZE_SMALL } from '../constants/ui';
import type { BudgetActions } from '../hooks/useBudgetSnapshot';
import { resolveRendererLocale } from '../i18n';
import { buildPricingModelOptions, type PricingModelOption } from '../utils/pricingModelOptions';
import {
  createPricingFormState,
  getPricingFormIssues,
  toPricingOverride,
  type PricingFormState,
} from '../utils/pricingForm';
import { formatNumber, formatShortDateTime, formatUsd } from '../utils/formatters';
import { translateValidationIssue } from '../utils/validationIssues';
import PricingModelCombobox from './PricingModelCombobox';

interface ModelPricingViewProps {
  pricing: ModelPricingEntry[];
  unpricedModels: UnpricedModelSummary[];
  unknownModelPricing?: UnknownModelPricing;
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
  modelOptions: PricingModelOption[];
  actions: BudgetActions;
  onClose: () => void;
}> = ({ model, modelOptions, actions, onClose }) => {
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
  const modelIdIssue = getIssueMessage(issues, 'modelId', t);

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

        {modelIdLocked ? (
          <label className="form-field">
            <span>{t('pricing.modelId')}</span>
            <input value={state.modelId} readOnly />
            {modelIdIssue ? <small className="field-error">{modelIdIssue}</small> : null}
          </label>
        ) : (
          <PricingModelCombobox
            value={state.modelId}
            options={modelOptions}
            label={t('pricing.modelId')}
            pricedLabel={t('pricing.pricedOption')}
            unpricedLabel={t('pricing.unpricedOption')}
            unknownModelLabel={tCommon('value.unknownModel')}
            unknownModelDescription={t('pricing.unknownModelDescription')}
            error={modelIdIssue}
            onChange={(modelId) => updateField('modelId', modelId)}
          />
        )}
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

type UnknownPricingFormState = Record<
  'inputUsdPerMillion' | 'cachedInputUsdPerMillion' | 'outputUsdPerMillion',
  string
>;

const createUnknownPricingFormState = (pricing?: UnknownModelPricing): UnknownPricingFormState => ({
  inputUsdPerMillion:
    pricing?.inputUsdPerMillion === undefined ? '' : String(pricing.inputUsdPerMillion),
  cachedInputUsdPerMillion:
    pricing?.cachedInputUsdPerMillion === undefined ? '' : String(pricing.cachedInputUsdPerMillion),
  outputUsdPerMillion:
    pricing?.outputUsdPerMillion === undefined ? '' : String(pricing.outputUsdPerMillion),
});

const toUnknownModelPricingInput = (state: UnknownPricingFormState): UnknownModelPricingInput => ({
  inputUsdPerMillion: Number(state.inputUsdPerMillion),
  cachedInputUsdPerMillion: Number(state.cachedInputUsdPerMillion),
  outputUsdPerMillion: Number(state.outputUsdPerMillion),
});

const getUnknownPricingFormIssues = (state: UnknownPricingFormState): ValidationIssue[] => {
  const requiredIssues = PRICE_INPUTS.filter(({ field }) => !state[field].trim()).map(
    ({ field }) => ({
      field,
      code:
        field === 'inputUsdPerMillion'
          ? ('input-price-required' as const)
          : field === 'cachedInputUsdPerMillion'
            ? ('cached-input-price-required' as const)
            : ('output-price-required' as const),
    })
  );
  const requiredFields = new Set<string>(requiredIssues.map(({ field }) => field));
  const pricingIssues = getUnknownModelPricingIssues(toUnknownModelPricingInput(state)).filter(
    ({ field }) => !requiredFields.has(field)
  );

  return [...requiredIssues, ...pricingIssues];
};

const UnknownPricingEditor: React.FC<{
  pricing?: UnknownModelPricing;
  actions: BudgetActions;
  onClose: () => void;
}> = ({ pricing, actions, onClose }) => {
  const { t } = useTranslation('budgets');
  const { t: tCommon } = useTranslation('common');
  const [state, setState] = useState<UnknownPricingFormState>(() =>
    createUnknownPricingFormState(pricing)
  );
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const nextIssues = getUnknownPricingFormIssues(state);

    if (nextIssues.length > 0) {
      setIssues(nextIssues);
      return;
    }

    const input = toUnknownModelPricingInput(state);
    const isZeroPricing = Object.values(input).every((value) => value === 0);

    if (isZeroPricing && !window.confirm(t('pricing.zeroFallbackConfirm'))) {
      return;
    }

    setSaving(true);
    try {
      await actions.saveUnknownModelPricing(input);
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
            <h2>{pricing ? t('pricing.editFallback') : t('pricing.setFallback')}</h2>
            <p>{t('pricing.fallbackEditorDescription')}</p>
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
                onChange={(event) => {
                  setState((current) => ({
                    ...current,
                    [input.field]: event.target.value,
                  }));
                  setIssues([]);
                }}
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
            {saving ? tCommon('action.saving') : t('pricing.saveFallback')}
          </button>
        </div>
      </form>
    </aside>
  );
};

const ModelPricingView: React.FC<ModelPricingViewProps> = ({
  pricing,
  unpricedModels,
  unknownModelPricing,
  actions,
  initialModelId,
  onInitialModelConsumed,
}) => {
  const { t, i18n } = useTranslation('budgets');
  const { t: tCommon } = useTranslation('common');
  const locale = resolveRendererLocale(i18n.resolvedLanguage);
  const [editorModel, setEditorModel] = useState<PricingEditorModel | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [unknownEditorOpen, setUnknownEditorOpen] = useState(false);
  const showUnpricedModels = unpricedModels.length > 0;
  const modelOptions = useMemo(
    () => buildPricingModelOptions(pricing, unpricedModels),
    [pricing, unpricedModels]
  );

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

  const handleDeleteUnknownPricing = async (): Promise<void> => {
    if (!window.confirm(t('pricing.disableFallbackConfirm'))) {
      return;
    }

    try {
      await actions.deleteUnknownModelPricing();
      setActionError(null);
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  };

  const editor = editorModel ? (
    <PricingEditor
      model={editorModel}
      modelOptions={modelOptions}
      actions={actions}
      onClose={() => setEditorModel(null)}
    />
  ) : null;
  const unknownEditor = unknownEditorOpen ? (
    <UnknownPricingEditor
      pricing={unknownModelPricing}
      actions={actions}
      onClose={() => setUnknownEditorOpen(false)}
    />
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

      <section className="unknown-pricing-card panel">
        <div>
          <h4>{t('pricing.fallbackTitle')}</h4>
          <p>{t('pricing.fallbackDescription')}</p>
        </div>
        {unknownModelPricing ? (
          <>
            <div className="unknown-pricing-values">
              <span>{t('pricing.userAssumption')}</span>
              <strong>{formatUsd(unknownModelPricing.inputUsdPerMillion, locale)}</strong>
              <strong>{formatUsd(unknownModelPricing.cachedInputUsdPerMillion, locale)}</strong>
              <strong>{formatUsd(unknownModelPricing.outputUsdPerMillion, locale)}</strong>
              <small>
                {formatShortDateTime(
                  unknownModelPricing.updatedAt,
                  locale,
                  tCommon('value.unknownDate')
                )}
              </small>
            </div>
            <div className="pricing-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setUnknownEditorOpen(true)}
              >
                {t('pricing.editFallback')}
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => void handleDeleteUnknownPricing()}
              >
                {t('pricing.disableFallback')}
              </button>
            </div>
          </>
        ) : (
          <button
            type="button"
            className="secondary-button"
            onClick={() => setUnknownEditorOpen(true)}
          >
            {t('pricing.setFallback')}
          </button>
        )}
      </section>

      {showUnpricedModels ? (
        <div className="unpriced-model-list pricing-status-label">
          <strong>{t('pricing.unpricedModels')}</strong>
          {unpricedModels.map((model) => {
            const displayModelId = model.modelId?.trim();
            const canAddPrice = Boolean(displayModelId);
            return (
              <div key={model.modelId ?? 'unknown-model'}>
                <span>
                  {t('pricing.unpricedTokens', {
                    model: displayModelId || tCommon('value.unknownModel'),
                    tokens: formatNumber(model.totalTokens, locale),
                  })}
                </span>
                {canAddPrice ? (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setEditorModel({ detectedModelId: displayModelId })}
                  >
                    {t('pricing.addPrice')}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setUnknownEditorOpen(true)}
                  >
                    {t('pricing.setFallback')}
                  </button>
                )}
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
      {unknownEditor}
    </section>
  );
};

export default ModelPricingView;
