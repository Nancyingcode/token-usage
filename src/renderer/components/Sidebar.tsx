import { BarChart3, FolderKanban, MessageSquareText, Settings, ShieldCheck } from "lucide-react";

export type ViewKey = "overview" | "projects" | "sessions" | "settings";

interface SidebarProps {
  activeView: ViewKey;
  warningCount: number;
  onChange: (view: ViewKey) => void;
}

const navItems: Array<{ key: ViewKey; label: string; icon: typeof BarChart3 }> = [
  { key: "overview", label: "概览", icon: BarChart3 },
  { key: "projects", label: "项目", icon: FolderKanban },
  { key: "sessions", label: "会话", icon: MessageSquareText },
  { key: "settings", label: "设置", icon: Settings }
];

export default function Sidebar({ activeView, warningCount, onChange }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="brand-block">
        <div className="brand-mark">C</div>
        <div>
          <p className="eyebrow">Codex Usage</p>
          <h1>Token 仪表盘</h1>
        </div>
      </div>

      <div className="privacy-pill">
        <ShieldCheck size={16} />
        <span>本地只读扫描</span>
      </div>

      <nav className="nav-list" aria-label="主导航">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              type="button"
              className={activeView === item.key ? "nav-item active" : "nav-item"}
              onClick={() => onChange(item.key)}
              title={item.label}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <span>Warnings</span>
        <strong>{warningCount}</strong>
      </div>
    </aside>
  );
}
