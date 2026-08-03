/**
 * @file Project usage share chart
 * @description Displays project token shares as an accessible interactive donut chart.
 */
import React, { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { UsageProject } from '../../shared/usageTypes';
import { resolveRendererLocale } from '../i18n';
import { formatNumber, formatPercent, formatShortDateTime } from '../utils/formatters';
import PageHeader from './PageHeader';

interface ProjectsViewProps {
  projects: UsageProject[];
  onProjectSelect: (projectPath: string) => void;
}

export interface ProjectDonutSegment {
  project: UsageProject;
  percentage: number;
  startPercentage: number;
  toneIndex: number;
  tooltipXPercent: number;
  tooltipYPercent: number;
}

type ProjectTooltipStyle = React.CSSProperties & {
  '--project-tooltip-x': string;
  '--project-tooltip-y': string;
};

const DONUT_VIEWBOX_SIZE = 320;
const DONUT_VIEWBOX = `0 0 ${DONUT_VIEWBOX_SIZE} ${DONUT_VIEWBOX_SIZE}`;
const DONUT_CENTER = DONUT_VIEWBOX_SIZE / 2;
const DONUT_RADIUS = 112;
const TOOLTIP_ANCHOR_RADIUS = 126;
const PERCENT_SCALE = 100;
const FULL_CIRCLE_DEGREES = 360;
const HALF_CIRCLE_DEGREES = 180;
const DONUT_START_ANGLE = -90;
const PROJECT_SHARE_FRACTION_DIGITS = 1;
const PROJECT_COLOR_COUNT = 8;
const ACTIVATION_KEYS = new Set(['Enter', ' ']);

export const buildProjectDonutSegments = (
  projects: readonly UsageProject[]
): ProjectDonutSegment[] => {
  const totalTokens = projects.reduce((total, project) => total + project.totalTokens, 0);

  if (totalTokens <= 0) {
    return [];
  }

  let startPercentage = 0;

  return projects.flatMap((project, index) => {
    if (project.totalTokens <= 0) {
      return [];
    }

    const percentage = (project.totalTokens / totalTokens) * PERCENT_SCALE;
    const midpointAngle =
      DONUT_START_ANGLE +
      ((startPercentage + percentage / 2) / PERCENT_SCALE) * FULL_CIRCLE_DEGREES;
    const midpointRadians = (midpointAngle * Math.PI) / HALF_CIRCLE_DEGREES;
    const segment = {
      project,
      percentage,
      startPercentage,
      toneIndex: (index % PROJECT_COLOR_COUNT) + 1,
      tooltipXPercent:
        ((DONUT_CENTER + Math.cos(midpointRadians) * TOOLTIP_ANCHOR_RADIUS) / DONUT_VIEWBOX_SIZE) *
        PERCENT_SCALE,
      tooltipYPercent:
        ((DONUT_CENTER + Math.sin(midpointRadians) * TOOLTIP_ANCHOR_RADIUS) / DONUT_VIEWBOX_SIZE) *
        PERCENT_SCALE,
    };

    startPercentage += percentage;
    return [segment];
  });
};

const ProjectsView: React.FC<ProjectsViewProps> = ({ projects, onProjectSelect }) => {
  const { t, i18n } = useTranslation('analytics');
  const { t: tCommon } = useTranslation('common');
  const locale = resolveRendererLocale(i18n.resolvedLanguage);
  const chartId = useId();
  const [hoveredProjectPath, setHoveredProjectPath] = useState<string | null>(null);
  const [focusedProjectPath, setFocusedProjectPath] = useState<string | null>(null);
  const segments = buildProjectDonutSegments(projects);
  const totalTokens = projects.reduce((total, project) => total + project.totalTokens, 0);
  const activeProjectPath = hoveredProjectPath ?? focusedProjectPath;
  const activeSegment = segments.find(({ project }) => project.projectPath === activeProjectPath);
  const unknownDateLabel = tCommon('value.unknownDate');

  const activateProject = (projectPath: string): void => {
    onProjectSelect(projectPath);
  };

  const handleSegmentKeyDown = (
    event: React.KeyboardEvent<SVGGElement>,
    projectPath: string
  ): void => {
    if (!ACTIVATION_KEYS.has(event.key)) {
      return;
    }

    event.preventDefault();
    activateProject(projectPath);
  };

  return (
    <section className="page-stack">
      <PageHeader
        eyebrow={t('projects.eyebrow')}
        title={t('projects.title')}
        description={t('projects.description')}
        actions={<span>{t('projects.count', { count: projects.length })}</span>}
      />
      <div className="panel project-donut-panel">
        <div className="project-donut-layout">
          <div className="project-donut-stage">
            <svg
              className="project-donut-chart"
              viewBox={DONUT_VIEWBOX}
              role="group"
              aria-labelledby={`${chartId}-title ${chartId}-description`}
            >
              <title id={`${chartId}-title`}>{t('projects.chartLabel')}</title>
              <desc id={`${chartId}-description`}>{t('projects.chartDescription')}</desc>
              <circle
                className="project-donut-track"
                cx={DONUT_CENTER}
                cy={DONUT_CENTER}
                r={DONUT_RADIUS}
                pathLength={PERCENT_SCALE}
              />
              {segments.map((segment) => {
                const { project, percentage, startPercentage, toneIndex } = segment;
                const share = formatPercent(percentage, locale, PROJECT_SHARE_FRACTION_DIGITS);
                const tokens = formatNumber(project.totalTokens, locale);
                const sessions = formatNumber(project.sessionCount, locale);
                const lastActive = formatShortDateTime(
                  project.lastActivityAt,
                  locale,
                  unknownDateLabel
                );
                const isActive = activeProjectPath === project.projectPath;
                const accessibleLabel = t('projects.segmentLabel', {
                  project: project.projectName,
                  share,
                  tokens,
                  count: project.sessionCount,
                  sessions,
                  lastActive,
                });

                return (
                  <g
                    key={project.projectPath}
                    className={`project-donut-segment project-donut-tone-${toneIndex}${
                      isActive ? ' is-active' : ''
                    }`}
                    role="button"
                    tabIndex={0}
                    aria-label={accessibleLabel}
                    aria-describedby={isActive ? `${chartId}-tooltip` : undefined}
                    onClick={() => activateProject(project.projectPath)}
                    onKeyDown={(event) => handleSegmentKeyDown(event, project.projectPath)}
                    onPointerEnter={() => setHoveredProjectPath(project.projectPath)}
                    onPointerLeave={() =>
                      setHoveredProjectPath((current) =>
                        current === project.projectPath ? null : current
                      )
                    }
                    onFocus={() => setFocusedProjectPath(project.projectPath)}
                    onBlur={() =>
                      setFocusedProjectPath((current) =>
                        current === project.projectPath ? null : current
                      )
                    }
                  >
                    <circle
                      className="project-donut-segment-hit"
                      cx={DONUT_CENTER}
                      cy={DONUT_CENTER}
                      r={DONUT_RADIUS}
                      pathLength={PERCENT_SCALE}
                      strokeDasharray={`${percentage} ${PERCENT_SCALE - percentage}`}
                      strokeDashoffset={-startPercentage}
                      transform={`rotate(${DONUT_START_ANGLE} ${DONUT_CENTER} ${DONUT_CENTER})`}
                    />
                    <circle
                      className="project-donut-segment-visible"
                      cx={DONUT_CENTER}
                      cy={DONUT_CENTER}
                      r={DONUT_RADIUS}
                      pathLength={PERCENT_SCALE}
                      strokeDasharray={`${percentage} ${PERCENT_SCALE - percentage}`}
                      strokeDashoffset={-startPercentage}
                      transform={`rotate(${DONUT_START_ANGLE} ${DONUT_CENTER} ${DONUT_CENTER})`}
                    />
                  </g>
                );
              })}
            </svg>
            <div className="project-donut-center">
              <span>{t('projects.totalTokens')}</span>
              <strong>{formatNumber(totalTokens, locale)}</strong>
            </div>
            {activeSegment ? (
              <div
                id={`${chartId}-tooltip`}
                className="project-donut-tooltip"
                role="tooltip"
                style={
                  {
                    '--project-tooltip-x': `${activeSegment.tooltipXPercent}%`,
                    '--project-tooltip-y': `${activeSegment.tooltipYPercent}%`,
                  } as ProjectTooltipStyle
                }
              >
                <strong>{activeSegment.project.projectName}</strong>
                <dl>
                  <div>
                    <dt>{t('projects.path')}</dt>
                    <dd title={activeSegment.project.projectPath}>
                      {activeSegment.project.projectPath}
                    </dd>
                  </div>
                  <div>
                    <dt>{t('projects.share')}</dt>
                    <dd>
                      {formatPercent(
                        activeSegment.percentage,
                        locale,
                        PROJECT_SHARE_FRACTION_DIGITS
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>{t('projects.tokens')}</dt>
                    <dd>{formatNumber(activeSegment.project.totalTokens, locale)}</dd>
                  </div>
                  <div>
                    <dt>{t('projects.sessions')}</dt>
                    <dd>{formatNumber(activeSegment.project.sessionCount, locale)}</dd>
                  </div>
                  <div>
                    <dt>{t('projects.lastActive')}</dt>
                    <dd>
                      {formatShortDateTime(
                        activeSegment.project.lastActivityAt,
                        locale,
                        unknownDateLabel
                      )}
                    </dd>
                  </div>
                </dl>
              </div>
            ) : null}
          </div>
          <aside className="project-donut-legend">
            <h2>{t('projects.legendLabel')}</h2>
            <ul aria-label={t('projects.legendLabel')}>
              {segments.map(({ project, percentage, toneIndex }) => {
                const share = formatPercent(percentage, locale, PROJECT_SHARE_FRACTION_DIGITS);
                const isActive = activeProjectPath === project.projectPath;

                return (
                  <li key={project.projectPath}>
                    <button
                      type="button"
                      className={`project-donut-legend-item project-donut-tone-${toneIndex}${
                        isActive ? ' is-active' : ''
                      }`}
                      aria-label={t('projects.legendItemLabel', {
                        project: project.projectName,
                        share,
                      })}
                      aria-describedby={isActive ? `${chartId}-tooltip` : undefined}
                      onClick={() => activateProject(project.projectPath)}
                      onPointerEnter={() => setHoveredProjectPath(project.projectPath)}
                      onPointerLeave={() =>
                        setHoveredProjectPath((current) =>
                          current === project.projectPath ? null : current
                        )
                      }
                      onFocus={() => setFocusedProjectPath(project.projectPath)}
                      onBlur={() =>
                        setFocusedProjectPath((current) =>
                          current === project.projectPath ? null : current
                        )
                      }
                    >
                      <span className="project-donut-legend-swatch" aria-hidden="true" />
                      <span className="project-donut-legend-name" title={project.projectPath}>
                        {project.projectName}
                      </span>
                      <span className="project-donut-legend-share">{share}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>
        </div>
      </div>
    </section>
  );
};

export default ProjectsView;
