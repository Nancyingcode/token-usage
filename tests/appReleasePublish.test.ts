/**
 * @file 正式 Release 发布门禁
 * @description 使用模拟 GitHub 命令验证只有完整且验签通过的现有草稿才能发布。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { publishDraftRelease } = require('../scripts/release-publish.cjs') as {
  publishDraftRelease: (options: {
    version: string;
    directory: string;
    environment: Record<string, string>;
    run: (command: string, arguments_: string[]) => string;
    verifyArtifacts: (options: unknown) => string[];
  }) => void;
};

const repository = 'Nancyingcode/token-usage';
const version = '0.1.1';
const tag = `v${version}`;
const commit = 'a'.repeat(40);
const artifactNames = [
  `Codex-Token-Usage-Setup-${version}-x64.exe`,
  `Codex-Token-Usage-Setup-${version}-x64.exe.blockmap`,
  'latest.yml',
];
const draftRelease = {
  id: 42,
  tag_name: tag,
  draft: true,
  prerelease: false,
  assets: artifactNames.map((name) => ({ name, state: 'uploaded', size: 100 })),
};
const environment = () => ({
  GITHUB_ACTIONS: 'true',
  GITHUB_EVENT_NAME: 'workflow_dispatch',
  GITHUB_REPOSITORY: repository,
  APP_RELEASE_TAG: tag,
  APP_RELEASE_COMMIT: commit,
  WINDOWS_PUBLISHER_NAME: 'Example Publisher',
  GH_TOKEN: 'test-token-never-sent',
});

const createRun = (release: unknown = draftRelease) =>
  vi.fn((command: string, arguments_: string[]) => {
    expect(command).toBe('gh');
    if (arguments_.includes('PATCH')) {
      return JSON.stringify({ id: 42, draft: false });
    }
    if (arguments_[0] === 'release' && arguments_[1] === 'download') {
      return '';
    }
    if (arguments_[0] === 'api' && arguments_[1].includes('/releases/tags/')) {
      return JSON.stringify(release);
    }
    if (arguments_[0] === 'api') {
      return JSON.stringify({ object: { type: 'commit', sha: commit } });
    }
    throw new Error(`Unexpected command: ${arguments_.join(' ')}`);
  });

const hasMutation = (run: ReturnType<typeof createRun>) =>
  run.mock.calls.some(([, arguments_]) => arguments_.includes('PATCH'));
const hasDownload = (run: ReturnType<typeof createRun>) =>
  run.mock.calls.some(([, arguments_]) => arguments_[0] === 'release');

describe('signed draft publication', () => {
  it('downloads and verifies the exact draft assets before publishing its id', () => {
    const run = createRun();
    const verifyArtifacts = vi.fn().mockReturnValue(artifactNames);
    publishDraftRelease({
      version,
      directory: 'downloads',
      environment: environment(),
      run,
      verifyArtifacts,
    });
    expect(run).toHaveBeenCalledWith('gh', [
      'release',
      'download',
      tag,
      '--repo',
      repository,
      '--dir',
      'downloads',
      '--pattern',
      artifactNames[0],
      '--pattern',
      artifactNames[1],
      '--pattern',
      artifactNames[2],
    ]);
    expect(verifyArtifacts).toHaveBeenCalledWith({
      version,
      directory: 'downloads',
      publisherName: 'Example Publisher',
      verifyUnpacked: false,
    });
    const publishArgs = run.mock.calls.find(([, arguments_]) => arguments_.includes('PATCH'))?.[1];
    expect(publishArgs).toEqual(
      expect.arrayContaining([
        'api',
        '--method',
        'PATCH',
        `repos/${repository}/releases/42`,
        '-F',
        'draft=false',
        '-F',
        'prerelease=false',
      ])
    );
  });

  it.each([{ draft: false }, { prerelease: true }, { tag_name: 'v0.1.2' }])(
    'refuses a release that is not the matching stable draft: %j',
    (override) => {
      const run = createRun({ ...draftRelease, ...override });
      expect(() =>
        publishDraftRelease({
          version,
          directory: 'downloads',
          environment: environment(),
          run,
          verifyArtifacts: () => [],
        })
      ).toThrow();
      expect(hasDownload(run)).toBe(false);
      expect(hasMutation(run)).toBe(false);
    }
  );

  it.each([
    draftRelease.assets.slice(1),
    [...draftRelease.assets, { name: 'unexpected.exe', state: 'uploaded', size: 1 }],
    draftRelease.assets.map((asset, index) =>
      index === 0 ? { ...asset, state: 'starter' } : asset
    ),
  ])('refuses missing, additional or unfinished assets', (assets) => {
    const run = createRun({ ...draftRelease, assets });
    expect(() =>
      publishDraftRelease({
        version,
        directory: 'downloads',
        environment: environment(),
        run,
        verifyArtifacts: () => [],
      })
    ).toThrow();
    expect(hasDownload(run)).toBe(false);
    expect(hasMutation(run)).toBe(false);
  });

  it('refuses a moved tag before downloading or publishing', () => {
    const run = createRun();
    run.mockImplementationOnce(() =>
      JSON.stringify({ object: { type: 'commit', sha: 'b'.repeat(40) } })
    );
    expect(() =>
      publishDraftRelease({
        version,
        directory: 'downloads',
        environment: environment(),
        run,
        verifyArtifacts: () => [],
      })
    ).toThrow(/commit/);
    expect(hasDownload(run)).toBe(false);
    expect(hasMutation(run)).toBe(false);
  });

  it('does not publish when downloaded artifact verification fails', () => {
    const run = createRun();
    expect(() =>
      publishDraftRelease({
        version,
        directory: 'downloads',
        environment: environment(),
        run,
        verifyArtifacts: () => {
          throw new Error('invalid signature');
        },
      })
    ).toThrow('invalid signature');
    expect(hasMutation(run)).toBe(false);
  });

  it.each(['GITHUB_ACTIONS', 'GITHUB_EVENT_NAME', 'GITHUB_REPOSITORY', 'GH_TOKEN'])(
    'requires the authorized CI environment field %s',
    (field) => {
      const run = createRun();
      expect(() =>
        publishDraftRelease({
          version,
          directory: 'downloads',
          environment: { ...environment(), [field]: '' },
          run,
          verifyArtifacts: () => [],
        })
      ).toThrow();
      expect(run).not.toHaveBeenCalled();
    }
  );

  it('uses a separate manual Windows workflow without signing secrets', () => {
    const workflow = readFileSync(resolve('.github/workflows/release-publish.yml'), 'utf8');
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).not.toMatch(/^\s+(?:push|pull_request|schedule):/m);
    expect(workflow).toContain('windows-latest');
    expect(workflow).toContain('node scripts/release-publish.cjs');
    expect(workflow).toMatch(/refs\/tags\/\$\{\{ inputs\.tag \}\}/u);
    expect(workflow).toContain('persist-credentials: false');
    expect(workflow).toMatch(/GH_TOKEN: \$\{\{ secrets\.GITHUB_TOKEN \}\}/u);
    expect(workflow).not.toContain('CSC_LINK');
    expect(workflow).not.toContain('CSC_KEY_PASSWORD');
  });
});
