// @vitest-environment jsdom
/**
 * @file Exit transition tests
 * @description Verifies deferred completion, duplicate guards, and reduced-motion behavior.
 */

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useExitTransition } from '../src/renderer/hooks/useExitTransition';
import { fireAnimationEvent } from './helpers/fireAnimationEvent';

interface ExitHarnessProps {
  onExited: () => void;
}

const ExitHarness: React.FC<ExitHarnessProps> = ({ onExited }) => {
  const { state, requestExit, setExitSurface } = useExitTransition(onExited, 'drawer-exit');

  return (
    <div data-testid="exit-surface" data-state={state} ref={setExitSurface}>
      <button type="button" onClick={requestExit}>
        Close
      </button>
      <span data-testid="animated-child" />
    </div>
  );
};

const setReducedMotion = (matches: boolean) => {
  const preference = Object.assign(new EventTarget(), { matches });
  vi.stubGlobal('matchMedia', () => preference);
  return (next: boolean) => {
    act(() => {
      preference.matches = next;
      preference.dispatchEvent(Object.assign(new Event('change'), { matches: next }));
    });
  };
};

describe('useExitTransition', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('waits for the surface animation and completes only once', () => {
    setReducedMotion(false);
    const onExited = vi.fn();
    render(<ExitHarness onExited={onExited} />);

    const surface = screen.getByTestId('exit-surface');
    expect(surface.getAttribute('data-state')).toBe('idle');

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(surface.getAttribute('data-state')).toBe('exiting');
    expect(onExited).not.toHaveBeenCalled();

    fireAnimationEvent(screen.getByTestId('animated-child'), 'animationend', 'drawer-exit');
    fireAnimationEvent(screen.getByTestId('animated-child'), 'animationcancel', 'drawer-exit');
    fireAnimationEvent(surface, 'animationcancel', 'drawer-enter');
    fireAnimationEvent(surface, 'animationend', 'drawer-enter');
    expect(onExited).not.toHaveBeenCalled();

    fireAnimationEvent(surface, 'animationend', 'drawer-exit');
    fireAnimationEvent(surface, 'animationend', 'drawer-exit');
    expect(onExited).toHaveBeenCalledTimes(1);
    expect(surface.getAttribute('data-state')).toBe('idle');
  });

  it('completes immediately when reduced motion is requested', () => {
    setReducedMotion(true);
    const onExited = vi.fn();
    render(<ExitHarness onExited={onExited} />);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onExited).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('exit-surface').getAttribute('data-state')).toBe('idle');
  });

  it.each(['preference', 'animationcancel'] as const)(
    'completes a pending exit only once when %s interrupts it',
    (firstNotification) => {
      const changePreference = setReducedMotion(false);
      const onExited = vi.fn();
      render(<ExitHarness onExited={onExited} />);
      const surface = screen.getByTestId('exit-surface');
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      changePreference(false);
      expect(onExited).not.toHaveBeenCalled();

      if (firstNotification === 'preference') {
        changePreference(true);
      } else {
        fireAnimationEvent(surface, 'animationcancel', 'drawer-exit');
      }
      expect(onExited).toHaveBeenCalledOnce();

      fireAnimationEvent(surface, 'animationcancel', 'drawer-exit');
      fireAnimationEvent(surface, 'animationend', 'drawer-exit');
      changePreference(true);
      expect(onExited).toHaveBeenCalledOnce();
    }
  );

  it('discards the pending action and listeners when its surface unmounts', () => {
    const changePreference = setReducedMotion(false);
    const onExited = vi.fn();
    const view = render(<ExitHarness onExited={onExited} />);
    const surface = screen.getByTestId('exit-surface');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    view.unmount();

    changePreference(true);
    fireAnimationEvent(surface, 'animationcancel', 'drawer-exit');
    fireAnimationEvent(surface, 'animationend', 'drawer-exit');
    expect(onExited).not.toHaveBeenCalled();
  });
});
