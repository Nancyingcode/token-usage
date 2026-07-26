/**
 * @file 成本异常详情
 * @description 按层级和严重程度筛选异常，并展示基线、评分和贡献证据链。
 */
import React, { useMemo, useState } from 'react';
import { AlertTriangle, CircleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type {
  CostAnomaly,
  CostAnomalyBaselineScope,
  CostAnomalyLevel,
  CostAnomalySeverity,
} from '../../shared/costOptimizationTypes';
import { ICON_SIZE_SMALL } from '../constants/ui';
import { resolveRendererLocale } from '../i18n';
import { formatPercent, formatUsd } from '../utils/formatters';

export type CostAnomalyLevelFilter = CostAnomalyLevel | 'all';
export type CostAnomalySeverityFilter = CostAnomalySeverity | 'all';

interface CostAnomaliesProps {
  anomalies: CostAnomaly[];
}

const PERCENT_BASE = 100;
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

export const filterCostAnomalies = (
  anomalies: CostAnomaly[],
  level: CostAnomalyLevelFilter,
  severity: CostAnomalySeverityFilter
): CostAnomaly[] =>
  anomalies.filter(
    (anomaly) =>
      (level === 'all' || anomaly.level === level) &&
      (severity === 'all' || anomaly.severity === severity)
  );

const CostAnomalies: React.FC<CostAnomaliesProps> = ({ anomalies }) => {
  const { t, i18n } = useTranslation('costOptimization');
  const locale = resolveRendererLocale(i18n.resolvedLanguage);
  const [level, setLevel] = useState<CostAnomalyLevelFilter>('all');
  const [severity, setSeverity] = useState<CostAnomalySeverityFilter>('all');
  const levels = useMemo(
    () => [...new Set(anomalies.map((anomaly) => anomaly.level))],
    [anomalies]
  );
  const severities = useMemo(
    () => [...new Set(anomalies.map((anomaly) => anomaly.severity))],
    [anomalies]
  );
  const filteredAnomalies = useMemo(
    () => filterCostAnomalies(anomalies, level, severity),
    [anomalies, level, severity]
  );

  return (
    <section className="cost-detail-stack">
      <div className="cost-detail-filter-bar">
        <label>
          <span>{t('anomalies.levelFilter')}</span>
          <select
            value={level}
            onChange={(event) => setLevel(event.target.value as CostAnomalyLevelFilter)}
          >
            <option value="all">{t('filter.allLevels')}</option>
            {levels.map((option) => (
              <option key={option} value={option}>
                {t(`anomaly.level.${option}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t('anomalies.severityFilter')}</span>
          <select
            value={severity}
            onChange={(event) => setSeverity(event.target.value as CostAnomalySeverityFilter)}
          >
            <option value="all">{t('filter.allSeverities')}</option>
            {severities.map((option) => (
              <option key={option} value={option}>
                {t(`anomaly.severity.${option}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {filteredAnomalies.length > 0 ? (
        <div className="cost-anomaly-list">
          {filteredAnomalies.map((anomaly) => {
            const SeverityIcon = anomaly.severity === 'critical' ? CircleAlert : AlertTriangle;
            const chain = [
              anomaly.date ? `${t('anomaly.level.day')}: ${anomaly.date}` : undefined,
              anomaly.projectName
                ? `${t('anomaly.level.project')}: ${anomaly.projectName}`
                : undefined,
              anomaly.modelId ? `${t('anomaly.level.model')}: ${anomaly.modelId}` : undefined,
              anomaly.sessionId ? `${t('anomaly.level.session')}: ${anomaly.sessionId}` : undefined,
            ].filter((value): value is string => Boolean(value));

            return (
              <article className={`cost-anomaly-card ${anomaly.severity}`} key={anomaly.id}>
                <div className="cost-anomaly-heading">
                  <SeverityIcon size={ICON_SIZE_SMALL} />
                  <div>
                    <strong>{t(`anomaly.level.${anomaly.level}`)}</strong>
                    <span>{t(`anomaly.severity.${anomaly.severity}`)}</span>
                  </div>
                  <em>{formatUsd(anomaly.actualCostUsd, locale)}</em>
                </div>
                <dl className="cost-detail-definition-grid">
                  <div>
                    <dt>{t('anomalies.baseline')}</dt>
                    <dd>{formatUsd(anomaly.baselineCostUsd, locale)}</dd>
                  </div>
                  <div>
                    <dt>{t('anomalies.deviation')}</dt>
                    <dd>{formatPercent(anomaly.deviationRatio * PERCENT_BASE, locale, 1)}</dd>
                  </div>
                  <div>
                    <dt>{t('anomalies.score')}</dt>
                    <dd>{anomaly.score.toFixed(1)}</dd>
                  </div>
                  <div>
                    <dt>{t('anomalies.samples')}</dt>
                    <dd>{anomaly.sampleCount}</dd>
                  </div>
                  <div>
                    <dt>{t('anomalies.baselineScope')}</dt>
                    <dd>{t(BASELINE_SCOPE_KEYS[anomaly.baselineScope])}</dd>
                  </div>
                  <div>
                    <dt>{t('anomalies.coverage')}</dt>
                    <dd>{formatPercent(anomaly.coverage.percentage, locale)}</dd>
                  </div>
                </dl>
                <details>
                  <summary>{t('anomalies.contributionChain')}</summary>
                  <ol className="cost-contribution-chain">
                    {chain.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                    {anomaly.contributionIds.map((contributionId) => (
                      <li key={contributionId}>
                        {t('anomalies.contribution')}: <code>{contributionId}</code>
                      </li>
                    ))}
                  </ol>
                </details>
              </article>
            );
          })}
        </div>
      ) : (
        <section className="panel cost-detail-empty">{t('anomalies.empty')}</section>
      )}
    </section>
  );
};

export default CostAnomalies;
