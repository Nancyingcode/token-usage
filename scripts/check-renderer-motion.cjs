/**
 * @file Electron 动效验收
 * @description 在隔离窗口中检查真实 CSS 动画、原生键盘交互和系统动效偏好。
 */
// Probes passed to evaluate run in the isolated renderer document.
/* global document, window, getComputedStyle, matchMedia, requestAnimationFrame */
const assert = require('node:assert/strict');
const { join } = require('node:path');
const { setTimeout: wait } = require('node:timers/promises');

const WIDE_WINDOW = [1440, 900];
const OVERVIEW_WINDOW = [1024, 680];
const COMPACT_WINDOW = [900, 680];
const RENDER_ATTEMPTS = 50;
const RENDER_POLL_MS = 100;
const COMMAND_TIMEOUT_MS = 10_000;
const ENTER = { key: 'Enter', code: 'Enter', text: '\r', windowsVirtualKeyCode: 13 };
const SPACE = { key: ' ', code: 'Space', text: ' ', windowsVirtualKeyCode: 32 };
const ESCAPE = { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 };
const END = { key: 'End', code: 'End', windowsVirtualKeyCode: 35 };
const WEEK = '.period-toggle--overview button:nth-child(2)';
const MONTH = '.period-toggle--overview button:nth-child(3)';
const CUSTOM = '.period-toggle--overview [aria-haspopup="dialog"]';
const DATE_MENU = '.overview-period-menu .select-menu-trigger';
const DATE_DIALOG = '.date-range-dialog[open]';
const ROW_DETAILS = '.usage-row-details > summary';

const withinTimeout = async (operation, description) => {
  const timeout = new AbortController();
  try {
    return await Promise.race([
      operation,
      wait(COMMAND_TIMEOUT_MS, undefined, { signal: timeout.signal }).then(() => {
        assert.fail(`Timed out during ${description}`);
      }),
    ]);
  } finally {
    timeout.abort();
  }
};

const checkRendererMotion = async (browserWindow, directory, pressKey) => {
  const { webContents } = browserWindow;
  const evaluate = (fn, ...args) =>
    withinTimeout(
      webContents.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`),
      fn.toString().split('\n')[0]
    );
  const command = (method, params) =>
    withinTimeout(webContents.debugger.sendCommand(method, params), method);
  const resize = ([width, height]) => browserWindow.setContentSize(width, height);
  const paint = () =>
    evaluate(async () => {
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
    });
  const key = (input) => withinTimeout(pressKey(input, 0), `key ${input.code}`);
  const setMotion = (value) =>
    command('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value }],
    });
  const waitFor = async (selector) => {
    for (let attempt = 0; attempt < RENDER_ATTEMPTS; attempt += 1) {
      if (await evaluate((target) => Boolean(document.querySelector(target)), selector)) {
        return;
      }
      await wait(RENDER_POLL_MS);
    }
    assert.fail(`Timed out waiting for ${selector}`);
  };
  const focus = (selector) =>
    evaluate((target) => document.querySelector(target).focus(), selector);
  const click = (selector) =>
    evaluate((target) => {
      const button = document.querySelector(target);
      button.focus();
      button.click();
    }, selector);
  const navigate = (view) =>
    evaluate((viewKey) => {
      const button = [...document.querySelectorAll('.nav-item')].find(
        (item) => item.title === window.motionFixture.labels[viewKey]
      );
      button.focus();
      button.click();
    }, view);
  const starts = (name) =>
    evaluate(
      (expected) => window.motionFixture.motionStarts.filter((event) => event.name === expected),
      name
    );
  const assertFocused = async (selector) =>
    assert.equal(
      await evaluate(
        (target) => document.activeElement === document.querySelector(target),
        selector
      ),
      true,
      `Expected focus on ${selector}`
    );

  await withinTimeout(browserWindow.loadURL('about:blank'), 'loading a debugger target');
  webContents.debugger.attach();
  await command('Emulation.setFocusEmulationEnabled', { enabled: true });

  const openOverview = async (size, locale, theme, preference) => {
    resize(size);
    await setMotion(preference);
    await withinTimeout(
      browserWindow.loadFile(join(directory, 'index.html'), { query: { locale, theme } }),
      'loading the motion fixture'
    );
    await waitFor('.page-stack--overview .trend-hit-target');
    await paint();
    assert.deepEqual(
      await evaluate(() => ({
        locale: document.documentElement.lang,
        theme: document.documentElement.dataset.theme,
        reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
      })),
      { locale, theme, reduced: preference === 'reduce' }
    );
  };

  const openDateDialog = async (compact) => {
    if (compact) {
      await focus(DATE_MENU);
      await key(ENTER);
      await waitFor('.select-menu-popover [role="option"]');
      await key(END);
      await key(ENTER);
    } else {
      await click(CUSTOM);
    }
    await waitFor(DATE_DIALOG);
    await paint();
    await assertFocused(`${DATE_DIALOG} input`);
  };
  const editDates = (valid) =>
    evaluate((isValid) => {
      const { today, yesterday } = window.motionFixture;
      const [start, end] = document.querySelectorAll('.date-range-dialog input');
      start.value = today;
      end.value = isValid ? today : yesterday;
      start.dispatchEvent(new Event('input', { bubbles: true }));
      end.dispatchEvent(new Event('input', { bubbles: true }));
    }, valid);
  const closeDateDialog = async (action, selector) => {
    if (action === 'escape') {
      await key(ESCAPE);
    } else {
      await click(`${DATE_DIALOG} button[type="${action === 'apply' ? 'submit' : 'button'}"]`);
    }
    await paint();
    assert.equal(
      await evaluate((target) => Boolean(document.querySelector(target)), DATE_DIALOG),
      false
    );
    await assertFocused(selector);
  };
  const dateStyles = () =>
    evaluate((selector) => {
      const dialog = document.querySelector(selector);
      return [
        getComputedStyle(dialog).animationName,
        getComputedStyle(dialog, '::backdrop').animationName,
      ];
    }, DATE_DIALOG);

  await openOverview(OVERVIEW_WINDOW, 'en', 'mint-light', 'no-preference');
  const pageStarts = (await starts('view-enter')).filter((item) =>
    item.target?.includes('page-stack--overview')
  );
  assert.equal(pageStarts.length, 1, 'Overview should enter as a single surface');
  assert.equal(pageStarts[0].duration, '0.18s');
  assert.equal(pageStarts[0].delay, '0s');
  assert.equal((await starts('trend-range-enter')).length, 0);
  assert.equal((await starts('data-value-enter')).length, 0);

  await click(MONTH);
  await paint();
  await click(WEEK);
  await paint();
  const rangeStarts = await starts('trend-range-enter');
  assert.equal(rangeStarts.length, 4, 'Each changed range should animate two graphic layers');
  assert.ok(rangeStarts.every(({ duration, delay }) => duration === '0.14s' && delay === '0s'));
  await assertFocused(WEEK);
  assert.deepEqual(
    await evaluate(
      (week) => ({
        selected: document.querySelector(week).getAttribute('aria-pressed'),
        peak: document.querySelector('.trend-peak-label').textContent,
      }),
      WEEK
    ),
    { selected: 'true', peak: '800' }
  );
  await click(WEEK);
  await paint();
  assert.equal((await starts('trend-range-enter')).length, rangeStarts.length);

  resize(COMPACT_WINDOW);
  await paint();
  await click('.activity-window-toggle');
  await paint();
  const updatedUsage = await evaluate(async () => {
    const calendar = document.querySelector('.activity-calendar-scroll');
    const grid = calendar.querySelector('.activity-grid');
    const rightEdge = calendar.scrollWidth - calendar.clientWidth;
    const wasAnchored = Math.abs(calendar.scrollLeft - rightEdge) <= 1;
    calendar.scrollLeft = Math.floor(rightEdge / 2);
    const scrollBefore = calendar.scrollLeft;
    const point = [...document.querySelectorAll('.trend-hit-target')].at(-1);
    point.focus({ preventScroll: true });
    window.motionFixture.publishUsage();
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    return {
      wasAnchored,
      scrollBefore,
      scrollAfter: calendar.scrollLeft,
      weeks: grid.dataset.weekCount,
      gridRetained: document.querySelector('.activity-grid') === grid,
      focused: document.activeElement === point,
      label: point.getAttribute('aria-label'),
      tooltip: document.querySelector('.trend-tooltip')?.textContent,
    };
  });
  assert.ok(
    updatedUsage.wasAnchored && updatedUsage.scrollBefore > 0,
    '53-week calendar did not anchor to its scrollable end'
  );
  assert.equal(updatedUsage.scrollAfter, updatedUsage.scrollBefore);
  assert.equal(updatedUsage.weeks, '53');
  assert.equal(updatedUsage.gridRetained, true);
  assert.equal(updatedUsage.focused, true);
  assert.match(updatedUsage.label, /3,200 total tokens/);
  assert.match(updatedUsage.tooltip, /3,200/);
  assert.equal((await starts('trend-range-enter')).length, rangeStarts.length);
  assert.deepEqual(
    await evaluate(() =>
      [...document.querySelectorAll('.metric-card strong')].map(
        (value) => getComputedStyle(value).animationName
      )
    ),
    ['data-value-enter', 'data-value-enter', 'none', 'data-value-enter'],
    'Only metrics whose values changed should animate'
  );
  process.stdout.write(
    'en / mint-light / ordinary: overview entry, range changes, focus and scrolling passed\n'
  );

  await openDateDialog(true);
  assert.deepEqual(await dateStyles(), ['date-range-dialog-enter', 'dialog-backdrop-enter']);
  await closeDateDialog('escape', DATE_MENU);
  await openDateDialog(true);
  await closeDateDialog('cancel', DATE_MENU);
  await openDateDialog(true);
  await editDates(true);
  await closeDateDialog('apply', DATE_MENU);
  assert.equal(await evaluate(() => document.querySelectorAll('.trend-hit-target').length), 1);

  resize(OVERVIEW_WINDOW);
  await paint();
  await openDateDialog(false);
  await editDates(false);
  assert.equal(
    await evaluate(
      () => document.querySelector('.date-range-dialog button[type="submit"]').disabled
    ),
    true
  );
  await closeDateDialog('cancel', CUSTOM);
  await openDateDialog(false);
  await closeDateDialog('escape', CUSTOM);
  await openDateDialog(false);
  await closeDateDialog('apply', CUSTOM);
  const panelStarts = await starts('date-range-dialog-enter');
  const maskStarts = (await starts('dialog-backdrop-enter')).filter(
    (event) => event.pseudoElement === '::backdrop'
  );
  assert.ok(panelStarts.length > 0 && maskStarts.length > 0);
  assert.ok(
    [...panelStarts, ...maskStarts].every(
      ({ duration, delay }) => duration === '0.18s' && delay === '0s'
    )
  );
  process.stdout.write(
    'en / mint-light / 900 and 1024: native date dialog, validation and focus passed\n'
  );

  const verifyRow = async (view, reduced) => {
    resize(OVERVIEW_WINDOW);
    await navigate(view);
    await waitFor(ROW_DETAILS);
    await paint();
    await focus(ROW_DETAILS);
    const readDetails = () =>
      evaluate((selector) => {
        const summary = document.querySelector(selector);
        const details = summary.closest('details');
        const arrow = getComputedStyle(summary.querySelector('svg'));
        const fields = details.querySelector('dl');
        return {
          open: details.open,
          focused: document.activeElement === summary,
          visible: fields.checkVisibility(),
          property: arrow.transitionProperty,
          duration: arrow.transitionDuration,
          direction: arrow.transform,
          fieldsDuration: getComputedStyle(fields).transitionDuration,
        };
      }, ROW_DETAILS);
    await key(ENTER);
    await paint();
    const opened = await readDetails();
    assert.ok(opened.open && opened.focused && opened.visible);
    assert.equal(opened.fieldsDuration, '0s');
    assert.equal(opened.property, reduced ? 'none' : 'transform');
    assert.equal(opened.duration, reduced ? '0s' : '0.14s');
    if (reduced) {
      assert.equal(opened.direction, 'matrix(-1, 0, 0, -1, 0, 0)');
    }
    resize(WIDE_WINDOW);
    await paint();
    await assertFocused(ROW_DETAILS);
    assert.equal((await readDetails()).open, true);
    resize(OVERVIEW_WINDOW);
    await paint();
    await key(SPACE);
    await paint();
    const closed = await readDetails();
    assert.equal(closed.open, false);
    assert.equal(closed.visible, false);
    assert.equal(closed.focused, true);
  };
  await verifyRow('sessions', false);
  await verifyRow('projects', false);
  await navigate('overview');
  await waitFor('.page-stack--overview');
  await paint();
  assert.equal(
    (await starts('view-enter')).filter((event) => event.target?.includes('page-stack--overview'))
      .length,
    2
  );
  process.stdout.write(
    'en / mint-light / 1024 and 1440: both row details and returning to overview passed\n'
  );

  await openOverview(WIDE_WINDOW, 'zh-CN', 'ocean-dark', 'reduce');
  assert.equal((await starts('view-enter')).length, 0);
  await click(MONTH);
  await paint();
  assert.equal((await starts('trend-range-enter')).length, 0);
  assert.deepEqual(
    await evaluate(async () => {
      const point = document.querySelector('.trend-hit-target');
      point.focus({ preventScroll: true });
      await new Promise(requestAnimationFrame);
      return [
        getComputedStyle(document.querySelector('.trend-range-enter')).opacity,
        getComputedStyle(document.querySelector('.trend-point')).transitionProperty,
        getComputedStyle(document.querySelector('.trend-point.active')).filter !== 'none',
      ];
    }),
    ['1', 'none', true]
  );
  await setMotion('no-preference');
  await paint();
  assert.equal(
    (await starts('trend-range-enter')).length,
    0,
    'Restoring motion preferences should not replay a previous range change'
  );
  await setMotion('reduce');
  await openDateDialog(false);
  assert.deepEqual(await dateStyles(), ['none', 'none']);
  await closeDateDialog('escape', CUSTOM);
  await verifyRow('sessions', true);
  await verifyRow('projects', true);
  process.stdout.write('zh-CN / ocean-dark / reduced: trend, date dialog and row details passed\n');

  await navigate('budgets');
  await waitFor('#budget-tab-policies');
  await click('#budget-tab-policies');
  await waitFor('.budget-table-row .danger');
  const deleteTrigger = '.budget-table-row .danger';
  for (const shouldConfirm of [false, true]) {
    await setMotion('no-preference');
    await click(deleteTrigger);
    await waitFor('.dialog-backdrop [role="alertdialog"]');
    const isExiting = await evaluate((confirm) => {
      const backdrop = document.querySelector('.dialog-backdrop');
      backdrop.querySelector(confirm ? '.danger-button' : '.secondary-button').click();
      backdrop.querySelector('.secondary-button').click();
      return new Promise((resolve) =>
        requestAnimationFrame(() => {
          const exit = backdrop
            .getAnimations()
            .find((animation) => animation.animationName === 'dialog-backdrop-exit');
          // Hold the live animation so slow machines exercise an actual mid-exit preference change.
          exit?.pause();
          resolve(Boolean(exit) && backdrop.dataset.state === 'exiting');
        })
      );
    }, shouldConfirm);
    assert.equal(
      isExiting,
      true,
      'Expected a live confirmation exit before changing system preference'
    );
    assert.equal(await evaluate(() => window.motionFixture.getDeletedPolicies()), 0);
    await setMotion('reduce');
    await paint();
    assert.equal(await evaluate(() => document.querySelector('.dialog-backdrop') === null), true);
    assert.equal(
      await evaluate(() => window.motionFixture.getDeletedPolicies()),
      shouldConfirm ? 1 : 0
    );
    if (!shouldConfirm) {
      await assertFocused(deleteTrigger);
    }
  }
  process.stdout.write(
    'zh-CN / ocean-dark: changing preference during a real exit restored focus and confirmed once\n'
  );
};

module.exports = { checkRendererMotion };
