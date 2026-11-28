/**
 * @file Exit transition lifecycle
 * @description Completes overlay actions once when the matching exit ends or is interrupted.
 */
import React from 'react';
import { getReducedMotionPreference } from '../utils/motion';

export type ExitTransitionState = 'idle' | 'exiting';

interface ExitTransition {
  state: ExitTransitionState;
  requestExit: () => void;
  requestExitWith: (onExited: () => void) => void;
  setExitSurface: React.RefCallback<HTMLElement>;
}

export const useExitTransition = (onExited: () => void, animationName: string): ExitTransition => {
  const [state, setState] = React.useState<ExitTransitionState>('idle');
  const onExitedRef = React.useRef(onExited);
  const pendingCompletionRef = React.useRef<(() => void) | null>(null);
  const exitSurfaceRef = React.useRef<HTMLElement | null>(null);

  React.useLayoutEffect(() => {
    onExitedRef.current = onExited;
  }, [onExited]);

  const setExitSurface = React.useCallback<React.RefCallback<HTMLElement>>((surface) => {
    exitSurfaceRef.current = surface;
  }, []);

  const completeExit = React.useCallback((): void => {
    const completion = pendingCompletionRef.current;
    if (!completion) {
      return;
    }
    pendingCompletionRef.current = null;
    setState('idle');
    completion();
  }, []);

  const startExit = React.useCallback(
    (completion: () => void): void => {
      if (pendingCompletionRef.current) {
        return;
      }

      pendingCompletionRef.current = completion;
      if (getReducedMotionPreference()?.matches) {
        completeExit();
        return;
      }
      setState('exiting');
    },
    [completeExit]
  );

  const requestExit = React.useCallback((): void => {
    startExit(onExitedRef.current);
  }, [startExit]);

  const requestExitWith = React.useCallback(
    (completion: () => void): void => {
      startExit(completion);
    },
    [startExit]
  );

  React.useLayoutEffect(() => {
    const surface = exitSurfaceRef.current;
    if (state !== 'exiting' || !surface) {
      return;
    }

    const preference = getReducedMotionPreference();
    if (preference?.matches) {
      completeExit();
      return;
    }

    // Starting a CSS exit can also cancel the entry on the same node.
    const handleAnimationDone = (event: AnimationEvent): void => {
      if (event.target === surface && event.animationName === animationName) {
        completeExit();
      }
    };
    const handlePreferenceChange = (event: MediaQueryListEvent): void => {
      if (event.matches) {
        completeExit();
      }
    };
    surface.addEventListener('animationend', handleAnimationDone);
    surface.addEventListener('animationcancel', handleAnimationDone);
    preference?.addEventListener('change', handlePreferenceChange);

    return () => {
      pendingCompletionRef.current = null;
      surface.removeEventListener('animationend', handleAnimationDone);
      surface.removeEventListener('animationcancel', handleAnimationDone);
      preference?.removeEventListener('change', handlePreferenceChange);
    };
  }, [animationName, completeExit, state]);

  return { state, requestExit, requestExitWith, setExitSurface };
};
