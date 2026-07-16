import React from 'react';
import type { UsageProject } from '../../shared/usageTypes';
import { formatNumber } from './MetricCard';
import TokenBar from './TokenBar';

interface ProjectsViewProps {
  projects: UsageProject[];
}

const ProjectsView: React.FC<ProjectsViewProps> = ({ projects }) => {
  const max = Math.max(0, ...projects.map((project) => project.totalTokens));

  return (
    <section className="panel table-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Project totals</p>
          <h3>Tool Usage</h3>
        </div>
        <span>{projects.length} projects</span>
      </div>
      <div className="data-table project-table">
        <div className="table-row table-head">
          <span>Project</span>
          <span>Share</span>
          <span>Sessions</span>
          <span>Tokens</span>
          <span>Last Active</span>
        </div>
        {projects.map((project) => (
          <div className="table-row" key={project.projectPath}>
            <span className="primary-cell" title={project.projectPath}>
              {project.projectName}
            </span>
            <span>
              <TokenBar value={project.totalTokens} max={max} tone="green" />
            </span>
            <span>{project.sessionCount}</span>
            <span>{formatNumber(project.totalTokens)}</span>
            <span>{formatShortDate(project.lastActivityAt)}</span>
          </div>
        ))}
      </div>
    </section>
  );
};

function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat('en', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export default ProjectsView;
