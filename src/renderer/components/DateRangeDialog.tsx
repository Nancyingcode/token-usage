/**
 * @file 自定义日期对话框
 * @description 维护本次编辑的日期草稿，并调用原生模态对话框管理焦点。
 */
import React, { useId, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getUsageDateRangeIssue } from '../../shared/usageMath';
import type { UsageDateRange } from '../../shared/usageTypes';

interface DateRangeDialogProps {
  initialRange: UsageDateRange;
  today: string;
  onApply: (range: UsageDateRange) => void;
  onCancel: () => void;
}

const DATE_FIELDS = ['startDate', 'endDate'] as const;

const DateRangeDialog: React.FC<DateRangeDialogProps> = ({
  initialRange,
  today,
  onApply,
  onCancel,
}) => {
  const { t } = useTranslation('common');
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(() => ({
    startDate: { value: initialRange.startDate, badInput: false },
    endDate: { value: initialRange.endDate, badInput: false },
  }));
  const range = { startDate: draft.startDate.value, endDate: draft.endDate.value };
  const hasInvalidDate = draft.startDate.badInput || draft.endDate.badInput;
  const issue = hasInvalidDate ? 'invalid' : getUsageDateRangeIssue(range, today);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    dialog.showModal();
    return () => dialog.close();
  }, []);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!issue) {
      onApply(range);
    }
  };

  const handleCancel = (event: React.SyntheticEvent<HTMLDialogElement>): void => {
    event.preventDefault();
    onCancel();
  };

  return (
    <dialog
      ref={dialogRef}
      className="date-range-dialog"
      aria-labelledby={`${id}-title`}
      onCancel={handleCancel}
    >
      <form noValidate onSubmit={handleSubmit}>
        <h2 id={`${id}-title`}>{t('toolbar.customRange.title')}</h2>
        {DATE_FIELDS.map((field) => (
          <label key={field} className="date-range-field">
            <span>{t(`toolbar.customRange.${field}`)}</span>
            <input
              type="date"
              defaultValue={initialRange[field]}
              max={today}
              required
              aria-invalid={issue !== null || undefined}
              aria-describedby={`${id}-issue`}
              onInput={({ currentTarget }) => {
                const { value, validity } = currentTarget;
                const enteredDate = { value, badInput: validity.badInput };
                setDraft((previous) => ({ ...previous, [field]: enteredDate }));
              }}
            />
          </label>
        ))}
        <p id={`${id}-issue`} className="date-range-issue" role="status">
          {issue ? t(`toolbar.customRange.validation.${issue}`) : null}
        </p>
        <div className="dialog-actions">
          <button type="button" className="secondary-button" onClick={onCancel}>
            {t('action.cancel')}
          </button>
          <button type="submit" className="primary-button" disabled={issue !== null}>
            {t('toolbar.customRange.apply')}
          </button>
        </div>
      </form>
    </dialog>
  );
};

export default DateRangeDialog;
