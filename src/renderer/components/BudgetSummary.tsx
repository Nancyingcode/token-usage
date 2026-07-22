import React from 'react';
import { BadgeAlert, CircleDollarSign, TriangleAlert } from 'lucide-react';
import type { BudgetSnapshotSummary } from '../../shared/budgetTypes';
import { ICON_SIZE_MEDIUM } from '../constants/ui';

interface BudgetSummaryProps {
  summary: BudgetSnapshotSummary;
}

const BudgetSummary: React.FC<BudgetSummaryProps> = ({ summary }) => (
  <section className="budget-summary-grid" aria-label="Budget summary">
    <article className="budget-summary-item tone-warning">
      <TriangleAlert size={ICON_SIZE_MEDIUM} />
      <div>
        <span>Approaching limit</span>
        <strong>{summary.warningCount}</strong>
      </div>
    </article>
    <article className="budget-summary-item tone-danger">
      <BadgeAlert size={ICON_SIZE_MEDIUM} />
      <div>
        <span>Over budget</span>
        <strong>{summary.overCount}</strong>
      </div>
    </article>
    <article className="budget-summary-item tone-neutral">
      <CircleDollarSign size={ICON_SIZE_MEDIUM} />
      <div>
        <span>Unpriced models</span>
        <strong>{summary.unpricedModelCount}</strong>
      </div>
    </article>
  </section>
);

export default BudgetSummary;
