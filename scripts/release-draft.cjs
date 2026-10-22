/**
 * @file 应用草稿发布入口
 * @description 仅在手动触发的固定仓库 CI 中创建新草稿；不更新、覆盖、删除或正式发布任何 Release。
 */
const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
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

const createDraftRelease = ({
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
    throw new Error('Draft publication requires the configured manual GitHub Actions environment.');
  }
  const input = validateReleaseInputs(version, environment);
  const artifacts = verifyArtifacts({ version, directory, publisherName: input.publisherName });
  verifyRemoteTag(run, input.tag, input.commit);
  const pages = JSON.parse(
    run('gh', ['api', '--paginate', '--slurp', `repos/${REPOSITORY}/releases?per_page=100`])
  );
  if (
    !Array.isArray(pages) ||
    pages.length === 0 ||
    !pages.every(Array.isArray) ||
    !pages.flat().every((release) => typeof release?.tag_name === 'string')
  ) {
    throw new Error('Cannot verify existing releases.');
  }
  if (pages.flat().some((release) => release.tag_name === input.tag)) {
    throw new Error('A release for this tag already exists; it will not be overwritten.');
  }
  run('gh', [
    'release',
    'create',
    input.tag,
    ...artifacts,
    '--repo',
    REPOSITORY,
    '--draft',
    '--verify-tag',
    '--target',
    input.commit,
    '--title',
    input.tag,
    '--notes',
    `待隔离验收。构建提交：${input.commit}。此草稿不会自动正式发布。`,
  ]);
};

module.exports = { createDraftRelease };
if (require.main === module) {
  try {
    const version = JSON.parse(readFileSync(resolve('package.json'), 'utf8')).version;
    if (process.argv.includes('--validate')) {
      validateReleaseInputs(version, process.env);
    } else {
      createDraftRelease({ version, directory: resolve('dist') });
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Draft release failed.');
    process.exitCode = 1;
  }
}
