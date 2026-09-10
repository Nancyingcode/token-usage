/**
 * @file 条件估算提示
 * @description 将价格条件缺失与未知模型兜底区分，保留可通过键盘展开的原因说明。
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import type { PricingIssue } from '../../shared/conditionalPricingTypes';
import { resolveRendererLocale } from '../i18n';
import { formatNumber } from '../utils/formatters';

export interface PricingQuality {
  conditionAssumedTokens?: number;
  pricingIssues?: PricingIssue[];
}

export const PricingQualityNotice: React.FC<{ quality: PricingQuality }> = ({ quality }) => {
  const { t, i18n } = useTranslation('budgets');
  if (!quality.conditionAssumedTokens) return null;
  return (
    <details className="pricing-quality-notice">
      <summary>{t('pricing.qualityTitle')}</summary>
      <p>
        {t('pricing.qualityDescription', {
          tokens: formatNumber(
            quality.conditionAssumedTokens,
            resolveRendererLocale(i18n.resolvedLanguage)
          ),
        })}
      </p>
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
