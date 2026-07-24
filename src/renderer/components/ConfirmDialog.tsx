import React from 'react';
import { Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ICON_SIZE_SMALL } from '../constants/ui';

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

  return (
    <div className="dialog-backdrop">
      <section
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
      >
        <div>
          <h2 id="confirm-title">{title}</h2>
          <p>{message}</p>
        </div>
        <div className="dialog-actions">
          <button type="button" className="secondary-button" onClick={onCancel}>
            {t('action.cancel')}
          </button>
          <button type="button" className="danger-button" onClick={onConfirm}>
            <Trash2 size={ICON_SIZE_SMALL} />
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
};

export default ConfirmDialog;
