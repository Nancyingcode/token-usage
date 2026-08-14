/**
 * @file Project analytics workspace
 * @description Presents project summary metrics, a compact usage-share chart, and a searchable project table.
 */
import React, { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { UNKNOWN_PROJECT_KEY } from '../../shared/usageMath';
import type { UsageProject } from '../../shared/usageTypes';
import { resolveRendererLocale } from '../i18n';
import { formatNumber, formatPercent, formatShortDateTime } from '../utils/formatters';
import { getStaggeredMotionStyle } from '../utils/motion';
import {
  buildProjectChartEntries,
  buildProjectRow,
  filterAndSortProjects,
  type ProjectChartEntry,
  type ProjectSortKey,
} from '../utils/projectViewModel';
import PageHeader from './PageHeader';
import SelectMenu, { type SelectMenuOption } from './SelectMenu';

interface ProjectsViewProps {
  projects: UsageProject[];
  onProjectSelect: (projectPath: string) => void;
}

type ProjectDonutDatum = UsageProject | ProjectChartEntry;

export interface ProjectDonutSegment {
  project: ProjectDonutDatum;
  key: string;
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
const OTHER_PROJECT_KEY = '__other-projects__';

const isChartEntry = (project: ProjectDonutDatum): project is ProjectChartEntry =>
  'kind' in project;

const isNavigableProject = (project: ProjectDonutDatum): boolean =>
  !isChartEntry(project) || project.kind === 'project';

const getProjectKey = (project: ProjectDonutDatum): string =>
  isChartEntry(project) && project.kind === 'other'
    ? OTHER_PROJECT_KEY
    : (project.projectPath ?? OTHER_PROJECT_KEY);

export const buildProjectDonutSegments = (
  projects: readonly ProjectDonutDatum[]
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
      key: getProjectKey(project),
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
  const [hoveredProjectKey, setHoveredProjectKey] = useState<string | null>(null);
  const [focusedProjectKey, setFocusedProjectKey] = useState<string | null>(null);
  const [isCenterHovered, setIsCenterHovered] = useState(false);
  const [isCenterFocused, setIsCenterFocused] = useState(false);
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<ProjectSortKey>('tokens');
  const sortOptions = useMemo<SelectMenuOption<ProjectSortKey>[]>(
    () => [
      { value: 'tokens', label: t('projects.sort.tokens') },
      { value: 'sessions', label: t('projects.sort.sessions') },
      { value: 'activity', label: t('projects.sort.activity') },
      { value: 'name', label: t('projects.sort.name') },
    ],
    [t]
  );
  const chartEntries = useMemo(() => buildProjectChartEntries(projects), [projects]);
  const segments = useMemo(() => buildProjectDonutSegments(chartEntries), [chartEntries]);
  const visibleProjects = useMemo(
    () => filterAndSortProjects(projects, query, sortKey),
    [projects, query, sortKey]
  );
  const listMotionKey = useMemo(
    () =>
      [
        sortKey,
        query.trim().toLocaleLowerCase(),
        ...visibleProjects.map(({ projectPath }) => projectPath),
      ].join(':'),
    [query, sortKey, visibleProjects]
  );
  const totalTokens = projects.reduce((total, project) => total + project.totalTokens, 0);
  const totalSessions = projects.reduce((total, project) => total + project.sessionCount, 0);
  const topProject = [...projects].sort((a, b) => b.totalTokens - a.totalTokens)[0];
  const activeProjectKey = hoveredProjectKey ?? focusedProjectKey;
  const activeSegment = segments.find(({ key }) => key === activeProjectKey);
  const formattedTotalTokens = formatNumber(totalTokens, locale);
  const isCenterTooltipVisible = isCenterHovered || isCenterFocused;
  const unknownDateLabel = tCommon('value.unknownDate');

  const getDisplayName = (project: ProjectDonutDatum): string => {
    if (isChartEntry(project) && project.kind === 'other') {
      return t('projects.otherProjects');
    }

    return project.projectName === UNKNOWN_PROJECT_KEY
      ? t('projects.unknownProject')
      : project.projectName;
  };

  const getDisplayPath = (project: ProjectDonutDatum): string | undefined =>
    project.projectPath === UNKNOWN_PROJECT_KEY
      ? t('projects.unknownProject')
      : project.projectPath;

  const activateProject = (project: ProjectDonutDatum): void => {
    if (isNavigableProject(project) && project.projectPath) {
      onProjectSelect(project.projectPath);
    }
  };

  const handleSegmentKeyDown = (
    event: React.KeyboardEvent<SVGGElement>,
    project: ProjectDonutDatum
  ): void => {
    if (!ACTIVATION_KEYS.has(event.key) || !isNavigableProject(project)) {
      return;
    }

    event.preventDefault();
    activateProject(project);
  };

  return (
    <section className="page-stack project-workspace">
      <PageHeader
        eyebrow={t('projects.eyebrow')}
        title={t('projects.title')}
        description={t('projects.description')}
        actions={<span>{t('projects.count', { count: projects.length })}</span>}
      />

      <section
        className="project-summary-grid"
        aria-label={t('projects.summary.label')}
        role="region"
      >
        <article className="panel project-summary-card">
          <span>{t('projects.summary.projectCount')}</span>
          <strong>{t('projects.count', { count: projects.length })}</strong>
        </article>
        <article className="panel project-summary-card">
          <span>{t('projects.summary.totalTokens')}</span>
          <strong>{formatNumber(totalTokens, locale)}</strong>
        </article>
        <article className="panel project-summary-card">
          <span>{t('projects.summary.totalSessions')}</span>
          <strong>{formatNumber(totalSessions, locale)}</strong>
        </article>
        <article className="panel project-summary-card">
          <span>{t('projects.summary.topProject')}</span>
          <strong>{topProject ? getDisplayName(topProject) : tCommon('value.notSet')}</strong>
          {topProject ? (
            <small>
              {formatPercent(
                totalTokens > 0 ? (topProject.totalTokens / totalTokens) * PERCENT_SCALE : 0,
                locale,
                PROJECT_SHARE_FRACTION_DIGITS
              )}
            </small>
          ) : null}
        </article>
      </section>

      <article className="panel project-donut-panel">
        <div className="panel-heading compact project-chart-heading">
          <div>
            <h2>{t('projects.chartTitle')}</h2>
            <p>{t('projects.chartSummary')}</p>
          </div>
        </div>
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
                const { project, key, percentage, startPercentage, toneIndex } = segment;
                const share = formatPercent(percentage, locale, PROJECT_SHARE_FRACTION_DIGITS);
                const tokens = formatNumber(project.totalTokens, locale);
                const sessions = formatNumber(project.sessionCount, locale);
                const lastActive = formatShortDateTime(
                  project.lastActivityAt,
                  locale,
                  unknownDateLabel
                );
                const isActive = activeProjectKey === key;
                const navigable = isNavigableProject(project);
                const projectName = getDisplayName(project);
                const accessibleLabel = navigable
                  ? t('projects.segmentLabel', {
                      project: projectName,
                      share,
                      tokens,
                      count: project.sessionCount,
                      sessions,
                      lastActive,
                    })
                  : t('projects.otherSegmentLabel', {
                      project: projectName,
                      count: isChartEntry(project) ? project.projectCount : 0,
                      share,
                      tokens,
                    });

                return (
                  <g
                    key={key}
                    className={`project-donut-segment project-donut-tone-${toneIndex}${
                      isActive ? ' is-active' : ''
                    }${navigable ? '' : ' is-static'}`}
                    role={navigable ? 'button' : 'img'}
                    tabIndex={navigable ? 0 : undefined}
                    aria-label={accessibleLabel}
                    aria-describedby={isActive ? `${chartId}-tooltip` : undefined}
                    onClick={navigable ? () => activateProject(project) : undefined}
                    onKeyDown={
                      navigable ? (event) => handleSegmentKeyDown(event, project) : undefined
                    }
                    onPointerEnter={() => setHoveredProjectKey(key)}
                    onPointerLeave={() =>
                      setHoveredProjectKey((current) => (current === key ? null : current))
                    }
                    onFocus={navigable ? () => setFocusedProjectKey(key) : undefined}
                    onBlur={
                      navigable
                        ? () =>
                            setFocusedProjectKey((current) => (current === key ? null : current))
                        : undefined
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
            <div
              className="project-donut-center"
              tabIndex={0}
              aria-describedby={isCenterTooltipVisible ? `${chartId}-center-tooltip` : undefined}
              onPointerEnter={() => setIsCenterHovered(true)}
              onPointerLeave={() => setIsCenterHovered(false)}
              onFocus={() => setIsCenterFocused(true)}
              onBlur={() => setIsCenterFocused(false)}
            >
              <span>{t('projects.totalTokens')}</span>
              <strong className="project-donut-center-value">{formattedTotalTokens}</strong>
            </div>
            {isCenterTooltipVisible ? (
              <div
                id={`${chartId}-center-tooltip`}
                className="project-donut-center-tooltip"
                role="tooltip"
              >
                <span>{t('projects.totalTokens')}</span>
                <strong>{formattedTotalTokens}</strong>
              </div>
            ) : null}
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
                <strong>{getDisplayName(activeSegment.project)}</strong>
                <dl>
                  {getDisplayPath(activeSegment.project) ? (
                    <div>
                      <dt>{t('projects.path')}</dt>
                      <dd title={getDisplayPath(activeSegment.project)}>
                        {getDisplayPath(activeSegment.project)}
                      </dd>
                    </div>
                  ) : null}
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
            <h3>{t('projects.legendLabel')}</h3>
            <ul aria-label={t('projects.legendLabel')}>
              {segments.map(({ project, key, percentage, toneIndex }) => {
                const share = formatPercent(percentage, locale, PROJECT_SHARE_FRACTION_DIGITS);
                const isActive = activeProjectKey === key;
                const navigable = isNavigableProject(project);
                const itemClassName = `project-donut-legend-item project-donut-tone-${toneIndex}${
                  isActive ? ' is-active' : ''
                }${navigable ? '' : ' is-static'}`;
                const content = (
                  <>
                    <span className="project-donut-legend-swatch" aria-hidden="true" />
                    <span className="project-donut-legend-name" title={getDisplayPath(project)}>
                      {getDisplayName(project)}
                    </span>
                    <span className="project-donut-legend-share">{share}</span>
                  </>
                );

                return (
                  <li key={key}>
                    {navigable ? (
                      <button
                        type="button"
                        className={itemClassName}
                        aria-label={t('projects.legendItemLabel', {
                          project: getDisplayName(project),
                          share,
                        })}
                        aria-describedby={isActive ? `${chartId}-tooltip` : undefined}
                        onClick={() => activateProject(project)}
                        onPointerEnter={() => setHoveredProjectKey(key)}
                        onPointerLeave={() =>
                          setHoveredProjectKey((current) => (current === key ? null : current))
                        }
                        onFocus={() => setFocusedProjectKey(key)}
                        onBlur={() =>
                          setFocusedProjectKey((current) => (current === key ? null : current))
                        }
                      >
                        {content}
                      </button>
                    ) : (
                      <div className={itemClassName}>{content}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </aside>
        </div>
      </article>

      <article className="panel project-list-panel">
        <div className="project-list-heading">
          <div>
            <h2>{t('projects.list.title')}</h2>
            <p>
              {t('projects.list.filteredCount', {
                visible: visibleProjects.length,
                total: projects.length,
              })}
            </p>
          </div>
          <div className="project-list-controls">
            <label>
              <span>{t('projects.search.label')}</span>
              <input
                type="search"
                value={query}
                placeholder={t('projects.search.placeholder')}
                aria-label={t('projects.search.label')}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <label>
              <span>{t('projects.sort.label')}</span>
              <SelectMenu
                value={sortKey}
                options={sortOptions}
                ariaLabel={t('projects.sort.label')}
                loadingLabel={tCommon('state.loadingOptions')}
                emptyLabel={tCommon('state.noOptions')}
                onChange={setSortKey}
              />
            </label>
          </div>
        </div>

        {visibleProjects.length > 0 ? (
          <div className="project-table-scroll">
            <table className="project-table" aria-label={t('projects.list.label')}>
              <thead>
                <tr>
                  <th scope="col">{t('projects.project')}</th>
                  <th scope="col" className="table-cell--numeric">
                    {t('projects.tokens')}
                  </th>
                  <th scope="col" className="table-cell--numeric">
                    {t('projects.share')}
                  </th>
                  <th scope="col" className="table-cell--numeric">
                    {t('projects.sessions')}
                  </th>
                  <th scope="col" className="table-cell--numeric">
                    {t('projects.averageTokens')}
                  </th>
                  <th scope="col" className="table-cell--numeric">
                    {t('projects.cacheRatio')}
                  </th>
                  <th scope="col">{t('projects.lastActive')}</th>
                  <th scope="col">{t('projects.action')}</th>
                </tr>
              </thead>
              <tbody key={listMotionKey} data-motion-key={listMotionKey}>
                {visibleProjects.map((project, index) => {
                  const row = buildProjectRow(project);
                  const projectName = getDisplayName(project);

                  return (
                    <tr
                      key={project.projectPath}
                      className="motion-list-item"
                      style={getStaggeredMotionStyle(index)}
                    >
                      <th scope="row" className="project-name-cell">
                        <strong>{projectName}</strong>
                        <small title={getDisplayPath(project)}>{getDisplayPath(project)}</small>
                      </th>
                      <td className="table-cell--numeric">
                        {formatNumber(project.totalTokens, locale)}
                      </td>
                      <td className="table-cell--numeric">
                        {formatPercent(
                          totalTokens > 0 ? (project.totalTokens / totalTokens) * PERCENT_SCALE : 0,
                          locale,
                          PROJECT_SHARE_FRACTION_DIGITS
                        )}
                      </td>
                      <td className="table-cell--numeric">
                        {formatNumber(project.sessionCount, locale)}
                      </td>
                      <td className="table-cell--numeric">
                        {formatNumber(Math.round(row.averageTokensPerSession), locale)}
                      </td>
                      <td className="table-cell--numeric">
                        {formatPercent(row.cacheInputRatio * PERCENT_SCALE, locale)}
                      </td>
                      <td>
                        {formatShortDateTime(project.lastActivityAt, locale, unknownDateLabel)}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="secondary-button project-session-action"
                          aria-label={t('projects.viewSessionsFor', { project: projectName })}
                          onClick={() => activateProject(project)}
                        >
                          {t('projects.viewSessions')}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="project-search-empty">
            <strong>{t('projects.search.emptyTitle')}</strong>
            <p>{t('projects.search.emptyDescription')}</p>
            <button type="button" className="secondary-button" onClick={() => setQuery('')}>
              {t('projects.search.clear')}
            </button>
          </div>
        )}
      </article>
    </section>
  );
};

export default ProjectsView;
