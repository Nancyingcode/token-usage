/**
 * @file 回合错误率详情卡片
 * @description 展示回合终态汇总、每日错误趋势、错误分类和最近失败信息。
 */
import React, { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SupportedLocale } from '../../shared/i18n/locale';
import { resolveRendererLocale } from '../i18n';
import type { ErrorCategory, ErrorRateDay, ErrorRateDetail } from '../utils/errorRateDetail';
import { formatNumber, formatPercent, formatShortDateTime } from '../utils/formatters';

interface ErrorRateCardProps {
  detail: ErrorRateDetail;
}

const PERCENT_SCALE = 100;
const MINIMUM_VISIBLE_BAR_PERCENTAGE = 3;
const DATE_PART_COUNT = 3;
const COLUMN_CENTER_OFFSET = 0.5;
const EDGE_ALIGNMENT_MINIMUM_DAY_COUNT = 2;

const formatDateKey = (value: string, locale: SupportedLocale): string => {
  const dateParts = value.split('-').map(Number);

  if (dateParts.length !== DATE_PART_COUNT || dateParts.some((part) => !Number.isInteger(part))) {
    return value;
  }

  const [year, month, day] = dateParts;
  const date = new Date(year, month - 1, day);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(date);
};

const ErrorRateCard: React.FC<ErrorRateCardProps> = ({ detail }) => {
  const { t, i18n } = useTranslation('analytics');
  const locale = resolveRendererLocale(i18n.resolvedLanguage);
  const trendDescriptionId = useId();
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const activeDay = detail.days.find(({ date }) => date === activeDate) ?? null;
  const activeDayIndex = activeDay
    ? detail.days.findIndex(({ date }) => date === activeDay.date)
    : -1;
  const activeTooltipX =
    activeDayIndex >= 0
      ? ((activeDayIndex + COLUMN_CENTER_OFFSET) / detail.days.length) * PERCENT_SCALE
      : null;
  const activeTooltip =
    activeDay && activeTooltipX !== null ? { day: activeDay, left: activeTooltipX } : null;
  let tooltipAlignmentClass = '';

  if (detail.days.length >= EDGE_ALIGNMENT_MINIMUM_DAY_COUNT) {
    if (activeDayIndex === 0) {
      tooltipAlignmentClass = ' align-start';
    } else if (activeDayIndex === detail.days.length - 1) {
      tooltipAlignmentClass = ' align-end';
    }
  }
  const hasAnyOutcome = detail.completedCount + detail.failedCount + detail.interruptedCount > 0;
  const hasErrors = detail.failedCount > 0;
  const firstDay = detail.days[0];
  const lastDay = detail.days.at(-1);
  const showLastDayLabel = lastDay !== undefined && lastDay.date !== firstDay?.date;
  const categoryLabels: Record<ErrorCategory, string> = {
    'context-limit': t('performance.errorCategory.contextLimit'),
    'usage-limit': t('performance.errorCategory.usageLimit'),
    authentication: t('performance.errorCategory.authentication'),
    network: t('performance.errorCategory.network'),
    service: t('performance.errorCategory.service'),
    sandbox: t('performance.errorCategory.sandbox'),
    'request-policy': t('performance.errorCategory.requestPolicy'),
    other: t('performance.errorCategory.other'),
  };
  const formatRate = (value: number | null): string =>
    value === null ? '—' : formatPercent(value, locale);
  const formatOutcomeCount = (
    kind: 'completed' | 'failed' | 'interrupted',
    count: number
  ): string =>
    t(`performance.${kind}TurnCount`, {
      count,
      formattedCount: formatNumber(count, locale),
    });
  const getDayLabel = (day: ErrorRateDay): string =>
    t(
      day.errorRate === null ? 'performance.errorDayUnavailableLabel' : 'performance.errorDayLabel',
      {
        date: formatDateKey(day.date, locale),
        rate: formatRate(day.errorRate),
        completed: formatOutcomeCount('completed', day.completedCount),
        failed: formatOutcomeCount('failed', day.failedCount),
        interrupted: formatOutcomeCount('interrupted', day.interruptedCount),
      }
    );

  return (
    <article className="panel perf-card error-rate-card">
      <div className="error-rate-summary" data-testid="error-rate-summary">
        <div className="error-rate-heading">
          <h3>{t('performance.errorRate')}</h3>
          <strong className="error-rate-value" data-testid="error-rate-value">
            {formatRate(detail.errorRate)}
          </strong>
          <p>{t('performance.errorRateDefinition')}</p>
        </div>

        <dl className="error-rate-stats">
          <div>
            <dt>{t('performance.completedTurns')}</dt>
            <dd>{formatNumber(detail.completedCount, locale)}</dd>
          </div>
          <div>
            <dt>{t('performance.failedTurns')}</dt>
            <dd>{formatNumber(detail.failedCount, locale)}</dd>
          </div>
          <div>
            <dt>{t('performance.interruptedTurns')}</dt>
            <dd>{formatNumber(detail.interruptedCount, locale)}</dd>
          </div>
          <div title={t('performance.terminalCoverageDescription')}>
            <dt>{t('performance.terminalCoverage')}</dt>
            <dd>
              {formatNumber(detail.coveredSessionCount, locale)} /{' '}
              {formatNumber(detail.totalSessionCount, locale)}
            </dd>
          </div>
        </dl>
      </div>

      {hasAnyOutcome ? (
        <>
          <figure className="error-trend" aria-labelledby={trendDescriptionId}>
            <figcaption id={trendDescriptionId} className="error-section-heading">
              <strong>{t('performance.dailyErrorTrend')}</strong>
              <span>{t('performance.errorTrendDescription')}</span>
            </figcaption>

            <div className="error-trend-scroll">
              <div className="error-trend-plot">
                <div className="error-trend-bars" role="list">
                  {detail.days.map((day) => {
                    const height =
                      day.errorRate === null
                        ? 0
                        : day.errorRate > 0
                          ? Math.max(MINIMUM_VISIBLE_BAR_PERCENTAGE, day.errorRate)
                          : 0;

                    return (
                      <span className="error-trend-column" role="listitem" key={day.date}>
                        <span
                          className={`error-trend-target${day.errorRate === null ? ' unavailable' : ''}`}
                          role="img"
                          tabIndex={0}
                          aria-label={getDayLabel(day)}
                          data-error-rate={day.errorRate ?? 'unavailable'}
                          data-testid={`error-day-${day.date}`}
                          onMouseEnter={() => setActiveDate(day.date)}
                          onMouseLeave={() => setActiveDate(null)}
                          onFocus={() => setActiveDate(day.date)}
                          onBlur={() => setActiveDate(null)}
                        >
                          <span
                            className="error-trend-bar"
                            style={{ height: `${Math.min(PERCENT_SCALE, height)}%` }}
                          />
                        </span>
                      </span>
                    );
                  })}
                </div>

                <div className="error-trend-axis" aria-hidden="true">
                  {firstDay ? <span>{formatDateKey(firstDay.date, locale)}</span> : null}
                  {showLastDayLabel ? <span>{formatDateKey(lastDay.date, locale)}</span> : null}
                </div>

                {activeTooltip ? (
                  <div
                    className={`error-trend-tooltip${tooltipAlignmentClass}`}
                    role="tooltip"
                    data-anchor-date={activeTooltip.day.date}
                    style={{ left: `${activeTooltip.left}%` }}
                  >
                    <strong>{formatDateKey(activeTooltip.day.date, locale)}</strong>
                    <span>{formatRate(activeTooltip.day.errorRate)}</span>
                    <dl>
                      <div>
                        <dt>{t('performance.completedTurns')}</dt>
                        <dd>{formatNumber(activeTooltip.day.completedCount, locale)}</dd>
                      </div>
                      <div>
                        <dt>{t('performance.failedTurns')}</dt>
                        <dd>{formatNumber(activeTooltip.day.failedCount, locale)}</dd>
                      </div>
                      <div>
                        <dt>{t('performance.interruptedTurns')}</dt>
                        <dd>{formatNumber(activeTooltip.day.interruptedCount, locale)}</dd>
                      </div>
                    </dl>
                  </div>
                ) : null}
              </div>
            </div>
          </figure>

          {hasErrors ? (
            <div className="error-detail-grid">
              <section className="error-category-section" aria-label={t('performance.errorTypes')}>
                <div className="error-section-heading">
                  <strong>{t('performance.errorTypes')}</strong>
                  <span>{t('performance.errorTypeDescription')}</span>
                </div>
                <ul className="error-category-list">
                  {detail.categories.map((category) => (
                    <li key={category.category}>
                      <span>{categoryLabels[category.category]}</span>
                      <strong>
                        {formatNumber(category.count, locale)} ·{' '}
                        {formatPercent(category.percentage, locale)}
                      </strong>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="recent-error-section" aria-label={t('performance.recentErrors')}>
                <div className="error-section-heading">
                  <strong>{t('performance.recentErrors')}</strong>
                  <span>{t('performance.recentErrorsDescription')}</span>
                </div>
                <ol className="recent-error-list">
                  {detail.recentErrors.map((error) => (
                    <li key={`${error.sessionId}:${error.occurredAt}:${error.rawCode ?? 'other'}`}>
                      <div className="recent-error-meta">
                        <time dateTime={error.occurredAt}>
                          {formatShortDateTime(
                            error.occurredAt,
                            locale,
                            t('performance.unknownDate')
                          )}
                        </time>
                        <span>{error.sessionLabel}</span>
                        <span>{categoryLabels[error.category]}</span>
                      </div>
                      {error.rawCode ? <code>{error.rawCode}</code> : null}
                      <p>{error.message || t('performance.unknownTurnError')}</p>
                    </li>
                  ))}
                </ol>
              </section>
            </div>
          ) : (
            <p className="error-rate-empty">{t('performance.noTurnErrors')}</p>
          )}
        </>
      ) : (
        <div className="error-rate-empty-state">
          <strong>{t('performance.noAssessableTurns')}</strong>
          <p>{t('performance.noAssessableTurnsDescription')}</p>
        </div>
      )}
    </article>
  );
};

export default ErrorRateCard;
