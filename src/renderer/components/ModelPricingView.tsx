/**
 * @file 模型价格设置视图
 * @description
 * 展示模型计价信息，并提供价格覆盖项的新增、编辑、校验与重置交互。
 */
import React, { useEffect, useState } from 'react';
import { ExternalLink, Pencil, Plus, RotateCcw, Save, X } from 'lucide-react';
import type {
  ModelPricingEntry,
  UnpricedModelSummary,
  ValidationIssue,
} from '../../shared/budgetTypes';
import { isRecord } from '../../shared/runtimeTypes';
import { ICON_SIZE_SMALL } from '../constants/ui';
import type { BudgetActions } from '../hooks/useBudgetSnapshot';
import {
  createPricingFormState,
  getPricingFormIssues,
  toPricingOverride,
  type PricingFormState,
} from '../utils/pricingForm';
import { formatNumber, formatShortDateTime, formatUsd } from '../utils/formatters';

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
    return error.issues.filter(
      (issue): issue is ValidationIssue =>
        isRecord(issue) && typeof issue.field === 'string' && typeof issue.message === 'string'
    );
  }

  return [{ field: 'form', message: getErrorMessage(error) }];
};

const getIssueMessage = (issues: ValidationIssue[], field: string): string | undefined =>
  issues.find((issue) => issue.field === field)?.message;

const PricingEditor: React.FC<{
  model: PricingEditorModel;
  actions: BudgetActions;
  onClose: () => void;
}> = ({ model, actions, onClose }) => {
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

  const formIssue = getIssueMessage(issues, 'form');

  return (
    <aside className="budget-drawer">
      <form className="drawer-form" onSubmit={handleSubmit}>
        <div className="drawer-heading">
          <div>
            <h2>{model.entry ? 'Edit model price' : 'Add model price'}</h2>
            <p>Prices are USD per one million tokens.</p>
          </div>
          <button type="button" className="icon-button" title="Close" onClick={onClose}>
            <X size={ICON_SIZE_SMALL} />
          </button>
        </div>

        <label className="form-field">
          <span>Model ID</span>
          <input
            value={state.modelId}
            readOnly={modelIdLocked}
            onChange={(event) => updateField('modelId', event.target.value)}
          />
          {getIssueMessage(issues, 'modelId') ? (
            <small className="field-error">{getIssueMessage(issues, 'modelId')}</small>
          ) : null}
        </label>
        <label className="form-field">
          <span>Aliases</span>
          <input
            value={state.aliases}
            placeholder="alias-one, alias-two"
            onChange={(event) => updateField('aliases', event.target.value)}
          />
          {getIssueMessage(issues, 'aliases') ? (
            <small className="field-error">{getIssueMessage(issues, 'aliases')}</small>
          ) : null}
        </label>

        {PRICE_INPUTS.map((input) => {
          const issue = getIssueMessage(issues, input.field);
          return (
            <label className="form-field" key={input.field}>
              <span>{input.label}</span>
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
            Cancel
          </button>
          <button type="submit" className="primary-button" disabled={saving}>
            <Save size={ICON_SIZE_SMALL} />
            {saving ? 'Saving' : 'Save price'}
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
  label: string;
}> = [
  { field: 'inputUsdPerMillion', label: 'Input price' },
  { field: 'cachedInputUsdPerMillion', label: 'Cached input price' },
  { field: 'outputUsdPerMillion', label: 'Output price' },
];

const ModelPricingView: React.FC<ModelPricingViewProps> = ({
  pricing,
  unpricedModels,
  actions,
  initialModelId,
  onInitialModelConsumed,
}) => {
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
          <h3>Model pricing</h3>
          <p>USD per one million standard text tokens.</p>
        </div>
        <button
          type="button"
          className="primary-button icon-command"
          onClick={() => setEditorModel({})}
        >
          <Plus size={ICON_SIZE_SMALL} />
          Add price
        </button>
      </div>

      {showUnpricedModels ? (
        <div className="unpriced-model-list">
          <strong>Unpriced models</strong>
          {unpricedModels.map((model) => {
            const canAddPrice = Boolean(model.modelId);
            return (
              <div key={model.modelId ?? 'unknown-model'}>
                <span>
                  {model.modelId ?? 'Unknown model'} · {formatNumber(model.totalTokens)} tokens
                </span>
                {canAddPrice ? (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setEditorModel({ detectedModelId: model.modelId })}
                  >
                    Add price
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
          <span>Model</span>
          <span>Input</span>
          <span>Cached input</span>
          <span>Output</span>
          <span>Effective</span>
          <span>Source</span>
          <span>Actions</span>
        </div>
        {pricing.map((entry) => {
          const isOverride = entry.sourceKind === 'override';
          const canRestoreDefault = isOverride && Boolean(entry.sourceUrl);
          const sourceUrl = entry.sourceUrl;
          const sourceAction = sourceUrl ? (
            <button
              type="button"
              className="icon-button"
              title="Open official pricing"
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
              {canRestoreDefault ? 'Restore default' : 'Remove custom'}
            </button>
          ) : null;

          return (
            <div className="pricing-table-row" key={entry.modelId}>
              <div className="pricing-model-cell">
                <strong>{entry.modelId}</strong>
                <span>{entry.aliases.join(', ') || 'No aliases'}</span>
              </div>
              <span>{formatUsd(entry.inputUsdPerMillion)}</span>
              <span>{formatUsd(entry.cachedInputUsdPerMillion)}</span>
              <span>{formatUsd(entry.outputUsdPerMillion)}</span>
              <span>{formatShortDateTime(entry.effectiveAt)}</span>
              <div className="pricing-source-cell">
                <span className={`pricing-source ${entry.sourceKind}`}>
                  {isOverride ? 'Custom' : 'Built-in'}
                </span>
                {sourceAction}
              </div>
              <div className="pricing-actions">
                <button
                  type="button"
                  className="icon-button"
                  title="Edit model price"
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
