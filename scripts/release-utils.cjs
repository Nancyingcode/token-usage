/**
 * @file 稳定版发布校验
 * @description 发布工具只接受固定版本产物、明确发布者和可信签名；校验失败时不创建远程草稿。
 */
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { readFileSync, statSync } = require('node:fs');
const { createRequire } = require('node:module');
const { join } = require('node:path');
const { gunzipSync } = require('node:zlib');

const REPOSITORY = 'Nancyingcode/token-usage';
const VERSION_COMPONENT_COUNT = 3;
const COMMIT_SHA_LENGTH = 40;

const isStableVersion = (value) =>
  typeof value === 'string' &&
  value.split('.').length === VERSION_COMPONENT_COUNT &&
  value
    .split('.')
    .every(
      (part) => part.length > 0 && !/[^0-9]/u.test(part) && (part === '0' || !part.startsWith('0'))
    );

const requiredEnvironment = (environment, name) => {
  const value = environment[name];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Release requires ${name}.`);
  }
  return value;
};

const validateReleaseInputs = (version, environment) => {
  if (!isStableVersion(version)) {
    throw new Error('Release requires a three-component stable package version.');
  }
  const tag = requiredEnvironment(environment, 'APP_RELEASE_TAG');
  if (tag !== `v${version}`) {
    throw new Error('Release tag must match the package version.');
  }
  const commit = requiredEnvironment(environment, 'APP_RELEASE_COMMIT');
  if (commit.length !== COMMIT_SHA_LENGTH || !/^[a-f0-9]+$/u.test(commit)) {
    throw new Error('Release requires an exact checked-out commit.');
  }
  const publisherName = requiredEnvironment(environment, 'WINDOWS_PUBLISHER_NAME');
  if (publisherName !== publisherName.trim()) {
    throw new Error('Publisher name must match the certificate without surrounding whitespace.');
  }
  return { version, tag, commit, publisherName };
};

const createReleaseConfiguration = (environment) => {
  const publisherName = requiredEnvironment(environment, 'WINDOWS_PUBLISHER_NAME');
  requiredEnvironment(environment, 'CSC_LINK');
  requiredEnvironment(environment, 'CSC_KEY_PASSWORD');
  if (publisherName !== publisherName.trim()) {
    throw new Error('Publisher name must not contain surrounding whitespace.');
  }
  return {
    extends: './electron-builder.yml',
    forceCodeSigning: true,
    win: {
      verifyUpdateCodeSignature: true,
      signtoolOptions: { publisherName: [publisherName] },
    },
  };
};

const verifyWindowsSignature = (file, publisherName) => {
  if (process.platform !== 'win32') {
    throw new Error('Release signatures must be verified on Windows.');
  }
  // 路径与发布者通过环境传递，不插入 PowerShell 程序，证书秘密不进入命令参数或日志。
  const command = `
$ErrorActionPreference = 'Stop'
$signature = Get-AuthenticodeSignature -LiteralPath $env:RELEASE_SIGNATURE_PATH
if ($signature.Status -ne 'Valid' -or $null -eq $signature.SignerCertificate -or $null -eq $signature.TimeStamperCertificate) {
  throw 'Release executable requires a valid timestamped signature.'
}
$publisher = $signature.SignerCertificate.GetNameInfo([System.Security.Cryptography.X509Certificates.X509NameType]::SimpleName, $false)
if ($publisher -cne $env:RELEASE_EXPECTED_PUBLISHER) { throw 'Release publisher does not match the configured identity.' }
`;
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-EncodedCommand',
      Buffer.from(command, 'utf16le').toString('base64'),
    ],
    {
      env: {
        ...process.env,
        RELEASE_SIGNATURE_PATH: file,
        RELEASE_EXPECTED_PUBLISHER: publisherName,
      },
      windowsHide: true,
      stdio: 'pipe',
      timeout: 60_000,
    }
  );
};

const verifyReleaseArtifacts = ({
  version,
  directory,
  publisherName,
  verifySignature = verifyWindowsSignature,
}) => {
  if (!isStableVersion(version)) {
    throw new Error('Artifact version must be stable.');
  }
  const installerName = `Codex-Token-Usage-Setup-${version}-x64.exe`;
  const installerPath = join(directory, installerName);
  const blockmapPath = `${installerPath}.blockmap`;
  const metadataPath = join(directory, 'latest.yml');
  const executablePaths = [
    installerPath,
    join(directory, 'win-unpacked', 'CodexTokenUsage.exe'),
    join(directory, 'win-unpacked', 'resources', 'elevate.exe'),
  ];
  for (const file of [...executablePaths, blockmapPath, metadataPath]) {
    const info = statSync(file);
    if (!info.isFile() || info.size === 0) {
      throw new Error('A required release artifact is missing or empty.');
    }
  }
  // 采用 updater 自身声明的 YAML 解析依赖，避免另写不完整的 latest.yml 解析器。
  const updaterRequire = createRequire(require.resolve('electron-updater'));
  const { load } = updaterRequire('js-yaml');
  const metadata = load(readFileSync(metadataPath, 'utf8'));
  const installer = readFileSync(installerPath);
  const hash = createHash('sha512').update(installer).digest('base64');
  const file =
    Array.isArray(metadata?.files) && metadata.files.length === 1 ? metadata.files[0] : undefined;
  if (
    metadata?.version !== version ||
    metadata.path !== installerName ||
    metadata.sha512 !== hash ||
    file?.url !== installerName ||
    file?.sha512 !== hash ||
    file?.size !== installer.length
  ) {
    throw new Error('Release metadata does not match the exact installer.');
  }
  const blockmap = JSON.parse(gunzipSync(readFileSync(blockmapPath)).toString('utf8'));
  const blockmapFile =
    Array.isArray(blockmap.files) && blockmap.files.length === 1 ? blockmap.files[0] : undefined;
  if (
    blockmap.version !== '2' ||
    blockmapFile?.offset !== 0 ||
    !Array.isArray(blockmapFile?.sizes) ||
    !Array.isArray(blockmapFile?.checksums) ||
    blockmapFile.sizes.length !== blockmapFile.checksums.length ||
    !blockmapFile.sizes.every((size) => Number.isSafeInteger(size) && size > 0) ||
    blockmapFile.sizes.reduce((total, size) => total + size, 0) !== installer.length
  ) {
    throw new Error('Release blockmap does not describe the exact installer size.');
  }
  executablePaths.forEach((path) => verifySignature(path, publisherName));
  return [installerPath, blockmapPath, metadataPath];
};

module.exports = {
  REPOSITORY,
  validateReleaseInputs,
  createReleaseConfiguration,
  verifyReleaseArtifacts,
};
