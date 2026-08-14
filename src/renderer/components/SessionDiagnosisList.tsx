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
import { getStaggeredMotionStyle } from '../utils/motion';
import {
  filterSessionDiagnosisSummaries,
  type SessionDiagnosisFilters,
} from '../utils/sessionDiagnosisFilters';
import { getSessionDiagnosisBaselineDeviationKey } from '../utils/sessionDiagnosisBaseline';
import SelectMenu, { type SelectMenuOption } from './SelectMenu';

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
  const { t: tCommon } = useTranslation('common');
  const locale = resolveRendererLocale(i18n.resolvedLanguage);
  const scopeOptions = useMemo<SelectMenuOption<SessionDiagnosisFilters['scope']>[]>(
    () => [
      { value: 'attention', label: t('diagnostics.scope.attention') },
      { value: 'all', label: t('diagnostics.scope.all') },
    ],
    [t]
  );
  const causeOptions = useMemo<SelectMenuOption<SessionDiagnosisFilters['cause']>[]>(
    () => [
      { value: 'all', label: t('diagnostics.cause.all') },
      ...CAUSES.map((cause) => ({
        value: cause,
        label: t(CAUSE_KEYS[cause]),
      })),
    ],
    [t]
  );
  const severityOptions = useMemo<SelectMenuOption<SessionDiagnosisFilters['severity']>[]>(
    () => [
      { value: 'all', label: t('diagnostics.severity.all') },
      ...SEVERITIES.map((severity) => ({
        value: severity,
        label: t(`diagnostics.severity.${severity}`),
      })),
    ],
    [t]
  );
  const confidenceOptions = useMemo<SelectMenuOption<SessionDiagnosisFilters['confidence']>[]>(
    () => [
      { value: 'all', label: t('diagnostics.confidence.all') },
      ...CONFIDENCE_LEVELS.map((confidence) => ({
        value: confidence,
        label: t(`diagnostics.confidence.${confidence}`),
      })),
    ],
    [t]
  );
  const filteredSummaries = useMemo(
    () => filterSessionDiagnosisSummaries({ summaries, ...filters }),
    [filters, summaries]
  );
  const motionKey = [
    filters.scope,
    filters.cause,
    filters.severity,
    filters.confidence,
    ...filteredSummaries.map(({ diagnosisId }) => diagnosisId),
  ].join(':');

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
            <SelectMenu
              value={filters.scope}
              options={scopeOptions}
              onChange={(scope) =>
                onFiltersChange({
                  ...filters,
                  scope,
                })
              }
              ariaLabel={t('diagnostics.scope.label')}
              loadingLabel={tCommon('state.loadingOptions')}
              emptyLabel={tCommon('state.noOptions')}
            />
          </label>
          <label>
            <span>{t('diagnostics.cause.label')}</span>
            <SelectMenu
              value={filters.cause}
              options={causeOptions}
              onChange={(cause) =>
                onFiltersChange({
                  ...filters,
                  cause,
                })
              }
              ariaLabel={t('diagnostics.cause.label')}
              loadingLabel={tCommon('state.loadingOptions')}
              emptyLabel={tCommon('state.noOptions')}
            />
          </label>
          <label>
            <span>{t('diagnostics.severity.label')}</span>
            <SelectMenu
              value={filters.severity}
              options={severityOptions}
              onChange={(severity) =>
                onFiltersChange({
                  ...filters,
                  severity,
                })
              }
              ariaLabel={t('diagnostics.severity.label')}
              loadingLabel={tCommon('state.loadingOptions')}
              emptyLabel={tCommon('state.noOptions')}
            />
          </label>
          <label>
            <span>{t('diagnostics.confidence.label')}</span>
            <SelectMenu
              value={filters.confidence}
              options={confidenceOptions}
              onChange={(confidence) =>
                onFiltersChange({
                  ...filters,
                  confidence,
                })
              }
              ariaLabel={t('diagnostics.confidence.label')}
              loadingLabel={tCommon('state.loadingOptions')}
              emptyLabel={tCommon('state.noOptions')}
            />
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
          <div key={motionKey} className="session-diagnosis-table-body" data-motion-key={motionKey}>
            {filteredSummaries.map((summary, index) => {
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
                  className={`session-diagnosis-row motion-list-item${finding ? ` ${finding.severity}` : ''}`}
                  key={summary.diagnosisId}
                  type="button"
                  style={getStaggeredMotionStyle(index)}
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
                    className="status-label session-diagnosis-severity"
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
                  <span
                    className="status-label session-diagnosis-confidence"
                    data-label={t('diagnostics.list.confidence')}
                  >
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
