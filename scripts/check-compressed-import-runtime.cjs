/**
 * @file 压缩会话完整导入压力验证
 * @description 以独立合成来源验证 Node 与 Electron 中解压、完整原文提交、异步解析的正确性及响应性。
 */
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { createHash, randomBytes } = require('node:crypto');
const { createReadStream, createWriteStream } = require('node:fs');
const { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { basename, dirname, isAbsolute, join, relative, resolve } = require('node:path');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { constants, createZstdCompress } = require('node:zlib');
const { buildSync } = require('esbuild');

const WORKSPACE = resolve(__dirname, '..');
const TEMPORARY_PREFIX = 'token-usage-compressed-import-runtime-';
const MEBIBYTE = 1024 * 1024;
const LARGE_SOURCE_BYTES = 32 * MEBIBYTE;
const COMPANION_SOURCE_BYTES = MEBIBYTE;
const SOURCE_SIZES = [LARGE_SOURCE_BYTES, COMPANION_SOURCE_BYTES, COMPANION_SOURCE_BYTES];
const MESSAGE_PAYLOAD_BYTES = 3072;
const PAYLOAD_VARIANTS = 256;
const MESSAGES_PER_TOKEN_EVENT = 128;
const TIMER_INTERVAL_MS = 5;
const RUNTIME_TIMEOUT_MS = 120_000;
const EXPECTED_IMPORT_CONCURRENCY = 2;
const TOKEN_USAGE = {
  inputTokens: 100,
  cachedInputTokens: 30,
  outputTokens: 20,
  reasoningOutputTokens: 5,
  totalTokens: 120,
};

const hashFile = async (file) => {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) {
    hash.update(chunk);
  }
  return hash.digest('hex');
};

const makeFixture = async (directory, index, minimumBytes) => {
  const sourceFile = join(directory, `synthetic-${index}.jsonl.zst`);
  const payloads = Array.from({ length: PAYLOAD_VARIANTS }, () =>
    randomBytes(MESSAGE_PAYLOAD_BYTES).toString('base64')
  );
  const hash = createHash('sha256');
  let bytes = 0;
  let messages = 0;
  let tokenEvents = 0;
  const encode = (record) => {
    const buffer = Buffer.from(`${JSON.stringify(record)}\n`);
    bytes += buffer.length;
    hash.update(buffer);
    return buffer;
  };
  const records = function* () {
    yield encode({
      timestamp: '2026-10-21T00:00:00.000Z',
      type: 'session_meta',
      payload: { id: `synthetic-${index}`, cwd: 'C:/synthetic-project', model: 'gpt-5' },
    });
    while (bytes < minimumBytes) {
      yield encode({
        timestamp: '2026-10-21T00:00:01.000Z',
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'output_text',
              text: `合成测试内容 😀 ${messages} ${payloads[messages % payloads.length]}`,
            },
          ],
        },
      });
      messages += 1;
      if (messages % MESSAGES_PER_TOKEN_EVENT === 0) {
        tokenEvents += 1;
        yield encode({
          timestamp: '2026-10-21T00:00:02.000Z',
          type: 'event_msg',
          payload: {
            type: 'token_count',
            info: {
              last_token_usage: {
                input_tokens: TOKEN_USAGE.inputTokens,
                cached_input_tokens: TOKEN_USAGE.cachedInputTokens,
                output_tokens: TOKEN_USAGE.outputTokens,
                reasoning_output_tokens: TOKEN_USAGE.reasoningOutputTokens,
                total_tokens: TOKEN_USAGE.totalTokens,
              },
            },
          },
        });
      }
    }
  };
  await pipeline(
    Readable.from(records()),
    createZstdCompress({ params: { [constants.ZSTD_c_checksumFlag]: 1 } }),
    createWriteStream(sourceFile, { flags: 'wx' })
  );
  return {
    sourceFile,
    bytes,
    messages,
    tokenEvents,
    contentSha256: hash.digest('hex'),
    sourceSha256: await hashFile(sourceFile),
  };
};

const checkRuntime = async (modulePath, fixturePath, storageDir) => {
  const { createCompressedSessionStore, decompressZstdFile, parseSessionJsonlAsync } = require(
    modulePath
  );
  const { sessionsDir, fixtures } = JSON.parse(await readFile(fixturePath, 'utf8'));
  const expectedSourceNames = fixtures.map(({ sourceFile }) => basename(sourceFile)).sort();
  const baselineRss = process.memoryUsage().rss;
  let peakRss = baselineRss;
  let activeDecompressions = 0;
  let peakDecompressions = 0;
  let activeParsers = 0;
  let peakParsers = 0;
  let activeFiles = 0;
  let peakFiles = 0;
  let timerTicks = 0;
  let largestTimerGapMs = 0;
  let lastTick = performance.now();
  const sampleMemory = () => {
    peakRss = Math.max(peakRss, process.memoryUsage().rss);
  };
  const sampleTimer = () => {
    const current = performance.now();
    largestTimerGapMs = Math.max(largestTimerGapMs, current - lastTick);
    lastTick = current;
    sampleMemory();
  };
  const store = createCompressedSessionStore({
    storageDir,
    decompressFile: async (source, target) => {
      activeFiles += 1;
      peakFiles = Math.max(peakFiles, activeFiles);
      activeDecompressions += 1;
      peakDecompressions = Math.max(peakDecompressions, activeDecompressions);
      try {
        await decompressZstdFile(source, target);
      } finally {
        activeDecompressions -= 1;
        sampleMemory();
      }
    },
    parseSession: async (source, content) => {
      activeParsers += 1;
      peakParsers = Math.max(peakParsers, activeParsers);
      sampleMemory();
      try {
        return await parseSessionJsonlAsync(source, content);
      } finally {
        activeParsers -= 1;
        activeFiles -= 1;
        sampleMemory();
      }
    },
  });
  const started = performance.now();
  const timer = setInterval(() => {
    timerTicks += 1;
    sampleTimer();
  }, TIMER_INTERVAL_MS);
  let imported;
  try {
    imported = await store.importFiles(
      sessionsDir,
      fixtures.map(({ sourceFile }) => sourceFile),
      sampleMemory
    );
  } finally {
    sampleTimer();
    clearInterval(timer);
  }
  const elapsedMs = performance.now() - started;
  assert.deepEqual(imported.report, {
    added: fixtures.length,
    updated: 0,
    unchanged: 0,
    failures: [],
  });
  assert.equal(imported.snapshot.sources.length, fixtures.length);
  assert.equal(activeFiles, 0);
  assert.equal(peakFiles, EXPECTED_IMPORT_CONCURRENCY);
  assert.ok(peakDecompressions <= EXPECTED_IMPORT_CONCURRENCY);
  assert.ok(peakParsers <= EXPECTED_IMPORT_CONCURRENCY);
  assert.ok(timerTicks > 0, 'Complete import must allow timers to run.');

  const roots = await readdir(storageDir);
  assert.equal(roots.length, 1);
  const root = join(storageDir, roots[0]);
  const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
  const hashes = [];
  for (const fixture of fixtures) {
    const entry = Object.values(manifest.entries).find(
      ({ sourceFile }) => sourceFile === fixture.sourceFile
    );
    assert.ok(entry);
    const rawPath = join(root, entry.localRelativePath);
    const actualHash = await hashFile(rawPath);
    assert.equal((await stat(rawPath)).size, fixture.bytes);
    assert.equal(actualHash, fixture.contentSha256);
    assert.equal(entry.contentSha256, fixture.contentSha256);
    const session = imported.snapshot.sources.find(
      ({ sourceFile }) => sourceFile === fixture.sourceFile
    )?.session;
    assert.ok(session);
    for (const [key, perEvent] of Object.entries(TOKEN_USAGE)) {
      assert.equal(
        session[key],
        perEvent * fixture.tokenEvents,
        `${basename(fixture.sourceFile)} ${key}`
      );
    }
    assert.equal(session.eventCount, fixture.tokenEvents);
    assert.deepEqual(session.warnings, []);
    assert.equal(await hashFile(fixture.sourceFile), fixture.sourceSha256);
    hashes.push({ file: basename(fixture.sourceFile), bytes: fixture.bytes, sha256: actualHash });
  }
  assert.deepEqual((await readdir(sessionsDir)).sort(), expectedSourceNames);
  const round = (value) => Math.round(value * 100) / 100;
  return {
    node: process.versions.node,
    electron: process.versions.electron,
    files: fixtures.length,
    importedMiB: round(fixtures.reduce((sum, fixture) => sum + fixture.bytes, 0) / MEBIBYTE),
    totalTokens: imported.snapshot.sources.reduce(
      (sum, { session }) => sum + session.totalTokens,
      0
    ),
    elapsedMs: Math.round(elapsedMs),
    timerIntervalMs: TIMER_INTERVAL_MS,
    timerTicks,
    largestTimerGapMs: round(largestTimerGapMs),
    baselineRssMiB: round(baselineRss / MEBIBYTE),
    sampledPeakRssMiB: round(peakRss / MEBIBYTE),
    peakRssIncreaseMiB: round((peakRss - baselineRss) / MEBIBYTE),
    peakConcurrentFiles: peakFiles,
    peakConcurrentDecompressions: peakDecompressions,
    peakConcurrentParsers: peakParsers,
    sourceFilesUnchanged: true,
    hashes,
  };
};

const removeTemporaryDirectory = async (directory) => {
  const target = resolve(directory);
  const relativePath = relative(resolve(tmpdir()), target);
  assert.ok(relativePath && !relativePath.startsWith('..') && !isAbsolute(relativePath));
  assert.equal(dirname(target), resolve(tmpdir()));
  assert.ok(basename(target).startsWith(TEMPORARY_PREFIX));
  await rm(target, { recursive: true, force: true });
};

const main = async () => {
  if (process.argv[2] === '--child') {
    const result = await checkRuntime(process.argv[3], process.argv[4], process.argv[5]);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  const directory = await mkdtemp(join(tmpdir(), TEMPORARY_PREFIX));
  try {
    const sessionsDir = join(directory, 'synthetic-sources');
    await mkdir(sessionsDir);
    const fixtures = [];
    for (const [index, bytes] of SOURCE_SIZES.entries()) {
      fixtures.push(await makeFixture(sessionsDir, index, bytes));
    }
    const fixturePath = join(directory, 'fixture-metadata.json');
    await writeFile(fixturePath, JSON.stringify({ sessionsDir, fixtures }));
    const modulePath = join(directory, 'compressed-import.cjs');
    buildSync({
      stdin: {
        contents: [
          "export { createCompressedSessionStore } from './src/main/compressedSessionStore';",
          "export { decompressZstdFile } from './src/main/zstdFrames';",
          "export { parseSessionJsonlAsync } from './src/main/sessionParser';",
        ].join('\n'),
        resolveDir: WORKSPACE,
        loader: 'ts',
      },
      outfile: modulePath,
      platform: 'node',
      target: 'node24',
      format: 'cjs',
      bundle: true,
    });
    // 测量进程只导入预先生成的数据，避免 fixture 生成占用混入导入内存基线。
    for (const [label, executable] of [
      ['Node', process.execPath],
      ['Electron', require('electron')],
    ]) {
      const result = spawnSync(
        executable,
        [__filename, '--child', modulePath, fixturePath, join(directory, `${label}-storage`)],
        {
          cwd: WORKSPACE,
          env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
          encoding: 'utf8',
          windowsHide: true,
          timeout: RUNTIME_TIMEOUT_MS,
        }
      );
      if (result.error) {
        throw result.error;
      }
      assert.equal(result.status, 0, result.stderr || `${label} import checks failed.`);
      process.stdout.write(`${label}: ${result.stdout}`);
    }
  } finally {
    await removeTemporaryDirectory(directory);
  }
};

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
