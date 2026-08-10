/**
 * @file Motion utility tests
 * @description Verifies bounded stagger timing for animated data lists.
 */

import { describe, expect, it } from 'vitest';

import {
  MOTION_STAGGER_MAX_INDEX,
  MOTION_STAGGER_STEP_MS,
  getStaggerDelayMs,
  getStaggeredMotionStyle,
} from '../src/renderer/utils/motion';

describe('motion utilities', () => {
  it('clamps stagger delays to a bounded non-negative range', () => {
    expect(getStaggerDelayMs(-1)).toBe(0);
    expect(getStaggerDelayMs(2)).toBe(MOTION_STAGGER_STEP_MS * 2);
    expect(getStaggerDelayMs(MOTION_STAGGER_MAX_INDEX + 10)).toBe(
      MOTION_STAGGER_STEP_MS * MOTION_STAGGER_MAX_INDEX
    );
  });

  it('exposes the bounded delay as a CSS custom property', () => {
    expect(getStaggeredMotionStyle(3)).toEqual({
      '--motion-delay': `${MOTION_STAGGER_STEP_MS * 3}ms`,
    });
  });
});
