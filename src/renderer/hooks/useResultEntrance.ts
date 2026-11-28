/**
 * @file 结果区入场反馈
 * @description 每次主动换组或切换查询只消费一次动效，支持偏好变化与中断。
 */
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { getReducedMotionPreference } from '../utils/motion';

type ResultEntranceStatus = 'loading' | 'ready' | 'skipped';

const RESULTS_ENTER = 'results-enter';
const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

const startResultEntrance = (
  surface: HTMLElement,
  preference: MediaQueryList | undefined
): (() => void) => {
  const finish = (): void => {
    surface.classList.remove(RESULTS_ENTER);
    surface.removeEventListener('animationend', onAnimationDone);
    surface.removeEventListener('animationcancel', onAnimationDone);
    preference?.removeEventListener('change', onPreferenceChange);
  };
  const onAnimationDone = (event: AnimationEvent): void => {
    if (event.target === surface && event.animationName === RESULTS_ENTER) {
      finish();
    }
  };
  const onPreferenceChange = (event: MediaQueryListEvent): void => {
    if (event.matches) {
      finish();
    }
  };

  surface.addEventListener('animationend', onAnimationDone);
  surface.addEventListener('animationcancel', onAnimationDone);
  preference?.addEventListener('change', onPreferenceChange);
  surface.classList.add(RESULTS_ENTER);
  return finish;
};

export const useResultEntrance = <T extends HTMLElement>(
  scope: string | number,
  status: ResultEntranceStatus
) => {
  const resultsRef = useRef<T>(null);
  const entryRef = useRef({ scope, pending: false });
  const cancelRef = useRef<(() => void) | null>(null);
  const cancel = useCallback((): void => {
    cancelRef.current?.();
    cancelRef.current = null;
  }, []);

  useBrowserLayoutEffect(() => {
    if (entryRef.current.scope !== scope) {
      entryRef.current = { scope, pending: true };
    }
    if (!entryRef.current.pending || status === 'loading') {
      return;
    }

    // Empty results, errors, and reduced motion also settle the selection.
    entryRef.current.pending = false;
    const surface = resultsRef.current;
    const preference = getReducedMotionPreference();
    if (status !== 'ready' || !surface || preference?.matches) {
      return;
    }

    cancelRef.current = startResultEntrance(surface, preference);
    return cancel;
  }, [scope, status, cancel]);

  return { resultsRef, cancel };
};
