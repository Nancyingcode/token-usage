import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle } from "lucide-react";
import EmptyState from "./components/EmptyState";
import Overview from "./components/Overview";
import ProjectsView from "./components/ProjectsView";
import SessionsView from "./components/SessionsView";
import SettingsView from "./components/SettingsView";
import Sidebar, { type ViewKey } from "./components/Sidebar";
import Toolbar from "./components/Toolbar";
import type { UsageScanResult, UsageSession } from "../shared/usageTypes";

export default function App() {
  const [activeView, setActiveView] = useState<ViewKey>("overview");
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<UsageScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const nextResult = await window.codexUsage.scan();
      setResult(nextResult);
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : String(scanError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filteredSessions = useMemo(() => {
    const sessions = result?.summary.sessions ?? [];
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return sessions;
    }

    return sessions.filter((session) => sessionMatchesQuery(session, normalizedQuery));
  }, [query, result]);

  const warningCount = result?.warnings.length ?? 0;

  return (
    <div className="app-frame">
      <Sidebar activeView={activeView} onChange={setActiveView} warningCount={warningCount} />
      <main className="main-panel">
        <Toolbar
          loading={loading}
          query={query}
          scannedAt={result?.scannedAt}
          onQueryChange={setQuery}
          onRefresh={refresh}
        />

        {error ? (
          <section className="state-panel">
            <AlertCircle size={22} />
            <div>
              <h2>扫描失败</h2>
              <p>{error}</p>
            </div>
          </section>
        ) : null}

        {!error && loading ? (
          <section className="state-panel">
            <div className="loader" />
            <div>
              <h2>正在扫描本机 Codex 会话</h2>
              <p>只读解析本地 JSONL 文件，不会修改或上传数据。</p>
            </div>
          </section>
        ) : null}

        {!error && !loading && result && result.summary.sessions.length === 0 ? (
          <EmptyState sessionsDir={result.sessionsDir} warnings={result.warnings} />
        ) : null}

        {!error && !loading && result && result.summary.sessions.length > 0 ? (
          <>
            {activeView === "overview" ? <Overview summary={result.summary} /> : null}
            {activeView === "projects" ? (
              <ProjectsView projects={result.summary.byProject} />
            ) : null}
            {activeView === "sessions" ? <SessionsView sessions={filteredSessions} /> : null}
            {activeView === "settings" ? <SettingsView result={result} /> : null}
          </>
        ) : null}
      </main>
    </div>
  );
}

function sessionMatchesQuery(session: UsageSession, query: string): boolean {
  return [
    session.sessionId,
    session.threadName ?? "",
    session.projectName,
    session.projectPath,
    session.sourceFile
  ].some((value) => value.toLowerCase().includes(query));
}
