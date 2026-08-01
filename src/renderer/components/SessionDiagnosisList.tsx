/**
 * @file 会话诊断摘要列表
 * @description 展示、筛选并打开按影响排序的本地会话诊断摘要。
 */

import React, { useMemo } from 'react';
import { AlertTriangle, CircleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type {
  SessionDiagnosisBaselineScope,
  SessionDiagnosisCause,
  SessionDiagnosisConfidence,
  SessionDiagnosisSeverity,
  SessionDiagnosisSummary,
} from '../../shared/costOptimizationTypes';
import { ICON_SIZE_SMALL } from '../constants/ui';
import { resolveRendererLocale } from '../i18n';
import { formatNumber, formatPercent, formatShortDateTime, formatUsd } from '../utils/formatters';
import {
  filterSessionDiagnosisSummaries,
  type SessionDiagnosisFilters,
} from '../utils/sessionDiagnosisFilters';
import { getSessionDiagnosisBaselineDeviationKey } from '../utils/sessionDiagnosisBaseline';

interface SessionDiagnosisListProps {
  summaries: SessionDiagnosisSummary[];
  filters: SessionDiagnosisFilters;
  onFiltersChange: (filters: SessionDiagnosisFilters) => void;
  onOpen: (summary: SessionDiagnosisSummary) => void;
}

const SHORT_SESSION_ID_LENGTH = 8;
const FULL_PRICING_COVERAGE_PERCENTAGE = 100;

const CAUSES: SessionDiagnosisCause[] = [
  'input-growth',
  'cache-degradation',
  'generation-concentration',
  'model-cost-dominance',
  'interaction-accumulation',
];
const SEVERITIES: SessionDiagnosisSeverity[] = ['warning', 'critical'];
const CONFIDENCE_LEVELS: SessionDiagnosisConfidence[] = ['low', 'medium', 'high'];

const CAUSE_KEYS = {
  'input-growth': 'diagnostics.cause.inputGrowth',
  'cache-degradation': 'diagnostics.cause.cacheDegradation',
  'generation-concentration': 'diagnostics.cause.generationConcentration',
  'model-cost-dominance': 'diagnostics.cause.modelCostDominance',
  'interaction-accumulation': 'diagnostics.cause.interactionAccumulation',
} as const;

const BASELINE_SCOPE_KEYS: Record<
  SessionDiagnosisBaselineScope,
  | 'diagnostics.baseline.scope.session'
  | 'diagnostics.baseline.scope.projectModel'
  | 'diagnostics.baseline.scope.model'
  | 'diagnostics.baseline.scope.project'
  | 'diagnostics.baseline.scope.global'
> = {
  session: 'diagnostics.baseline.scope.session',
  'project-model': 'diagnostics.baseline.scope.projectModel',
  model: 'diagnostics.baseline.scope.model',
  project: 'diagnostics.baseline.scope.project',
  global: 'diagnostics.baseline.scope.global',
};

const getSessionDisplayName = (summary: SessionDiagnosisSummary): string =>
  summary.threadName?.trim() || summary.sessionId.slice(0, SHORT_SESSION_ID_LENGTH);

const SessionDiagnosisList: React.FC<SessionDiagnosisListProps> = ({
  summaries,
  filters,
  onFiltersChange,
  onOpen,
}) => {
  const { t, i18n } = useTranslation('costOptimization');
  const locale = resolveRendererLocale(i18n.resolvedLanguage);
  const filteredSummaries = useMemo(
    () => filterSessionDiagnosisSummaries({ summaries, ...filters }),
    [filters, summaries]
  );

  return (
    <section className="session-diagnosis-list">
      <header className="session-diagnosis-list-heading">
        <div>
          <h3>{t('diagnostics.list.title')}</h3>
          <p>{t('diagnostics.list.description')}</p>
        </div>
        <div className="session-diagnosis-filters">
          <label>
            <span>{t('diagnostics.scope.label')}</span>
            <select
              value={filters.scope}
              onChange={(event) =>
                onFiltersChange({
                  ...filters,
                  scope: event.target.value as SessionDiagnosisFilters['scope'],
                })
              }
            >
              <option value="attention">{t('diagnostics.scope.attention')}</option>
              <option value="all">{t('diagnostics.scope.all')}</option>
            </select>
          </label>
          <label>
            <span>{t('diagnostics.cause.label')}</span>
            <select
              value={filters.cause}
              onChange={(event) =>
                onFiltersChange({
                  ...filters,
                  cause: event.target.value as SessionDiagnosisFilters['cause'],
                })
              }
            >
              <option value="all">{t('diagnostics.cause.all')}</option>
              {CAUSES.map((cause) => (
                <option key={cause} value={cause}>
                  {t(CAUSE_KEYS[cause])}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t('diagnostics.severity.label')}</span>
            <select
              value={filters.severity}
              onChange={(event) =>
                onFiltersChange({
                  ...filters,
                  severity: event.target.value as SessionDiagnosisFilters['severity'],
                })
              }
            >
              <option value="all">{t('diagnostics.severity.all')}</option>
              {SEVERITIES.map((severity) => (
                <option key={severity} value={severity}>
                  {t(`diagnostics.severity.${severity}`)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t('diagnostics.confidence.label')}</span>
            <select
              value={filters.confidence}
              onChange={(event) =>
                onFiltersChange({
                  ...filters,
                  confidence: event.target.value as SessionDiagnosisFilters['confidence'],
                })
              }
            >
              <option value="all">{t('diagnostics.confidence.all')}</option>
              {CONFIDENCE_LEVELS.map((confidence) => (
                <option key={confidence} value={confidence}>
                  {t(`diagnostics.confidence.${confidence}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {filteredSummaries.length > 0 ? (
        <div className="session-diagnosis-table">
          <div className="session-diagnosis-table-head" aria-hidden="true">
            <span>{t('diagnostics.list.session')}</span>
            <span>{t('diagnostics.list.project')}</span>
            <span>{t('diagnostics.list.startedAt')}</span>
            <span>{t('diagnostics.list.totalTokens')}</span>
            <span>{t('diagnostics.list.pricedCost')}</span>
            <span>{t('diagnostics.list.pricingCoverage')}</span>
            <span>{t('diagnostics.list.relativeBaseline')}</span>
            <span>{t('diagnostics.list.primaryCause')}</span>
            <span>{t('diagnostics.list.otherFindings')}</span>
            <span>{t('diagnostics.list.severity')}</span>
            <span>{t('diagnostics.list.confidence')}</span>
          </div>
          <div className="session-diagnosis-table-body">
            {filteredSummaries.map((summary) => {
              const displayName = getSessionDisplayName(summary);
              const finding = summary.primaryFinding;
              const cause = finding
                ? t(CAUSE_KEYS[finding.cause])
                : t('diagnostics.state.unresolved');
              const isFullyPriced = summary.coverage.percentage >= FULL_PRICING_COVERAGE_PERCENTAGE;
              const costLabel = isFullyPriced
                ? t('diagnostics.list.fullEstimatedCost')
                : t('diagnostics.list.pricedCost');
              const SeverityIcon = finding?.severity === 'critical' ? CircleAlert : AlertTriangle;

              return (
                <button
                  className={`session-diagnosis-row${finding ? ` ${finding.severity}` : ''}`}
                  key={summary.diagnosisId}
                  type="button"
                  aria-label={t('diagnostics.list.open', { session: displayName })}
                  onClick={() => onOpen(summary)}
                >
                  <span
                    className="session-diagnosis-session"
                    data-label={t('diagnostics.list.session')}
                  >
                    <strong>{displayName}</strong>
                    <small>{summary.sessionId}</small>
                  </span>
                  <span data-label={t('diagnostics.list.project')}>{summary.projectName}</span>
                  <span data-label={t('diagnostics.list.startedAt')}>
                    {formatShortDateTime(summary.startedAt, locale)}
                  </span>
                  <span data-label={t('diagnostics.list.totalTokens')}>
                    {formatNumber(summary.totalTokens, locale)}
                  </span>
                  <span className="session-diagnosis-cost" data-label={costLabel}>
                    <small>{costLabel}</small>
                    <strong>{formatUsd(summary.pricedCostUsd, locale)}</strong>
                  </span>
                  <span data-label={t('diagnostics.list.pricingCoverage')}>
                    {formatPercent(summary.coverage.percentage, locale, 1)}
                  </span>
                  <span
                    className="session-diagnosis-baseline"
                    data-label={t('diagnostics.list.relativeBaseline')}
                  >
                    {finding?.baseline ? (
                      <>
                        <strong>
                          {t(getSessionDiagnosisBaselineDeviationKey(finding.cause), {
                            score: finding.baseline.score.toFixed(1),
                          })}
                        </strong>
                        <small>
                          {t('diagnostics.baseline.scopeSamples', {
                            scope: t(BASELINE_SCOPE_KEYS[finding.baseline.scope]),
                            count: finding.baseline.sampleCount,
                          })}
                        </small>
                      </>
                    ) : (
                      t('diagnostics.baseline.unavailable')
                    )}
                  </span>
                  <span
                    className="session-diagnosis-cause"
                    data-label={t('diagnostics.list.primaryCause')}
                  >
                    <strong>{cause}</strong>
                    <small>{t('diagnostics.sessions.open', { cause })}</small>
                  </span>
                  <span data-label={t('diagnostics.list.otherFindings')}>
                    {t('diagnostics.additionalFindings', {
                      count: summary.additionalFindingCount,
                    })}
                  </span>
                  <span
                    className="session-diagnosis-severity"
                    data-label={t('diagnostics.list.severity')}
                  >
                    {finding ? (
                      <>
                        <SeverityIcon size={ICON_SIZE_SMALL} aria-hidden="true" />
                        {t(`diagnostics.severity.${finding.severity}`)}
                      </>
                    ) : (
                      '—'
                    )}
                  </span>
                  <span data-label={t('diagnostics.list.confidence')}>
                    {finding ? t(`diagnostics.confidence.${finding.confidence}`) : '—'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <section className="panel session-diagnosis-empty">
          <h4>{t('diagnostics.state.noAttentionTitle')}</h4>
          <p>{t('diagnostics.state.noAttentionDescription')}</p>
          {filters.scope === 'attention' ? (
            <button type="button" onClick={() => onFiltersChange({ ...filters, scope: 'all' })}>
              {t('diagnostics.state.showAll')}
            </button>
          ) : null}
        </section>
      )}
    </section>
  );
};

export default SessionDiagnosisList;
