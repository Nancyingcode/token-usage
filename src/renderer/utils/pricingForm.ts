import type {
  ModelPricingEntry,
  ModelPricingOverrideInput,
  ValidationIssue,
  ValidationIssueCode,
} from '../../shared/budgetTypes';
import { getPricingOverrideIssues } from '../../shared/budgetValidation';

export interface PricingFormState {
  modelId: string;
  aliases: string;
  inputUsdPerMillion: string;
  cachedInputUsdPerMillion: string;
  outputUsdPerMillion: string;
}

const PRICE_FIELDS: Array<{
  field: keyof Pick<
    PricingFormState,
    'inputUsdPerMillion' | 'cachedInputUsdPerMillion' | 'outputUsdPerMillion'
  >;
  code: ValidationIssueCode;
}> = [
  {
    field: 'inputUsdPerMillion',
    code: 'input-price-required',
  },
  {
    field: 'cachedInputUsdPerMillion',
    code: 'cached-input-price-required',
  },
  {
    field: 'outputUsdPerMillion',
    code: 'output-price-required',
  },
];

export const createPricingFormState = (
  entry?: ModelPricingEntry,
  detectedModelId = ''
): PricingFormState => ({
  modelId: entry?.modelId ?? detectedModelId,
  aliases: entry?.aliases.join(', ') ?? '',
  inputUsdPerMillion:
    entry?.inputUsdPerMillion === undefined ? '' : String(entry.inputUsdPerMillion),
  cachedInputUsdPerMillion:
    entry?.cachedInputUsdPerMillion === undefined ? '' : String(entry.cachedInputUsdPerMillion),
  outputUsdPerMillion:
    entry?.outputUsdPerMillion === undefined ? '' : String(entry.outputUsdPerMillion),
});

export const toPricingOverride = (state: PricingFormState): ModelPricingOverrideInput => ({
  modelId: state.modelId.trim(),
  aliases: state.aliases
    .split(',')
    .map((alias) => alias.trim())
    .filter(Boolean),
  inputUsdPerMillion: Number(state.inputUsdPerMillion),
  cachedInputUsdPerMillion: Number(state.cachedInputUsdPerMillion),
  outputUsdPerMillion: Number(state.outputUsdPerMillion),
});

export const getPricingFormIssues = (state: PricingFormState): ValidationIssue[] => {
  const emptyPriceIssues = PRICE_FIELDS.filter(({ field }) => !state[field].trim()).map(
    ({ field, code }) => ({ field, code })
  );
  const emptyPriceFields = new Set<string>(emptyPriceIssues.map(({ field }) => field));
  const pricingIssues = getPricingOverrideIssues(toPricingOverride(state)).filter(
    ({ field }) => !emptyPriceFields.has(field)
  );

  return [...emptyPriceIssues, ...pricingIssues];
};
