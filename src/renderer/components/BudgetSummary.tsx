import React from 'react';
import { BadgeAlert, CircleDollarSign, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { BudgetSnapshotSummary } from '../../shared/budgetTypes';
import { ICON_SIZE_MEDIUM } from '../constants/ui';

interface BudgetSummaryProps {
  summary: BudgetSnapshotSummary;
}

const BudgetSummary: React.FC<BudgetSummaryProps> = ({ summary }) => {
  const { t } = useTranslation('budgets');

  return (
    <section className="budget-summary-grid" aria-label={t('summary.label')}>
      <article className="summary-card budget-summary-item tone-warning">
        <TriangleAlert size={ICON_SIZE_MEDIUM} />
        <div>
          <span>{t('summary.approaching')}</span>
          <strong>{summary.warningCount}</strong>
        </div>
      </article>
      <article className="summary-card budget-summary-item tone-danger">
        <BadgeAlert size={ICON_SIZE_MEDIUM} />
        <div>
          <span>{t('summary.over')}</span>
          <strong>{summary.overCount}</strong>
        </div>
      </article>
      <article className="summary-card budget-summary-item tone-neutral">
        <CircleDollarSign size={ICON_SIZE_MEDIUM} />
        <div>
          <span>{t('summary.unpriced')}</span>
          <strong>{summary.unpricedModelCount}</strong>
        </div>
      </article>
    </section>
  );
};

export default BudgetSummary;
