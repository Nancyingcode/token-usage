/**
 * @file Renderer motion helpers
 * @description Provides bounded, pure stagger timing for animated data collections.
 */
import type React from 'react';

export const MOTION_STAGGER_STEP_MS = 32;
export const MOTION_STAGGER_MAX_INDEX = 6;

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
