// @vitest-environment jsdom
/**
 * @file Exit transition tests
 * @description Verifies deferred completion, duplicate guards, and reduced-motion behavior.
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useExitTransition } from '../src/renderer/hooks/useExitTransition';

interface ExitHarnessProps {
  onExited: () => void;
}

const ExitHarness: React.FC<ExitHarnessProps> = ({ onExited }) => {
  const { state, requestExit, handleAnimationEnd } = useExitTransition(onExited);

  return (
    <div data-testid="exit-surface" data-state={state} onAnimationEnd={handleAnimationEnd}>
      <button type="button" onClick={requestExit}>
        Close
      </button>
      <span data-testid="animated-child" />
    </div>
  );
};

const setReducedMotion = (matches: boolean): void => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockReturnValue({ matches }),
  });
};

describe('useExitTransition', () => {
  afterEach(() => {
    vi.restoreAllMocks();
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

    fireEvent.animationEnd(screen.getByTestId('animated-child'));
    expect(onExited).not.toHaveBeenCalled();

    fireEvent.animationEnd(surface);
    fireEvent.animationEnd(surface);
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
});
