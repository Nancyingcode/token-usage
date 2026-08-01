/**
 * @file 会话诊断基线文案
 * @description 根据检测器分数方向选择相对历史基线的本地化文案。
 */

import type { SessionDiagnosisCause } from '../../shared/costOptimizationTypes';

export type SessionDiagnosisBaselineDeviationKey =
  'diagnostics.baseline.deviationAbove' | 'diagnostics.baseline.deviationBelow';

export const getSessionDiagnosisBaselineDeviationKey = (
  cause: SessionDiagnosisCause
): SessionDiagnosisBaselineDeviationKey =>
  cause === 'cache-degradation'
    ? 'diagnostics.baseline.deviationBelow'
    : 'diagnostics.baseline.deviationAbove';
