/**
 * @file Non-blocking toast notice
 * @description Announces transient success feedback and dismisses it after a bounded duration.
 */
import React from 'react';
import { CheckCircle2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ICON_SIZE_SMALL } from '../constants/ui';

const DEFAULT_TOAST_DURATION_MS = 4_000;

interface ToastNoticeProps {
  message: string;
  onDismiss: () => void;
  durationMs?: number;
}

const ToastNotice: React.FC<ToastNoticeProps> = ({
  message,
  onDismiss,
  durationMs = DEFAULT_TOAST_DURATION_MS,
}) => {
  const { t } = useTranslation('common');

  React.useEffect(() => {
    const timer = window.setTimeout(onDismiss, durationMs);
    return () => window.clearTimeout(timer);
  }, [durationMs, onDismiss]);

  return (
    <div className="toast-notice" role="status">
      <CheckCircle2 size={ICON_SIZE_SMALL} aria-hidden="true" />
      <span>{message}</span>
      <button type="button" aria-label={t('action.close')} onClick={onDismiss}>
        <X size={ICON_SIZE_SMALL} aria-hidden="true" />
      </button>
    </div>
  );
};

export default ToastNotice;
