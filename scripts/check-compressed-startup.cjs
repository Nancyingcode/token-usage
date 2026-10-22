/**
 * @file 压缩历史启动性能验证
 * @description 使用独立合成目录比较已导入数据的重启恢复和成本缓存复用；完整统计必须一致，源文件不变。
 */
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { mkdir, mkdtemp, readFile, readdir, rm, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { basename, dirname, join, relative, resolve } = require('node:path');
const { zstdCompressSync } = require('node:zlib');
const { build } = require('esbuild');

const WORKSPACE = resolve(__dirname, '..');
const TEMP_PREFIX = 'token-usage-startup-';
const MEBIBYTE = 1024 * 1024;
const SMALL_FILE_COUNT = 128;
const SMALL_FILE_BYTES = MEBIBYTE;
const LARGE_FILE_COUNT = 2;
const LARGE_FILE_BYTES = 32 * MEBIBYTE;
const TOKEN_EVENTS_PER_FILE = 128;
const REPETITIONS = 3;
const TIMER_INTERVAL_MS = 5;
const CHILD_TIMEOUT_MS = 120_000;
const IMPORTED_TOKEN_COUNT = (SMALL_FILE_COUNT + LARGE_FILE_COUNT) * TOKEN_EVENTS_PER_FILE * 120;
const BASELINE_MODULES = new Set([
  'src/main/compressedSessionStore.ts',
  'src/main/compressedUsageService.ts',
  'src/main/costOptimizationRuntime.ts',
]);
const hash = (content) => createHash('sha256').update(content).digest('hex');
const round = (value) => Math.round(value * 100) / 100;

const createFixtureContent = (size) => {
  const event = `${JSON.stringify({
    timestamp: '2026-10-21T00:00:00.000Z',
    type: 'event_msg',
    payload: {
      type: 'token_count',
      info: { last_token_usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120 } },
    },
  })}\n`;
  const prefix = event.repeat(TOKEN_EVENTS_PER_FILE);
  const message = `${JSON.stringify({ type: 'response_item', payload: { text: 'synthetic '.repeat(256) } })}\n`;
  return Buffer.from(
    prefix +
      message.repeat(Math.ceil((size - Buffer.byteLength(prefix)) / Buffer.byteLength(message)))
  );
};

const bundle = async (directory, label, baselineRef) => {
  const modulePath = join(directory, `${label}.cjs`);
  await build({
    stdin: {
      contents: [
        "export { createCompressedSessionStore } from './src/main/compressedSessionStore';",
        "export { createCompressedUsageService } from './src/main/compressedUsageService';",
        "export { createUsageScanner } from './src/main/usageScanner';",
        "export { createUsageScanCacheStore } from './src/main/usageScanCacheStore';",
        "export { createCostOptimizationRuntime } from './src/main/costOptimizationRuntime';",
        "export { createCostOptimizationCacheStore } from './src/main/costOptimizationCacheStore';",
        "export { createCostOptimizationConfigStore } from './src/main/costOptimizationConfigStore';",
      ].join('\n'),
      resolveDir: WORKSPACE,
      loader: 'ts',
    },
    outfile: modulePath,
    bundle: true,
    platform: 'node',
    target: 'node24',
    format: 'cjs',
    plugins: baselineRef
      ? [
          {
            name: 'baseline',
            setup(builder) {
              builder.onLoad({ filter: /\.ts$/ }, (args) => {
                const path = relative(WORKSPACE, args.path).replace(/\\/g, '/');
                if (!BASELINE_MODULES.has(path)) {
                  return undefined;
                }
                return {
                  contents: execFileSync('git', ['show', `${baselineRef}:${path}`], {
                    cwd: WORKSPACE,
                    encoding: 'utf8',
                    windowsHide: true,
                  }),
                  loader: 'ts',
                  resolveDir: dirname(args.path),
                };
              });
            },
          },
        ]
      : [],
  });
  return modulePath;
};

const runChild = (executable, args) =>
  new Promise((resolveExit, rejectExit) => {
    const child = spawn(executable, [__filename, '--child', ...args], {
      cwd: WORKSPACE,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      windowsHide: true,
      timeout: CHILD_TIMEOUT_MS,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', rejectExit);
    child.on('close', (code) => {
      if (code !== 0) {
        rejectExit(new Error(stderr || `Startup check failed (${code}).`));
        return;
      }
      try {
        resolveExit(JSON.parse(stdout));
      } catch (error) {
        rejectExit(error);
      }
    });
  });

const checkStartup = async (modulePath, directory, mode) => {
  const api = require(modulePath);
  const sessionsDir = join(directory, 'sources');
  const storageDir = join(directory, 'user-data', 'imported-sessions');
  let parseCalls = 0;
  const store = api.createCompressedSessionStore({
    storageDir,
    ...(mode === 'measure'
      ? {
          parseSession: async () => {
            parseCalls += 1;
            throw new Error('Warm startup reparsed cached history.');
          },
        }
      : {}),
  });
  if (mode === 'prepare') {
    const files = (await readdir(sessionsDir)).map((name) => join(sessionsDir, name));
    const imported = await store.importFiles(sessionsDir, files);
    assert.equal(imported.report.added, files.length);
    assert.deepEqual(imported.report.failures, []);
  }
  const scanner = api.createUsageScanner({
    cacheStore: api.createUsageScanCacheStore(join(directory, 'scan-cache.json')),
  });
  const service = api.createCompressedUsageService({
    initialSessionsDir: sessionsDir,
    store,
    scanCycle: (root) =>
      scanner.scanCycle({
        sessionsDir: root,
        sessionIndexPath: join(directory, 'session-index.jsonl'),
      }),
  });
  const cacheStore = api.createCostOptimizationCacheStore(join(directory, 'cost-cache.json'));
  let cacheWrites = 0;
  const costs = api.createCostOptimizationRuntime({
    sessionsDir,
    defaultPricing: [],
    now: () => new Date('2026-10-22T00:00:00Z'),
    configStore: api.createCostOptimizationConfigStore(join(directory, 'cost-config.json')),
    cacheStore: {
      ...cacheStore,
      save: async (index) => {
        cacheWrites += 1;
        await cacheStore.save(index);
      },
    },
  });
  const initializeStartedAt = performance.now();
  await costs.initialize();
  const initializeMs = performance.now() - initializeStartedAt;
  const baselineRss = process.memoryUsage().rss;
  let peakRss = baselineRss;
  let lastTick = performance.now();
  let maxTimerGap = 0;
  let timerTicks = 0;
  const sample = () => {
    const now = performance.now();
    maxTimerGap = Math.max(maxTimerGap, now - lastTick);
    lastTick = now;
    peakRss = Math.max(peakRss, process.memoryUsage().rss);
  };
  const timer = setInterval(() => {
    timerTicks += 1;
    sample();
  }, TIMER_INTERVAL_MS);
  const start = performance.now();
  try {
    const cycle = await service.scanCycle(sessionsDir);
    const loadedAt = performance.now();
    sample();
    assert.equal(cycle.result.summary.sessions.length, SMALL_FILE_COUNT + LARGE_FILE_COUNT);
    assert.equal(cycle.result.summary.totals.totalTokens, IMPORTED_TOKEN_COUNT);
    await costs.applyUsageCycle(cycle);
    sample();
    const completedAt = performance.now();
    assert.equal(costs.getSnapshot({ period: 'total' }).coverage.totalTokens, IMPORTED_TOKEN_COUNT);
    return {
      initializeMs: round(initializeMs),
      loadMs: round(loadedAt - start),
      analysisMs: round(completedAt - loadedAt),
      totalMs: round(completedAt - start),
      parseCalls,
      cacheWrites,
      fullRebuild: cycle.changes.requiresFullRebuild,
      totalTokens: cycle.result.summary.totals.totalTokens,
      peakRssIncreaseMiB: round((peakRss - baselineRss) / MEBIBYTE),
      peakRssMiB: round(peakRss / MEBIBYTE),
      maxTimerGapMs: round(maxTimerGap),
      timerTicks,
      nodeVersion: process.versions.node,
      electronVersion: process.versions.electron,
    };
  } finally {
    clearInterval(timer);
    service.stop();
  }
};

const main = async () => {
  if (process.argv[2] === '--child') {
    process.stdout.write(
      `${JSON.stringify(await checkStartup(process.argv[3], process.argv[4], process.argv[5]))}\n`
    );
    return;
  }
  const baselineArg = process.argv.indexOf('--baseline-ref');
  const baselineRef = baselineArg >= 0 ? process.argv[baselineArg + 1] : undefined;
  if (baselineArg >= 0) {
    assert.ok(baselineRef, 'Missing baseline revision.');
  }
  const directory = await mkdtemp(join(tmpdir(), TEMP_PREFIX));
  try {
    const sessionsDir = join(directory, 'sources');
    await mkdir(sessionsDir);
    const sourceHashes = new Map();
    let rawBytes = 0;
    for (const [label, count, size] of [
      ['small', SMALL_FILE_COUNT, SMALL_FILE_BYTES],
      ['large', LARGE_FILE_COUNT, LARGE_FILE_BYTES],
    ]) {
      const content = createFixtureContent(size);
      const compressed = zstdCompressSync(content);
      for (let index = 0; index < count; index += 1) {
        const path = join(sessionsDir, `${label}-${index}.jsonl.zst`);
        await writeFile(path, compressed);
        sourceHashes.set(path, hash(compressed));
        rawBytes += content.length;
      }
    }
    const current = await bundle(directory, 'current');
    const modules = baselineRef
      ? [
          ['baseline', await bundle(directory, 'baseline', baselineRef)],
          ['current', current],
        ]
      : [['current', current]];
    await runChild(process.execPath, [current, directory, 'prepare']);
    const results = [];
    for (const [runtime, executable] of [
      ['Node', process.execPath],
      ['Electron', require('electron')],
    ]) {
      for (const [label, modulePath] of modules) {
        const samples = [];
        for (let repetition = 0; repetition < REPETITIONS; repetition += 1) {
          const sample = await runChild(executable, [modulePath, directory, 'measure']);
          if (label === 'current') {
            assert.equal(sample.cacheWrites, 0, 'Warm startup rewrote the unchanged cost index.');
            assert.equal(sample.fullRebuild, false);
          }
          samples.push(sample);
        }
        const median = (key) =>
          [...samples].sort((first, second) => first[key] - second[key])[
            Math.floor(samples.length / 2)
          ][key];
        const result = {
          runtime,
          label,
          files: sourceHashes.size,
          rawMiB: round(rawBytes / MEBIBYTE),
          medianInitializeMs: median('initializeMs'),
          medianLoadMs: median('loadMs'),
          medianAnalysisMs: median('analysisMs'),
          medianTotalMs: median('totalMs'),
          medianPeakRssIncreaseMiB: median('peakRssIncreaseMiB'),
          medianPeakRssMiB: median('peakRssMiB'),
          medianMaxTimerGapMs: median('maxTimerGapMs'),
          samples,
        };
        results.push(result);
        process.stdout.write(`${JSON.stringify(result)}\n`);
      }
    }
    for (const [path, originalHash] of sourceHashes) {
      assert.equal(hash(await readFile(path)), originalHash);
    }
    assert.equal((await readdir(sessionsDir)).length, sourceHashes.size);
    process.stdout.write(`Verified ${results.length} scenarios; source files unchanged.\n`);
  } finally {
    const checked = resolve(directory);
    assert.equal(dirname(checked), resolve(tmpdir()));
    assert.ok(basename(checked).startsWith(TEMP_PREFIX));
    await rm(checked, { recursive: true, force: true });
  }
};

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
