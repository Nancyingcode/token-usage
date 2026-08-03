/**
 * @file 模型成本对比
 * @description 展示实际模型成本和仅基于价格的替代情景，并明确能力不等价边界。
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import type { ModelCostRow, ModelSubstitutionScenario } from '../../shared/costOptimizationTypes';
import { resolveRendererLocale } from '../i18n';
import { formatCompactNumber, formatPercent, formatUsd } from '../utils/formatters';

interface ModelCostComparisonProps {
  rows: ModelCostRow[];
  scenarios: ModelSubstitutionScenario[];
}

const PERCENT_BASE = 100;

const ModelCostComparison: React.FC<ModelCostComparisonProps> = ({ rows, scenarios }) => {
  const { t, i18n } = useTranslation('costOptimization');
  const locale = resolveRendererLocale(i18n.resolvedLanguage);

  return (
    <div className="cost-detail-stack">
      <section className="panel cost-detail-panel">
        <div className="panel-heading">
          <div>
            <h3>{t('comparison.actualTitle')}</h3>
            <p>{t('comparison.actualDescription')}</p>
          </div>
        </div>
        <div className="cost-table-scroll">
          <table className="detail-table cost-detail-table">
            <thead>
              <tr>
                <th>{t('comparison.model')}</th>
                <th>{t('comparison.tokens')}</th>
                <th>{t('comparison.actualCost')}</th>
                <th>{t('comparison.share')}</th>
                <th>{t('comparison.averageSession')}</th>
                <th>{t('comparison.coverage')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const hasPricedUsage = row.coverage.pricedTokens > 0;

                return (
                  <tr key={row.modelId ?? 'unknown'}>
                    <td>{row.modelId ?? t('comparison.unknownModel')}</td>
                    <td>
                      <strong>{formatCompactNumber(row.totalTokens, locale)}</strong>
                      <small>
                        {t('comparison.tokenComposition', {
                          input: formatCompactNumber(row.inputTokens, locale),
                          cached: formatCompactNumber(row.cachedInputTokens, locale),
                          output: formatCompactNumber(row.outputTokens, locale),
                        })}
                      </small>
                    </td>
                    <td>
                      {hasPricedUsage
                        ? formatUsd(row.pricedCostUsd, locale)
                        : t('comparison.pricingIncomplete')}
                    </td>
                    <td>{formatPercent(row.costShare * PERCENT_BASE, locale)}</td>
                    <td>
                      {hasPricedUsage
                        ? formatUsd(row.averageSessionCostUsd, locale)
                        : t('comparison.pricingIncomplete')}
                    </td>
                    <td>{formatPercent(row.coverage.percentage, locale)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel cost-detail-panel">
        <div className="panel-heading">
          <div>
            <h3>{t('comparison.scenarioTitle')}</h3>
            <p>{t('comparison.scenarioDescription')}</p>
          </div>
        </div>
        <div className="cost-table-scroll">
          <table className="detail-table cost-detail-table">
            <thead>
              <tr>
                <th>{t('comparison.sourceModel')}</th>
                <th>{t('comparison.targetModel')}</th>
                <th>{t('comparison.actualCost')}</th>
                <th>{t('comparison.scenarioCost')}</th>
                <th>{t('comparison.savings')}</th>
                <th>{t('comparison.sessions')}</th>
              </tr>
            </thead>
            <tbody>
              {scenarios.map((scenario) => (
                <tr key={`${scenario.sourceModelId ?? 'unknown'}:${scenario.targetModelId}`}>
                  <td>{scenario.sourceModelId ?? t('comparison.unknownModel')}</td>
                  <td>{scenario.targetModelId}</td>
                  <td>{formatUsd(scenario.actualCostUsd, locale)}</td>
                  <td>{formatUsd(scenario.scenarioCostUsd, locale)}</td>
                  <td className="cost-positive">{formatUsd(scenario.savingsUsd, locale)}</td>
                  <td>{scenario.affectedSessionCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="cost-detail-disclaimer">{t('comparison.equivalenceDisclaimer')}</p>
      </section>
    </div>
  );
};

export default ModelCostComparison;
