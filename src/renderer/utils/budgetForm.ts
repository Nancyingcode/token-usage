import type {
  BudgetPeriod,
  BudgetModelTarget,
  BudgetPolicy,
  BudgetPolicyInput,
  BudgetScope,
  ValidationIssue,
} from '../../shared/budgetTypes';

export interface BudgetFormState {
  id?: string;
  scope: BudgetScope;
  projectPath: string;
  period: BudgetPeriod;
  modelTarget: BudgetModelTarget;
  tokenEnabled: boolean;
  tokenLimit: string;
  costEnabled: boolean;
  costLimitUsd: string;
  issues: ValidationIssue[];
}

export type BudgetFormAction =
  | { type: 'scope-changed'; scope: BudgetScope }
  | { type: 'project-changed'; projectPath: string }
  | { type: 'period-changed'; period: BudgetPeriod }
  | { type: 'token-enabled'; enabled: boolean }
  | { type: 'token-limit-changed'; value: string }
  | { type: 'cost-enabled'; enabled: boolean }
  | { type: 'cost-limit-changed'; value: string }
  | { type: 'save-failed'; issues: ValidationIssue[] };

const DEFAULT_BUDGET_PERIOD: BudgetPeriod = 'month';

export const createBudgetFormState = (policy?: BudgetPolicy): BudgetFormState => ({
  id: policy?.id,
  scope: policy?.scope ?? 'global',
  projectPath: policy?.projectPath ?? '',
  period: policy?.period ?? DEFAULT_BUDGET_PERIOD,
  modelTarget: policy ? { ...policy.modelTarget } : { kind: 'all' },
  tokenEnabled: policy?.tokenLimit !== undefined,
  tokenLimit: policy?.tokenLimit === undefined ? '' : String(policy.tokenLimit),
  costEnabled: policy?.costLimitUsd !== undefined,
  costLimitUsd: policy?.costLimitUsd === undefined ? '' : String(policy.costLimitUsd),
  issues: [],
});

export const budgetFormReducer = (
  state: BudgetFormState,
  action: BudgetFormAction
): BudgetFormState => {
  switch (action.type) {
    case 'scope-changed':
      return {
        ...state,
        scope: action.scope,
        projectPath: action.scope === 'global' ? '' : state.projectPath,
        issues: [],
      };
    case 'project-changed':
      return { ...state, projectPath: action.projectPath, issues: [] };
    case 'period-changed':
      return { ...state, period: action.period, issues: [] };
    case 'token-enabled':
      return { ...state, tokenEnabled: action.enabled, issues: [] };
    case 'token-limit-changed':
      return { ...state, tokenLimit: action.value, issues: [] };
    case 'cost-enabled':
      return { ...state, costEnabled: action.enabled, issues: [] };
    case 'cost-limit-changed':
      return { ...state, costLimitUsd: action.value, issues: [] };
    case 'save-failed':
      return { ...state, issues: action.issues };
  }
};

export const toBudgetPolicyInput = (state: BudgetFormState): BudgetPolicyInput => ({
  ...(state.id ? { id: state.id } : {}),
  scope: state.scope,
  ...(state.scope === 'project' ? { projectPath: state.projectPath.trim() } : {}),
  period: state.period,
  modelTarget: { ...state.modelTarget },
  ...(state.tokenEnabled ? { tokenLimit: Number(state.tokenLimit) } : {}),
  ...(state.costEnabled ? { costLimitUsd: Number(state.costLimitUsd) } : {}),
});
