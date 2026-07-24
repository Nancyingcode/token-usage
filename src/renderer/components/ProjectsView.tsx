/**
 * @file Project usage ranking
 * @description Displays project-level token totals and reports project drilldown selections.
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import type { SupportedLocale } from '../../shared/i18n/locale';
import type { UsageProject } from '../../shared/usageTypes';
import { resolveRendererLocale } from '../i18n';
import { formatNumber, formatShortDateTime } from '../utils/formatters';
import TokenBar from './TokenBar';

interface ProjectsViewProps {
  projects: UsageProject[];
  onProjectSelect: (projectPath: string) => void;
}

interface ProjectRowProps {
  project: UsageProject;
  max: number;
  locale: SupportedLocale;
  unknownDateLabel: string;
  onSelect: (projectPath: string) => void;
}

export const ProjectRow: React.FC<ProjectRowProps> = ({
  project,
  max,
  locale,
  unknownDateLabel,
  onSelect,
}) => (
  <button
    type="button"
    className="table-row project-table-row"
    onClick={() => onSelect(project.projectPath)}
  >
    <span className="primary-cell" title={project.projectPath}>
      {project.projectName}
    </span>
    <span>
      <TokenBar value={project.totalTokens} max={max} tone="green" />
    </span>
    <span>{formatNumber(project.sessionCount, locale)}</span>
    <span>{formatNumber(project.totalTokens, locale)}</span>
    <span>{formatShortDateTime(project.lastActivityAt, locale, unknownDateLabel)}</span>
  </button>
);

const ProjectsView: React.FC<ProjectsViewProps> = ({ projects, onProjectSelect }) => {
  const { t, i18n } = useTranslation('analytics');
  const { t: tCommon } = useTranslation('common');
  const locale = resolveRendererLocale(i18n.resolvedLanguage);
  const max = Math.max(0, ...projects.map((project) => project.totalTokens));
  const unknownDateLabel = tCommon('value.unknownDate');

  return (
    <section className="panel table-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{t('projects.eyebrow')}</p>
          <h3>{t('projects.title')}</h3>
        </div>
        <span>{t('projects.count', { count: projects.length })}</span>
      </div>
      <div className="data-table project-table">
        <div className="table-row table-head">
          <span>{t('projects.project')}</span>
          <span>{t('projects.share')}</span>
          <span>{t('projects.sessions')}</span>
          <span>{t('projects.tokens')}</span>
          <span>{t('projects.lastActive')}</span>
        </div>
        {projects.map((project) => (
          <ProjectRow
            key={project.projectPath}
            project={project}
            max={max}
            locale={locale}
            unknownDateLabel={unknownDateLabel}
            onSelect={onProjectSelect}
          />
        ))}
      </div>
    </section>
  );
};

export default ProjectsView;
