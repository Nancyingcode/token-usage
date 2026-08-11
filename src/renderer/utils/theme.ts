/**
 * @file Renderer 主题应用
 * @description 把已解析主题同步到文档根元素和浏览器原生配色方案。
 */

import { getThemeColorScheme, type ThemeId } from '../../shared/theme';

export const applyThemeToDocument = (
  themeId: ThemeId,
  root: HTMLElement = document.documentElement
): void => {
  const themeRoot = root;
  themeRoot.dataset.theme = themeId;
  themeRoot.style.colorScheme = getThemeColorScheme(themeId);
};
