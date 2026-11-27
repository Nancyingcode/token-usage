/**
 * @file 压缩状态条与概览布局回归
 * @description 在隔离的 Electron 窗口中渲染生产组件与 CSS，仅使用合成数据，验证图表比例、活动日历标签、滚动与详情展开。
 */
const assert = require('node:assert/strict');
const { mkdtemp, mkdir, readFile, rm, writeFile } = require('node:fs/promises');
const { basename, dirname, join, resolve } = require('node:path');
const { tmpdir } = require('node:os');
const { spawn } = require('node:child_process');
const { checkRendererMotion } = require('./check-renderer-motion.cjs');

const WORKSPACE = resolve(__dirname, '..');
const checkMotion = process.argv.includes('--motion');
const TEMP_PREFIX = 'token-usage-layout-';
const MIN_PLOT_HEIGHT = 190;
const COMPACT_PANEL_MAX_HEIGHT = 92;
const MAX_PRICING_NOTICE_GAP = 24;
const GEOMETRY_TOLERANCE = 1;
const SCALE_TOLERANCE = 0.01;
const MIN_TEXT_CONTRAST = 4.5;
const LOCAL_COST_TITLES = { en: 'Local Cost Estimate', 'zh-CN': '本地估算费用' };
const PARTIAL_PRICING_COPY = {
  en: {
    title: 'Partially priced',
    tokenUnit: 'tokens',
    scope: 'The local cost estimate includes only priced usage.',
    reason: 'Cached input has no published price.',
  },
  'zh-CN': {
    title: '部分用量未计价',
    tokenUnit: 'Token',
    scope: '本地估算费用仅包含已计价的用量。',
    reason: '官方未提供缓存输入价格。',
  },
};
const EXPECTED_UNPRICED_TOKENS = { default: 1_920_000, short: 30_337_600 };
const PRICING_PREVIEW_PADDING = 12;
const TAB_KEY = { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 };
const ENTER_KEY = { key: 'Enter', code: 'Enter', text: '\r', windowsVirtualKeyCode: 13 };
const SPACE_KEY = { key: ' ', code: 'Space', text: ' ', windowsVirtualKeyCode: 32 };
const RENDER_WAIT_MS = 100;
const RENDER_ATTEMPTS = 50;
const CASES = [
  {
    width: 1264,
    height: 755,
    locale: 'zh-CN',
    theme: 'mint-light',
    scenario: 'none',
    pricing: 'partial',
  },
  { width: 1264, height: 755, locale: 'zh-CN', theme: 'mint-light', scenario: 'pending' },
  { width: 1280, height: 720, locale: 'en', theme: 'mint-light', scenario: 'pending' },
  { width: 1440, height: 900, locale: 'zh-CN', theme: 'emerald-dark', scenario: 'pending' },
  { width: 1280, height: 720, locale: 'en', theme: 'ocean-dark', scenario: 'none' },
  { width: 1280, height: 720, locale: 'zh-CN', theme: 'sand-light', scenario: 'none' },
  { width: 640, height: 720, locale: 'en', theme: 'mint-light', scenario: 'partial' },
  { width: 800, height: 720, locale: 'en', theme: 'mint-light', scenario: 'pending' },
  { width: 1600, height: 1080, locale: 'zh-CN', theme: 'mint-light', scenario: 'pending' },
  { width: 1264, height: 755, locale: 'zh-CN', theme: 'mint-light', scenario: 'none' },
  {
    width: 1024,
    height: 680,
    locale: 'zh-CN',
    theme: 'mint-light',
    scenario: 'none',
    range: 'short',
    pricing: 'partial',
  },
  {
    width: 1024,
    height: 680,
    locale: 'en',
    theme: 'ocean-dark',
    scenario: 'none',
    range: 'short',
    pricing: 'partial',
  },
  {
    width: 1360,
    height: 900,
    locale: 'zh-CN',
    theme: 'mint-light',
    scenario: 'none',
    range: 'short',
  },
];

const relativeLuminance = (color) => {
  const rgb = /^rgb\((\d+), (\d+), (\d+)\)$/.exec(color);
  assert.ok(rgb, `Expected an opaque sRGB metric color, got ${color}`);
  const [red, green, blue] = rgb.slice(1).map((value) => {
    const channel = Number(value) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
};

const checkTextContrast = (foreground, background, label) => {
  const lightness = [foreground, background].map(relativeLuminance);
  const contrast = (Math.max(...lightness) + 0.05) / (Math.min(...lightness) + 0.05);
  assert.ok(
    contrast >= MIN_TEXT_CONTRAST,
    `${label} contrast ${contrast.toFixed(2)}:1 is below ${MIN_TEXT_CONTRAST}:1`
  );
};

const checkWithin = (box, container, label) => {
  const edges = [
    container.left - box.left,
    box.right - container.right,
    container.top - box.top,
    box.bottom - container.bottom,
  ];
  assert.ok(
    edges.every((edge) => edge <= GEOMETRY_TOLERANCE),
    `${label} is clipped`
  );
};

const checkMetricCards = (cards, locale, label) => {
  assert.equal(cards.length, 4, `${label}: expected four overview metrics`);
  const [cost, ...otherCards] = cards;
  for (const [part, color] of Object.entries(cost.colors)) {
    checkTextContrast(color, cost.background, `${label}: cost ${part}`);
  }
  for (const card of otherCards) {
    assert.notEqual(card.background, cost.background, `${label}: another cost-style metric`);
    assert.equal(
      card.background,
      otherCards[0].background,
      `${label}: inconsistent neutral metrics`
    );
  }
  assert.equal(
    cost.title,
    LOCAL_COST_TITLES[locale],
    `${label}: cost should be labeled as a local estimate`
  );
};

const runElectron = async () => {
  const { app, BrowserWindow } = require('electron');
  const directory = process.argv[3];
  const screenshots = process.argv[4];
  app.setPath('userData', join(directory, 'user-data'));
  if (!checkMotion) {
    app.commandLine.appendSwitch('force-prefers-reduced-motion');
  }
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
      offscreen: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('console-message', (details) => {
    if (details.level === 'error') {
      process.stderr.write(`${details.message}\n`);
    }
  });
  const saveScreenshot = async (label, clip) => {
    if (!screenshots) {
      return;
    }
    await window.webContents.executeJavaScript(
      'new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))'
    );
    const { data } = await window.webContents.debugger.sendCommand('Page.captureScreenshot', {
      format: 'png',
      ...(clip ? { clip } : {}),
    });
    await writeFile(join(screenshots, `${label}.png`), Buffer.from(data, 'base64'));
  };
  const measure = () =>
    window.webContents.executeJavaScript(`(() => {
    const box = (selector) => document.querySelector(selector)?.getBoundingClientRect().toJSON();
    const main = document.querySelector('main');
    const trendLine = document.querySelector('.trend-line');
    const marker = box('.trend-point');
    const lineStart = trendLine.getPointAtLength(0).matrixTransform(trendLine.getScreenCTM());
    const labelTransform = document.querySelector('.trend-x-axis text').getScreenCTM();
    const tickLabels = Array.from(document.querySelectorAll('.trend-y-axis text'), (label) => {
      const { y } = new DOMPoint(0, label.y.baseVal.getItem(0).value).matrixTransform(label.getScreenCTM());
      return { box: label.getBoundingClientRect().toJSON(), color: getComputedStyle(label).fill,
        text: label.textContent, y };
    });
    const gridY = Array.from(document.querySelectorAll('.trend-grid-line'), (line) =>
      line.getBoundingClientRect().top);
    const calendarScroll = document.querySelector('.activity-calendar-scroll');
    const calendarGrid = document.querySelector('.activity-grid');
    const weekdayCenters = ['monday', 'wednesday', 'friday'].map((day, index) => {
      const label = box('.activity-labels .' + day);
      const cell = calendarGrid.children[index * 2 + 1].getBoundingClientRect();
      return Math.abs(label.top + label.height / 2 - (cell.top + cell.height / 2));
    });
    const monthSpans = document.querySelectorAll('.activity-months > span:not(:empty)');
    const monthLabels = Array.from(monthSpans, (span) => {
      const textRange = document.createRange();
      textRange.selectNodeContents(span);
      const { left, right } = textRange.getBoundingClientRect();
      return { text: span.textContent, left, right };
    });
    const metricCards = Array.from(document.querySelectorAll('.overview-grid .metric-card'), (card) => {
      const title = card.querySelector('.metric-copy p');
      return {
        background: getComputedStyle(card).backgroundColor,
        title: title.textContent,
        colors: {
          amount: getComputedStyle(card.querySelector('.metric-copy strong')).color,
          title: getComputedStyle(title).color,
          detail: getComputedStyle(card.querySelector('.metric-copy span')).color,
        },
      };
    });
    return { plot: box('.trend-chart-plot'), chart: box('.chart-panel'), calendar: box('.activity-panel'),
      chartBackground: getComputedStyle(document.querySelector('.chart-panel')).backgroundColor,
      tickLabels, gridY, peak: box('.trend-peak-label'),
      peakColor: getComputedStyle(document.querySelector('.trend-peak-label')).fill,
      lineDashoffset: parseFloat(getComputedStyle(trendLine).strokeDashoffset),
      trendSvg: box('.trend-chart-plot > svg'), marker, metricCards, lineStart: { x: lineStart.x, y: lineStart.y },
      labelScaleX: labelTransform.a, labelScaleY: labelTransform.d, monthLabels, weekdayCenters,
      activity: {
        weeks: Number(calendarGrid.dataset.weekCount),
        days: calendarGrid.children.length,
        focusableDays: calendarGrid.querySelectorAll('[tabindex="0"]').length,
        scrollLeft: calendarScroll.scrollLeft, scrollWidth: calendarScroll.scrollWidth,
        clientWidth: calendarScroll.clientWidth,
      },
      panel: box('.compressed-data-panel'), main: box('main'),
      clientHeight: main.clientHeight, scrollHeight: main.scrollHeight,
      clientWidth: main.clientWidth, scrollWidth: main.scrollWidth,
      overflowY: getComputedStyle(main).overflowY,
      button: box('.compressed-data-heading button:last-child') };
  })()`);
  const check = (geometry, label, weeks = 53) => {
    const { plot, trendSvg, marker, lineStart, labelScaleX, labelScaleY, monthLabels } = geometry;
    assert.ok(
      plot.height >= MIN_PLOT_HEIGHT - GEOMETRY_TOLERANCE,
      `${label}: trend plot collapsed to ${plot.height}px`
    );
    assert.ok(
      Math.abs(trendSvg.width - plot.width) <= GEOMETRY_TOLERANCE &&
        Math.abs(trendSvg.height - plot.height) <= GEOMETRY_TOLERANCE,
      `${label}: SVG does not fill the trend plot`
    );
    assert.ok(
      Math.abs(marker.width - marker.height) <= GEOMETRY_TOLERANCE,
      `${label}: trend marker is stretched to ${marker.width}x${marker.height}px`
    );
    assert.ok(
      Math.abs(labelScaleX - 1) <= SCALE_TOLERANCE && Math.abs(labelScaleY - 1) <= SCALE_TOLERANCE,
      `${label}: trend date text is scaled by ${labelScaleX}x${labelScaleY}`
    );
    assert.ok(
      Math.abs(marker.x + marker.width / 2 - lineStart.x) <= GEOMETRY_TOLERANCE &&
        Math.abs(marker.y + marker.height / 2 - lineStart.y) <= GEOMETRY_TOLERANCE,
      `${label}: trend marker is detached from the line`
    );
    assert.ok(
      geometry.chart.bottom <= geometry.calendar.top + GEOMETRY_TOLERANCE,
      `${label}: chart overlaps calendar`
    );
    assert.ok([3, 4].includes(geometry.tickLabels.length), `${label}: unexpected Token tick count`);
    assert.equal(geometry.lineDashoffset, 0, `${label}: trend line is hidden`);
    assert.equal(geometry.tickLabels[0].text, '0', `${label}: Token axis does not start at zero`);
    geometry.tickLabels.forEach((tick, index) => {
      assert.ok(
        Math.abs(tick.y - geometry.gridY[index]) <= GEOMETRY_TOLERANCE,
        `${label}: Token tick ${tick.text} is detached from its grid line`
      );
      checkWithin(tick.box, geometry.chart, `${label}: Token tick ${tick.text}`);
      checkTextContrast(tick.color, geometry.chartBackground, `${label}: Token tick`);
    });
    checkWithin(geometry.peak, geometry.chart, `${label}: trend peak`);
    checkTextContrast(geometry.peakColor, geometry.chartBackground, `${label}: trend peak`);
    assert.equal(geometry.activity.weeks, weeks, `${label}: unexpected activity week count`);
    assert.equal(geometry.activity.days, weeks * 7, `${label}: incomplete activity weeks`);
    assert.ok(
      geometry.weekdayCenters.every((distance) => distance <= GEOMETRY_TOLERANCE),
      `${label}: weekday labels are detached from the activity rows`
    );
    const expectedMonths = weeks === 53 ? 13 : 2;
    assert.equal(
      monthLabels.length,
      expectedMonths,
      `${label}: activity calendar lost month labels`
    );
    monthLabels.slice(1).forEach((month, index) => {
      const previous = monthLabels[index];
      assert.ok(
        previous.right <= month.left,
        `${label}: activity month labels ${previous.text} and ${month.text} overlap`
      );
    });
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
  const checkActivityTooltip = async (date, label, zero = false) => {
    const detail = await window.webContents.executeJavaScript(`(async () => {
      const day = document.querySelector('[data-testid="activity-day-' + ${JSON.stringify(date)} + '"]');
      day.focus({ preventScroll: true });
      await new Promise(requestAnimationFrame);
      const tooltip = document.querySelector('.activity-tooltip');
      return {
        focused: document.activeElement === day,
        tokens: tooltip?.querySelector('span')?.textContent,
        box: tooltip?.getBoundingClientRect().toJSON(),
        viewport: document.querySelector('.activity-calendar-scroll').getBoundingClientRect().toJSON(),
      };
    })()`);
    assert.ok(detail.focused, `${label}: activity day did not receive focus`);
    assert.ok(detail.box, `${label}: activity tooltip unavailable on focus`);
    checkWithin(detail.box, detail.viewport, `${label}: activity tooltip for ${date}`);
    if (zero) {
      assert.match(detail.tokens, /^0 (tokens|Token)$/);
    }
  };
  const pressKey = async ({ key, code, text, windowsVirtualKeyCode }, waitMs = RENDER_WAIT_MS) => {
    const description = { key, code, windowsVirtualKeyCode };
    const debuggerSession = window.webContents.debugger;
    await debuggerSession.sendCommand('Input.dispatchKeyEvent', {
      ...description,
      type: 'keyDown',
      text,
      unmodifiedText: text,
    });
    await debuggerSession.sendCommand('Input.dispatchKeyEvent', { ...description, type: 'keyUp' });
    if (waitMs > 0) {
      await new Promise((resolveWait) => setTimeout(resolveWait, waitMs));
    }
  };
  const measurePricingNotice = () =>
    window.webContents.executeJavaScript(`(() => {
      const notice = document.querySelector('.pricing-quality-notice');
      if (!notice) return null;
      const heading = document.querySelector('.page-header');
      const subtitle = heading.querySelector('.page-header-copy > p');
      const summary = notice.querySelector('summary');
      const { x, y, width, height } = summary.getBoundingClientRect();
      return {
        heading: heading.getBoundingClientRect().toJSON(),
        subtitle: subtitle.getBoundingClientRect().toJSON(),
        box: notice.getBoundingClientRect().toJSON(),
        summary: summary.textContent,
        open: notice.open,
        focused: document.activeElement === summary,
        hitTarget: document.elementFromPoint(x + width / 2, y + height / 2)?.closest('summary') === summary,
        details: Array.from(notice.querySelectorAll('p, li'), (element) => element.textContent),
        scrollWidth: notice.scrollWidth,
        clientWidth: notice.clientWidth,
      };
    })()`);
  const savePricingScreenshot = async (label, notice) => {
    const x = Math.floor(notice.box.left) - PRICING_PREVIEW_PADDING;
    const y = Math.floor(notice.heading.top) - PRICING_PREVIEW_PADDING;
    await saveScreenshot(`${label}-pricing-area`, {
      x,
      y,
      width: Math.ceil(notice.box.right) + PRICING_PREVIEW_PADDING - x,
      height: Math.ceil(notice.box.bottom) + PRICING_PREVIEW_PADDING - y,
      scale: 1,
    });
  };
  const checkPricingNotice = async (fixture, label) => {
    const copy = PARTIAL_PRICING_COPY[fixture.locale];
    const closed = await measurePricingNotice();
    assert.ok(closed?.summary.includes(copy.title), `${label}: partial pricing notice is missing`);
    const gap = closed.box.top - closed.subtitle.bottom;
    assert.ok(
      gap >= 0 && gap <= MAX_PRICING_NOTICE_GAP,
      `${label}: overview subtitle-to-pricing notice gap is ${gap}px`
    );
    const unpricedTokens = EXPECTED_UNPRICED_TOKENS[fixture.range ?? 'default'];
    const count = new Intl.NumberFormat(fixture.locale).format(unpricedTokens);
    assert.ok(
      closed.summary.includes(`${count} ${copy.tokenUnit}`),
      `${label}: expected ${count} unpriced tokens`
    );
    assert.equal(closed.open, false, `${label}: pricing details start expanded`);
    assert.ok(closed.hitTarget, `${label}: pricing toggle is covered`);
    await savePricingScreenshot(label, closed);

    await window.webContents.executeJavaScript(
      "Array.from(document.querySelectorAll('.nav-list button')).at(-1).focus()"
    );
    await pressKey(TAB_KEY);
    assert.ok((await measurePricingNotice()).focused, `${label}: Tab skips the pricing toggle`);
    await pressKey(ENTER_KEY);
    const opened = await measurePricingNotice();
    assert.ok(opened.open, `${label}: Enter did not expand the pricing details`);
    assert.ok(opened.focused, `${label}: expanding the pricing details moved focus`);
    assert.ok(opened.box.height > closed.box.height, `${label}: pricing details stay hidden`);
    assert.ok(opened.details.includes(copy.scope), `${label}: cost estimate scope is missing`);
    assert.ok(opened.details.includes(copy.reason), `${label}: missing-price reason is missing`);
    assert.ok(
      opened.scrollWidth <= opened.clientWidth + GEOMETRY_TOLERANCE,
      `${label}: expanded pricing details overflow horizontally`
    );
    check(await measure(), `${label}-pricing-expanded`, fixture.range === 'short' ? 3 : 53);
    await saveScreenshot(`${label}-expanded`);
    await savePricingScreenshot(`${label}-expanded`, opened);

    await pressKey(SPACE_KEY);
    const collapsed = await measurePricingNotice();
    assert.equal(collapsed.open, false, `${label}: Space did not close the pricing details`);
    assert.ok(collapsed.focused, `${label}: collapsing the pricing details moved focus`);
    assert.ok(
      Math.abs(collapsed.box.height - closed.box.height) <= GEOMETRY_TOLERANCE,
      `${label}: collapsing changed the pricing notice height`
    );
    await window.webContents.executeJavaScript('document.activeElement.blur()');
    return gap;
  };
  const checkShortCalendar = async (closed, label) => {
    assert.equal(
      closed.activity.scrollWidth,
      closed.activity.clientWidth,
      `${label}: short calendar scrolls`
    );
    assert.equal(closed.activity.focusableDays, 13, `${label}: selected dates are missing`);
    await window.webContents.executeJavaScript(
      "document.querySelector('.activity-panel').scrollIntoView({ block: 'end' })"
    );
    await checkActivityTooltip('2026-10-31', label);
    await checkActivityTooltip('2026-11-12', label);
    await checkActivityTooltip('2026-11-02', label, true);
    const hitTarget = await window.webContents.executeJavaScript(`(() => {
      const toggle = document.querySelector('.activity-window-toggle');
      const { x, y, width, height } = toggle.getBoundingClientRect();
      toggle.focus({ preventScroll: true });
      return document.elementFromPoint(x + width / 2, y + height / 2)?.closest('button') === toggle;
    })()`);
    assert.ok(hitTarget, `${label}: calendar toggle is covered`);
    await pressKey(ENTER_KEY);
    const expanded = await measure();
    check(expanded, `${label}-53-weeks`);
    assert.equal(
      expanded.activity.focusableDays,
      closed.activity.focusableDays,
      `${label}: calendar toggle changed the selected dates`
    );
    assert.ok(
      Math.abs(
        expanded.activity.scrollWidth - expanded.activity.clientWidth - expanded.activity.scrollLeft
      ) <= GEOMETRY_TOLERANCE,
      `${label}: expanded calendar is scrolled away from its end week`
    );
    const toggleState = () =>
      window.webContents.executeJavaScript(`(() => {
        const toggle = document.querySelector('.activity-window-toggle');
        return { focused: document.activeElement === toggle, expanded: toggle.getAttribute('aria-expanded') };
      })()`);
    assert.deepEqual(await toggleState(), { focused: true, expanded: 'true' });
    await saveScreenshot(`${label}-53-weeks`);
    await checkActivityTooltip('2026-11-12', `${label}-53-weeks`);
    await window.webContents.executeJavaScript(
      "document.querySelector('.activity-window-toggle').focus({ preventScroll: true })"
    );
    await pressKey(SPACE_KEY);
    check(await measure(), `${label}-selected-weeks`, 3);
    assert.deepEqual(await toggleState(), { focused: true, expanded: 'false' });
    await window.webContents.executeJavaScript('document.activeElement.blur()');
    await saveScreenshot(`${label}-activity`);
  };
  try {
    if (checkMotion) {
      await checkRendererMotion(window, directory, pressKey);
      return;
    }
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
      if (!window.webContents.debugger.isAttached()) {
        window.webContents.debugger.attach();
      }
      await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', {
        enabled: true,
      });
      await window.webContents.executeJavaScript(
        `document.documentElement.dataset.theme = ${JSON.stringify(fixture.theme)}`
      );
      await new Promise((resolveWait) => setTimeout(resolveWait, RENDER_WAIT_MS));
      const pricingSuffix = fixture.pricing ? `-pricing-${fixture.pricing}` : '';
      const rangeSuffix = fixture.range ? `-${fixture.range}` : '';
      const weeks = fixture.range === 'short' ? 3 : 53;
      const label = `${fixture.width}x${fixture.height}-${fixture.locale}-${fixture.theme}-${fixture.scenario}${rangeSuffix}${pricingSuffix}`;
      const closed = await measure();
      checkMetricCards(closed.metricCards, fixture.locale, label);
      await saveScreenshot(label);
      const hasPartialPricing = fixture.pricing === 'partial';
      const pricingGap = hasPartialPricing ? await checkPricingNotice(fixture, label) : undefined;
      check(closed, label, weeks);
      const chartKeyboardAccess = await window.webContents.executeJavaScript(`(async () => {
        const point = document.querySelector('.trend-chart [tabindex="0"]');
        point.focus({ preventScroll: true });
        await new Promise(requestAnimationFrame);
        const hint = document.querySelector('.trend-tooltip');
        const result = {
          focused: document.activeElement === point,
          hasEstimate: Boolean(hint?.querySelector('.trend-tooltip-cost b')?.textContent),
          box: hint?.getBoundingClientRect().toJSON(),
        };
        point.blur();
        return result;
      })()`);
      assert.ok(chartKeyboardAccess.focused, `${label}: chart point did not receive focus`);
      assert.ok(
        chartKeyboardAccess.hasEstimate,
        `${label}: chart keyboard tooltip lost the cost estimate`
      );
      checkWithin(chartKeyboardAccess.box, closed.chart, `${label}: trend tooltip`);
      if (fixture.range === 'short') {
        await checkShortCalendar(closed, label);
      }
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
        check(expanded, `${label}-expanded`, weeks);
        assert.ok(expanded.panel.height > closed.panel.height, `${label}: details did not expand`);
        await window.webContents.executeJavaScript(
          `document.querySelector('.compressed-data-failures')?.setAttribute('open', '')`
        );
        await new Promise((resolveWait) => setTimeout(resolveWait, RENDER_WAIT_MS));
        check(await measure(), `${label}-failures`, weeks);
        await saveScreenshot(`${label}-expanded`);
        await window.webContents.executeJavaScript(
          `document.querySelector('.compressed-data-failures')?.removeAttribute('open'); document.querySelector('.compressed-data-panel [aria-expanded]').click()`
        );
        await new Promise((resolveWait) => setTimeout(resolveWait, RENDER_WAIT_MS));
        const collapsed = await measure();
        check(collapsed, `${label}-collapsed`, weeks);
        assert.ok(
          Math.abs(collapsed.panel.height - closed.panel.height) <= GEOMETRY_TOLERANCE,
          `${label}: details did not collapse`
        );
      }
      if (!hasPartialPricing) {
        await window.webContents.executeJavaScript(
          `document.querySelector('.pricing-quality-notice').setAttribute('open', '')`
        );
        check(await measure(), `${label}-pricing-details`, weeks);
      }
      const pricingResult = pricingGap === undefined ? '' : ` pricing gap ${pricingGap}px;`;
      process.stdout.write(
        `${label}: plot ${closed.plot.height}px; panel ${closed.panel?.height ?? 0}px;${pricingResult} passed\n`
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
    const fixtureName = checkMotion ? 'rendererMotionFixture.tsx' : 'compressedLayoutFixture.tsx';
    await require('esbuild').build({
      entryPoints: [join(WORKSPACE, 'tests/nodeHelpers', fixtureName)],
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
    const staticStyles = checkMotion
      ? ''
      : '*,*::before,*::after {animation:none !important;transition:none !important;}';
    await writeFile(
      join(directory, 'index.html'),
      `<!doctype html><html><head><meta charset="UTF-8"><style>${styles.join('\n')}\n${staticStyles}</style></head><body><div id="root"></div><script>window.addEventListener('error', (event) => console.error(event.message));</script><script src="fixture.js"></script></body></html>`
    );
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    await new Promise((resolveExit, rejectExit) => {
      const args = [__filename, '--electron', directory, screenshots];
      if (checkMotion) {
        args.push('--motion');
      }
      const child = spawn(require('electron'), args, {
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
