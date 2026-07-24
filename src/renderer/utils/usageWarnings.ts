/**
 * @file 用量警告本地化
 * @description 将主进程返回的稳定警告代码映射为当前界面语言，同时保留原始技术细节。
 */

import type { TFunction } from 'i18next';
import type { UsageWarning } from '../../shared/usageTypes';

export const translateUsageWarning = (warning: UsageWarning, t: TFunction<'warnings'>): string =>
  t(warning.code, {
    details: warning.details ?? '',
  });
