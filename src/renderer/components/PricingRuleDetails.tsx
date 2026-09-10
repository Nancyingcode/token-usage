/**
 * @file 模型条件规则明细
 * @description 展示精确模型的已核实倍率及用户覆盖后的有效单价。
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import type { ModelPricingEntry } from '../../shared/budgetTypes';
import type { PricingMode } from '../../shared/conditionalPricingTypes';
import { resolveRendererLocale } from '../i18n';
import { formatNumber, formatShortDateTime, formatUsd } from '../utils/formatters';

export const PricingRuleDetails: React.FC<{ entry: ModelPricingEntry }> = ({ entry }) => {
  const { t, i18n } = useTranslation('budgets');
  const locale = resolveRendererLocale(i18n.resolvedLanguage);
  const rules = entry.conditions;
  const long = rules?.longContext;
  return (
    <details className="pricing-rule-details">
      <summary>{t('pricing.ruleTitle')}</summary>
      {rules ? (
        <>
          <p>
            {t('pricing.ruleVerified', {
              date: formatShortDateTime(rules.verifiedAt, locale, rules.verifiedAt),
            })}
          </p>
          <small>{rules.sourceUrl}</small>
          {rules.cacheWriteMultiplier !== undefined ? (
            <p>
              {t('pricing.writeRate', {
                price: formatUsd(entry.inputUsdPerMillion * rules.cacheWriteMultiplier, locale),
                multiplier: formatNumber(rules.cacheWriteMultiplier, locale),
              })}
            </p>
          ) : null}
          {long ? (
            <p>
              {t('pricing.longRule', {
                threshold: formatNumber(long.inputTokenThreshold, locale),
                input: formatNumber(long.inputMultiplier, locale),
                cached: formatNumber(long.cachedInputMultiplier, locale),
                write: formatNumber(long.cacheWriteMultiplier, locale),
                output: formatNumber(long.outputMultiplier, locale),
              })}
            </p>
          ) : null}
          <ul>
            {Object.entries(rules.modes).map(([mode, multiplier]) => (
              <li key={mode}>
                {t('pricing.modeRule', {
                  mode: t(`pricing.modeLabels.${mode as PricingMode}`),
                  multiplier: formatNumber(multiplier, locale),
                })}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p>
          {t(entry.sourceKind === 'override' ? 'pricing.flatOverride' : 'pricing.ruleUnavailable')}
        </p>
      )}
    </details>
  );
};
