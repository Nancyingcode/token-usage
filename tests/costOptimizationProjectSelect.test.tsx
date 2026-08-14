// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';
import CostOptimizationView from '../src/renderer/components/CostOptimizationView';
import type { CostOptimizationContentModel } from '../src/renderer/components/CostOptimizationView';
import { SNAPSHOT } from './helpers/costOptimizationFixtures';
import { createTestI18n } from './helpers/renderWithI18n';

interface RenderProjectSelectOptions {
  model?: CostOptimizationContentModel;
  projectOptions?: string[];
  projectOptionsLoading?: boolean;
  onProjectPathChange?: (projectPath: string | undefined) => void;
  locale?: 'en' | 'zh-CN';
}

const renderProjectSelect = ({
  model = { kind: 'ready', snapshot: SNAPSHOT },
  projectOptions = [],
  projectOptionsLoading = false,
  onProjectPathChange = vi.fn(),
  locale = 'en',
}: RenderProjectSelectOptions = {}) => {
  const triggerName = locale === 'zh-CN' ? '项目' : 'Project';

  render(
    <I18nextProvider i18n={createTestI18n(locale)}>
      <CostOptimizationView
        model={model}
        projectOptions={projectOptions}
        projectOptionsLoading={projectOptionsLoading}
        projectPath={undefined}
        activeTab="overview"
        diagnosisId={null}
        diagnosisDetailModel={{ kind: 'idle' }}
        onActiveTabChange={vi.fn()}
        onDiagnosisOpen={vi.fn()}
        onDiagnosisClose={vi.fn()}
        onProjectPathChange={onProjectPathChange}
        onUpdateSettings={vi.fn()}
      />
    </I18nextProvider>
  );

  return {
    trigger: screen.getByRole('combobox', { name: triggerName }),
    onProjectPathChange,
  };
};

describe('CostOptimizationView project select', () => {
  it('announces initial asynchronous option loading without exposing a false empty list', () => {
    const { trigger, onProjectPathChange } = renderProjectSelect({
      model: { kind: 'loading' },
      projectOptionsLoading: true,
    });

    expect(trigger.getAttribute('aria-busy')).toBe('true');
    expect(trigger.textContent).toContain('All projects');
    fireEvent.click(trigger);
    expect(screen.getByText('Loading options…').closest('[role="status"]')).toBeTruthy();
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(onProjectPathChange).not.toHaveBeenCalled();
  });

  it('keeps previous projects selectable while refreshed options are loading', () => {
    const { trigger, onProjectPathChange } = renderProjectSelect({
      projectOptions: ['C:\\repo'],
      projectOptionsLoading: true,
    });

    fireEvent.click(trigger);
    expect(screen.getByText('Loading options…').closest('[role="status"]')).toBeTruthy();
    fireEvent.click(screen.getByRole('option', { name: 'C:\\repo' }));
    expect(onProjectPathChange).toHaveBeenCalledWith('C:\\repo');
  });

  it('removes the loading state when current project options are ready', () => {
    const { trigger } = renderProjectSelect({ projectOptions: ['C:\\repo'] });

    expect(trigger.hasAttribute('aria-busy')).toBe(false);
    fireEvent.click(trigger);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('option', { name: 'All projects' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'C:\\repo' })).toBeTruthy();
  });

  it('provides localized loading feedback in Chinese', () => {
    const { trigger } = renderProjectSelect({
      model: { kind: 'loading' },
      projectOptionsLoading: true,
      locale: 'zh-CN',
    });

    fireEvent.click(trigger);
    expect(screen.getByText('正在加载选项…').closest('[role="status"]')).toBeTruthy();
  });
});
