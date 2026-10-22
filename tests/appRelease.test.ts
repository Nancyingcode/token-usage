/**
 * @file 稳定版草稿发布门禁
 * @description 使用隔离产物与模拟 GitHub 命令验证发布边界，不调用真实发布服务。
 */
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
interface ReleaseInputs {
  version: string;
  tag: string;
  commit: string;
  publisherName: string;
}
const { validateReleaseInputs, createReleaseConfiguration, verifyReleaseArtifacts } =
  require('../scripts/release-utils.cjs') as {
    validateReleaseInputs: (version: string, environment: Record<string, string>) => ReleaseInputs;
    createReleaseConfiguration: (environment: Record<string, string>) => Record<string, unknown>;
    verifyReleaseArtifacts: (options: {
      version: string;
      directory: string;
      publisherName: string;
      verifySignature: (path: string, publisher: string) => void;
    }) => string[];
  };
const { createDraftRelease } = require('../scripts/release-draft.cjs') as {
  createDraftRelease: (options: {
    version: string;
    directory: string;
    environment: Record<string, string>;
    run: (command: string, arguments_: string[]) => string;
    verifyArtifacts: (options: unknown) => string[];
  }) => void;
};

const commit = 'a'.repeat(40);
const environment = () => ({
  GITHUB_ACTIONS: 'true',
  GITHUB_EVENT_NAME: 'workflow_dispatch',
  GITHUB_REPOSITORY: 'Nancyingcode/token-usage',
  APP_RELEASE_TAG: 'v0.1.1',
  APP_RELEASE_COMMIT: commit,
  WINDOWS_PUBLISHER_NAME: 'Example Publisher',
  GH_TOKEN: 'test-token-never-sent',
  CSC_LINK: 'test-certificate',
  CSC_KEY_PASSWORD: 'test-password',
});

const makeArtifacts = () => {
  const directory = mkdtempSync(join(tmpdir(), 'codex-release-'));
  const installerName = 'Codex-Token-Usage-Setup-0.1.1-x64.exe';
  const installer = Buffer.from('installer-fixture');
  writeFileSync(join(directory, installerName), installer);
  writeFileSync(
    join(directory, `${installerName}.blockmap`),
    gzipSync(
      JSON.stringify({
        version: '2',
        files: [{ offset: 0, checksums: ['fixture'], sizes: [installer.length] }],
      })
    )
  );
  const sha512 = createHash('sha512').update(installer).digest('base64');
  const metadata = {
    version: '0.1.1',
    path: installerName,
    sha512,
    files: [{ url: installerName, sha512, size: installer.length }],
  };
  writeFileSync(join(directory, 'latest.yml'), JSON.stringify(metadata));
  mkdirSync(join(directory, 'win-unpacked', 'resources'), { recursive: true });
  writeFileSync(join(directory, 'win-unpacked', 'CodexTokenUsage.exe'), 'application-fixture');
  writeFileSync(join(directory, 'win-unpacked', 'resources', 'elevate.exe'), 'elevate-fixture');
  return { directory, installerName, metadata };
};

describe('stable release configuration', () => {
  it('requires a stable package version, matching tag and exact commit', () => {
    expect(validateReleaseInputs('0.1.1', environment())).toEqual({
      version: '0.1.1',
      tag: 'v0.1.1',
      commit,
      publisherName: 'Example Publisher',
    });
    expect(() => validateReleaseInputs('0.1.1-beta.1', environment())).toThrow();
    expect(() => validateReleaseInputs('01.1.1', environment())).toThrow();
    expect(() => validateReleaseInputs('0.1.1\n', environment())).toThrow();
    expect(() => validateReleaseInputs('0.1.2', environment())).toThrow();
    expect(() =>
      validateReleaseInputs('0.1.1', { ...environment(), APP_RELEASE_COMMIT: 'main' })
    ).toThrow();
    expect(() =>
      validateReleaseInputs('0.1.1', { ...environment(), WINDOWS_PUBLISHER_NAME: ' ' })
    ).toThrow();
  });

  it('requires signing credentials and inherits the production NSIS identity', () => {
    const config = createReleaseConfiguration(environment());
    expect(config).toMatchObject({
      extends: './electron-builder.yml',
      forceCodeSigning: true,
      win: {
        verifyUpdateCodeSignature: true,
        signtoolOptions: { publisherName: ['Example Publisher'] },
      },
    });
    for (const key of ['WINDOWS_PUBLISHER_NAME', 'CSC_LINK', 'CSC_KEY_PASSWORD']) {
      expect(() => createReleaseConfiguration({ ...environment(), [key]: '' })).toThrow();
    }
    expect(JSON.stringify(config)).not.toContain('test-password');
    expect(JSON.stringify(config)).not.toContain('test-token');
  });
});

describe('release artifact verification', () => {
  it('checks all executable signatures and metadata against the exact installer', () => {
    const fixture = makeArtifacts();
    try {
      const verifySignature = vi.fn();
      const files = verifyReleaseArtifacts({
        version: '0.1.1',
        directory: fixture.directory,
        publisherName: 'Example Publisher',
        verifySignature,
      });
      expect(files).toEqual([
        join(fixture.directory, fixture.installerName),
        join(fixture.directory, `${fixture.installerName}.blockmap`),
        join(fixture.directory, 'latest.yml'),
      ]);
      expect(verifySignature).toHaveBeenCalledTimes(3);
      expect(
        verifySignature.mock.calls.every(([, publisher]) => publisher === 'Example Publisher')
      ).toBe(true);
    } finally {
      rmSync(fixture.directory, { recursive: true, force: true });
    }
  });

  it.each(['hash', 'version', 'filename', 'blockmap', 'signature'])(
    'refuses %s mismatch before publication',
    (scenario) => {
      const fixture = makeArtifacts();
      try {
        if (scenario === 'hash') {
          fixture.metadata.files[0].sha512 = 'wrong';
        }
        if (scenario === 'version') {
          fixture.metadata.version = '0.1.2';
        }
        if (scenario === 'filename') {
          fixture.metadata.files[0].url = '../elsewhere.exe';
        }
        if (scenario === 'blockmap') {
          writeFileSync(join(fixture.directory, `${fixture.installerName}.blockmap`), 'broken');
        }
        writeFileSync(join(fixture.directory, 'latest.yml'), JSON.stringify(fixture.metadata));
        const verifySignature = vi.fn(() => {
          if (scenario === 'signature') {
            throw new Error('invalid signature');
          }
        });
        expect(() =>
          verifyReleaseArtifacts({
            version: '0.1.1',
            directory: fixture.directory,
            publisherName: 'Example Publisher',
            verifySignature,
          })
        ).toThrow();
      } finally {
        rmSync(fixture.directory, { recursive: true, force: true });
      }
    }
  );
});

describe('draft-only publication', () => {
  const createRun = (releases: unknown[] = []) =>
    vi.fn((command: string, arguments_: string[]) => {
      expect(command).toBe('gh');
      if (arguments_[0] === 'api' && arguments_.includes('--paginate')) {
        return JSON.stringify([releases]);
      }
      if (arguments_[0] === 'api') {
        return JSON.stringify({ object: { type: 'commit', sha: commit } });
      }
      return 'https://github.com/Nancyingcode/token-usage/releases/tag/v0.1.1';
    });

  it('verifies the tag and creates only a new draft with a fixed repository', () => {
    const run = createRun();
    const files = ['installer.exe', 'installer.exe.blockmap', 'latest.yml'];
    const verifyArtifacts = vi.fn().mockReturnValue(files);
    createDraftRelease({
      version: '0.1.1',
      directory: 'dist',
      environment: environment(),
      run,
      verifyArtifacts,
    });
    const createArgs = run.mock.calls.find(([, args]) => args[0] === 'release')?.[1] ?? [];
    expect(createArgs).toEqual(
      expect.arrayContaining([
        'create',
        'v0.1.1',
        '--draft',
        '--verify-tag',
        '--target',
        commit,
        '--repo',
        'Nancyingcode/token-usage',
        ...files,
      ])
    );
    expect(createArgs).not.toContain('--clobber');
    expect(
      run.mock.calls.some(([, args]) => args.includes('edit') || args.includes('delete'))
    ).toBe(false);
  });

  it.each([true, false])('refuses an existing release, including draft=%s', (draft) => {
    const run = createRun([{ tag_name: 'v0.1.1', draft }]);
    expect(() =>
      createDraftRelease({
        version: '0.1.1',
        directory: 'dist',
        environment: environment(),
        run,
        verifyArtifacts: () => [],
      })
    ).toThrow(/already exists/);
    expect(run.mock.calls.some(([, args]) => args[0] === 'release')).toBe(false);
  });

  it('refuses a moved tag before creating the draft', () => {
    const run = createRun();
    run.mockImplementationOnce(() =>
      JSON.stringify({ object: { type: 'commit', sha: 'b'.repeat(40) } })
    );
    expect(() =>
      createDraftRelease({
        version: '0.1.1',
        directory: 'dist',
        environment: environment(),
        run,
        verifyArtifacts: () => [],
      })
    ).toThrow(/commit/);
    expect(run.mock.calls.some(([, args]) => args[0] === 'release')).toBe(false);
  });

  it('resolves an annotated tag to the exact commit', () => {
    const run = createRun();
    const annotation = 'b'.repeat(40);
    run.mockImplementationOnce(() => JSON.stringify({ object: { type: 'tag', sha: annotation } }));
    createDraftRelease({
      version: '0.1.1',
      directory: 'dist',
      environment: environment(),
      run,
      verifyArtifacts: () => [],
    });
    expect(run).toHaveBeenCalledWith('gh', [
      'api',
      `repos/Nancyingcode/token-usage/git/tags/${annotation}`,
    ]);
    expect(run.mock.calls.some(([, args]) => args[0] === 'release')).toBe(true);
  });

  it('checks every page and rejects incomplete release responses', () => {
    for (const pages of [[[], [{ tag_name: 'v0.1.1', draft: true }]], [[{}]], []]) {
      const run = createRun();
      run.mockImplementation((command, arguments_) => {
        expect(command).toBe('gh');
        if (arguments_.includes('--paginate')) {
          return JSON.stringify(pages);
        }
        return JSON.stringify({ object: { type: 'commit', sha: commit } });
      });
      expect(() =>
        createDraftRelease({
          version: '0.1.1',
          directory: 'dist',
          environment: environment(),
          run,
          verifyArtifacts: () => [],
        })
      ).toThrow();
      expect(run.mock.calls.some(([, args]) => args[0] === 'release')).toBe(false);
    }
  });

  it.each(['GITHUB_ACTIONS', 'GITHUB_EVENT_NAME', 'GITHUB_REPOSITORY', 'GH_TOKEN'])(
    'requires the authorized CI environment field %s',
    (field) => {
      const run = createRun();
      expect(() =>
        createDraftRelease({
          version: '0.1.1',
          directory: 'dist',
          environment: { ...environment(), [field]: '' },
          run,
          verifyArtifacts: () => [],
        })
      ).toThrow();
      expect(run).not.toHaveBeenCalled();
    }
  );

  it('never creates a release after artifact verification fails', () => {
    const run = createRun();
    expect(() =>
      createDraftRelease({
        version: '0.1.1',
        directory: 'dist',
        environment: environment(),
        run,
        verifyArtifacts: () => {
          throw new Error('unsigned');
        },
      })
    ).toThrow('unsigned');
    expect(run).not.toHaveBeenCalled();
  });

  it('uses a manual Windows workflow with explicit no-publish build commands', () => {
    const workflow = readFileSync(resolve('.github/workflows/release-draft.yml'), 'utf8');
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).not.toMatch(/^\s+(?:push|pull_request|schedule):/m);
    expect(workflow).toContain('windows-latest');
    expect(workflow).toContain('--publish never');
    expect(workflow).toContain('node scripts/release-draft.cjs');
    expect(workflow).toMatch(/refs\/tags\/\$\{\{ inputs\.tag \}\}/u);
    expect(workflow).toContain('persist-credentials: false');
    expect(workflow).toMatch(/CSC_LINK: \$\{\{ secrets\.CSC_LINK \}\}/u);
  });
});
