/**
 * @file 安装器策略的原生执行测试
 * @description 编译实际 NSIS 策略并在临时目录执行，不通过 JavaScript 重写版本或路径判断。
 */
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const findMakeNsis = (): string => {
  const cacheRoots = [
    process.env.ELECTRON_BUILDER_CACHE,
    join(process.env.LOCALAPPDATA ?? '', 'electron-builder', 'Cache'),
    join(homedir(), 'AppData', 'Local', 'electron-builder', 'Cache'),
  ].filter((directory): directory is string => Boolean(directory));
  const search = (directory: string, depth: number): string | undefined => {
    const executable = join(directory, 'makensis.exe');
    if (existsSync(executable)) {
      return executable;
    }
    if (depth === 0 || !existsSync(directory)) {
      return undefined;
    }
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const found = search(join(directory, entry.name), depth - 1);
        if (found) {
          return found;
        }
      }
    }
    return undefined;
  };
  const executable = cacheRoots.map((directory) => search(directory, 3)).find(Boolean);
  if (!executable) {
    throw new Error(
      'NSIS 编译器不可用；先运行项目 Windows 打包命令以准备 electron-builder 工具缓存。'
    );
  }
  return executable;
};

const nsisString = (value: string): string =>
  `"${value.replaceAll('$', '$$').replaceAll('"', '$\\"')}"`;

describe.skipIf(process.platform !== 'win32')('native NSIS installer policy', () => {
  it('compares strict stable versions and rejects unsafe installation paths', () => {
    const directory = mkdtempSync(join(tmpdir(), 'codex-installer-policy-'));
    try {
      const junctionTarget = join(directory, 'junction-target');
      const junctionPath = join(directory, 'junction');
      mkdirSync(junctionTarget);
      symlinkSync(junctionTarget, junctionPath, 'junction');
      const fileTarget = join(directory, 'file-target');
      writeFileSync(fileTarget, 'fixture', 'utf8');
      const tildeDirectory = join(directory, 'legitimate~directory');
      mkdirSync(tildeDirectory);
      const versionCases = [
        ['same', '0.1.0', '0.1.0', 'equal'],
        ['minor', '0.9.0', '0.10.0', 'newer'],
        ['major', '9.99.99', '10.0.0', 'newer'],
        ['patch', '1.0.9', '1.0.10', 'newer'],
        ['downgrade', '2.0.0', '1.99.99', 'older'],
        ['zero', '0.0.0', '0.0.1', 'newer'],
        ['huge', '1.99999999999999999999.0', '1.100000000000000000000.0', 'newer'],
        ['hugeEqual', '99999999999999999999.0.0', '99999999999999999999.0.0', 'equal'],
        ['empty', '', '1.0.0', 'invalid'],
        ['leadingZero', '01.0.0', '1.0.0', 'invalid'],
        ['twoParts', '1.0', '1.0.0', 'invalid'],
        ['fourParts', '1.0.0.0', '1.0.0', 'invalid'],
        ['preRelease', '1.0.0-beta.1', '1.0.0', 'invalid'],
        ['buildMetadata', '1.0.0', '1.0.0+build', 'invalid'],
        ['invalidDigit', '1.x.0', '1.0.0', 'invalid'],
        ['negative', '1.-1.0', '1.0.0', 'invalid'],
        ['whitespace', ' 1.0.0', '1.0.0', 'invalid'],
        ['trailingDot', '1.0.0.', '1.0.0', 'invalid'],
      ];
      const pathCases = [
        ['normal', join(directory, 'program'), 'safe'],
        ['existing', junctionTarget, 'safe'],
        ['space', join(directory, 'Program Files', 'Application'), 'safe'],
        ['tildeDirectory', tildeDirectory, 'safe'],
        ['tildeChild', join(tildeDirectory, 'uncreated'), 'safe'],
        ['junction', join(junctionPath, 'program'), 'unsafe'],
        ['file', fileTarget, 'unsafe'],
        ['root', 'C:\\', 'unsafe'],
        ['relative', 'Applications\\CodexTokenUsage', 'unsafe'],
        ['unc', '\\\\server\\share\\App', 'unsafe'],
        ['device', '\\\\?\\C:\\Applications\\App', 'unsafe'],
        ['parent', `${join(directory, 'App')}\\..\\Other`, 'unsafe'],
        ['ads', join(directory, 'App:stream'), 'unsafe'],
        ['quote', join(directory, 'App"Name'), 'unsafe'],
        ['apostrophe', join(directory, "App'Name"), 'unsafe'],
        ['trailingDotPath', join(directory, 'App.'), 'unsafe'],
        ['trailingSpace', join(directory, 'App '), 'unsafe'],
        ['reservedName', join(directory, 'CON.txt'), 'unsafe'],
        ['reservedPort', join(directory, 'COM1'), 'unsafe'],
        ['windows', process.env.SystemRoot ?? 'C:\\Windows', 'unsafe'],
        ['windowsChild', join(process.env.SystemRoot ?? 'C:\\Windows', 'App'), 'unsafe'],
        ['profile', process.env.USERPROFILE ?? 'C:\\Users\\test', 'unsafe'],
        ['roaming', process.env.APPDATA ?? 'C:\\Users\\test\\AppData\\Roaming', 'unsafe'],
        ['local', process.env.LOCALAPPDATA ?? 'C:\\Users\\test\\AppData\\Local', 'unsafe'],
        ['programFiles', process.env.ProgramFiles ?? 'C:\\Program Files', 'unsafe'],
      ];
      const missingPathCases = [
        ['fileMissing', '2', 'safe'],
        ['pathMissing', '3', 'safe'],
        ['accessDenied', '5', 'unsafe'],
        ['sharingViolation', '32', 'unsafe'],
        ['unknownAttributeError', '0', 'unsafe'],
      ];
      const ancestorCases = [
        ['ancestorChild', 'C:\\App', 'C:\\App\\Child', '1'],
        ['ancestorCase', 'c:\\app', 'C:\\APP\\child', '1'],
        ['ancestorEqual', 'C:\\App', 'c:\\APP', '1'],
        ['ancestorBoundary', 'C:\\App', 'C:\\Application', '0'],
        ['ancestorSibling', 'C:\\App', 'C:\\Other', '0'],
        ['ancestorEmpty', '', 'C:\\App', '0'],
      ];
      const input = [
        ...versionCases.map(([name, installed, packageVersion]) =>
          ['!insertmacro VersionCase', name, installed, packageVersion]
            .map((value, index) => (index === 0 ? value : nsisString(value)))
            .join(' ')
        ),
        ...pathCases.map(([name, path]) =>
          ['!insertmacro PathCase', name, path]
            .map((value, index) => (index === 0 ? value : nsisString(value)))
            .join(' ')
        ),
        ...missingPathCases.map(([name, errorCode]) =>
          ['!insertmacro MissingPathCase', name, errorCode]
            .map((value, index) => (index === 0 ? value : nsisString(value)))
            .join(' ')
        ),
        ...ancestorCases.map(([name, ancestor, path]) =>
          ['!insertmacro AncestorCase', name, ancestor, path]
            .map((value, index) => (index === 0 ? value : nsisString(value)))
            .join(' ')
        ),
        `!insertmacro ShortPathCase "shortProgramFiles" ${nsisString(process.env.ProgramFiles ?? 'C:\\Program Files')}`,
      ].join('\n');
      const casesFile = join(directory, 'cases.nsh');
      const executable = join(directory, 'policy.exe');
      const resultFile = join(directory, 'result.txt');
      writeFileSync(casesFile, input, 'utf8');
      execFileSync(
        findMakeNsis(),
        [
          '/V2',
          '/WX',
          '/INPUTCHARSET',
          'UTF8',
          `/DOUTPUT_EXE=${executable}`,
          `/DRESULT_FILE=${resultFile}`,
          `/DCASES_FILE=${casesFile}`,
          `/DPOLICY_FILE=${resolve('build/installer-policy.nsh')}`,
          resolve('tests/fixtures/installer-policy.nsi'),
        ],
        { windowsHide: true, timeout: 30_000 }
      );
      execFileSync(executable, [], { windowsHide: true, timeout: 30_000 });
      const results = Object.fromEntries(
        readFileSync(resultFile, 'utf8')
          .trim()
          .split(/\r?\n/)
          .map((line) => line.split('='))
      );
      for (const [name, , , expected] of versionCases) {
        expect(results[name], name).toBe(expected);
      }
      for (const [name, , expected] of pathCases) {
        expect(results[name], name).toBe(expected);
      }
      for (const [name, , expected] of missingPathCases) {
        expect(results[name], name).toBe(expected);
      }
      for (const [name, , , expected] of ancestorCases) {
        expect(results[name], name).toBe(expected);
      }
      if (results.shortProgramFiles === 'unavailable') {
        console.warn('当前 Windows 未提供 Program Files 的 8.3 别名，短路径真实场景未执行。');
      } else {
        expect(results.shortProgramFiles, 'shortProgramFiles').toBe('unsafe');
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 90_000);
});
