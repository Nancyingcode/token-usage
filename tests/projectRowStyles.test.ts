/**
 * @file Project row style tests
 * @description Guards the interactive project row against browser button typography defaults.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const getCssRuleBody = (stylesheet: string, selector: string): string => {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = stylesheet.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));

  return match?.[1] ?? '';
};

describe('project row styles', () => {
  it('preserves the table row typography for interactive project buttons', async () => {
    const stylesheetPath = resolve(process.cwd(), 'src/renderer/styles.css');
    const stylesheet = await readFile(stylesheetPath, 'utf8');
    const tableRowRule = getCssRuleBody(stylesheet, '.table-row');
    const projectRowRule = getCssRuleBody(stylesheet, '.project-table-row');

    expect(tableRowRule).toContain('color: #4a4a4a');
    expect(tableRowRule).toContain('font-size: 12px');
    expect(projectRowRule).not.toContain('color: inherit');
    expect(projectRowRule).not.toContain('font: inherit');
  });
});
