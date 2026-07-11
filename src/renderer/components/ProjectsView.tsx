import type { UsageProject } from "../../shared/usageTypes";
import { formatNumber } from "./MetricCard";
import TokenBar from "./TokenBar";

interface ProjectsViewProps {
  projects: UsageProject[];
}

export default function ProjectsView({ projects }: ProjectsViewProps) {
  const max = Math.max(0, ...projects.map((project) => project.totalTokens));

  return (
    <section className="panel table-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Project totals</p>
          <h3>按项目统计</h3>
        </div>
        <span>{projects.length} 个项目</span>
      </div>
      <div className="data-table project-table">
        <div className="table-row table-head">
          <span>项目</span>
          <span>占比</span>
          <span>会话</span>
          <span>Token</span>
          <span>最后活动</span>
        </div>
        {projects.map((project) => (
          <div className="table-row" key={project.projectPath}>
            <span className="primary-cell" title={project.projectPath}>
              {project.projectName}
            </span>
            <span>
              <TokenBar value={project.totalTokens} max={max} />
            </span>
            <span>{project.sessionCount}</span>
            <span>{formatNumber(project.totalTokens)}</span>
            <span>{formatShortDate(project.lastActivityAt)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}
