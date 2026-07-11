import { Folder, ShieldCheck } from "lucide-react";
import type { UsageScanResult } from "../../shared/usageTypes";

interface SettingsViewProps {
  result: UsageScanResult;
}

export default function SettingsView({ result }: SettingsViewProps) {
  return (
    <section className="settings-grid">
      <article className="panel">
        <div className="settings-item">
          <Folder size={20} />
          <div>
            <p className="eyebrow">Data path</p>
            <h3>Codex 会话目录</h3>
            <code>{result.sessionsDir}</code>
          </div>
        </div>
      </article>

      <article className="panel">
        <div className="settings-item">
          <ShieldCheck size={20} />
          <div>
            <p className="eyebrow">Privacy</p>
            <h3>本地只读</h3>
            <p>应用只读取本机 JSONL 会话文件，不编辑 Codex 数据，不上传统计结果。</p>
          </div>
        </div>
      </article>

      <article className="panel">
        <p className="eyebrow">Cost estimate</p>
        <h3>费用估算</h3>
        <p>第一版以 Token 数量为准。模型价格表加入后，这里会提供可关闭的估算开关。</p>
      </article>

      <article className="panel">
        <p className="eyebrow">Warnings</p>
        <h3>{result.warnings.length} 条扫描提示</h3>
        <div className="warning-list">
          {result.warnings.slice(0, 8).map((warning, index) => (
            <p key={`${warning.sourceFile}-${warning.line}-${index}`}>
              {warning.sourceFile ? `${warning.sourceFile}: ` : ""}
              {warning.message}
            </p>
          ))}
          {result.warnings.length === 0 ? <p>没有发现解析警告。</p> : null}
        </div>
      </article>
    </section>
  );
}
