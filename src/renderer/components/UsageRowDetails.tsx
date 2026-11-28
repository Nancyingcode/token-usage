import React from 'react';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ICON_SIZE_SMALL } from '../constants/ui';

interface UsageRowDetailsProps {
  name: string;
  fields: readonly { label: string; value: string; fullWidth?: boolean }[];
  children?: React.ReactNode;
}

const UsageRowDetails: React.FC<UsageRowDetailsProps> = ({ name, fields, children }) => {
  const { t } = useTranslation('analytics');
  const [open, setOpen] = React.useState(false);

  return (
    <details
      className="usage-row-details"
      onToggle={children ? (event) => setOpen(event.currentTarget.open) : undefined}
    >
      <summary aria-label={t('usageRowDetails.label', { name })}>
        <ChevronDown size={ICON_SIZE_SMALL} aria-hidden="true" />
        <span>{t('usageRowDetails.action')}</span>
      </summary>
      {open ? children : null}
      <dl className="usage-row-details-fields">
        {fields.map(({ label, value, fullWidth }) => (
          <div key={label} className={fullWidth ? 'usage-row-detail-full-width' : undefined}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
};

export default UsageRowDetails;
