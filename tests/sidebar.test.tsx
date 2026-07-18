import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import Sidebar from '../src/renderer/components/Sidebar';

describe('Sidebar', () => {
  it('shows the warning badge when warnings exist', () => {
    const markup = renderToStaticMarkup(
      <Sidebar activeView="overview" warningCount={3} onChange={vi.fn()} />
    );

    expect(markup).toContain('<em class="nav-badge">3</em>');
  });

  it('hides the warning badge when warnings are absent', () => {
    const markup = renderToStaticMarkup(
      <Sidebar activeView="overview" warningCount={0} onChange={vi.fn()} />
    );

    expect(markup).not.toContain('nav-badge');
  });
});
