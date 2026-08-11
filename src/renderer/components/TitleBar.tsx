import React, { useCallback, useEffect, useState } from 'react';
import { Copy, Minus, Square, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { WindowState } from '../../shared/windowTypes';
import { ICON_SIZE_SMALL, NAV_ICON_STROKE_WIDTH } from '../constants/ui';
import Toolbar, { type ToolbarProps } from './Toolbar';

const INITIAL_WINDOW_STATE: WindowState = { isMaximized: false };

const TitleBar: React.FC<ToolbarProps> = (toolbarProps) => {
  const { t } = useTranslation('common');
  const [windowState, setWindowState] = useState<WindowState>(INITIAL_WINDOW_STATE);

  useEffect(() => {
    let mounted = true;
    const unsubscribe = window.codexUsage.window.onStateChanged((state) => {
      if (mounted) {
        setWindowState(state);
      }
    });

    void window.codexUsage.window
      .getState()
      .then((state) => {
        if (mounted) {
          setWindowState(state);
        }
      })
      .catch(() => undefined);

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const handleMinimize = useCallback((): void => {
    void window.codexUsage.window.minimize().catch(() => undefined);
  }, []);
  const handleToggleMaximize = useCallback((): void => {
    void window.codexUsage.window
      .toggleMaximize()
      .then(setWindowState)
      .catch(() => undefined);
  }, []);
  const handleClose = useCallback((): void => {
    void window.codexUsage.window.close().catch(() => undefined);
  }, []);
  const maximizeLabel = windowState.isMaximized
    ? t('windowControls.restore')
    : t('windowControls.maximize');
  const MaximizeIcon = windowState.isMaximized ? Copy : Square;

  return (
    <header className="title-bar">
      <Toolbar {...toolbarProps} />
      <div className="window-controls">
        <button
          type="button"
          className="window-control"
          aria-label={t('windowControls.minimize')}
          title={t('windowControls.minimize')}
          onClick={handleMinimize}
        >
          <Minus aria-hidden="true" size={ICON_SIZE_SMALL} strokeWidth={NAV_ICON_STROKE_WIDTH} />
        </button>
        <button
          type="button"
          className="window-control"
          aria-label={maximizeLabel}
          title={maximizeLabel}
          onClick={handleToggleMaximize}
        >
          <MaximizeIcon
            aria-hidden="true"
            size={ICON_SIZE_SMALL}
            strokeWidth={NAV_ICON_STROKE_WIDTH}
          />
        </button>
        <button
          type="button"
          className="window-control window-control--close"
          aria-label={t('windowControls.close')}
          title={t('windowControls.close')}
          onClick={handleClose}
        >
          <X aria-hidden="true" size={ICON_SIZE_SMALL} strokeWidth={NAV_ICON_STROKE_WIDTH} />
        </button>
      </div>
    </header>
  );
};

export default TitleBar;
