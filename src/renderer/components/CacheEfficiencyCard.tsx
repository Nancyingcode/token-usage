/**
 * @file Cache efficiency detail card
 * @description Displays cache composition and keyboard-accessible daily cache-rate details.
 */

import React, { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SupportedLocale } from '../../shared/i18n/locale';
import { resolveRendererLocale } from '../i18n';
import type { CacheEfficiency, CacheEfficiencyDay } from '../utils/cacheEfficiency';
import { formatNumber, formatPercent } from '../utils/formatters';

interface CacheEfficiencyCardProps {
  efficiency: CacheEfficiency;
}

interface TrendPoint {
  day: CacheEfficiencyDay;
  x: number;
  y: number;
}

const PERCENT_SCALE = 100;
const CACHE_TREND_VIEWBOX_WIDTH = 640;
const CACHE_TREND_VIEWBOX_HEIGHT = 210;
const CACHE_TREND_VIEWBOX = `0 0 ${CACHE_TREND_VIEWBOX_WIDTH} ${CACHE_TREND_VIEWBOX_HEIGHT}`;
const CACHE_TREND_LEFT = 44;
const CACHE_TREND_RIGHT = 620;
const CACHE_TREND_TOP = 18;
const CACHE_TREND_BOTTOM = 168;
const CACHE_TREND_HEIGHT = CACHE_TREND_BOTTOM - CACHE_TREND_TOP;
const CACHE_TREND_GRID_LABEL_OFFSET = 4;
const CACHE_TREND_MIDDLE_PERCENTAGE = 50;
const CACHE_TREND_GRID_PERCENTAGES = [PERCENT_SCALE, CACHE_TREND_MIDDLE_PERCENTAGE, 0];
const DATE_PART_COUNT = 3;

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

const getTrendX = (index: number, dayCount: number): number => {
  if (dayCount <= 1) {
    return (CACHE_TREND_LEFT + CACHE_TREND_RIGHT) / 2;
  }

  return CACHE_TREND_LEFT + (index / (dayCount - 1)) * (CACHE_TREND_RIGHT - CACHE_TREND_LEFT);
};

const getTrendY = (percentage: number): number =>
  CACHE_TREND_BOTTOM - (percentage / PERCENT_SCALE) * CACHE_TREND_HEIGHT;

const buildTrendSegments = (points: TrendPoint[]): TrendPoint[][] => {
  const segments: TrendPoint[][] = [];

  points.forEach((point, index) => {
    if (point.day.percentage === null) {
      return;
    }

    const currentSegment = segments.at(-1);
    const previousPoint = points[index - 1];

    if (!currentSegment || previousPoint?.day.percentage === null) {
      segments.push([point]);
      return;
    }

    currentSegment.push(point);
  });

  return segments;
};

const buildSegmentPath = (segment: TrendPoint[]): string =>
  segment.map(({ x, y }, index) => `${index === 0 ? 'M' : 'L'}${x},${y}`).join(' ');

const CacheEfficiencyCard: React.FC<CacheEfficiencyCardProps> = ({ efficiency }) => {
  const { t, i18n } = useTranslation('analytics');
  const locale = resolveRendererLocale(i18n.resolvedLanguage);
  const chartDescriptionId = useId();
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const cachedPercentage = efficiency.percentage ?? 0;
  const uncachedPercentage = efficiency.percentage === null ? 0 : PERCENT_SCALE - cachedPercentage;
  const activeDay = efficiency.days.find(({ date }) => date === activeDate) ?? null;
  const hasTrend = efficiency.inputTokens > 0 && efficiency.days.length > 0;
  const points = efficiency.days.map((day, index) => ({
    day,
    x: getTrendX(index, efficiency.days.length),
    y: getTrendY(day.percentage ?? 0),
  }));
  const segments = buildTrendSegments(points);
  const firstDay = efficiency.days[0];
  const lastDay = efficiency.days.at(-1);
  const showLastDayLabel = lastDay !== undefined && lastDay.date !== firstDay?.date;

  const formatRate = (percentage: number | null): string =>
    percentage === null ? '—' : formatPercent(percentage, locale);
  const getDayLabel = (day: CacheEfficiencyDay): string =>
    t(
      day.percentage === null
        ? 'performance.cacheDayUnavailableLabel'
        : 'performance.cacheDayLabel',
      {
        date: formatDateKey(day.date, locale),
        rate: formatRate(day.percentage),
        cached: formatNumber(day.cachedInputTokens, locale),
        uncached: formatNumber(day.uncachedInputTokens, locale),
        total: formatNumber(day.inputTokens, locale),
      }
    );

  return (
    <article className="panel perf-card cache-efficiency-card">
      <div className="cache-efficiency-summary" data-testid="cache-summary">
        <div className="cache-efficiency-heading">
          <h3>{t('performance.cacheHitRate')}</h3>
          <strong className="cache-efficiency-rate" data-testid="cache-rate">
            {formatRate(efficiency.percentage)}
          </strong>
          <p>{t('performance.cacheDefinition')}</p>
        </div>

        <dl className="cache-efficiency-stats">
          <div>
            <dt>{t('performance.cachedInput')}</dt>
            <dd>{formatNumber(efficiency.cachedInputTokens, locale)}</dd>
          </div>
          <div>
            <dt>{t('performance.uncachedInput')}</dt>
            <dd>{formatNumber(efficiency.uncachedInputTokens, locale)}</dd>
          </div>
          <div>
            <dt>{t('performance.totalInput')}</dt>
            <dd>{formatNumber(efficiency.inputTokens, locale)}</dd>
          </div>
        </dl>
      </div>

      {efficiency.hasInconsistentData ? (
        <div className="cache-efficiency-warning" role="status">
          <strong>{t('performance.cacheInconsistentTitle')}</strong>
          <span>{t('performance.cacheInconsistentDescription')}</span>
        </div>
      ) : null}

      <div
        className="cache-composition"
        role="img"
        aria-label={t('performance.cacheCompositionLabel', {
          cached: formatNumber(efficiency.cachedInputTokens, locale),
          cachedRate: formatRate(efficiency.percentage),
          uncached: formatNumber(efficiency.uncachedInputTokens, locale),
          uncachedRate: formatRate(efficiency.percentage === null ? null : uncachedPercentage),
        })}
      >
        <div className="cache-composition-track" aria-hidden="true">
          <span
            className="cache-composition-cached"
            data-testid="cache-composition-cached"
            style={{ width: `${cachedPercentage}%` }}
          />
          <span
            className="cache-composition-uncached"
            style={{ width: `${uncachedPercentage}%` }}
          />
        </div>
        <ul className="cache-composition-legend" aria-label={t('performance.cacheLegendLabel')}>
          <li className="cached">
            <span>{t('performance.cachedInput')}</span>
            <strong>
              {formatNumber(efficiency.cachedInputTokens, locale)} ·{' '}
              {formatRate(efficiency.percentage)}
            </strong>
          </li>
          <li className="uncached">
            <span>{t('performance.uncachedInput')}</span>
            <strong>
              {formatNumber(efficiency.uncachedInputTokens, locale)} ·{' '}
              {formatRate(efficiency.percentage === null ? null : uncachedPercentage)}
            </strong>
          </li>
        </ul>
      </div>

      <figure className="cache-trend" aria-labelledby={chartDescriptionId}>
        <figcaption id={chartDescriptionId}>
          <strong>{t('performance.cacheDailyTrend')}</strong>
          <span>{t('performance.cacheTrendDescription')}</span>
        </figcaption>

        {hasTrend ? (
          <div className="cache-trend-scroll">
            <div className="cache-trend-plot">
              <svg viewBox={CACHE_TREND_VIEWBOX} role="group">
                {CACHE_TREND_GRID_PERCENTAGES.map((percentage) => {
                  const y = getTrendY(percentage);

                  return (
                    <g key={percentage} className="cache-trend-grid">
                      <line x1={CACHE_TREND_LEFT} x2={CACHE_TREND_RIGHT} y1={y} y2={y} />
                      <text x={0} y={y + CACHE_TREND_GRID_LABEL_OFFSET}>
                        {formatPercent(percentage, locale)}
                      </text>
                    </g>
                  );
                })}

                {segments.map((segment) => (
                  <path
                    key={segment[0]?.day.date}
                    className="cache-trend-line"
                    d={buildSegmentPath(segment)}
                  />
                ))}

                {points.map(({ day, x, y }) => {
                  const unavailable = day.percentage === null;

                  return (
                    <g key={day.date}>
                      <circle
                        className={`cache-trend-point${unavailable ? ' unavailable' : ''}`}
                        cx={x}
                        cy={y}
                        r={5}
                        aria-hidden="true"
                      />
                      <circle
                        className="cache-trend-target"
                        cx={x}
                        cy={y}
                        r={13}
                        role="img"
                        tabIndex={0}
                        aria-label={getDayLabel(day)}
                        data-cache-percentage={day.percentage ?? 'unavailable'}
                        data-testid={`cache-day-${day.date}`}
                        onMouseEnter={() => setActiveDate(day.date)}
                        onMouseLeave={() => setActiveDate(null)}
                        onFocus={() => setActiveDate(day.date)}
                        onBlur={() => setActiveDate(null)}
                      />
                    </g>
                  );
                })}
              </svg>

              <div className="cache-trend-axis" aria-hidden="true">
                {firstDay ? <span>{formatDateKey(firstDay.date, locale)}</span> : null}
                {showLastDayLabel ? <span>{formatDateKey(lastDay.date, locale)}</span> : null}
              </div>

              {activeDay ? (
                <div className="cache-trend-tooltip" role="tooltip">
                  <strong>{formatDateKey(activeDay.date, locale)}</strong>
                  <span>{formatRate(activeDay.percentage)}</span>
                  <dl>
                    <div>
                      <dt>{t('performance.cachedInput')}</dt>
                      <dd>{formatNumber(activeDay.cachedInputTokens, locale)}</dd>
                    </div>
                    <div>
                      <dt>{t('performance.uncachedInput')}</dt>
                      <dd>{formatNumber(activeDay.uncachedInputTokens, locale)}</dd>
                    </div>
                    <div>
                      <dt>{t('performance.totalInput')}</dt>
                      <dd>{formatNumber(activeDay.inputTokens, locale)}</dd>
                    </div>
                  </dl>
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="cache-trend-empty">{t('performance.cacheNoInput')}</p>
        )}
      </figure>
    </article>
  );
};

export default CacheEfficiencyCard;
