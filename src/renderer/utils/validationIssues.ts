/**
 * @file 预算校验问题本地化
 * @description 将共享层返回的稳定校验代码转换为当前界面语言，并保留意外错误的技术细节。
 */

import type { TFunction } from 'i18next';
import type { ValidationIssue } from '../../shared/budgetTypes';

export const translateValidationIssue = (issue: ValidationIssue, t: TFunction<'budgets'>): string =>
  t(`validation.${issue.code}`, {
    details: issue.details ?? '',
  });
