import React from 'react';
import { Folder, ShieldCheck } from 'lucide-react';
import type { UsageScanResult } from '../../shared/usageTypes';

interface SettingsViewProps {
  result: UsageScanResult;
}

const MAX_VISIBLE_WARNINGS = 8;

const SettingsView: React.FC<SettingsViewProps> = ({ result }) => (
  <section className="settings-grid">
    <article className="panel">
      <div className="settings-item">
        <Folder size={18} />
        <div>
          <p className="eyebrow">Data path</p>
          <h3>Codex Sessions</h3>
          <code>{result.sessionsDir}</code>
        </div>
      </div>
    </article>

    <article className="panel">
      <div className="settings-item">
        <ShieldCheck size={18} />
        <div>
          <p className="eyebrow">Privacy</p>
          <h3>Local Read-only</h3>
          <p>The app reads local JSONL files only. It does not edit Codex data or upload usage.</p>
        </div>
      </div>
    </article>

    <article className="panel">
      <p className="eyebrow">Cost estimate</p>
      <h3>Token-based Estimate</h3>
      <p>
        Cost is derived from token totals for display only. Raw token statistics stay unchanged.
      </p>
    </article>

    <article className="panel">
      <p className="eyebrow">Warnings</p>
      <h3>{result.warnings.length} scan warnings</h3>
      <div className="warning-list">
        {result.warnings.slice(0, MAX_VISIBLE_WARNINGS).map((warning) => (
          <p key={`${warning.sourceFile}-${warning.line}-${warning.message}`}>
            {warning.sourceFile ? `${warning.sourceFile}: ` : ''}
            {warning.message}
          </p>
        ))}
        {result.warnings.length === 0 ? <p>No parser warnings found.</p> : null}
      </div>
    </article>
  </section>
);

export default SettingsView;
