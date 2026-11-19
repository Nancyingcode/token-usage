/**
 * @file 正式 Release 发布入口
 * @description 仅发布固定仓库中已通过产物与签名校验的现有草稿，不上传或替换发布资产。
 */
const { execFileSync } = require('node:child_process');
const { mkdtempSync, readFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const {
  REPOSITORY,
  validateReleaseInputs,
  verifyReleaseArtifacts,
} = require('./release-utils.cjs');

const MAX_TAG_DEPTH = 8;
const runCommand = (command, arguments_) =>
  execFileSync(command, arguments_, {
    encoding: 'utf8',
    windowsHide: true,
    stdio: 'pipe',
    timeout: 120_000,
  });

const verifyRemoteTag = (run, tag, commit) => {
  let reference = JSON.parse(run('gh', ['api', `repos/${REPOSITORY}/git/ref/tags/${tag}`])).object;
  for (let depth = 0; reference?.type === 'tag' && depth < MAX_TAG_DEPTH; depth += 1) {
    if (!/^[a-f0-9]{40}$/u.test(reference.sha)) {
      throw new Error('GitHub returned an invalid tag object.');
    }
    reference = JSON.parse(
      run('gh', ['api', `repos/${REPOSITORY}/git/tags/${reference.sha}`])
    ).object;
  }
  if (reference?.type !== 'commit' || reference.sha !== commit) {
    throw new Error('Remote release tag no longer matches the checked-out commit.');
  }
};

const publishDraftRelease = ({
  version,
  directory,
  environment = process.env,
  run = runCommand,
  verifyArtifacts = verifyReleaseArtifacts,
}) => {
  if (
    environment.GITHUB_ACTIONS !== 'true' ||
    environment.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
    environment.GITHUB_REPOSITORY !== REPOSITORY ||
    !environment.GH_TOKEN
  ) {
    throw new Error(
      'Release publication requires the configured manual GitHub Actions environment.'
    );
  }
  const input = validateReleaseInputs(version, environment);
  verifyRemoteTag(run, input.tag, input.commit);
  const release = JSON.parse(run('gh', ['api', `repos/${REPOSITORY}/releases/tags/${input.tag}`]));
  const expectedAssets = [
    `Codex-Token-Usage-Setup-${version}-x64.exe`,
    `Codex-Token-Usage-Setup-${version}-x64.exe.blockmap`,
    'latest.yml',
  ];
  const assetNames = Array.isArray(release?.assets)
    ? release.assets.map((asset) => asset?.name)
    : [];
  if (
    !Number.isSafeInteger(release?.id) ||
    release.id <= 0 ||
    release.tag_name !== input.tag ||
    release.draft !== true ||
    release.prerelease !== false ||
    release.assets.length !== expectedAssets.length ||
    new Set(assetNames).size !== expectedAssets.length ||
    !expectedAssets.every((name) => assetNames.includes(name)) ||
    !release.assets.every(
      (asset) => asset?.state === 'uploaded' && Number.isSafeInteger(asset?.size) && asset.size > 0
    )
  ) {
    throw new Error(
      'Release must be the matching stable draft with exactly three uploaded assets.'
    );
  }
  run('gh', [
    'release',
    'download',
    input.tag,
    '--repo',
    REPOSITORY,
    '--dir',
    directory,
    ...expectedAssets.flatMap((name) => ['--pattern', name]),
  ]);
  // 草稿只含安装资产；内部可执行文件已在签名草稿构建阶段验签。
  verifyArtifacts({
    version,
    directory,
    publisherName: input.publisherName,
    verifyUnpacked: false,
  });
  run('gh', [
    'api',
    '--method',
    'PATCH',
    `repos/${REPOSITORY}/releases/${release.id}`,
    '-F',
    'draft=false',
    '-F',
    'prerelease=false',
  ]);
};

module.exports = { publishDraftRelease };
if (require.main === module) {
  try {
    const version = JSON.parse(readFileSync(resolve('package.json'), 'utf8')).version;
    if (process.argv.includes('--validate')) {
      validateReleaseInputs(version, process.env);
    } else {
      publishDraftRelease({
        version,
        directory: mkdtempSync(join(tmpdir(), 'codex-release-publish-')),
      });
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Release publication failed.');
    process.exitCode = 1;
  }
}
