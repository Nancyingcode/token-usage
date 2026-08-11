// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { applyThemeToDocument } from '../src/renderer/utils/theme';

describe('applyThemeToDocument', () => {
  it('synchronizes the root theme and native color scheme', () => {
    applyThemeToDocument('ocean-dark');

    expect(document.documentElement.dataset.theme).toBe('ocean-dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');

    applyThemeToDocument('sand-light');

    expect(document.documentElement.dataset.theme).toBe('sand-light');
    expect(document.documentElement.style.colorScheme).toBe('light');
  });
});
