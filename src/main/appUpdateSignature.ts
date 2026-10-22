/**
 * @file Windows 更新签名严格校验
 * @description 上游兼容逻辑在 PowerShell 不可用时可能跳过验证；下载和安装前必须取得系统的明确有效结果。
 * 只有上游在所有失败分支、缓存命中及安装前提供同等严格校验，并通过本项目回归后，才可移除此补充边界。
 */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { join } from 'node:path';

const SIGNATURE_TIMEOUT_MS = 20_000;
const SIGNATURE_OUTPUT_LIMIT_BYTES = 16_384;
const SIGNATURE_SUCCESS = 'TOKEN_USAGE_VALID_SIGNATURE';
// 固定脚本只从环境读取数据，避免缓存路径或证书名称被解释为 PowerShell 代码。
const SIGNATURE_COMMAND = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$signature = Get-AuthenticodeSignature -LiteralPath $env:TOKEN_USAGE_UPDATE_PATH -ErrorAction Stop
if ($signature.Status -ne [System.Management.Automation.SignatureStatus]::Valid -or $null -eq $signature.SignerCertificate) { exit 1 }
$publisher = $signature.SignerCertificate.GetNameInfo([System.Security.Cryptography.X509Certificates.X509NameType]::SimpleName, $false)
if (-not [String]::Equals($publisher, $env:TOKEN_USAGE_UPDATE_PUBLISHER, [StringComparison]::Ordinal)) { exit 1 }
[Console]::Out.Write('${SIGNATURE_SUCCESS}')
`;

export const verifyAppUpdateSignature = async (
  publisher: string,
  filename: string,
  expectedSha512: string
): Promise<void> => {
  const hash = createHash('sha512');
  for await (const chunk of createReadStream(filename)) {
    hash.update(chunk);
  }
  if (hash.digest('base64') !== expectedSha512) {
    throw new Error('Update installer digest does not match the checked release.');
  }
  return new Promise((resolve, reject) => {
    if (!publisher.trim() || !filename) {
      reject(new Error('Update signature inputs are missing.'));
      return;
    }
    const executable = join(
      process.env.SystemRoot ?? 'C:\\Windows',
      'System32',
      'WindowsPowerShell',
      'v1.0',
      'powershell.exe'
    );
    execFile(
      executable,
      [
        '-NoProfile',
        '-NonInteractive',
        '-EncodedCommand',
        Buffer.from(SIGNATURE_COMMAND, 'utf16le').toString('base64'),
      ],
      {
        shell: false,
        windowsHide: true,
        timeout: SIGNATURE_TIMEOUT_MS,
        maxBuffer: SIGNATURE_OUTPUT_LIMIT_BYTES,
        encoding: 'utf8',
        env: {
          ...process.env,
          PSModulePath: '',
          TOKEN_USAGE_UPDATE_PATH: filename,
          TOKEN_USAGE_UPDATE_PUBLISHER: publisher,
        },
      },
      (error, stdout, stderr) => {
        if (error || stderr.trim() || stdout.trim() !== SIGNATURE_SUCCESS) {
          reject(new Error('Update signature could not be verified.'));
          return;
        }
        resolve();
      }
    );
  });
};
