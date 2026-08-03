// @vitest-environment jsdom
/**
 * @file Overlay focus and toast tests
 * @description Verifies focus entry, keyboard containment, restoration, and timed feedback.
 */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { i18n } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import ToastNotice from '../src/renderer/components/ToastNotice';
import { useOverlayFocus } from '../src/renderer/hooks/useOverlayFocus';
import { createRendererI18n } from '../src/renderer/i18n';

const OverlayHarness: React.FC = () => {
  const [open, setOpen] = React.useState(false);
  const close = React.useCallback(() => setOpen(false), []);
  const dialogRef = useOverlayFocus<HTMLDivElement>(close);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      {open ? (
        <div ref={dialogRef} role="dialog" aria-label="Example dialog">
          <button type="button" onClick={close}>
            Close
          </button>
          <button type="button">Save</button>
        </div>
      ) : null}
    </>
  );
};

describe('useOverlayFocus', () => {
  let testI18n: i18n;

  beforeAll(async () => {
    testI18n = await createRendererI18n('en');
  });

  afterEach(() => vi.useRealTimers());

  it('focuses the first control, traps Tab, closes on Escape, and restores focus', () => {
    render(<OverlayHarness />);
    const trigger = screen.getByRole('button', { name: 'Open' });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog');
    const close = screen.getByRole('button', { name: 'Close' });
    const save = screen.getByRole('button', { name: 'Save' });

    expect(document.activeElement).toBe(close);
    save.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(document.activeElement).toBe(trigger);
  });

  it('dismisses a toast after the configured duration', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(
      <I18nextProvider i18n={testI18n}>
        <ToastNotice message="Budget saved" onDismiss={onDismiss} durationMs={1_000} />
      </I18nextProvider>
    );

    expect(screen.getByRole('status').textContent).toContain('Budget saved');
    act(() => vi.advanceTimersByTime(1_000));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
