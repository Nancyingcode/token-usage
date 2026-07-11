import { RefreshCw, Search } from "lucide-react";

interface ToolbarProps {
  loading: boolean;
  query: string;
  scannedAt?: string;
  onQueryChange: (query: string) => void;
  onRefresh: () => void;
}

export default function Toolbar({
  loading,
  query,
  scannedAt,
  onQueryChange,
  onRefresh
}: ToolbarProps) {
  return (
    <header className="toolbar">
      <div>
        <p className="eyebrow">本机 Codex sessions</p>
        <h2>Token 消耗统计</h2>
        <p className="toolbar-meta">
          {scannedAt ? `上次扫描 ${formatDateTime(scannedAt)}` : "等待首次扫描"}
        </p>
      </div>

      <div className="toolbar-actions">
        <label className="search-box">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="搜索项目、会话或线程"
          />
        </label>
        <button className="icon-button" type="button" onClick={onRefresh} disabled={loading} title="刷新">
          <RefreshCw size={18} className={loading ? "spinning" : undefined} />
        </button>
      </div>
    </header>
  );
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}
