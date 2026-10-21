/**
 * @file 压缩状态条与概览布局回归
 * @description 在隔离的 Electron 窗口中渲染生产组件与 CSS，仅使用合成数据，验证图表高度、滚动与详情展开。
 */
const assert = require('node:assert/strict');
const { mkdtemp, mkdir, readFile, rm, writeFile } = require('node:fs/promises');
const { basename, dirname, join, resolve } = require('node:path');
const { tmpdir } = require('node:os');
const { spawn } = require('node:child_process');

const WORKSPACE = resolve(__dirname, '..');
const TEMP_PREFIX = 'token-usage-layout-';
const MIN_PLOT_HEIGHT = 190;
const COMPACT_PANEL_MAX_HEIGHT = 92;
const GEOMETRY_TOLERANCE = 1;
const RENDER_WAIT_MS = 100;
const RENDER_ATTEMPTS = 50;
const CASES = [
  { width: 1264, height: 755, locale: 'zh-CN', theme: 'mint-light', scenario: 'pending' },
  { width: 1280, height: 720, locale: 'en', theme: 'mint-light', scenario: 'pending' },
  { width: 1440, height: 900, locale: 'zh-CN', theme: 'emerald-dark', scenario: 'pending' },
  { width: 640, height: 720, locale: 'en', theme: 'mint-light', scenario: 'partial' },
  { width: 800, height: 720, locale: 'en', theme: 'mint-light', scenario: 'pending' },
  { width: 1600, height: 1080, locale: 'zh-CN', theme: 'mint-light', scenario: 'pending' },
  { width: 1264, height: 755, locale: 'zh-CN', theme: 'mint-light', scenario: 'none' },
];

const runElectron = async () => {
  const { app, BrowserWindow } = require('electron');
  const directory = process.argv[3];
  const screenshots = process.argv[4];
  app.setPath('userData', join(directory, 'user-data'));
  app.disableHardwareAcceleration();
  await app.whenReady();
  const window = new BrowserWindow({
    show: false,
    frame: false,
    useContentSize: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('console-message', (details) => {
    if (details.level === 'error') {
      process.stderr.write(`${details.message}\n`);
    }
  });
  const measure = () =>
    window.webContents.executeJavaScript(`(() => {
    const box = (selector) => document.querySelector(selector)?.getBoundingClientRect().toJSON();
    const main = document.querySelector('main');
    return { plot: box('.trend-chart-plot'), chart: box('.chart-panel'), calendar: box('.activity-panel'),
      panel: box('.compressed-data-panel'), main: box('main'),
      clientHeight: main.clientHeight, scrollHeight: main.scrollHeight,
      clientWidth: main.clientWidth, scrollWidth: main.scrollWidth,
      overflowY: getComputedStyle(main).overflowY,
      button: box('.compressed-data-heading button:last-child') };
  })()`);
  const check = (geometry, label) => {
    assert.ok(
      geometry.plot.height >= MIN_PLOT_HEIGHT - GEOMETRY_TOLERANCE,
      `${label}: trend plot collapsed to ${geometry.plot.height}px`
    );
    assert.ok(
      geometry.chart.bottom <= geometry.calendar.top + GEOMETRY_TOLERANCE,
      `${label}: chart overlaps calendar`
    );
    assert.ok(
      geometry.plot.bottom <= geometry.chart.bottom + GEOMETRY_TOLERANCE,
      `${label}: plot overflows chart`
    );
    assert.ok(
      geometry.scrollWidth <= geometry.clientWidth + GEOMETRY_TOLERANCE,
      `${label}: horizontal overflow`
    );
    if (geometry.scrollHeight > geometry.clientHeight + GEOMETRY_TOLERANCE) {
      assert.ok(
        ['auto', 'scroll'].includes(geometry.overflowY),
        `${label}: tall content is clipped`
      );
    }
  };
  try {
    for (const fixture of CASES) {
      window.setContentSize(fixture.width, fixture.height);
      await window.loadFile(join(directory, 'index.html'), { query: fixture });
      for (let attempt = 0; attempt < RENDER_ATTEMPTS; attempt += 1) {
        if (
          await window.webContents.executeJavaScript(
            "Boolean(document.querySelector('.trend-chart svg'))"
          )
        ) {
          break;
        }
        await new Promise((resolveWait) => setTimeout(resolveWait, RENDER_WAIT_MS));
      }
      await window.webContents.executeJavaScript(
        `document.documentElement.dataset.theme = ${JSON.stringify(fixture.theme)}`
      );
      await new Promise((resolveWait) => setTimeout(resolveWait, RENDER_WAIT_MS));
      const label = `${fixture.width}x${fixture.height}-${fixture.locale}-${fixture.theme}-${fixture.scenario}`;
      const closed = await measure();
      if (screenshots) {
        await writeFile(
          join(screenshots, `${label}.png`),
          (await window.webContents.capturePage()).toPNG()
        );
      }
      check(closed, label);
      const chartKeyboardAccess = await window.webContents.executeJavaScript(`(() => {
        const point = document.querySelector('.trend-chart [tabindex="0"]');
        point.focus({ preventScroll: true });
        return document.activeElement === point;
      })()`);
      assert.ok(chartKeyboardAccess, `${label}: chart lost keyboard access`);
      if (fixture.scenario === 'pending' && fixture.width >= 1000) {
        assert.ok(
          closed.panel.height <= COMPACT_PANEL_MAX_HEIGHT,
          `${label}: compact panel is ${closed.panel.height}px tall`
        );
      }
      if (fixture.scenario !== 'none') {
        await window.webContents.executeJavaScript(
          `document.querySelector('.compressed-data-panel [aria-expanded]').click()`
        );
        await new Promise((resolveWait) => setTimeout(resolveWait, RENDER_WAIT_MS));
        const expanded = await measure();
        check(expanded, `${label}-expanded`);
        assert.ok(expanded.panel.height > closed.panel.height, `${label}: details did not expand`);
        await window.webContents.executeJavaScript(
          `document.querySelector('.compressed-data-failures')?.setAttribute('open', '')`
        );
        await new Promise((resolveWait) => setTimeout(resolveWait, RENDER_WAIT_MS));
        check(await measure(), `${label}-failures`);
        if (screenshots) {
          await writeFile(
            join(screenshots, `${label}-expanded.png`),
            (await window.webContents.capturePage()).toPNG()
          );
        }
        await window.webContents.executeJavaScript(
          `document.querySelector('.compressed-data-failures')?.removeAttribute('open'); document.querySelector('.compressed-data-panel [aria-expanded]').click()`
        );
        await new Promise((resolveWait) => setTimeout(resolveWait, RENDER_WAIT_MS));
        const collapsed = await measure();
        check(collapsed, `${label}-collapsed`);
        assert.ok(
          Math.abs(collapsed.panel.height - closed.panel.height) <= GEOMETRY_TOLERANCE,
          `${label}: details did not collapse`
        );
      }
      await window.webContents.executeJavaScript(
        `document.querySelector('.pricing-quality-notice').setAttribute('open', '')`
      );
      check(await measure(), `${label}-pricing-details`);
      process.stdout.write(
        `${label}: plot ${closed.plot.height}px; panel ${closed.panel?.height ?? 0}px; passed\n`
      );
    }
  } finally {
    window.destroy();
  }
};

const main = async () => {
  if (process.argv[2] === '--electron') {
    try {
      await runElectron();
      require('electron').app.exit(0);
    } catch (error) {
      process.stderr.write(`${error.stack ?? error}\n`);
      require('electron').app.exit(1);
    }
    return;
  }
  const directory = await mkdtemp(join(tmpdir(), TEMP_PREFIX));
  try {
    const screenshotsIndex = process.argv.indexOf('--screenshots');
    const screenshots = screenshotsIndex >= 0 ? resolve(process.argv[screenshotsIndex + 1]) : '';
    if (screenshots) {
      await mkdir(screenshots, { recursive: true });
    }
    await require('esbuild').build({
      entryPoints: [join(WORKSPACE, 'tests/nodeHelpers/compressedLayoutFixture.tsx')],
      tsconfig: join(WORKSPACE, 'tsconfig.web.json'),
      outfile: join(directory, 'fixture.js'),
      bundle: true,
      platform: 'browser',
      format: 'iife',
      jsx: 'automatic',
      define: { 'process.env.NODE_ENV': '"production"' },
    });
    const styles = await Promise.all(
      ['tokens', 'base', 'shell', 'components', 'views'].map((name) =>
        readFile(join(WORKSPACE, `src/renderer/styles/${name}.css`), 'utf8')
      )
    );
    await writeFile(
      join(directory, 'index.html'),
      `<!doctype html><html><head><meta charset="UTF-8"><style>${styles.join('\n')}\n*,*::before,*::after {animation:none !important;transition:none !important;}</style></head><body><div id="root"></div><script>window.addEventListener('error', (event) => console.error(event.message));</script><script src="fixture.js"></script></body></html>`
    );
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    await new Promise((resolveExit, rejectExit) => {
      const child = spawn(require('electron'), [__filename, '--electron', directory, screenshots], {
        env,
        cwd: WORKSPACE,
        windowsHide: true,
        stdio: 'inherit',
      });
      child.on('error', rejectExit);
      child.on('exit', (code) =>
        code === 0 ? resolveExit() : rejectExit(new Error(`Layout checks failed (${code}).`))
      );
    });
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
