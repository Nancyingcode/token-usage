/**
 * @file Renderer motion helpers
 * @description Provides motion preference and bounded stagger timing for data collections.
 */
import type React from 'react';

export const MOTION_STAGGER_STEP_MS = 32;
export const MOTION_STAGGER_MAX_INDEX = 6;

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export const getReducedMotionPreference = (): MediaQueryList | undefined =>
  typeof window.matchMedia === 'function' ? window.matchMedia(REDUCED_MOTION_QUERY) : undefined;

export type StaggeredMotionStyle = React.CSSProperties & {
  '--motion-delay': string;
};

export const getStaggerDelayMs = (index: number): number => {
  const boundedIndex = Math.min(Math.max(index, 0), MOTION_STAGGER_MAX_INDEX);
  return boundedIndex * MOTION_STAGGER_STEP_MS;
};

export const getStaggeredMotionStyle = (index: number): StaggeredMotionStyle => ({
  '--motion-delay': `${getStaggerDelayMs(index)}ms`,
});
