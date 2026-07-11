import { Inbox } from "lucide-react";
import type { UsageWarning } from "../../shared/usageTypes";

interface EmptyStateProps {
  sessionsDir: string;
  warnings: UsageWarning[];
}

export default function EmptyState({ sessionsDir, warnings }: EmptyStateProps) {
  return (
    <section className="state-panel">
      <Inbox size={24} />
      <div>
        <h2>没有找到 Codex 会话</h2>
        <p>已扫描：{sessionsDir}</p>
        {warnings.length ? <p>{warnings[0].message}</p> : null}
      </div>
    </section>
  );
}
