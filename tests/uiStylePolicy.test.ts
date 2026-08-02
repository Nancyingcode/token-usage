/**
 * @file UI 样式策略测试
 * @description 约束 Renderer 样式入口、视觉令牌和迁移完成条件。
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const readRendererStyle = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), 'src/renderer', relativePath), 'utf8');

describe('UI style policy', () => {
  it('loads layered styles in deterministic order', () => {
    expect(readRendererStyle('styles.css').trim()).toBe(
      [
        "@import './styles/tokens.css';",
        "@import './styles/base.css';",
        "@import './styles/legacy.css';",
        "@import './styles/shell.css';",
        "@import './styles/components.css';",
        "@import './styles/views.css';",
      ].join('\n')
    );
  });

  it('defines the approved brand tokens', () => {
    const tokens = readRendererStyle('styles/tokens.css');

    expect(tokens).toContain('--color-brand-950: #102b27;');
    expect(tokens).toContain('--color-brand-500: #37b786;');
    expect(tokens).toContain('--color-brand-300: #6ce0b5;');
    expect(tokens).toContain('--font-size-body: 0.8125rem;');
    expect(tokens).toContain('--control-height-compact: 2rem;');
  });
});
