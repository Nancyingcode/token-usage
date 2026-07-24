import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import Sidebar from '../src/renderer/components/Sidebar';
import { renderWithI18n } from './helpers/renderWithI18n';

describe('Sidebar', () => {
  it('shows the warning badge when warnings exist', () => {
    const markup = renderWithI18n(
      <Sidebar activeView="overview" warningCount={3} onChange={vi.fn()} />
    );

    expect(markup).toContain('<em class="nav-badge">3</em>');
  });

  it('hides the warning badge when warnings are absent', () => {
    const markup = renderWithI18n(
      <Sidebar activeView="overview" warningCount={0} onChange={vi.fn()} />
    );

    expect(markup).not.toContain('nav-badge');
  });

  it('shows budget alerts on the Budgets navigation item', () => {
    const markup = renderWithI18n(
      <Sidebar activeView="overview" warningCount={0} budgetAlertCount={2} onChange={vi.fn()} />
    );

    expect(markup).toContain('Budgets');
    expect(markup).toContain('<em class="nav-badge">2</em>');
  });

  it('renders Chinese navigation and accessibility copy', () => {
    const markup = renderWithI18n(
      <Sidebar activeView="overview" warningCount={0} onChange={vi.fn()} />,
      'zh-CN'
    );

    expect(markup).toContain('主导航');
    expect(markup).toContain('概览');
    expect(markup).toContain('预算');
  });
});
