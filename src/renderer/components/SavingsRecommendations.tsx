/**
 * @file 节省建议详情
 * @description 筛选并展示建议金额、证据、置信度、风险和重叠去重说明。
 */
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  CostAnomalyBaselineScope,
  RecommendationConfidence,
  SavingsRecommendation,
  SavingsEvidence,
  SavingsRecommendationType,
} from '../../shared/costOptimizationTypes';
import { resolveRendererLocale } from '../i18n';
import { formatPercent, formatUsd } from '../utils/formatters';

export type SavingsTypeFilter = SavingsRecommendationType | 'all';
export type SavingsConfidenceFilter = RecommendationConfidence | 'all';

interface SavingsRecommendationsProps {
  recommendations: SavingsRecommendation[];
  conservativeSavingsUsd: number;
}

type RecommendationTitleKey =
  | 'recommendation.model-substitution'
  | 'recommendation.cache-improvement'
  | 'recommendation.anomaly-recovery';

type RecommendationRiskKey =
  | 'savings.risk.modelEquivalence'
  | 'savings.risk.cacheEligibility'
  | 'savings.risk.anomalyRecurrence'
  | 'savings.risk.unknown';

const TITLE_KEYS: Record<SavingsRecommendationType, RecommendationTitleKey> = {
  'model-substitution': 'recommendation.model-substitution',
  'cache-improvement': 'recommendation.cache-improvement',
  'anomaly-recovery': 'recommendation.anomaly-recovery',
};

const RISK_KEYS: Record<string, RecommendationRiskKey> = {
  'risk.modelEquivalence': 'savings.risk.modelEquivalence',
  'risk.cacheEligibility': 'savings.risk.cacheEligibility',
  'risk.anomalyRecurrence': 'savings.risk.anomalyRecurrence',
};
const DEFAULT_RISK_KEY: RecommendationRiskKey = 'savings.risk.unknown';
const BASELINE_SCOPE_KEYS: Record<
  CostAnomalyBaselineScope,
  | 'anomalies.baselineScopes.globalDay'
  | 'anomalies.baselineScopes.projectDay'
  | 'anomalies.baselineScopes.globalModelDay'
  | 'anomalies.baselineScopes.projectModelDay'
  | 'anomalies.baselineScopes.projectModel'
  | 'anomalies.baselineScopes.model'
  | 'anomalies.baselineScopes.global'
> = {
  'global-day': 'anomalies.baselineScopes.globalDay',
  'project-day': 'anomalies.baselineScopes.projectDay',
  'global-model-day': 'anomalies.baselineScopes.globalModelDay',
  'project-model-day': 'anomalies.baselineScopes.projectModelDay',
  'project-model': 'anomalies.baselineScopes.projectModel',
  model: 'anomalies.baselineScopes.model',
  global: 'anomalies.baselineScopes.global',
};

export const filterSavingsRecommendations = (
  recommendations: SavingsRecommendation[],
  type: SavingsTypeFilter,
  confidence: SavingsConfidenceFilter
): SavingsRecommendation[] =>
  recommendations.filter(
    (recommendation) =>
      (type === 'all' || recommendation.type === type) &&
      (confidence === 'all' || recommendation.confidence === confidence)
  );

const SavingsRecommendations: React.FC<SavingsRecommendationsProps> = ({
  recommendations,
  conservativeSavingsUsd,
}) => {
  const { t, i18n } = useTranslation('costOptimization');
  const locale = resolveRendererLocale(i18n.resolvedLanguage);
  const [type, setType] = useState<SavingsTypeFilter>('all');
  const [confidence, setConfidence] = useState<SavingsConfidenceFilter>('all');
  const types = useMemo(
    () => [...new Set(recommendations.map((recommendation) => recommendation.type))],
    [recommendations]
  );
  const confidences = useMemo(
    () => [...new Set(recommendations.map((recommendation) => recommendation.confidence))],
    [recommendations]
  );
  const filteredRecommendations = useMemo(
    () => filterSavingsRecommendations(recommendations, type, confidence),
    [confidence, recommendations, type]
  );
  const formatEvidence = (evidence: SavingsEvidence): string => {
    switch (evidence.kind) {
      case 'sessions':
        return t('savings.evidence.sessions', { count: evidence.count });
      case 'pricing-coverage':
        return t('savings.evidence.pricingCoverage', {
          percentage: formatPercent(evidence.percentage, locale),
        });
      case 'baseline-samples':
        return t('savings.evidence.baselineSamples', { count: evidence.count });
      case 'baseline-scope':
        return t('savings.evidence.baselineScope', {
          scope: t(BASELINE_SCOPE_KEYS[evidence.scope]),
        });
      case 'current-cache-percentage':
        return t('savings.evidence.currentCachePercentage', {
          percentage: formatPercent(evidence.percentage, locale),
        });
      case 'target-cache-percentage':
        return t('savings.evidence.targetCachePercentage', {
          percentage: formatPercent(evidence.percentage, locale),
        });
    }
  };

  return (
    <section className="cost-detail-stack">
      <div className="cost-savings-summary">
        <div>
          <span>{t('savings.conservativeTotal')}</span>
          <strong>{formatUsd(conservativeSavingsUsd, locale)}</strong>
        </div>
        <p>{t('savings.overlapNotice')}</p>
      </div>

      <div className="cost-detail-filter-bar">
        <label>
          <span>{t('savings.typeFilter')}</span>
          <select
            value={type}
            onChange={(event) => setType(event.target.value as SavingsTypeFilter)}
          >
            <option value="all">{t('filter.allTypes')}</option>
            {types.map((option) => (
              <option key={option} value={option}>
                {t(TITLE_KEYS[option])}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t('savings.confidenceFilter')}</span>
          <select
            value={confidence}
            onChange={(event) => setConfidence(event.target.value as SavingsConfidenceFilter)}
          >
            <option value="all">{t('filter.allConfidence')}</option>
            {confidences.map((option) => (
              <option key={option} value={option}>
                {t(`savings.confidence.${option}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {filteredRecommendations.length > 0 ? (
        <div className="cost-savings-list">
          {filteredRecommendations.map((recommendation) => (
            <article className="panel cost-savings-card" key={recommendation.id}>
              <div className="cost-savings-heading">
                <div>
                  <span>{t(`savings.confidence.${recommendation.confidence}`)}</span>
                  <h3>{t(TITLE_KEYS[recommendation.type])}</h3>
                  <p>{recommendation.scopeLabel}</p>
                </div>
                <strong>{formatUsd(recommendation.savingsUsd, locale)}</strong>
              </div>
              <section>
                <h4>{t('savings.calculationBasis')}</h4>
                <ul>
                  {recommendation.evidence.map((evidence) => (
                    <li key={JSON.stringify(evidence)}>{formatEvidence(evidence)}</li>
                  ))}
                </ul>
              </section>
              <section className="cost-savings-risk">
                <h4>{t('savings.riskLabel')}</h4>
                <p>{t(RISK_KEYS[recommendation.riskKey] ?? DEFAULT_RISK_KEY)}</p>
              </section>
            </article>
          ))}
        </div>
      ) : (
        <section className="panel cost-detail-empty">{t('savings.empty')}</section>
      )}
    </section>
  );
};

export default SavingsRecommendations;
