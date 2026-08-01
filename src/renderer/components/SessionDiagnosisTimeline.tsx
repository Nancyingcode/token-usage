/**
 * @file 会话诊断证据时间线
 * @description 在共享时间轴上分轨展示输入、输出、推理、缓存率和模型切换证据。
 */

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { SessionDiagnosisTimelinePoint } from '../../shared/costOptimizationTypes';
import { resolveRendererLocale } from '../i18n';
import { formatNumber, formatPercent, formatShortDateTime } from '../utils/formatters';

interface SessionDiagnosisTimelineProps {
  points: SessionDiagnosisTimelinePoint[];
  invalidPointCount: number;
}

const CHART_WIDTH = 720;
const CHART_HEIGHT = 260;
const CHART_PADDING_X = 34;
const CHART_PADDING_Y = 24;
const CHART_INNER_WIDTH = CHART_WIDTH - CHART_PADDING_X * 2;
const CHART_INNER_HEIGHT = CHART_HEIGHT - CHART_PADDING_Y * 2;
const TOKEN_LANE_SHARE = 0.72;
const POINT_RADIUS = 4;
const PERCENT_BASE = 100;
const TOOLTIP_OFFSET = 10;
const LANE_LABEL_OFFSET = 12;
const MODEL_SWITCH_LABEL_OFFSET = 4;

type TokenSeries = 'input' | 'output' | 'reasoning';

export interface SessionDiagnosisTimelineGeometry {
  points: Array<{
    point: SessionDiagnosisTimelinePoint;
    x: number;
    inputY: number;
    outputY: number;
    reasoningY: number;
    cacheY: number;
  }>;
  tokenLaneHeight: number;
  cacheLaneHeight: number;
}

type TimelineGeometryPoint = SessionDiagnosisTimelineGeometry['points'][number];

const getFiniteTimestamp = (value: string): number => {
  const timestamp = new Date(value).getTime();

  return Number.isFinite(timestamp) ? timestamp : 0;
};

export const buildSessionDiagnosisTimelineGeometry = (
  points: SessionDiagnosisTimelinePoint[],
  width: number,
  height: number
): SessionDiagnosisTimelineGeometry => {
  const safeWidth = Math.max(width, 1);
  const safeHeight = Math.max(height, 1);
  const tokenLaneHeight = safeHeight * TOKEN_LANE_SHARE;
  const cacheLaneHeight = safeHeight - tokenLaneHeight;
  const timestamps = points.map(({ occurredAt }) => getFiniteTimestamp(occurredAt));
  const minTime = timestamps.length > 0 ? Math.min(...timestamps) : 0;
  const maxTime = timestamps.length > 0 ? Math.max(...timestamps) : minTime;
  const timeSpan = Math.max(maxTime - minTime, 1);
  const maxTokens = Math.max(
    1,
    ...points.flatMap(({ inputTokens, outputTokens, reasoningOutputTokens }) => [
      inputTokens,
      outputTokens,
      reasoningOutputTokens,
    ])
  );
  const toTokenY = (tokens: number): number =>
    tokenLaneHeight - (Math.max(tokens, 0) / maxTokens) * tokenLaneHeight;

  return {
    points: points.map((point, index) => {
      const inputTokens = Math.max(point.inputTokens, 0);
      const boundedCached = Math.min(Math.max(point.cachedInputTokens, 0), inputTokens);
      const cacheRate = inputTokens > 0 ? boundedCached / inputTokens : 0;

      return {
        point,
        x: ((timestamps[index] - minTime) / timeSpan) * safeWidth,
        inputY: toTokenY(point.inputTokens),
        outputY: toTokenY(point.outputTokens),
        reasoningY: toTokenY(point.reasoningOutputTokens),
        cacheY: tokenLaneHeight + (1 - cacheRate) * cacheLaneHeight,
      };
    }),
    tokenLaneHeight,
    cacheLaneHeight,
  };
};

const getSeriesTokens = (series: TokenSeries, point: SessionDiagnosisTimelinePoint): number => {
  switch (series) {
    case 'input':
      return point.inputTokens;
    case 'output':
      return point.outputTokens;
    case 'reasoning':
      return point.reasoningOutputTokens;
  }
};

const getSeriesY = (series: TokenSeries, point: TimelineGeometryPoint): number => {
  switch (series) {
    case 'input':
      return point.inputY;
    case 'output':
      return point.outputY;
    case 'reasoning':
      return point.reasoningY;
  }
};

const getPolylinePoints = (
  points: TimelineGeometryPoint[],
  getY: (point: TimelineGeometryPoint) => number
): string => points.map((point) => `${point.x},${getY(point)}`).join(' ');

const getCacheRate = (point: SessionDiagnosisTimelinePoint): number => {
  const inputTokens = Math.max(point.inputTokens, 0);
  const cachedInputTokens = Math.min(Math.max(point.cachedInputTokens, 0), inputTokens);

  return inputTokens > 0 ? cachedInputTokens / inputTokens : 0;
};

const renderTokenSeries = (
  series: TokenSeries,
  points: TimelineGeometryPoint[],
  getPointLabel: (series: TokenSeries, point: SessionDiagnosisTimelinePoint) => string
): React.ReactNode => (
  <g key={series} className={`session-diagnosis-timeline-series ${series}`} data-series={series}>
    <polyline points={getPolylinePoints(points, (point) => getSeriesY(series, point))} />
    {points.map((geometryPoint) => {
      const label = getPointLabel(series, geometryPoint.point);

      return (
        <g
          className="session-diagnosis-timeline-point"
          key={`${series}:${geometryPoint.point.contributionId}`}
        >
          <circle
            tabIndex={0}
            aria-label={label}
            cx={geometryPoint.x}
            cy={getSeriesY(series, geometryPoint)}
            r={POINT_RADIUS}
          >
            <title>{label}</title>
          </circle>
          <text
            className="session-diagnosis-timeline-tooltip"
            x={geometryPoint.x}
            y={Math.max(getSeriesY(series, geometryPoint) - TOOLTIP_OFFSET, TOOLTIP_OFFSET)}
          >
            {label}
          </text>
        </g>
      );
    })}
  </g>
);

const SessionDiagnosisTimeline: React.FC<SessionDiagnosisTimelineProps> = ({
  points,
  invalidPointCount,
}) => {
  const { t, i18n } = useTranslation('costOptimization');
  const { t: tCommon } = useTranslation('common');
  const locale = resolveRendererLocale(i18n.resolvedLanguage);
  const geometry = useMemo(
    () => buildSessionDiagnosisTimelineGeometry(points, CHART_INNER_WIDTH, CHART_INNER_HEIGHT),
    [points]
  );
  const getPointLabel = (series: TokenSeries, point: SessionDiagnosisTimelinePoint): string =>
    t('diagnostics.timeline.tokenPointLabel', {
      series: t(`diagnostics.timeline.series.${series}`),
      value: formatNumber(getSeriesTokens(series, point), locale),
      time: formatShortDateTime(point.occurredAt, locale, tCommon('value.unknownDate')),
    });

  return (
    <section className="session-diagnosis-timeline">
      <div className="session-diagnosis-timeline-heading">
        <h3>{t('diagnostics.detail.evidenceTimeline')}</h3>
        <p>{t('diagnostics.timeline.summary')}</p>
      </div>
      <div className="session-diagnosis-timeline-chart">
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          role="img"
          aria-label={t('diagnostics.timeline.ariaLabel')}
        >
          <g transform={`translate(${CHART_PADDING_X} ${CHART_PADDING_Y})`}>
            <g data-lane="tokens">
              <text className="session-diagnosis-timeline-lane-label" x="0" y={LANE_LABEL_OFFSET}>
                {t('diagnostics.timeline.tokenLane')}
              </text>
              {(['input', 'output', 'reasoning'] as const).map((series) =>
                renderTokenSeries(series, geometry.points, getPointLabel)
              )}
            </g>
            <line
              className="session-diagnosis-timeline-divider"
              x1="0"
              y1={geometry.tokenLaneHeight}
              x2={CHART_INNER_WIDTH}
              y2={geometry.tokenLaneHeight}
            />
            <g data-lane="cache-rate">
              <text
                className="session-diagnosis-timeline-lane-label"
                x="0"
                y={geometry.tokenLaneHeight + LANE_LABEL_OFFSET}
              >
                {t('diagnostics.timeline.cacheLane')}
              </text>
              <polyline
                className="session-diagnosis-timeline-cache-line"
                points={getPolylinePoints(geometry.points, ({ cacheY }) => cacheY)}
              />
              {geometry.points.map((geometryPoint) => {
                const cacheRate = getCacheRate(geometryPoint.point);
                const label = t('diagnostics.timeline.cachePointLabel', {
                  value: formatPercent(cacheRate * PERCENT_BASE, locale, 1),
                  time: formatShortDateTime(
                    geometryPoint.point.occurredAt,
                    locale,
                    tCommon('value.unknownDate')
                  ),
                });

                return (
                  <g
                    className="session-diagnosis-timeline-point cache"
                    key={`cache:${geometryPoint.point.contributionId}`}
                  >
                    <circle
                      tabIndex={0}
                      aria-label={label}
                      cx={geometryPoint.x}
                      cy={geometryPoint.cacheY}
                      r={POINT_RADIUS}
                    >
                      <title>{label}</title>
                    </circle>
                    <text
                      className="session-diagnosis-timeline-tooltip"
                      x={geometryPoint.x}
                      y={Math.max(geometryPoint.cacheY - TOOLTIP_OFFSET, TOOLTIP_OFFSET)}
                    >
                      {label}
                    </text>
                  </g>
                );
              })}
            </g>
            {geometry.points.slice(1).map((geometryPoint, index) => {
              const previous = geometry.points[index];
              const from = previous.point.modelId;
              const to = geometryPoint.point.modelId;

              if (!from || !to || from === to) {
                return null;
              }

              const label = t('diagnostics.timeline.modelSwitch', { from, to });

              return (
                <g
                  className="session-diagnosis-timeline-model-switch"
                  key={`model-switch:${geometryPoint.point.contributionId}`}
                  tabIndex={0}
                  aria-label={label}
                >
                  <line x1={geometryPoint.x} y1="0" x2={geometryPoint.x} y2={CHART_INNER_HEIGHT} />
                  <text x={geometryPoint.x} y={CHART_INNER_HEIGHT - MODEL_SWITCH_LABEL_OFFSET}>
                    {from} → {to}
                  </text>
                  <title>{label}</title>
                </g>
              );
            })}
          </g>
        </svg>
      </div>
      <div className="session-diagnosis-timeline-legend" aria-hidden="true">
        <span className="input">{t('diagnostics.timeline.series.input')}</span>
        <span className="output">{t('diagnostics.timeline.series.output')}</span>
        <span className="reasoning">{t('diagnostics.timeline.series.reasoning')}</span>
        <span className="cache">{t('diagnostics.timeline.cacheLane')}</span>
      </div>
      {invalidPointCount > 0 ? (
        <p className="session-diagnosis-timeline-note">
          {t('diagnostics.detail.invalidTimelinePoints', { count: invalidPointCount })}
        </p>
      ) : null}
    </section>
  );
};

export default SessionDiagnosisTimeline;
