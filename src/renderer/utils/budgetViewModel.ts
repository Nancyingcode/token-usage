import type {
  BudgetPeriod,
  BudgetPolicyStatus,
  BudgetScope,
  BudgetSnapshot,
} from '../../shared/budgetTypes';

export interface BudgetFilters {
  scope: BudgetScope | 'all';
  period: BudgetPeriod | 'all';
}

export interface BudgetStatusGroup {
  key: BudgetScope;
  label: string;
  statuses: BudgetPolicyStatus[];
}

export interface BudgetViewModel {
  summary: BudgetSnapshot['summary'];
  alerts: BudgetSnapshot['alerts'];
  dataState: BudgetSnapshot['dataState'];
  groups: BudgetStatusGroup[];
}

const groupBudgetStatuses = (statuses: BudgetPolicyStatus[]): BudgetStatusGroup[] => {
  const globalStatuses = statuses.filter(({ policy }) => policy.scope === 'global');
  const projectStatuses = statuses.filter(({ policy }) => policy.scope === 'project');
  const groups: BudgetStatusGroup[] = [];

  if (globalStatuses.length > 0) {
    groups.push({ key: 'global', label: 'Global budgets', statuses: globalStatuses });
  }

  if (projectStatuses.length > 0) {
    groups.push({ key: 'project', label: 'Project budgets', statuses: projectStatuses });
  }

  return groups;
};

export const buildBudgetViewModel = (
  snapshot: BudgetSnapshot,
  filters: BudgetFilters
): BudgetViewModel => {
  const filteredStatuses = snapshot.statuses.filter((status) => {
    const matchesScope = filters.scope === 'all' || status.policy.scope === filters.scope;
    const matchesPeriod = filters.period === 'all' || status.policy.period === filters.period;
    return matchesScope && matchesPeriod;
  });

  return {
    summary: snapshot.summary,
    alerts: snapshot.alerts,
    dataState: snapshot.dataState,
    groups: groupBudgetStatuses(filteredStatuses),
  };
};
