import React from 'react';
import { useTranslation } from 'react-i18next';
import type { UsageProject } from '../../shared/usageTypes';
import { resolveRendererLocale } from '../i18n';
import { formatNumber, formatShortDateTime } from '../utils/formatters';
import TokenBar from './TokenBar';

interface ProjectsViewProps {
  projects: UsageProject[];
}

const ProjectsView: React.FC<ProjectsViewProps> = ({ projects }) => {
  const { t, i18n } = useTranslation('analytics');
  const { t: tCommon } = useTranslation('common');
  const locale = resolveRendererLocale(i18n.resolvedLanguage);
  const max = Math.max(0, ...projects.map((project) => project.totalTokens));

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
          <div className="table-row" key={project.projectPath}>
            <span className="primary-cell" title={project.projectPath}>
              {project.projectName}
            </span>
            <span>
              <TokenBar value={project.totalTokens} max={max} tone="green" />
            </span>
            <span>{formatNumber(project.sessionCount, locale)}</span>
            <span>{formatNumber(project.totalTokens, locale)}</span>
            <span>
              {formatShortDateTime(project.lastActivityAt, locale, tCommon('value.unknownDate'))}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
};

export default ProjectsView;
