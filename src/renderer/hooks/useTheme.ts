/**
 * @file Renderer 主题状态
 * @description 读取和订阅权威主题快照，并协调主题保存反馈与根元素同步。
 */

import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_LIGHT_THEME,
  DEFAULT_THEME_PREFERENCE,
  isThemeId,
  type ThemePreference,
  type ThemeSnapshot,
} from '../../shared/theme';
import { applyThemeToDocument } from '../utils/theme';

export type ThemeFeedback = 'saved' | 'error' | null;

export interface ThemeState {
  snapshot: ThemeSnapshot;
  pending: boolean;
  feedback: ThemeFeedback;
  setPreference: (preference: ThemePreference) => Promise<void>;
}

const getInitialSnapshot = (): ThemeSnapshot => {
  const appliedTheme = document.documentElement.dataset.theme;
  return {
    preference: DEFAULT_THEME_PREFERENCE,
    resolvedTheme: isThemeId(appliedTheme) ? appliedTheme : DEFAULT_LIGHT_THEME,
  };
};

export const useTheme = (): ThemeState => {
  const [snapshot, setSnapshot] = useState<ThemeSnapshot>(getInitialSnapshot);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<ThemeFeedback>(null);

  const applySnapshot = useCallback((nextSnapshot: ThemeSnapshot): void => {
    setSnapshot(nextSnapshot);
    applyThemeToDocument(nextSnapshot.resolvedTheme);
  }, []);

  useEffect(() => {
    let active = true;
    const unsubscribe = window.codexUsage.theme.onUpdated((nextSnapshot) => {
      if (active) {
        applySnapshot(nextSnapshot);
      }
    });

    void window.codexUsage.theme
      .get()
      .then((nextSnapshot) => {
        if (active) {
          applySnapshot(nextSnapshot);
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
      unsubscribe();
    };
  }, [applySnapshot]);

  const setPreference = useCallback(
    async (preference: ThemePreference): Promise<void> => {
      setPending(true);
      setFeedback(null);

      try {
        applySnapshot(await window.codexUsage.theme.set(preference));
        setFeedback('saved');
      } catch {
        setFeedback('error');
      } finally {
        setPending(false);
      }
    },
    [applySnapshot]
  );

  return { snapshot, pending, feedback, setPreference };
};
