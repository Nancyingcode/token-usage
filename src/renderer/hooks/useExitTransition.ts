/**
 * @file Exit transition lifecycle
 * @description Defers overlay completion callbacks until the animated surface finishes exiting.
 */
import React from 'react';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export type ExitTransitionState = 'idle' | 'exiting';

interface ExitTransition {
  state: ExitTransitionState;
  requestExit: () => void;
  requestExitWith: (onExited: () => void) => void;
  handleAnimationEnd: (event: React.AnimationEvent<HTMLElement>) => void;
}

const prefersReducedMotion = (): boolean =>
  typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION_QUERY).matches;

export const useExitTransition = (onExited: () => void): ExitTransition => {
  const [state, setState] = React.useState<ExitTransitionState>('idle');
  const onExitedRef = React.useRef(onExited);
  const pendingCompletionRef = React.useRef<(() => void) | null>(null);
  const exitingRef = React.useRef(false);

  React.useEffect(() => {
    onExitedRef.current = onExited;
  }, [onExited]);

  const startExit = React.useCallback((completion: () => void): void => {
    if (exitingRef.current) {
      return;
    }

    if (prefersReducedMotion()) {
      completion();
      return;
    }

    exitingRef.current = true;
    pendingCompletionRef.current = completion;
    setState('exiting');
  }, []);

  const requestExit = React.useCallback((): void => {
    startExit(onExitedRef.current);
  }, [startExit]);

  const requestExitWith = React.useCallback(
    (completion: () => void): void => {
      startExit(completion);
    },
    [startExit]
  );

  const handleAnimationEnd = React.useCallback((event: React.AnimationEvent<HTMLElement>): void => {
    if (event.target !== event.currentTarget || !exitingRef.current) {
      return;
    }

    const completion = pendingCompletionRef.current;
    exitingRef.current = false;
    pendingCompletionRef.current = null;
    setState('idle');
    completion?.();
  }, []);

  return { state, requestExit, requestExitWith, handleAnimationEnd };
};
