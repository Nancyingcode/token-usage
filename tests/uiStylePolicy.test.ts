/**
 * @file UI 样式策略测试
 * @description 约束 Renderer 样式入口、视觉令牌和迁移完成条件。
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const readRendererStyle = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), 'src/renderer', relativePath), 'utf8').replace(/\r\n/g, '\n');

const readRendererFile = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), 'src/renderer', relativePath), 'utf8').replace(/\r\n/g, '\n');

describe('UI style policy', () => {
  it('loads layered styles in deterministic order', () => {
    expect(readRendererStyle('styles.css').trim()).toBe(
      [
        "@import './styles/tokens.css';",
        "@import './styles/base.css';",
        "@import './styles/shell.css';",
        "@import './styles/components.css';",
        "@import './styles/views.css';",
      ].join('\n')
    );
  });

  it('has no temporary legacy stylesheet after migration', () => {
    expect(readRendererStyle('styles.css')).not.toContain('legacy.css');
    expect(existsSync(resolve(process.cwd(), 'src/renderer/styles/legacy.css'))).toBe(false);
  });

  it('keeps raw colors inside tokens only', () => {
    for (const file of ['base.css', 'shell.css', 'components.css', 'views.css']) {
      expect(readRendererStyle(`styles/${file}`)).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
    }
  });

  it('forbids undersized production text and unsafe blanket transitions', () => {
    const css = ['base.css', 'shell.css', 'components.css', 'views.css']
      .map((file) => readRendererStyle(`styles/${file}`))
      .join('\n');
    const fontSizes = css.match(/font-size:\s*[^;]+;/g) ?? [];

    expect(fontSizes.every((declaration) => declaration.includes('var(--font-size-'))).toBe(true);
    expect(css).not.toContain('transition: all');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('defines the approved brand tokens', () => {
    const tokens = readRendererStyle('styles/tokens.css');

    expect(tokens).toContain('--color-brand-950: #102b27;');
    expect(tokens).toContain('--color-brand-500: #37b786;');
    expect(tokens).toContain('--color-brand-300: #6ce0b5;');
    expect(tokens).toContain('--font-size-body: 0.8125rem;');
    expect(tokens).toContain('--control-height-compact: 2rem;');
  });

  it('defines reusable motion tokens for entering and exiting surfaces', () => {
    const tokens = readRendererStyle('styles/tokens.css');

    expect(tokens).toContain('--ease-motion-enter:');
    expect(tokens).toContain('--ease-motion-exit:');
    expect(tokens).toContain('--motion-distance-small:');
    expect(tokens).toContain('--motion-distance-medium:');
  });

  it('animates view changes, overlay exits, and active control indicators', () => {
    const app = readRendererFile('App.tsx');
    const shell = readRendererStyle('styles/shell.css');
    const components = readRendererStyle('styles/components.css');
    const views = readRendererStyle('styles/views.css');

    expect(app).toContain('key={viewTransitionKey}');
    expect(app).toContain('className="view-transition"');
    expect(shell).toContain('.nav-item::before');
    expect(components).toContain('.accessible-tab::after');
    expect(components).toContain(".drawer-shell[data-state='exiting']");
    expect(components).toContain(".toast-notice[data-state='exiting']");
    expect(views).toContain('.view-transition > *');
    expect(views).toContain(".dialog-backdrop[data-state='exiting']");
    expect(views).toContain(".confirm-dialog[data-state='exiting']");
  });

  it('disables new movement and indicator transitions for reduced motion', () => {
    const css = ['shell.css', 'components.css', 'views.css']
      .map((file) => readRendererStyle(`styles/${file}`))
      .join('\n');

    expect(css).toContain('.view-transition > *');
    expect(css).toContain('.nav-item::before');
    expect(css).toContain('.accessible-tab::after');
    expect(css.match(/@media \(prefers-reduced-motion: reduce\)/g)?.length).toBeGreaterThanOrEqual(
      3
    );
  });

  it('adds bounded data feedback and lightweight microinteractions', () => {
    const base = readRendererStyle('styles/base.css');
    const shell = readRendererStyle('styles/shell.css');
    const components = readRendererStyle('styles/components.css');
    const views = readRendererStyle('styles/views.css');
    const sidebar = readRendererFile('components/Sidebar.tsx');

    expect(base).toContain('button:not(:disabled):active');
    expect(components).toContain('.animated-value');
    expect(components).toContain('@keyframes data-value-enter');
    expect(components).toContain('.motion-list-item');
    expect(components).toContain('@keyframes motion-list-item-enter');
    expect(components).toContain('.metric-card:hover');
    expect(components).toContain('.performance-summary-card:hover');
    expect(shell).toContain('.scan-status--scanning i');
    expect(shell).toContain('@keyframes scan-status-pulse');
    expect(shell).toContain('@keyframes badge-pop');
    expect(views).toContain('@keyframes tooltip-enter');
    expect(sidebar).toContain('key={`${item.key}:${badgeCount}`}');
  });

  it('disables second-phase feedback animation for reduced motion', () => {
    const css = ['base.css', 'shell.css', 'components.css', 'views.css']
      .map((file) => readRendererStyle(`styles/${file}`))
      .join('\n');

    expect(css).toContain('.animated-value');
    expect(css).toContain('.motion-list-item');
    expect(css).toContain('.scan-status--scanning i');
    expect(css).toContain('.nav-badge');
    expect(css).toContain('.trend-tooltip');
    expect(css).toContain('button:not(:disabled):active');
  });

  it('uses the brand accent for the featured overview metric value', () => {
    const components = readRendererStyle('styles/components.css');
    const featuredValueRule =
      components.match(/\.metric-card--featured \.metric-copy strong\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(featuredValueRule).toContain('color: var(--color-brand-300);');
    expect(featuredValueRule).not.toContain('color: var(--color-surface);');
  });

  it('does not show a busy cursor for ordinary disabled action buttons', () => {
    const views = readRendererStyle('styles/views.css');
    const disabledActionRule =
      views.match(
        /\.primary-button:disabled,\s*\.secondary-button:disabled,\s*\.danger-button:disabled\s*\{([^}]*)\}/
      )?.[1] ?? '';

    expect(disabledActionRule).toContain('cursor: not-allowed;');
    expect(disabledActionRule).not.toContain('cursor: wait;');
  });

  it('keeps the navigation sidebar visible while page content scrolls', () => {
    const shell = readRendererStyle('styles/shell.css');
    const sidebarRule = shell.match(/\.sidebar\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(sidebarRule).toContain('position: sticky;');
    expect(sidebarRule).toContain('top: 0;');
    expect(sidebarRule).toContain('height: 100vh;');
    expect(sidebarRule).toContain('overflow-y: auto;');
  });

  it('fits the overview into the first viewport without a content scrollbar', () => {
    const views = readRendererStyle('styles/views.css');
    const overviewPanelRule = views.match(/\.main-panel--overview\s*\{([^}]*)\}/)?.[1] ?? '';
    const overviewGridRule =
      views.match(/\.main-panel--overview \.overview-grid\s*\{([^}]*)\}/)?.[1] ?? '';
    const overviewChartRule =
      views.match(/\.main-panel--overview \.chart-panel\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(overviewPanelRule).toContain('overflow: hidden;');
    expect(overviewPanelRule).toContain('flex-direction: column;');
    expect(overviewGridRule).toContain('grid-template-rows: auto minmax(0, 1fr) auto;');
    expect(overviewChartRule).toContain('min-height: 0;');
    expect(views).toContain('@media (max-height: 740px) and (min-width: 761px)');
  });

  it('uses a full-width GitHub-style year for the overview activity calendar', () => {
    const views = readRendererStyle('styles/views.css');

    expect(views).toContain('grid-template-columns: repeat(53, var(--activity-cell-size));');
    expect(views).not.toContain('grid-template-columns: repeat(12, var(--activity-cell-size));');
  });

  it('defines draggable title bar space without making controls draggable', () => {
    const shell = readRendererStyle('styles/shell.css');
    const titleBarRule = shell.match(/\.title-bar\s*\{([^}]*)\}/)?.[1] ?? '';
    const controlRule = shell.match(/\.window-control\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(titleBarRule).toContain('-webkit-app-region: drag;');
    expect(controlRule).toContain('-webkit-app-region: no-drag;');
    expect(shell).toContain('.window-control--close:hover');
  });
});
