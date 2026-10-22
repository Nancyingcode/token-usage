import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readWorkspaceFile = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8').replace(/\r\n/g, '\n');

const readWorkspaceBytes = (relativePath: string): Buffer =>
  readFileSync(resolve(process.cwd(), relativePath));

const readInstallerIncludes = (): string[] =>
  readdirSync(resolve(process.cwd(), 'build'))
    .filter((filename) => filename.endsWith('.nsh'))
    .sort()
    .map((filename) => readWorkspaceFile(`build/${filename}`));

describe('Windows packaging configuration', () => {
  it('packages only production output, excluding isolated previews and test scratch data', () => {
    const config = readWorkspaceFile('electron-builder.yml');
    expect(config).not.toContain('  - out/**/*');
    expect(config).toContain('  - out/main/**/*');
    expect(config).toContain('  - out/preload/**/*');
    expect(config).toContain('  - out/renderer/**/*');
  });

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
    expect(config).toMatch(/^\s+allowToChangeInstallationDirectory: false$/m);
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
      '"build:win": "npm run build && electron-builder --config electron-builder.yml --win nsis --x64 --publish never"'
    );
  });

  it('prepares Electron binaries and Git hooks for a fresh checkout', () => {
    const packageSource = readWorkspaceFile('package.json');
    const prepareSource = readWorkspaceFile('scripts/prepare.cjs');

    expect(packageSource).toContain('"prepare": "node scripts/prepare.cjs"');
    expect(prepareSource).toContain("require('electron')");
    expect(prepareSource).toContain("require('./prepare-husky.cjs')");
  });

  it('does not grant the installer access to Codex session data', () => {
    const packagingSources = [readWorkspaceFile('electron-builder.yml'), ...readInstallerIncludes()]
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
  });

  it('adds maintenance through includes while preserving the default installer entry point', () => {
    const config = readWorkspaceFile('electron-builder.yml');
    const include = readWorkspaceFile('build/installer.nsh');
    const installerSources = readInstallerIncludes().join('\n');
    const sectionDeclarations = installerSources.match(/^\s*Section(?:\s|$)[^\n]*/gm) ?? [];
    const customHeader = include.match(/!macro customHeader\b([\s\S]*?)!macroend/)?.[1] ?? '';

    expect(config).toMatch(/^\s+include: build\/installer\.nsh$/m);
    expect(config).not.toMatch(/^\s+script:/m);
    expect(existsSync(resolve(process.cwd(), 'build/installer.nsi'))).toBe(false);
    expect(include).toContain('!include "installer-policy.nsh"');
    expect(include).toContain('!include "installer-maintenance.nsh"');
    expect(include).toContain('!include "installer-messages.nsh"');
    expect(sectionDeclarations).toHaveLength(1);
    expect(sectionDeclarations[0]?.trim()).toMatch(
      /^Section\s+(?:"-CodexPreflight"|-CodexPreflight)(?:\s+[A-Z_\d]+)?$/i
    );
    expect(customHeader).toMatch(/^\s*Section\s+(?:"-CodexPreflight"|-CodexPreflight)/m);
    expect(customHeader).toMatch(/^\s*SectionIn RO$/m);
    expect(installerSources).not.toMatch(/^\s*OutFile(?:\s|$)/m);
    expect(installerSources).not.toMatch(/^\s*InstallDir(?:\s|$)/m);
  });

  it('keeps the standard directory page in the local page extension', () => {
    const include = readWorkspaceFile('build/installer.nsh');
    const pageExtension =
      include.match(/!macro customPageAfterChangeDir\b([\s\S]*?)!macroend/)?.[1] ?? '';

    expect(pageExtension).toContain('!insertmacro MUI_PAGE_DIRECTORY');
    expect(pageExtension).toMatch(/!define MUI_PAGE_CUSTOMFUNCTION_PRE\s+\w+/);
  });

  it('fits custom controls within the standard NSIS page height', () => {
    const pageHeightInDialogUnits = 140;
    const controlLines = readWorkspaceFile('build/installer.nsh')
      .split('\n')
      .filter((line) => line.trimStart().startsWith('${NSD_Create'));

    expect(controlLines.length).toBeGreaterThan(0);
    for (const line of controlLines) {
      const [, , top = '', , height = ''] = line.trim().split(/\s+/);

      // 对话框单位随字体与 DPI 缩放；此边界检查不能替代实际高 DPI 下的文本裁切验收。
      expect(top, line).toMatch(/^(?:0|\d+u)$/);
      expect(height, line).toMatch(/^\d+u$/);
      expect(Number.parseInt(top, 10) + Number.parseInt(height, 10), line).toBeLessThanOrEqual(
        pageHeightInDialogUnits
      );
    }
  });

  it('provides matching nonempty English and Simplified Chinese installer messages', () => {
    const messages = readWorkspaceFile('build/installer-messages.nsh');
    const declarations = [...messages.matchAll(/^LangString\s+(\w+)\s+(1033|2052)\s+"(.+)"$/gm)];
    const englishKeys = declarations
      .filter(([, , language]) => language === '1033')
      .map(([, key]) => key)
      .sort();
    const chineseKeys = declarations
      .filter(([, , language]) => language === '2052')
      .map(([, key]) => key)
      .sort();

    expect(englishKeys.length).toBeGreaterThan(0);
    expect(chineseKeys).toEqual(englishKeys);
    expect(new Set(englishKeys).size).toBe(englishKeys.length);
    expect(new Set(chineseKeys).size).toBe(chineseKeys.length);
  });
});
