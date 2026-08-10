import React from 'react';
import { Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ICON_SIZE_SMALL } from '../constants/ui';
import { useExitTransition } from '../hooks/useExitTransition';
import { useOverlayFocus } from '../hooks/useOverlayFocus';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}) => {
  const { t } = useTranslation('common');
  const { state, requestExit, requestExitWith, handleAnimationEnd } = useExitTransition(onCancel);
  const dialogRef = useOverlayFocus<HTMLElement>(requestExit);

  return (
    <div className="dialog-backdrop" data-state={state} onAnimationEnd={handleAnimationEnd}>
      <section
        ref={dialogRef}
        className="confirm-dialog"
        data-state={state}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
      >
        <div>
          <h2 id="confirm-title">{title}</h2>
          <p>{message}</p>
        </div>
        <div className="dialog-actions">
          <button type="button" className="secondary-button" onClick={requestExit}>
            {t('action.cancel')}
          </button>
          <button
            type="button"
            className="danger-button"
            onClick={() => requestExitWith(onConfirm)}
          >
            <Trash2 size={ICON_SIZE_SMALL} />
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
};

export default ConfirmDialog;
