/**
 * @file 计价质量提示
 * @description 区分缺价用量、条件假设与未知模型兜底，保留可通过键盘展开的原因说明。
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import type { PricingIssue } from '../../shared/conditionalPricingTypes';
import { resolveRendererLocale } from '../i18n';
import { formatNumber } from '../utils/formatters';

export interface PricingQuality {
  conditionAssumedTokens?: number;
  unpricedTokens?: number;
  pricingIssues?: PricingIssue[];
}

export const PricingQualityNotice: React.FC<{ quality: PricingQuality }> = ({ quality }) => {
  const { t, i18n } = useTranslation('budgets');
  const hasConditionalAssumptions = (quality.conditionAssumedTokens ?? 0) > 0;
  const hasUnpricedTokens = (quality.unpricedTokens ?? 0) > 0;
  const hasIssues = (quality.pricingIssues?.length ?? 0) > 0;
  if (!hasConditionalAssumptions && !hasIssues) {
    return null;
  }
  return (
    <details className="pricing-quality-notice">
      <summary>{t(hasUnpricedTokens ? 'pricing.partialTitle' : 'pricing.qualityTitle')}</summary>
      {hasConditionalAssumptions ? (
        <p>
          {t('pricing.qualityDescription', {
            tokens: formatNumber(
              quality.conditionAssumedTokens ?? 0,
              resolveRendererLocale(i18n.resolvedLanguage)
            ),
          })}
        </p>
      ) : null}
      {hasUnpricedTokens ? (
        <p>
          {t('pricing.partialDescription', {
            tokens: formatNumber(
              quality.unpricedTokens ?? 0,
              resolveRendererLocale(i18n.resolvedLanguage)
            ),
          })}
        </p>
      ) : null}
      {quality.pricingIssues?.length ? (
        <ul>
          {quality.pricingIssues.map((issue) => (
            <li key={issue}>{t(`pricing.issues.${issue}`)}</li>
          ))}
        </ul>
      ) : null}
    </details>
  );
};
