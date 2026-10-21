/**
 * @file Zstandard 实际运行时验证
 * @description 使用独立临时合成文件验证系统 Node 与项目 Electron 的严格解压及流式内存表现。
 */
const assert = require('node:assert/strict');
const { createHash, randomBytes } = require('node:crypto');
const { createReadStream, createWriteStream } = require('node:fs');
const { mkdtemp, mkdir, readFile, rm, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { dirname, isAbsolute, join, relative, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { constants, createZstdCompress, zstdCompressSync } = require('node:zlib');
const { buildSync } = require('esbuild');

const WORKSPACE = resolve(__dirname, '..');
const MEBIBYTE = 1024 * 1024;
const STRESS_CHUNK_BYTES = 64 * 1024;
const STRESS_TOTAL_BYTES = 32 * MEBIBYTE;

const checkRuntime = async (modulePath, directory) => {
  const { decompressZstdFile } = require(modulePath);
  await mkdir(directory);
  const compressed = (value) =>
    zstdCompressSync(value, { params: { [constants.ZSTD_c_checksumFlag]: 1 } });
  let sequence = 0;
  const decode = async (input) => {
    sequence += 1;
    const source = join(directory, `${sequence}.jsonl.zst`);
    const target = join(directory, `${sequence}.jsonl`);
    await writeFile(source, input);
    await decompressZstdFile(source, target);
    return readFile(target);
  };

  const content = Buffer.from('{"message":"完整 JSONL 😀"}\ninvalid line\n');
  assert.deepEqual(await decode(compressed(content)), content);
  assert.deepEqual(
    await decode(
      Buffer.concat([compressed(content.subarray(0, 16)), compressed(content.subarray(16))])
    ),
    content
  );
  const complete = compressed(content);
  await assert.rejects(decode(complete.subarray(0, complete.length - 1)));
  await assert.rejects(decode(Buffer.concat([complete, Buffer.from('garbage')])));
  const invalidChecksum = Buffer.from(complete);
  invalidChecksum[invalidChecksum.length - 1] ^= 0xff;
  await assert.rejects(decode(invalidChecksum));

  const payload = randomBytes(STRESS_CHUNK_BYTES);
  const expectedHash = createHash('sha256');
  const source = join(directory, 'large.jsonl.zst');
  const target = join(directory, 'large.jsonl');
  const chunks = function* () {
    for (let written = 0; written < STRESS_TOTAL_BYTES; written += payload.length) {
      expectedHash.update(payload);
      yield payload;
    }
  };
  await pipeline(
    Readable.from(chunks()),
    createZstdCompress(),
    createWriteStream(source, { flags: 'wx' })
  );
  const initialRss = process.memoryUsage().rss;
  let peakRss = initialRss;
  let ticks = 0;
  const started = performance.now();
  const timer = setInterval(() => {
    ticks += 1;
    peakRss = Math.max(peakRss, process.memoryUsage().rss);
  }, 5);
  try {
    await decompressZstdFile(source, target);
  } finally {
    clearInterval(timer);
  }
  const elapsedMs = performance.now() - started;
  const actualHash = createHash('sha256');
  for await (const chunk of createReadStream(target)) {
    actualHash.update(chunk);
  }
  assert.equal(actualHash.digest('hex'), expectedHash.digest('hex'));
  assert.ok(ticks > 0, 'Decompression must allow timers to run.');
  return {
    node: process.versions.node,
    electron: process.versions.electron,
    decodedMiB: STRESS_TOTAL_BYTES / MEBIBYTE,
    elapsedMs: Math.round(elapsedMs),
    timerTicks: ticks,
    peakRssIncreaseMiB: Math.round((peakRss - initialRss) / MEBIBYTE),
  };
};

const removeTemporaryDirectory = async (directory) => {
  const relativePath = relative(resolve(tmpdir()), resolve(directory));
  if (!relativePath || relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new Error('Refusing to remove a directory outside the temporary root.');
  }
  assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
  await rm(directory, { recursive: true, force: true });
};

const main = async () => {
  if (process.argv[2] === '--child') {
    const result = await checkRuntime(process.argv[3], process.argv[4]);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }

  const directory = await mkdtemp(join(tmpdir(), 'token-usage-zstd-runtime-'));
  try {
    const modulePath = join(directory, 'zstdFrames.cjs');
    buildSync({
      entryPoints: [join(WORKSPACE, 'src/main/zstdFrames.ts')],
      outfile: modulePath,
      platform: 'node',
      target: 'node24',
      format: 'cjs',
      bundle: true,
    });
    const nodeResult = await checkRuntime(modulePath, join(directory, 'node'));
    process.stdout.write(`Node: ${JSON.stringify(nodeResult)}\n`);
    const electron = require('electron');
    const result = spawnSync(
      electron,
      [__filename, '--child', modulePath, join(directory, 'electron')],
      {
        cwd: WORKSPACE,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        encoding: 'utf8',
        windowsHide: true,
        timeout: 120_000,
      }
    );
    if (result.error) {
      throw result.error;
    }
    assert.equal(result.status, 0, result.stderr || 'Electron runtime checks failed.');
    process.stdout.write(`Electron: ${result.stdout}`);
  } finally {
    await removeTemporaryDirectory(directory);
  }
};

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
