import { Brain, Database, MessageCircle, Sparkles, Zap } from "lucide-react";
import type { UsageSummary } from "../../shared/usageTypes";
import MetricCard, { formatNumber } from "./MetricCard";
import TokenBar from "./TokenBar";

interface OverviewProps {
  summary: UsageSummary;
}

export default function Overview({ summary }: OverviewProps) {
  const maxDay = Math.max(0, ...summary.byDay.map((day) => day.totalTokens));
  const topProjects = summary.byProject.slice(0, 6);

  return (
    <section className="content-grid">
      <div className="metric-grid">
        <MetricCard label="总 Token" value={summary.totals.totalTokens} icon={Zap} tone="green" />
        <MetricCard label="输入" value={summary.totals.inputTokens} icon={MessageCircle} />
        <MetricCard label="缓存输入" value={summary.totals.cachedInputTokens} icon={Database} tone="blue" />
        <MetricCard label="输出" value={summary.totals.outputTokens} icon={Sparkles} tone="amber" />
        <MetricCard label="推理输出" value={summary.totals.reasoningOutputTokens} icon={Brain} />
      </div>

      <article className="panel wide">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Daily usage</p>
            <h3>每日消耗</h3>
          </div>
          <span>{summary.byDay.length} 天</span>
        </div>
        <div className="day-list">
          {summary.byDay.map((day) => (
            <div className="bar-row" key={day.date}>
              <span>{day.date}</span>
              <TokenBar value={day.totalTokens} max={maxDay} />
              <strong>{formatNumber(day.totalTokens)}</strong>
            </div>
          ))}
        </div>
      </article>

      <article className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Projects</p>
            <h3>项目排行</h3>
          </div>
        </div>
        <div className="rank-list">
          {topProjects.map((project) => (
            <div className="rank-row" key={project.projectPath}>
              <div>
                <strong>{project.projectName}</strong>
                <span>{project.sessionCount} 个会话</span>
              </div>
              <em>{formatNumber(project.totalTokens)}</em>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}
