import React from 'react';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ICON_SIZE_SMALL } from '../constants/ui';

interface UsageRowDetailsProps {
  name: string;
  fields: readonly { label: string; value: string; fullWidth?: boolean }[];
}

const UsageRowDetails: React.FC<UsageRowDetailsProps> = ({ name, fields }) => {
  const { t } = useTranslation('analytics');

  return (
    <details className="usage-row-details">
      <summary aria-label={t('usageRowDetails.label', { name })}>
        <ChevronDown size={ICON_SIZE_SMALL} aria-hidden="true" />
        <span>{t('usageRowDetails.action')}</span>
      </summary>
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
