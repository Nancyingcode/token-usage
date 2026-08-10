import { describe, expect, it } from 'vitest';
import { getApplicationMenuPolicy } from '../src/main/menuPolicy';

describe('getApplicationMenuPolicy', () => {
  it('keeps the menu visible in development', () => {
    expect(getApplicationMenuPolicy(false)).toEqual({
      autoHideMenuBar: false,
      removeApplicationMenu: false,
      useNativeFrame: true,
    });
  });

  it('removes and hides the menu in packaged production', () => {
    expect(getApplicationMenuPolicy(true)).toEqual({
      autoHideMenuBar: true,
      removeApplicationMenu: true,
      useNativeFrame: false,
    });
  });
});
