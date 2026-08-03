/**
 * @file 会话诊断详情
 * @description 按主要原因、时间线、其他发现和完整检测器状态展示会话消耗证据。
 */

import React from 'react';
import { ArrowLeft, AlertTriangle, CircleAlert } from 'lucide-react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import type {
  SessionDetectorResult,
  SessionDiagnosisBaselineScope,
  SessionDiagnosisDetail,
  SessionDiagnosisEvidence,
  SessionDiagnosisFinding,
  SessionDiagnosisUnavailable,
} from '../../shared/costOptimizationTypes';
import { ICON_SIZE_SMALL } from '../constants/ui';
import { resolveRendererLocale } from '../i18n';
import { formatNumber, formatPercent, formatShortDateTime, formatUsd } from '../utils/formatters';
import { getSessionDiagnosisBaselineDeviationKey } from '../utils/sessionDiagnosisBaseline';
import SessionDiagnosisTimeline from './SessionDiagnosisTimeline';

interface SessionDiagnosisDetailProps {
  detail: SessionDiagnosisDetail;
  onBack: () => void;
}

interface EvidenceItem {
  label: string;
  value: string;
}

const SHORT_SESSION_ID_LENGTH = 8;
const FULL_PRICING_COVERAGE_PERCENTAGE = 100;
const PERCENT_BASE = 100;
const MILLISECONDS_PER_MINUTE = 60_000;
const PRIMARY_EVIDENCE_ITEM_COUNT = 3;

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

const DETECTOR_STATE_KEYS = {
  finding: 'diagnostics.detectorState.finding',
  'not-found': 'diagnostics.detectorState.notFound',
  'insufficient-data': 'diagnostics.detectorState.insufficientData',
  'not-applicable': 'diagnostics.detectorState.notApplicable',
} as const;

const UNAVAILABLE_REASON_KEYS = {
  'within-normal-range': 'diagnostics.unavailableReason.withinNormalRange',
  'insufficient-history': 'diagnostics.unavailableReason.insufficientHistory',
  'insufficient-slices': 'diagnostics.unavailableReason.insufficientSlices',
  'pricing-incomplete': 'diagnostics.unavailableReason.pricingIncomplete',
  'zero-input': 'diagnostics.unavailableReason.zeroInput',
  'zero-total': 'diagnostics.unavailableReason.zeroTotal',
  'invalid-time-range': 'diagnostics.unavailableReason.invalidTimeRange',
} as const;

const assertNever = (value: never): never => {
  throw new Error(`Unhandled session diagnosis evidence: ${JSON.stringify(value)}`);
};

const getSessionDisplayName = (detail: SessionDiagnosisDetail): string =>
  detail.summary.threadName?.trim() || detail.summary.sessionId.slice(0, SHORT_SESSION_ID_LENGTH);

const formatRatio = (value: number, locale: 'en' | 'zh-CN'): string =>
  `${formatNumber(Number(value.toFixed(1)), locale)}×`;

const getEvidenceItems = (
  evidence: SessionDiagnosisEvidence,
  locale: 'en' | 'zh-CN',
  t: TFunction<'costOptimization'>,
  compact: boolean
): EvidenceItem[] => {
  switch (evidence.kind) {
    case 'input-growth': {
      const items = [
        {
          label: t('diagnostics.evidence.earlyInput'),
          value: formatNumber(evidence.earlyMedianTokens, locale),
        },
        {
          label: t('diagnostics.evidence.lateInput'),
          value: formatNumber(evidence.lateMedianTokens, locale),
        },
        {
          label: t('diagnostics.evidence.inputGrowthRatio'),
          value: formatRatio(evidence.growthRatio, locale),
        },
        {
          label: t('diagnostics.evidence.absoluteInputGrowth'),
          value: formatNumber(evidence.absoluteGrowthTokens, locale),
        },
      ];

      return compact ? items.slice(0, PRIMARY_EVIDENCE_ITEM_COUNT) : items;
    }
    case 'cache-reuse':
      return compact
        ? [
            {
              label: t('diagnostics.evidence.currentCacheRate'),
              value: formatPercent(evidence.currentPercentage, locale, 1),
            },
            {
              label: t('diagnostics.evidence.targetCacheRate'),
              value: formatPercent(evidence.targetPercentage, locale, 1),
            },
            {
              label: `${t('diagnostics.evidence.firstHalfCacheRate')} → ${t(
                'diagnostics.evidence.secondHalfCacheRate'
              )}`,
              value: `${formatPercent(
                evidence.firstHalfPercentage,
                locale,
                1
              )} → ${formatPercent(evidence.secondHalfPercentage, locale, 1)}`,
            },
          ]
        : [
            {
              label: t('diagnostics.evidence.currentCacheRate'),
              value: formatPercent(evidence.currentPercentage, locale, 1),
            },
            {
              label: t('diagnostics.evidence.firstHalfCacheRate'),
              value: formatPercent(evidence.firstHalfPercentage, locale, 1),
            },
            {
              label: t('diagnostics.evidence.secondHalfCacheRate'),
              value: formatPercent(evidence.secondHalfPercentage, locale, 1),
            },
            {
              label: t('diagnostics.evidence.targetCacheRate'),
              value: formatPercent(evidence.targetPercentage, locale, 1),
            },
          ];
    case 'generation-share':
      return [
        {
          label: t('diagnostics.evidence.outputShare'),
          value: formatPercent(evidence.outputPercentage, locale, 1),
        },
        {
          label: t('diagnostics.evidence.reasoningShare'),
          value: formatPercent(evidence.reasoningPercentage, locale, 1),
        },
        {
          label: t('diagnostics.evidence.generationSubtype'),
          value: t(`diagnostics.evidence.generationSubtypeValue.${evidence.subtype}`),
        },
      ];
    case 'model-cost': {
      const modelValue =
        evidence.switchedFromModelId && evidence.switchedToModelId
          ? t('diagnostics.evidence.modelSwitch', {
              from: evidence.switchedFromModelId,
              to: evidence.switchedToModelId,
            })
          : evidence.modelId;
      const items: EvidenceItem[] = [
        {
          label: t('diagnostics.evidence.dominantModel'),
          value: modelValue,
        },
        {
          label: t('diagnostics.evidence.costShare'),
          value: formatPercent(evidence.costShare * PERCENT_BASE, locale, 1),
        },
        {
          label: t('diagnostics.evidence.unitCostRatio'),
          value: formatRatio(evidence.unitCostRatio, locale),
        },
      ];

      if (!compact && evidence.switchedCostShare !== undefined) {
        items.push({
          label: t('diagnostics.evidence.switchedCostShare'),
          value: formatPercent(evidence.switchedCostShare * PERCENT_BASE, locale, 1),
        });
      }

      return items;
    }
    case 'interaction-accumulation':
      return [
        {
          label: t('diagnostics.evidence.eventCount'),
          value: formatNumber(evidence.eventCount, locale),
        },
        {
          label: t('diagnostics.evidence.duration'),
          value:
            evidence.durationMs === undefined
              ? t('diagnostics.detectorState.insufficientData')
              : t('diagnostics.evidence.durationMinutes', {
                  value: formatNumber(evidence.durationMs / MILLISECONDS_PER_MINUTE, locale),
                }),
        },
        {
          label: t('diagnostics.evidence.maxSliceShare'),
          value: formatPercent(evidence.maxSliceShare * PERCENT_BASE, locale, 1),
        },
      ];
    default:
      return assertNever(evidence);
  }
};

const EvidenceGrid: React.FC<{ items: EvidenceItem[] }> = ({ items }) => (
  <dl className="definition-list evidence-card-grid session-diagnosis-detail-evidence-grid">
    {items.map(({ label, value }) => (
      <div key={label}>
        <dt>{label}</dt>
        <dd>{value}</dd>
      </div>
    ))}
  </dl>
);

const FindingHeading: React.FC<{
  finding: SessionDiagnosisFinding;
  t: TFunction<'costOptimization'>;
}> = ({ finding, t }) => {
  const SeverityIcon = finding.severity === 'critical' ? CircleAlert : AlertTriangle;

  return (
    <div className="session-diagnosis-detail-finding-heading">
      <SeverityIcon size={ICON_SIZE_SMALL} aria-hidden="true" />
      <strong>{t(CAUSE_KEYS[finding.cause])}</strong>
      <span className={`status-label severity-${finding.severity}`}>
        {t(`diagnostics.severity.${finding.severity}`)}
      </span>
      <span className={`status-label confidence-${finding.confidence}`}>
        {t(`diagnostics.confidence.${finding.confidence}`)}
      </span>
    </div>
  );
};

const getUnavailableCopy = (
  result: SessionDiagnosisUnavailable,
  t: TFunction<'costOptimization'>
): string => t(UNAVAILABLE_REASON_KEYS[result.reason]);

const DetectorCard: React.FC<{
  result: SessionDetectorResult;
  locale: 'en' | 'zh-CN';
  t: TFunction<'costOptimization'>;
}> = ({ result, locale, t }) => (
  <article className={`session-diagnosis-detail-detector ${result.state}`}>
    <header>
      <strong>{t(CAUSE_KEYS[result.cause])}</strong>
      <span>{t(DETECTOR_STATE_KEYS[result.state])}</span>
    </header>
    {result.state === 'finding' ? (
      <>
        <FindingHeading finding={result} t={t} />
        <EvidenceGrid items={getEvidenceItems(result.evidence, locale, t, false)} />
        {result.baseline ? (
          <dl className="session-diagnosis-detail-baseline">
            <div>
              <dt>{t('diagnostics.evidence.baselineSamples')}</dt>
              <dd>{formatNumber(result.baseline.sampleCount, locale)}</dd>
            </div>
            <div>
              <dt>{t('diagnostics.evidence.baselineScope')}</dt>
              <dd>{t(BASELINE_SCOPE_KEYS[result.baseline.scope])}</dd>
            </div>
          </dl>
        ) : null}
        {result.cause === 'model-cost-dominance' ? (
          <p className="session-diagnosis-detail-disclaimer">
            {t('diagnostics.detail.modelCostDisclaimer')}
          </p>
        ) : null}
      </>
    ) : (
      <p>{getUnavailableCopy(result, t)}</p>
    )}
  </article>
);

const SessionDiagnosisDetailView: React.FC<SessionDiagnosisDetailProps> = ({ detail, onBack }) => {
  const { t, i18n } = useTranslation('costOptimization');
  const { t: tCommon } = useTranslation('common');
  const locale = resolveRendererLocale(i18n.resolvedLanguage);
  const displayName = getSessionDisplayName(detail);
  const primaryFinding =
    detail.summary.primaryFinding === undefined
      ? undefined
      : detail.detectors.find(
          (result): result is SessionDiagnosisFinding =>
            result.state === 'finding' && result.cause === detail.summary.primaryFinding?.cause
        );
  const otherFindings = detail.detectors.filter(
    (result): result is SessionDiagnosisFinding =>
      result.state === 'finding' && result.cause !== primaryFinding?.cause
  );
  const isFullyPriced = detail.summary.coverage.percentage >= FULL_PRICING_COVERAGE_PERCENTAGE;
  const costLabel = isFullyPriced
    ? t('diagnostics.list.fullEstimatedCost')
    : t('diagnostics.list.pricedCost');

  return (
    <article className="session-diagnosis-detail">
      <header className="session-diagnosis-detail-heading">
        <button type="button" onClick={onBack}>
          <ArrowLeft size={ICON_SIZE_SMALL} aria-hidden="true" />
          {t('diagnostics.detail.back')}
        </button>
        <div>
          <span>{t('diagnostics.detail.title')}</span>
          <h2>{displayName}</h2>
          <p>
            {detail.summary.projectName} ·{' '}
            {formatShortDateTime(detail.summary.startedAt, locale, tCommon('value.unknownDate'))}
          </p>
        </div>
      </header>

      <section aria-labelledby="session-diagnosis-metrics-title">
        <h3 id="session-diagnosis-metrics-title">{t('diagnostics.detail.metrics')}</h3>
        <dl className="session-diagnosis-detail-metrics">
          <div>
            <dt>{t('diagnostics.list.totalTokens')}</dt>
            <dd>{formatNumber(detail.summary.totalTokens, locale)}</dd>
          </div>
          <div>
            <dt>{costLabel}</dt>
            <dd>{formatUsd(detail.summary.pricedCostUsd, locale)}</dd>
          </div>
          <div>
            <dt>{t('diagnostics.list.pricingCoverage')}</dt>
            <dd>
              {formatPercent(detail.summary.coverage.percentage, locale, 1)}
              {detail.summary.coverage.unpricedModelIds.length > 0 ? (
                <small>{detail.summary.coverage.unpricedModelIds.join(', ')}</small>
              ) : null}
            </dd>
          </div>
          <div>
            <dt>{t('diagnostics.list.relativeBaseline')}</dt>
            <dd>
              {primaryFinding?.baseline ? (
                <>
                  {t(getSessionDiagnosisBaselineDeviationKey(primaryFinding.cause), {
                    score: primaryFinding.baseline.score.toFixed(1),
                  })}
                  <small>
                    {t('diagnostics.baseline.scopeSamples', {
                      scope: t(BASELINE_SCOPE_KEYS[primaryFinding.baseline.scope]),
                      count: primaryFinding.baseline.sampleCount,
                    })}
                  </small>
                </>
              ) : (
                t('diagnostics.baseline.unavailable')
              )}
            </dd>
          </div>
          <div>
            <dt>{t('diagnostics.detail.eventCount')}</dt>
            <dd>{formatNumber(detail.summary.eventCount, locale)}</dd>
          </div>
        </dl>
      </section>

      <section className="session-diagnosis-detail-primary">
        <h3>{t('diagnostics.detail.primaryCause')}</h3>
        {primaryFinding ? (
          <>
            <FindingHeading finding={primaryFinding} t={t} />
            <EvidenceGrid items={getEvidenceItems(primaryFinding.evidence, locale, t, true)} />
          </>
        ) : (
          <p>{t('diagnostics.state.unresolved')}</p>
        )}
      </section>

      <SessionDiagnosisTimeline
        points={detail.timeline}
        invalidPointCount={detail.invalidTimelinePointCount}
      />

      <section className="session-diagnosis-detail-other">
        <h3>{t('diagnostics.detail.otherFindings')}</h3>
        {otherFindings.length > 0 ? (
          <div className="session-diagnosis-detail-other-list">
            {otherFindings.map((finding) => (
              <article key={finding.cause}>
                <FindingHeading finding={finding} t={t} />
                <EvidenceGrid items={getEvidenceItems(finding.evidence, locale, t, true)} />
              </article>
            ))}
          </div>
        ) : (
          <p>{t('diagnostics.additionalFindings', { count: 0 })}</p>
        )}
      </section>

      <section className="session-diagnosis-detail-detectors">
        <h3>{t('diagnostics.detail.detectorResults')}</h3>
        <div>
          {detail.detectors.map((result) => (
            <DetectorCard key={result.cause} result={result} locale={locale} t={t} />
          ))}
        </div>
      </section>
    </article>
  );
};

export default SessionDiagnosisDetailView;
