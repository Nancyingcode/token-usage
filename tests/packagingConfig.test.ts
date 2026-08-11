import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readWorkspaceFile = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8').replace(/\r\n/g, '\n');

const readWorkspaceBytes = (relativePath: string): Buffer =>
  readFileSync(resolve(process.cwd(), relativePath));

describe('Windows packaging configuration', () => {
  it('pins the product identity and x64 NSIS artifact contract', () => {
    const config = readWorkspaceFile('electron-builder.yml');

    expect(config).toMatch(/^appId: io\.github\.nancyingcode\.tokenusage$/m);
    expect(config).toMatch(/^productName: Codex Token Usage$/m);
    expect(config).toMatch(/^\s+executableName: CodexTokenUsage$/m);
    expect(config).toMatch(/^\s+- target: nsis$/m);
    expect(config).toMatch(/^\s+arch:$/m);
    expect(config).toMatch(/^\s+- x64$/m);
    expect(config).toContain('Codex-Token-Usage-Setup-${version}-${arch}.${ext}');
  });

  it('uses an assisted bilingual installer with stable upgrade identity', () => {
    const config = readWorkspaceFile('electron-builder.yml');

    expect(config).toMatch(/^\s+oneClick: false$/m);
    expect(config).toMatch(/^\s+perMachine: false$/m);
    expect(config).toMatch(/^\s+selectPerMachineByDefault: false$/m);
    expect(config).toMatch(/^\s+allowToChangeInstallationDirectory: true$/m);
    expect(config).toMatch(/^\s+createDesktopShortcut: true$/m);
    expect(config).toMatch(/^\s+createStartMenuShortcut: true$/m);
    expect(config).toMatch(/^\s+runAfterFinish: true$/m);
    expect(config).toMatch(/^\s+displayLanguageSelector: false$/m);
    expect(config).toMatch(/^\s+- en_US$/m);
    expect(config).toMatch(/^\s+- zh_CN$/m);
    expect(config).toMatch(/^\s+guid: '[{][0-9A-F]{8}(?:-[0-9A-F]{4}){3}-[0-9A-F]{12}[}]'$/m);
  });

  it('builds with the controlled config instead of host defaults', () => {
    const packageSource = readWorkspaceFile('package.json');

    expect(packageSource).toContain(
      '"build:win": "npm run build && electron-builder --config electron-builder.yml --win nsis --x64"'
    );
  });

  it('does not grant the installer access to Codex session data', () => {
    const packagingSources = [
      readWorkspaceFile('electron-builder.yml'),
      readWorkspaceFile('build/installer.nsh'),
    ]
      .join('\n')
      .toLowerCase();

    expect(packagingSources).not.toContain('.codex');
    expect(packagingSources).not.toContain('sessions');
    expect(packagingSources).not.toContain('session_index.jsonl');
  });

  it('uses valid branded assets and a limited NSIS include', () => {
    const icon = readWorkspaceBytes('build/icon.ico');
    const header = readWorkspaceBytes('build/installer-header.bmp');
    const sidebar = readWorkspaceBytes('build/installer-sidebar.bmp');
    const include = readWorkspaceFile('build/installer.nsh');

    expect([...icon.subarray(0, 4)]).toEqual([0, 0, 1, 0]);
    expect(header.subarray(0, 2).toString('ascii')).toBe('BM');
    expect(sidebar.subarray(0, 2).toString('ascii')).toBe('BM');
    expect(icon.length).toBeGreaterThan(1_024);
    expect(header.length).toBeGreaterThan(1_024);
    expect(sidebar.length).toBeGreaterThan(1_024);
    expect(include).toContain('!macro customWelcomePage');
    expect(include).toContain('!macro customPageAfterChangeDir');
    expect(include).toContain('!macro customInstall');
    expect(include).not.toMatch(/^\s*Section(?:\s|$)/m);
    expect(include).not.toMatch(/^\s*OutFile(?:\s|$)/m);
    expect(include).not.toMatch(/^\s*InstallDir(?:\s|$)/m);
  });
});
