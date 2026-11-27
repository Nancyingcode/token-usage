/**
 * @file 计价质量提示
 * @description 区分缺价用量、条件假设与未知模型兜底，保留可通过键盘展开的原因说明。
 */
import React from 'react';
import { ChevronDown, CircleAlert, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { PricingIssue } from '../../shared/conditionalPricingTypes';
import { ICON_SIZE_MEDIUM, ICON_SIZE_SMALL } from '../constants/ui';
import { resolveRendererLocale } from '../i18n';
import { formatNumber } from '../utils/formatters';

export interface PricingQuality {
  conditionAssumedTokens?: number;
  unpricedTokens?: number;
  pricingIssues?: PricingIssue[];
}

interface PricingQualityNoticeProps {
  quality: PricingQuality;
  layout?: 'inline' | 'banner';
}

export const PricingQualityNotice: React.FC<PricingQualityNoticeProps> = ({
  quality,
  layout = 'inline',
}) => {
  const { t, i18n } = useTranslation('budgets');
  const hasConditionalAssumptions = (quality.conditionAssumedTokens ?? 0) > 0;
  const unpricedTokens = quality.unpricedTokens ?? 0;
  const hasUnpricedTokens = unpricedTokens > 0;
  const isBanner = layout === 'banner';
  const showUnpricedCount = isBanner && hasUnpricedTokens;
  const issues = quality.pricingIssues ?? [];
  if (!hasConditionalAssumptions && !issues.length && !showUnpricedCount) {
    return null;
  }
  const locale = resolveRendererLocale(i18n.resolvedLanguage);
  const title = t(hasUnpricedTokens ? 'pricing.partialTitle' : 'pricing.qualityTitle');
  const Icon = hasUnpricedTokens ? CircleAlert : Info;
  const className = isBanner
    ? 'pricing-quality-notice pricing-quality-banner'
    : 'pricing-quality-notice';
  return (
    <details className={className} data-tone={hasUnpricedTokens ? 'warning' : 'info'}>
      <summary>
        {isBanner ? <Icon size={ICON_SIZE_MEDIUM} aria-hidden="true" /> : null}
        {title}
        {showUnpricedCount ? (
          <span className="pricing-quality-count">
            {t('pricing.tokenCount', { tokens: formatNumber(unpricedTokens, locale) })}
          </span>
        ) : null}
        {isBanner ? (
          <ChevronDown
            className="pricing-quality-chevron"
            size={ICON_SIZE_SMALL}
            aria-hidden="true"
          />
        ) : null}
      </summary>
      <div className="pricing-quality-body">
        {hasUnpricedTokens ? (
          <p>
            {isBanner
              ? t('pricing.partialEstimateScope')
              : t('pricing.partialDescription', { tokens: formatNumber(unpricedTokens, locale) })}
          </p>
        ) : null}
        {hasConditionalAssumptions ? (
          <p>
            {t('pricing.qualityDescription', {
              tokens: formatNumber(quality.conditionAssumedTokens ?? 0, locale),
            })}
          </p>
        ) : null}
        {issues.length ? (
          <ul>
            {issues.map((issue) => (
              <li key={issue}>{t(`pricing.issues.${issue}`)}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </details>
  );
};
