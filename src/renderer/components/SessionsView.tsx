import { AlertTriangle } from "lucide-react";
import type { UsageSession } from "../../shared/usageTypes";
import { formatNumber } from "./MetricCard";

interface SessionsViewProps {
  sessions: UsageSession[];
}

export default function SessionsView({ sessions }: SessionsViewProps) {
  return (
    <section className="panel table-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Session details</p>
          <h3>按会话统计</h3>
        </div>
        <span>{sessions.length} 个会话</span>
      </div>
      <div className="data-table session-table">
        <div className="table-row table-head">
          <span>会话</span>
          <span>项目</span>
          <span>日期</span>
          <span>输入</span>
          <span>缓存</span>
          <span>输出</span>
          <span>总计</span>
          <span>状态</span>
        </div>
        {sessions.map((session) => (
          <div className="table-row" key={session.sourceFile}>
            <span className="primary-cell" title={session.sessionId}>
              {session.threadName || shortId(session.sessionId)}
            </span>
            <span title={session.projectPath}>{session.projectName}</span>
            <span>{formatShortDate(session.startedAt)}</span>
            <span>{formatNumber(session.inputTokens)}</span>
            <span>{formatNumber(session.cachedInputTokens)}</span>
            <span>{formatNumber(session.outputTokens)}</span>
            <span>{formatNumber(session.totalTokens)}</span>
            <span className={session.warnings.length ? "warning-cell" : "ok-cell"}>
              {session.warnings.length ? <AlertTriangle size={15} /> : null}
              {session.warnings.length ? `${session.warnings.length} 条` : "正常"}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}...${id.slice(-4)}` : id;
}

function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}
