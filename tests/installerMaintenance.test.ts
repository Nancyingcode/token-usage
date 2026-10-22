/**
 * @file 安装器维护状态的原生执行测试
 * @description 在临时目录与唯一 HKCU 测试键中执行实际 NSIS 维护函数，不访问真实产品登记。
 */
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const findCachedFile = (name: string): string => {
  const roots = [
    process.env.ELECTRON_BUILDER_CACHE,
    join(process.env.LOCALAPPDATA ?? '', 'electron-builder', 'Cache'),
    join(homedir(), 'AppData', 'Local', 'electron-builder', 'Cache'),
  ].filter((directory): directory is string => Boolean(directory));
  const search = (directory: string, depth: number): string | undefined => {
    if (!existsSync(directory)) {
      return undefined;
    }
    const candidate = join(directory, name);
    if (existsSync(candidate)) {
      return candidate;
    }
    if (depth === 0) {
      return undefined;
    }
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name !== 'x86-ansi') {
        const found = search(join(directory, entry.name), depth - 1);
        if (found) {
          return found;
        }
      }
    }
    return undefined;
  };
  const found = roots.map((directory) => search(directory, 5)).find(Boolean);
  if (!found) {
    throw new Error(`NSIS 工具缓存缺少 ${name}，请先运行 Windows 打包命令准备工具。`);
  }
  return found;
};

const readResults = (file: string): Record<string, string> =>
  Object.fromEntries(
    readFileSync(file, 'utf8')
      .trim()
      .split(/\r?\n/)
      .map((line) => {
        const separator = line.indexOf('=');
        return [line.slice(0, separator), line.slice(separator + 1)];
      })
  );

describe.skipIf(process.platform !== 'win32')('native NSIS installer maintenance', () => {
  it('detects installations and validates the actual maintenance boundary', () => {
    const directory = mkdtempSync(join(tmpdir(), 'codex-installer-maintenance-'));
    try {
      const executable = join(directory, 'maintenance.exe');
      const resultFile = join(directory, 'results.txt');
      const testId = randomUUID();
      const pluginFile = findCachedFile('UAC.dll');
      const pluginDirectory = resolve(pluginFile, '..');
      execFileSync(
        findCachedFile('makensis.exe'),
        [
          '/V2',
          '/WX',
          '/INPUTCHARSET',
          'UTF8',
          `/DOUTPUT_EXE=${executable}`,
          `/DRESULT_FILE=${resultFile}`,
          `/DTEST_DIRECTORY=${directory}`,
          `/DTEST_KEY=Software\\CodexInstallerTests\\${testId}`,
          `/DTEST_ID=${testId}`,
          `/DPROJECT_ROOT=${process.cwd()}`,
          `/DPLUGIN_DIRECTORY=${pluginDirectory}`,
          resolve('tests/fixtures/installer-maintenance.nsi'),
        ],
        { windowsHide: true, timeout: 30_000 }
      );
      execFileSync(executable, [], { windowsHide: true, timeout: 30_000 });
      expect(readResults(resultFile)).toMatchObject({
        fresh: 'fresh:',
        repairMissingFiles: 'repair:',
        update: 'update:',
        downgrade: 'blocked:downgrade',
        invalidVersion: 'blocked:invalid-version',
        orphanRegistration: 'blocked:registration',
        unsafeDirectory: 'blocked:path',
        wrongUninstaller: 'blocked:registration',
        scopeConflict: 'blocked:scope',
        userScopeSystemDirectory: 'blocked:scope',
        machineScopeUserDirectory: 'blocked:scope',
        machineUpdate: 'update:',
        directoryChanged: 'blocked:changed',
        versionChanged: 'blocked:changed',
        scopeChanged: 'blocked:scope',
        targetChanged: 'blocked:path',
        unsafeShortcutChange: 'blocked:registration',
        conflictAfterInit: 'blocked:scope',
        preserveUiChoice: '1',
        preserveDesktopChoice: '0',
        repairMenu: '1',
        updateMenu: '0',
        readyRepair: 'repair:',
        afterInstall: '1:0:0',
        failedShortcutDelete: 'blocked:write',
        'exit-invalid-version': '17001:preserved',
        'exit-downgrade': '17002:preserved',
        'exit-registration': '17003:preserved',
        'exit-path': '17004:preserved',
        'exit-scope': '17005:preserved',
        'exit-parameters': '17006:preserved',
        'exit-changed': '17007:preserved',
        'exit-write': '17008:preserved',
        'exit-unknown': '1603:preserved',
      });

      for (const parameter of ['--delete-app-data', '/allusers', `/D=${directory}\\Different`]) {
        execFileSync(executable, ['/parameters-only', parameter], {
          windowsHide: true,
          timeout: 30_000,
        });
        expect(readResults(resultFile), parameter).toEqual({
          parametersOnly: 'blocked:parameters',
        });
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 90_000);
});
