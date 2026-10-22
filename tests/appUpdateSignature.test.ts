/** @file 签名验证必须失败关闭，不执行安装程序。 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

const execution = vi.hoisted(() => ({ execFile: vi.fn() }));
vi.mock('node:child_process', () => execution);
vi.mock('node:fs', () => ({
  createReadStream: () => ({
    async *[Symbol.asyncIterator]() {
      yield Buffer.from('fixture installer');
    },
  }),
}));
import { verifyAppUpdateSignature } from '../src/main/appUpdateSignature';
const expectedHash = createHash('sha512').update('fixture installer').digest('base64');

describe('strict update signature verification', () => {
  beforeEach(() => {
    execution.execFile.mockReset();
  });

  it('passes paths and publisher as data to a fixed system executable without a shell', async () => {
    execution.execFile.mockImplementation((_file, _args, _options, callback) =>
      callback(null, 'TOKEN_USAGE_VALID_SIGNATURE', '')
    );
    const filename = "C:\\cache\\user'; Write-Output bad; '\\update.exe";
    await verifyAppUpdateSignature('Example Publisher', filename, expectedHash);
    const [file, args, options] = execution.execFile.mock.calls[0]!;
    expect(file).toMatch(/System32[\\/]WindowsPowerShell[\\/]v1\.0[\\/]powershell\.exe$/);
    expect(args).toContain('-EncodedCommand');
    expect(args.join(' ')).not.toContain(filename);
    expect(options).toMatchObject({
      shell: false,
      windowsHide: true,
      env: { TOKEN_USAGE_UPDATE_PATH: filename, TOKEN_USAGE_UPDATE_PUBLISHER: 'Example Publisher' },
    });
    const command = Buffer.from(args.at(-1), 'base64').toString('utf16le');
    expect(command).toContain('Get-AuthenticodeSignature -LiteralPath');
    expect(command).toContain('SignatureStatus]::Valid');
    expect(command).toContain('[StringComparison]::Ordinal');
  });

  it.each([
    [new Error('PowerShell disabled'), '', ''],
    [null, 'TOKEN_USAGE_VALID_SIGNATURE', 'verification error'],
    [null, '', ''],
    [null, 'untrusted output', ''],
  ])('rejects verification that did not positively succeed', async (error, stdout, stderr) => {
    execution.execFile.mockImplementation((_file, _args, _options, callback) =>
      callback(error, stdout, stderr)
    );
    await expect(
      verifyAppUpdateSignature('Example Publisher', 'C:\\cache\\update.exe', expectedHash)
    ).rejects.toThrow();
  });

  it('rejects a changed cached installer before invoking signature verification', async () => {
    execution.execFile.mockImplementation((_file, _args, _options, callback) =>
      callback(null, 'TOKEN_USAGE_VALID_SIGNATURE', '')
    );
    await expect(
      verifyAppUpdateSignature('Example Publisher', 'C:\\cache\\update.exe', 'wrong digest')
    ).rejects.toThrow();
    expect(execution.execFile).not.toHaveBeenCalled();
  });
});
