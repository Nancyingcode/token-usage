// @vitest-environment jsdom
/**
 * @file Overlay exit transition tests
 * @description Verifies that dialogs and drawers remain mounted until their exit animation ends.
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import type { i18n } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import BudgetDrawer from '../src/renderer/components/BudgetDrawer';
import ConfirmDialog from '../src/renderer/components/ConfirmDialog';
import CostOptimizationSettingsDrawer from '../src/renderer/components/CostOptimizationSettingsDrawer';
import type { BudgetActions } from '../src/renderer/hooks/useBudgetSnapshot';
import { createRendererI18n } from '../src/renderer/i18n';
import { DEFAULT_COST_OPTIMIZATION_SETTINGS } from '../src/shared/costOptimizationValidation';

const MODEL_OPTIONS = [
  { key: 'all', target: { kind: 'all' as const } },
  { key: 'unknown', target: { kind: 'unknown' as const } },
];

const ACTIONS: BudgetActions = {
  savePolicy: vi.fn(),
  deletePolicy: vi.fn(),
  updateThresholds: vi.fn(),
  savePricingOverride: vi.fn(),
  resetPricingOverride: vi.fn(),
  saveUnknownModelPricing: vi.fn(),
  deleteUnknownModelPricing: vi.fn(),
};

describe('overlay exit transitions', () => {
  let testI18n: i18n;

  beforeAll(async () => {
    testI18n = await createRendererI18n('en');
  });

  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    });
  });

  it('defers closing the budget drawer until its animation finishes', () => {
    const onClose = vi.fn();
    render(
      <I18nextProvider i18n={testI18n}>
        <BudgetDrawer
          model={{ kind: 'policy' }}
          modelOptions={MODEL_OPTIONS}
          thresholds={{ warningPercent: 80, criticalPercent: 100 }}
          actions={ACTIONS}
          onClose={onClose}
        />
      </I18nextProvider>
    );

    const drawer = screen.getByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(drawer.getAttribute('data-state')).toBe('exiting');
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.animationEnd(drawer);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('defers closing the cost optimization drawer until its animation finishes', () => {
    const onClose = vi.fn();
    render(
      <I18nextProvider i18n={testI18n}>
        <CostOptimizationSettingsDrawer
          settings={DEFAULT_COST_OPTIMIZATION_SETTINGS}
          availableCandidateModelIds={['gpt-test']}
          onClose={onClose}
          onSave={vi.fn()}
        />
      </I18nextProvider>
    );

    const drawer = screen.getByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(drawer.getAttribute('data-state')).toBe('exiting');
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.animationEnd(drawer);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('runs only the selected confirmation action after the dialog exits', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <I18nextProvider i18n={testI18n}>
        <ConfirmDialog
          title="Delete budget?"
          message="This cannot be undone."
          confirmLabel="Delete"
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      </I18nextProvider>
    );

    const dialog = screen.getByRole('alertdialog');
    const backdrop = dialog.parentElement;
    expect(backdrop).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(backdrop?.getAttribute('data-state')).toBe('exiting');
    expect(onCancel).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.animationEnd(backdrop as HTMLElement);
    expect(onCancel).not.toHaveBeenCalled();
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
