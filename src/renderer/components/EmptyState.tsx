import React from 'react';
import { Inbox } from 'lucide-react';
import type { UsageWarning } from '../../shared/usageTypes';

interface EmptyStateProps {
  sessionsDir: string;
  warnings: UsageWarning[];
}

const EmptyState: React.FC<EmptyStateProps> = ({ sessionsDir, warnings }) => (
  <section className="state-panel">
    <Inbox size={24} />
    <div>
      <h2>No Codex sessions found</h2>
      <p>Scanned: {sessionsDir}</p>
      {warnings.length ? <p>{warnings[0].message}</p> : null}
    </div>
  </section>
);

export default EmptyState;
