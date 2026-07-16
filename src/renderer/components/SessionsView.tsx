import React from "react";
import { AlertTriangle } from "lucide-react";
import type { UsageSession } from "../../shared/usageTypes";
import { formatNumber } from "./MetricCard";

interface SessionsViewProps {
  sessions: UsageSession[];
}

const SHORT_ID_MAX_LENGTH = 12;
const SHORT_ID_PREFIX_LENGTH = 8;
const SHORT_ID_SUFFIX_LENGTH = 4;

const SessionsView: React.FC<SessionsViewProps> = ({ sessions }) => {
  return (
    <section className="panel table-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Session details</p>
          <h3>Sessions</h3>
        </div>
        <span>{sessions.length} sessions</span>
      </div>
      <div className="data-table session-table">
        <div className="table-row table-head">
          <span>Session</span>
          <span>Project</span>
          <span>Date</span>
          <span>Input</span>
          <span>Cached</span>
          <span>Output</span>
          <span>Total</span>
          <span>Status</span>
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
              {session.warnings.length ? <AlertTriangle size={14} /> : null}
              {session.warnings.length ? `${session.warnings.length} warnings` : "OK"}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
};

function shortId(id: string): string {
  return id.length > SHORT_ID_MAX_LENGTH
    ? `${id.slice(0, SHORT_ID_PREFIX_LENGTH)}...${id.slice(-SHORT_ID_SUFFIX_LENGTH)}`
    : id;
}

function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export default SessionsView;
