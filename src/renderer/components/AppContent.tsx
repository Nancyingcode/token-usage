import React from 'react';
import { AlertCircle } from 'lucide-react';
import { ICON_SIZE_LARGE } from '../constants/ui';
import type { AppContentModel } from '../utils/appContentModel';
import EmptyState from './EmptyState';
import Overview from './Overview';
import PeriodEmptyState from './PeriodEmptyState';
import PerformanceView from './PerformanceView';
import ProjectsView from './ProjectsView';
import SessionsView from './SessionsView';
import SettingsView from './SettingsView';
import type { ViewKey } from './Sidebar';

interface AppContentProps {
  activeView: ViewKey;
  model: AppContentModel;
}

const AppContent: React.FC<AppContentProps> = ({ activeView, model }) => {
  switch (model.kind) {
    case 'error':
      return (
        <section className="state-panel">
          <AlertCircle size={ICON_SIZE_LARGE} />
          <div>
            <h2>Scan failed</h2>
            <p>{model.message}</p>
          </div>
        </section>
      );
    case 'loading':
      return (
        <section className="state-panel">
          <div className="loader" />
          <div>
            <h2>Scanning local Codex sessions</h2>
            <p>Read-only JSONL parsing. No edits, no uploads.</p>
          </div>
        </section>
      );
    case 'empty':
      return <EmptyState sessionsDir={model.result.sessionsDir} warnings={model.result.warnings} />;
    case 'period-empty':
      return <PeriodEmptyState period={model.period} />;
    case 'ready':
      return (
        <>
          {activeView === 'overview' ? <Overview summary={model.summary} /> : null}
          {activeView === 'sessions' ? <SessionsView sessions={model.summary.sessions} /> : null}
          {activeView === 'tools' ? <ProjectsView projects={model.summary.byProject} /> : null}
          {activeView === 'performance' ? <PerformanceView summary={model.summary} /> : null}
          {activeView === 'wrapped' ? <SettingsView result={model.result} /> : null}
        </>
      );
    case 'idle':
      return null;
  }
};

export default AppContent;
