import { describe, expect, it } from 'vitest';
import { translateValidationIssue } from '../src/renderer/utils/validationIssues';
import { createTestI18n } from './helpers/renderWithI18n';

describe('validation issue translations', () => {
  it.each([
    ['en' as const, 'Project is required.'],
    ['zh-CN' as const, '必须填写项目。'],
  ])('translates semantic validation codes in %s', (locale, expected) => {
    const i18n = createTestI18n(locale);
    const t = i18n.getFixedT(locale, 'budgets');

    expect(translateValidationIssue({ field: 'projectPath', code: 'project-required' }, t)).toBe(
      expected
    );
  });

  it('keeps raw details for unexpected failures', () => {
    const i18n = createTestI18n('zh-CN');
    const t = i18n.getFixedT('zh-CN', 'budgets');

    expect(
      translateValidationIssue(
        { field: 'form', code: 'unexpected', details: 'permission denied' },
        t
      )
    ).toContain('permission denied');
  });
});
