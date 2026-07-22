import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import BudgetDrawer from '../src/renderer/components/BudgetDrawer';
import ConfirmDialog from '../src/renderer/components/ConfirmDialog';
import type { BudgetActions } from '../src/renderer/hooks/useBudgetSnapshot';

const ACTIONS: BudgetActions = {
  savePolicy: vi.fn(),
  deletePolicy: vi.fn(),
  updateThresholds: vi.fn(),
  savePricingOverride: vi.fn(),
  resetPricingOverride: vi.fn(),
};

describe('BudgetDrawer', () => {
  it('renders independent token and cost controls in policy mode', () => {
    const markup = renderToStaticMarkup(
      <BudgetDrawer
        model={{ kind: 'policy' }}
        thresholds={{ warningPercent: 80, criticalPercent: 100 }}
        actions={ACTIONS}
        onClose={vi.fn()}
      />
    );

    expect(markup).toContain('Add budget');
    expect(markup).toContain('Token limit');
    expect(markup).toContain('Estimated cost limit');
    expect(markup).toContain('Monthly');
  });

  it('renders only global threshold fields in threshold mode', () => {
    const markup = renderToStaticMarkup(
      <BudgetDrawer
        model={{ kind: 'thresholds' }}
        thresholds={{ warningPercent: 80, criticalPercent: 100 }}
        actions={ACTIONS}
        onClose={vi.fn()}
      />
    );

    expect(markup).toContain('Alert thresholds');
    expect(markup).toContain('Warning percentage');
    expect(markup).not.toContain('Project path');
  });
});

describe('ConfirmDialog', () => {
  it('renders an accessible destructive confirmation', () => {
    const markup = renderToStaticMarkup(
      <ConfirmDialog
        title="Delete budget?"
        message="This cannot be undone."
        confirmLabel="Delete"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain('Delete');
  });
});
