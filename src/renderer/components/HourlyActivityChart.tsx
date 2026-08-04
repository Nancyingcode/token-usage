/**
 * @file Hourly activity chart
 * @description Displays a keyboard-accessible 24-hour token distribution and exact local-hour details.
 */

import React, { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { HourlyActivity, HourlyActivityBucket } from '../utils/hourlyActivity';
import { resolveRendererLocale } from '../i18n';
import { formatCompactNumber, formatNumber, formatPercent } from '../utils/formatters';

interface HourlyActivityChartProps {
  activity: HourlyActivity;
}

const HOURS_PER_DAY = 24;
const HOUR_LABEL_INTERVAL = 6;
const HOUR_CENTER_OFFSET = 0.5;
const MINIMUM_VISIBLE_BAR_PERCENT = 2;
const PERCENT_SCALE = 100;
const AXIS_HOURS = Array.from(
  { length: HOURS_PER_DAY / HOUR_LABEL_INTERVAL + 1 },
  (_, index) => index * HOUR_LABEL_INTERVAL
);

const formatHour = (hour: number): string => `${String(hour).padStart(2, '0')}:00`;

const formatHourRange = (hour: number): string => `${formatHour(hour)}–${formatHour(hour + 1)}`;

const HourlyActivityChart: React.FC<HourlyActivityChartProps> = ({ activity }) => {
  const { t, i18n } = useTranslation('analytics');
  const locale = resolveRendererLocale(i18n.resolvedLanguage);
  const descriptionId = useId();
  const [activeHour, setActiveHour] = useState<number | null>(null);
  const maxTokens = Math.max(0, ...activity.hours.map(({ totalTokens }) => totalTokens));
  const activeBucket = activeHour === null ? null : (activity.hours[activeHour] ?? null);
  const unallocatedMessage =
    activity.unallocatedTokens > 0
      ? t('performance.unallocatedActivity', {
          tokens: formatNumber(activity.unallocatedTokens, locale),
        })
      : null;
  const emptyMessage = unallocatedMessage ?? t('performance.noActivity');
  const showUnallocatedWarning = activity.peakHour !== null && unallocatedMessage !== null;

  const formatSessions = (count: number): string =>
    t('performance.sessionCount', { count, formattedCount: formatNumber(count, locale) });
  const formatActiveDays = (count: number): string =>
    t('performance.activeDayCount', { count, formattedCount: formatNumber(count, locale) });
  const getAccessibleLabel = (bucket: HourlyActivityBucket, isPeak: boolean): string =>
    t('performance.hourLabel', {
      range: formatHourRange(bucket.hour),
      tokens: formatNumber(bucket.totalTokens, locale),
      share: formatPercent(bucket.shareOfTotal, locale),
      sessions: formatSessions(bucket.sessionCount),
      days: formatActiveDays(bucket.activeDayCount),
      peak: isPeak ? t('performance.peakSuffix') : '',
    });

  return (
    <figure className="hourly-activity" aria-labelledby={descriptionId}>
      <figcaption id={descriptionId} className="hourly-activity-caption">
        {t('performance.chartDescription')}
      </figcaption>

      {activity.peakHour ? (
        <div className="hourly-activity-summary">
          <div className="hourly-activity-peak">
            <span>{t('performance.peakLabel')}</span>
            <strong>{formatHourRange(activity.peakHour.hour)}</strong>
          </div>
          <div className="hourly-activity-summary-stats">
            <span>
              {t('performance.tokenCount', {
                tokens: formatNumber(activity.peakHour.totalTokens, locale),
              })}
            </span>
            <span>{formatPercent(activity.peakHour.shareOfTotal, locale)}</span>
            <span>{formatSessions(activity.peakHour.sessionCount)}</span>
            <span>{formatActiveDays(activity.peakHour.activeDayCount)}</span>
          </div>
        </div>
      ) : (
        <p className="hourly-activity-empty">{emptyMessage}</p>
      )}

      {showUnallocatedWarning ? (
        <p className="hourly-activity-warning">{unallocatedMessage}</p>
      ) : null}

      <div className="hourly-activity-scroll">
        <div className="hourly-activity-plot">
          <div
            className="hourly-activity-bars"
            role="list"
            aria-label={t('performance.chartLabel')}
          >
            {activity.hours.map((bucket) => {
              const isPeak = activity.peakHour?.hour === bucket.hour;
              const height =
                bucket.totalTokens > 0 && maxTokens > 0
                  ? Math.max(
                      MINIMUM_VISIBLE_BAR_PERCENT,
                      (bucket.totalTokens / maxTokens) * PERCENT_SCALE
                    )
                  : 0;

              return (
                <span
                  key={bucket.hour}
                  className={`hourly-activity-column${isPeak ? ' is-peak' : ''}`}
                  role="listitem"
                >
                  {isPeak ? (
                    <span className="hourly-activity-peak-marker">
                      {t('performance.peakLabel')}
                    </span>
                  ) : null}
                  <span
                    className="hourly-activity-bar-target"
                    role="img"
                    tabIndex={0}
                    aria-label={getAccessibleLabel(bucket, isPeak)}
                    data-hour-bar="true"
                    data-testid={`hour-bar-${bucket.hour}`}
                    onMouseEnter={() => setActiveHour(bucket.hour)}
                    onMouseLeave={() => setActiveHour(null)}
                    onFocus={() => setActiveHour(bucket.hour)}
                    onBlur={() => setActiveHour(null)}
                  >
                    <span className="hourly-activity-bar" style={{ height: `${height}%` }} />
                  </span>
                </span>
              );
            })}
          </div>

          <div className="hourly-activity-axis" aria-hidden="true">
            {AXIS_HOURS.map((hour) => (
              <span key={hour} style={{ left: `${(hour / HOURS_PER_DAY) * PERCENT_SCALE}%` }}>
                {formatHour(hour)}
              </span>
            ))}
          </div>

          {activeBucket ? (
            <div
              className={`hourly-activity-tooltip${
                activeBucket.hour < HOUR_LABEL_INTERVAL
                  ? ' align-start'
                  : activeBucket.hour >= HOURS_PER_DAY - HOUR_LABEL_INTERVAL
                    ? ' align-end'
                    : ''
              }`}
              role="tooltip"
              style={{
                left: `${
                  ((activeBucket.hour + HOUR_CENTER_OFFSET) / HOURS_PER_DAY) * PERCENT_SCALE
                }%`,
              }}
            >
              <strong>{formatHourRange(activeBucket.hour)}</strong>
              <span>
                {t('performance.tokenCount', {
                  tokens: formatCompactNumber(activeBucket.totalTokens, locale),
                })}
              </span>
              <span>{formatPercent(activeBucket.shareOfTotal, locale)}</span>
              <span>{formatSessions(activeBucket.sessionCount)}</span>
              <span>{formatActiveDays(activeBucket.activeDayCount)}</span>
            </div>
          ) : null}
        </div>
      </div>

      <p className="hourly-activity-timezone">{t('performance.localTime')}</p>
    </figure>
  );
};

export default HourlyActivityChart;
