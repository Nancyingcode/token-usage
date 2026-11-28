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
const BACKSPACE = { key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 };
const DOWN = { key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 };
const HOME = { key: 'Home', code: 'Home', windowsVirtualKeyCode: 36 };
const END = { key: 'End', code: 'End', windowsVirtualKeyCode: 35 };
const WEEK = '.period-toggle--overview button:nth-child(2)';
const MONTH = '.period-toggle--overview button:nth-child(3)';
const CUSTOM = '.period-toggle--overview [aria-haspopup="dialog"]';
const DATE_MENU = '.overview-period-menu .select-menu-trigger';
const DATE_DIALOG = '.date-range-dialog[open]';
const ROW_DETAILS = '.usage-row-details > summary';
const SESSION_RESULTS = '.session-table [role="rowgroup"]';
const SESSION_SEARCH = '.session-filter-search input';
const SESSION_NEXT = '.session-pagination-navigation button:last-child';
const SESSION_PREVIOUS = '.session-pagination-navigation button:first-child';
const SESSION_CAUSE = '.session-filter-controls label:nth-child(3) .select-menu-trigger';
const PROJECT_RESULTS = '.project-table tbody';
const PROJECT_SEARCH = '.project-list-controls input';
const PROJECT_SORT = '.project-list-controls .select-menu-trigger';
const COST_RESULTS = '.cost-optimization-results';
const COST_PROJECT = '.cost-optimization-toolbar .select-menu-trigger';
const COST_MONTH = '.title-bar-toolbar .period-toggle button:nth-child(3)';
const MENU_OPTIONS = '.select-menu-popover [role="option"]';

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
  const waitForCondition = async (description, predicate, ...args) => {
    for (let attempt = 0; attempt < RENDER_ATTEMPTS; attempt += 1) {
      if (await evaluate(predicate, ...args)) {
        return;
      }
      await wait(RENDER_POLL_MS);
    }
    assert.fail(`Timed out waiting for ${description}`);
  };
  const waitFor = (selector) =>
    waitForCondition(selector, (target) => Boolean(document.querySelector(target)), selector);
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
  const waitForStarts = (name, count) =>
    waitForCondition(
      `${count} ${name} starts`,
      (expected, minimum) =>
        window.motionFixture.motionStarts.filter((event) => event.name === expected).length >=
        minimum,
      name,
      count
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

  const openOverview = async (size, locale, theme, preference, scenario = 'overview') => {
    resize(size);
    await setMotion(preference);
    await withinTimeout(
      browserWindow.loadFile(join(directory, 'index.html'), { query: { locale, theme, scenario } }),
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
  await waitForStarts('trend-range-enter', 2);
  await click(WEEK);
  await waitForStarts('trend-range-enter', 4);
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

  const verifySessionSettings = async () => {
    const historyToggle = '.session-speed-history > summary';
    const settingsVisible = () =>
      evaluate(() => {
        const details = document.querySelector('.session-execution-details');
        if (!details?.checkVisibility()) return false;
        const bounds = details.getBoundingClientRect();
        const row = details.closest('[role="row"]').getBoundingClientRect();
        const shares = [...details.querySelectorAll('.session-fast-shares dd')];
        return (
          bounds.left >= row.left - 1 &&
          bounds.right <= row.right + 1 &&
          details.scrollWidth <= details.clientWidth + 1 &&
          details.querySelector('.session-effort-table tbody th')?.innerText === 'motion-test' &&
          details.querySelector('.session-effort-table tbody td')?.innerText === 'ultra' &&
          shares.length === 2 &&
          shares.every((share) => share.checkVisibility() && share.innerText.includes('100.00%'))
        );
      });
    assert.ok(await settingsVisible(), 'Session execution details should fit the row');
    await focus(historyToggle);
    await key(ENTER);
    await paint();
    assert.deepEqual(
      await evaluate(() =>
        [...document.querySelectorAll('.session-speed-history li')].map(
          (entry) => entry.checkVisibility() && Boolean(entry.querySelector('time'))
        )
      ),
      [true, true]
    );
    await key(SPACE);
    await assertFocused(historyToggle);
    await focus(ROW_DETAILS);
  };

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
        const fields = details.querySelector('.usage-row-details-fields');
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
    if (view === 'sessions') await verifySessionSettings();
    resize(WIDE_WINDOW);
    await paint();
    await assertFocused(ROW_DETAILS);
    assert.equal((await readDetails()).open, true);
    if (view === 'sessions') {
      await key(SPACE);
      await evaluate((selector) => document.querySelector(selector).blur(), ROW_DETAILS);
      assert.ok(
        await evaluate(
          (selector) => document.querySelector(selector).checkVisibility(),
          ROW_DETAILS
        ),
        'Wide session rows must offer details before receiving focus'
      );
      await focus(ROW_DETAILS);
      await key(ENTER);
      await paint();
      await verifySessionSettings();
    }
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

  const insertText = (text) => command('Input.insertText', { text });
  const clearSearch = async (selector) => {
    await evaluate((target) => document.querySelector(target).select(), selector);
    await key(BACKSPACE);
  };
  const selectLastOption = async (selector) => {
    await focus(selector);
    // 从分页移回筛选器会滚动列表，等待焦点引起的滚动完成，再按键打开菜单。
    await paint();
    await key(ENTER);
    await waitFor(MENU_OPTIONS);
    await key(END);
    await key(ENTER);
  };
  const holdResultFade = async (selector) => {
    const fade = await evaluate(
      async (target, maxAttempts) => {
        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
          await new Promise(requestAnimationFrame);
          const surface = document.querySelector(target);
          const animation = surface
            ?.getAnimations()
            .find((item) => item.animationName === 'results-enter');
          if (!animation) {
            continue;
          }
          animation.pause();
          animation.currentTime = 1;
          await animation.ready;
          const style = getComputedStyle(surface);
          return {
            duration: style.animationDuration,
            delay: style.animationDelay,
            opacity: animation.effect.getKeyframes().map((frame) => frame.opacity),
            transform: style.transform,
          };
        }
        return null;
      },
      selector,
      RENDER_ATTEMPTS
    );
    assert.deepEqual(
      fade,
      {
        duration: '0.14s',
        delay: '0s',
        opacity: ['0.9', '1'],
        transform: 'none',
      },
      selector
    );
  };
  const finishResultFade = async (selector) => {
    await evaluate((target) => {
      document
        .querySelector(target)
        .getAnimations()
        .find((animation) => animation.animationName === 'results-enter')
        ?.finish();
    }, selector);
    await waitForCondition(
      'result fade cleanup',
      (target) => !document.querySelector(target).classList.contains('results-enter'),
      selector
    );
  };
  const resultStarts = () => starts('results-enter');

  await openOverview(WIDE_WINDOW, 'en', 'mint-light', 'no-preference', 'results');
  await navigate('sessions');
  await waitFor(SESSION_RESULTS);
  await paint();
  await evaluate((target) => {
    const results = document.querySelector(target);
    window.resultProbe = { sessionRow: results.firstElementChild };
  }, SESSION_RESULTS);
  await focus(SESSION_SEARCH);
  await insertText('Fixture session 0');
  await paint();
  const readSessions = () =>
    evaluate((target) => {
      const rows = document.querySelector(target);
      return {
        count: rows.children.length,
        last: rows.lastElementChild.textContent,
        sameFirstRow: rows.firstElementChild === window.resultProbe?.sessionRow,
        page: document.querySelector('.session-pagination-navigation [role="status"]').textContent,
      };
    }, SESSION_RESULTS);
  const searched = await readSessions();
  assert.equal(searched.count, 9);
  assert.equal(searched.sameFirstRow, true);
  await key(BACKSPACE);
  assert.equal((await readSessions()).count, 10);
  await clearSearch(SESSION_SEARCH);
  await paint();
  assert.equal((await readSessions()).sameFirstRow, true);
  await assertFocused(SESSION_SEARCH);
  assert.equal((await resultStarts()).length, 0);
  assert.equal((await starts('motion-list-item-enter')).length, 0);

  await focus(SESSION_NEXT);
  await key(ENTER);
  await holdResultFade(SESSION_RESULTS);
  assert.equal((await readSessions()).page, 'Page 2 of 3');
  await waitForStarts('results-enter', 1);
  assert.equal((await resultStarts()).length, 1);
  await key(ENTER);
  await holdResultFade(SESSION_RESULTS);
  await waitForStarts('results-enter', 2);
  const lastPage = await readSessions();
  assert.equal(lastPage.page, 'Page 3 of 3');
  assert.equal(lastPage.count, 10);
  assert.match(lastPage.last, /Fixture session 30/);
  assert.equal(
    await evaluate((target) => document.querySelector(target).disabled, SESSION_NEXT),
    true
  );
  assert.equal((await resultStarts()).length, 2);
  // Keep the animation active to exercise the preference change even on a slow machine.
  await setMotion('reduce');
  await paint();
  assert.equal(
    await evaluate(
      (target) => getComputedStyle(document.querySelector(target)).opacity,
      SESSION_RESULTS
    ),
    '1'
  );
  await setMotion('no-preference');
  await paint();
  assert.equal(
    (await resultStarts()).length,
    2,
    'Re-enabling motion must not replay a completed page change'
  );
  await selectLastOption(SESSION_CAUSE);
  await holdResultFade(SESSION_RESULTS);
  await paint();
  assert.equal((await readSessions()).page, 'Page 1 of 3');
  assert.equal(
    await evaluate((target) => document.querySelector(target).disabled, SESSION_PREVIOUS),
    true
  );
  assert.equal((await resultStarts()).length, 3);
  await assertFocused(SESSION_CAUSE);
  process.stdout.write(
    'en / mint-light / 1440: continuous search, rapid pagination, filters and mid-fade preference passed\n'
  );

  resize(COMPACT_WINDOW);
  await navigate('projects');
  await waitFor(PROJECT_RESULTS);
  await paint();
  const projectSummary = PROJECT_RESULTS + ' tr:first-child ' + ROW_DETAILS;
  const resultsBeforeProjects = (await resultStarts()).length;
  await focus(projectSummary);
  await key(ENTER);
  assert.equal(
    await evaluate(
      (target) => document.querySelector(target).closest('details').open,
      projectSummary
    ),
    true
  );
  assert.equal(
    await evaluate(() => {
      const container = document.querySelector('.project-table-scroll');
      const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
      return container.clientWidth < 68 * rem;
    }),
    true
  );
  await evaluate((target) => {
    window.resultProbe = {
      project: document.querySelector(target),
      chart: document.querySelector('.project-donut-chart'),
      header: document.querySelector('.project-table thead'),
    };
  }, projectSummary);
  await focus(PROJECT_SEARCH);
  await insertText('Fixture project A');
  await paint();
  assert.equal(
    await evaluate((target) => document.querySelector(target).children.length, PROJECT_RESULTS),
    1
  );
  await key(BACKSPACE);
  await clearSearch(PROJECT_SEARCH);
  await assertFocused(PROJECT_SEARCH);
  await evaluate(() => window.resultProbe.project.focus());
  const readProjectFocus = () =>
    evaluate(() => {
      const { project, chart, header } = window.resultProbe;
      const main = document.querySelector('main');
      const viewport = main.getBoundingClientRect();
      const bounds = project.getBoundingClientRect();
      return {
        focused: document.activeElement === project,
        rank: Array.from(project.closest('tbody').rows).indexOf(project.closest('tr')),
        open: project.closest('details').open,
        visible: bounds.top >= viewport.top - 1 && bounds.bottom <= viewport.bottom + 1,
        scrollTop: main.scrollTop,
        sameChrome:
          chart === document.querySelector('.project-donut-chart') &&
          header === document.querySelector('.project-table thead'),
      };
    });
  const beforeProjectUpdate = await readProjectFocus();
  assert.ok(beforeProjectUpdate.open && beforeProjectUpdate.focused && beforeProjectUpdate.visible);
  await evaluate(() => window.motionFixture.publishProjectChange('add'));
  await paint();
  assert.deepEqual(await readProjectFocus(), beforeProjectUpdate);
  await evaluate(() => window.motionFixture.publishProjectChange('reorder'));
  await paint();
  const moved = await readProjectFocus();
  assert.ok(moved.focused && moved.open && moved.visible && moved.sameChrome);
  assert.equal(moved.rank, 8);
  assert.ok(moved.scrollTop > 0);
  resize(WIDE_WINDOW);
  await paint();
  resize(COMPACT_WINDOW);
  await paint();
  assert.ok((await readProjectFocus()).open && (await readProjectFocus()).focused);
  await evaluate(() => window.motionFixture.publishProjectChange('remove'));
  await paint();
  await assertFocused(PROJECT_SEARCH);
  assert.equal((await resultStarts()).length, resultsBeforeProjects);
  assert.equal((await starts('motion-list-item-enter')).length, 0);

  await selectLastOption(PROJECT_SORT);
  await holdResultFade(PROJECT_RESULTS);
  await paint();
  assert.equal((await resultStarts()).length, resultsBeforeProjects + 1);
  assert.equal(
    await evaluate(() => {
      const { header, chart } = window.resultProbe;
      return (
        header === document.querySelector('.project-table thead') &&
        chart === document.querySelector('.project-donut-chart')
      );
    }),
    true
  );
  await assertFocused(PROJECT_SORT);
  process.stdout.write(
    'en / mint-light / 900 and 1440: project search, narrow-row reordering, scroll, focus and sorting passed\n'
  );

  const chooseCostProject = async (name) => {
    await focus(COST_PROJECT);
    await key(ENTER);
    await waitFor(MENU_OPTIONS);
    await key(HOME);
    const index = await evaluate(
      (target, project) =>
        [...document.querySelectorAll(target)].findIndex((item) =>
          item.textContent.endsWith(project)
        ),
      MENU_OPTIONS,
      name
    );
    assert.ok(index >= 0, name);
    for (let move = 0; move < index; move += 1) {
      await key(DOWN);
    }
    await key(ENTER);
    await assertFocused(COST_PROJECT);
  };
  const costRequest = (name, period) =>
    waitForCondition(
      'pending cost request',
      (project, range) => window.motionFixture.hasCostRequest(project, range),
      name,
      period
    );
  const settleCost = (name, period, result) =>
    evaluate(
      (project, range, outcome) => window.motionFixture.settleCostRequest(project, range, outcome),
      name,
      period,
      result
    );
  const waitForCost = (amount) =>
    waitForCondition(
      'visible current cost',
      (value) => {
        const readout = document.querySelector(
          '.cost-optimization-metric-grid .metric-card--featured strong'
        );
        const currency = new Intl.NumberFormat(document.documentElement.lang, {
          style: 'currency',
          currency: 'USD',
        });
        return readout?.textContent === currency.format(value);
      },
      amount
    );

  for (const [size, locale, theme, preference] of [
    [WIDE_WINDOW, 'en', 'mint-light', 'no-preference'],
    [COMPACT_WINDOW, 'zh-CN', 'ocean-dark', 'reduce'],
  ]) {
    const reduced = preference === 'reduce';
    await openOverview(size, locale, theme, preference, 'results');
    if (reduced) {
      await navigate('sessions');
      await waitFor(SESSION_NEXT);
      await focus(SESSION_NEXT);
      await key(ENTER);
      await paint();
      assert.equal((await readSessions()).count, 10);
      assert.equal(
        await evaluate(
          (target) => getComputedStyle(document.querySelector(target)).opacity,
          SESSION_RESULTS
        ),
        '1'
      );
      assert.equal((await resultStarts()).length, 0);
    }
    await navigate('costOptimization');
    await waitForCost(48.2);
    await paint();
    assert.equal((await resultStarts()).length, 0);
    const [projectB, projectC] = await evaluate(() => {
      const trigger = document.querySelector('.cost-optimization-toolbar .select-menu-trigger');
      const heading = document.querySelector('.cost-optimization-workspace h1');
      window.resultProbe = { trigger, heading };
      return window.motionFixture.resultProjectNames.slice(1, 3);
    });
    const pageStarts = (await starts('view-enter')).length;
    await chooseCostProject(projectB);
    await costRequest(projectB, 'week');
    await waitFor('.cost-optimization-workspace [aria-busy="true"]');
    assert.equal(
      await evaluate((target) => document.querySelector(target) === null, COST_RESULTS),
      true
    );
    await chooseCostProject(projectC);
    await costRequest(projectC, 'week');
    await key(ENTER);
    await waitFor(MENU_OPTIONS);
    await settleCost(projectC, 'week', 37);
    if (!reduced) {
      await holdResultFade(COST_RESULTS);
    }
    await waitForCost(37);
    await settleCost(projectB, 'week', reduced ? 'superseded fixture request' : 62);
    await paint();
    await waitForCost(37);
    assert.equal(
      await evaluate(() => {
        const { trigger, heading } = window.resultProbe;
        return (
          trigger === document.activeElement &&
          trigger.getAttribute('aria-expanded') === 'true' &&
          heading === document.querySelector('.cost-optimization-workspace h1') &&
          document.querySelector('.cost-optimization-workspace [role="alert"]') === null
        );
      }),
      true
    );
    assert.equal((await starts('view-enter')).length, pageStarts);
    assert.equal((await resultStarts()).length, reduced ? 0 : 1);
    if (!reduced) {
      await finishResultFade(COST_RESULTS);
    }
    await key(ESCAPE);
    await evaluate((name) => window.motionFixture.publishCost(name, 'week', 43), projectC);
    await waitForCost(43);
    await assertFocused(COST_PROJECT);
    assert.equal((await resultStarts()).length, reduced ? 0 : 1);

    await chooseCostProject(projectB);
    await costRequest(projectB, 'week');
    await settleCost(projectB, 'week', 'current fixture request failed');
    await waitFor('.cost-optimization-workspace [role="alert"]');
    await assertFocused(COST_PROJECT);
    await focus(COST_MONTH);
    await key(ENTER);
    await costRequest(projectB, 'month');
    await settleCost(projectB, 'month', 54);
    if (!reduced) {
      await holdResultFade(COST_RESULTS);
    }
    await waitForCost(54);
    await paint();
    await assertFocused(COST_MONTH);
    if (reduced) {
      assert.equal(
        await evaluate(
          (target) => getComputedStyle(document.querySelector(target)).opacity,
          COST_RESULTS
        ),
        '1'
      );
      await setMotion('no-preference');
      await paint();
    }
    assert.equal((await resultStarts()).length, reduced ? 0 : 2);
    process.stdout.write(
      `${locale} / ${theme} / ${size[0]} / ${preference}: cost selection, out-of-order results, error recovery and focus passed\n`
    );
  }
};

module.exports = { checkRendererMotion };
