// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nextProvider } from 'react-i18next';
import { PricingSyncPanel } from '../src/renderer/components/PricingSyncPanel';
import { createTestI18n } from './helpers/renderWithI18n';
import type { PricingSyncSnapshot } from '../src/shared/pricingCatalogTypes';

afterEach(cleanup);
describe('pricing sync panel', () => {
  it('shows source and limitations, refreshes, changes preference, and unsubscribes', async () => {
    const snapshot: PricingSyncSnapshot = {
      autoUpdate: true,
      status: 'ready',
      version: 'v1',
      sourceUrl: 'https://example.com/catalog.json',
    };
    let listener: (value: PricingSyncSnapshot) => void = () => undefined;
    const unsubscribe = vi.fn();
    const pricing = {
      get: vi.fn(async () => snapshot),
      refresh: vi.fn(async () => ({ ...snapshot, version: 'v2' })),
      setAutoUpdate: vi.fn(async (enabled: boolean) => ({ ...snapshot, autoUpdate: enabled })),
      onUpdated: vi.fn((callback) => {
        listener = callback;
        return unsubscribe;
      }),
    };
    Object.defineProperty(window, 'codexUsage', { configurable: true, value: { pricing } });
    const view = render(
      <I18nextProvider i18n={createTestI18n('en')}>
        <PricingSyncPanel />
      </I18nextProvider>
    );
    await screen.findByText(/v1/);
    expect(screen.getByText(/standard base rates/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Update prices now' }));
    await screen.findByText(/v2/);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Automatically update prices' }));
    await waitFor(() => expect(pricing.setAutoUpdate).toHaveBeenCalledWith(false));
    act(() => listener({ ...snapshot, status: 'error', error: 'network' }));
    expect(screen.getByRole('status').textContent).toContain('Network');
    view.unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
  it('does not overwrite a newer subscription with the initial response', async () => {
    let resolve: (value: PricingSyncSnapshot) => void = () => undefined;
    let listener: (value: PricingSyncSnapshot) => void = () => undefined;
    const snapshot: PricingSyncSnapshot = {
      autoUpdate: true,
      status: 'ready',
      sourceUrl: 'https://example.com',
      version: 'latest',
    };
    Object.defineProperty(window, 'codexUsage', {
      configurable: true,
      value: {
        pricing: {
          get: () =>
            new Promise((done) => {
              resolve = done;
            }),
          onUpdated: (callback: typeof listener) => {
            listener = callback;
            return () => undefined;
          },
        },
      },
    });
    render(
      <I18nextProvider i18n={createTestI18n('en')}>
        <PricingSyncPanel />
      </I18nextProvider>
    );
    await act(async () => {
      listener(snapshot);
      resolve({ ...snapshot, version: 'old' });
    });
    expect(screen.getByText(/latest/)).toBeTruthy();
    expect(screen.queryByText(/old/)).toBeNull();
  });
});
