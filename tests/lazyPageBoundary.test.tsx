// @vitest-environment jsdom

import React from 'react';
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LazyPageBoundary from '../src/renderer/components/LazyPageBoundary';
import { createTestI18n } from './helpers/renderWithI18n';

const BrokenPage = (): React.ReactNode => {
  throw new Error('chunk failed');
};

describe('LazyPageBoundary', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps the application shell alive when a lazy page fails to render', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <I18nextProvider i18n={createTestI18n('en')}>
        <LazyPageBoundary fallback={<span>Loading</span>}>
          <BrokenPage />
        </LazyPageBoundary>
      </I18nextProvider>
    );

    expect(screen.getByRole('alert').textContent).toContain('This page could not be loaded');
    expect(screen.getByRole('button', { name: 'Reload application' })).toBeTruthy();
  });
});
