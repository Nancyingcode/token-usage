import React from 'react';
import { isSupportedLocale, type SupportedLocale } from '../../shared/i18n/locale';

interface LanguageSelectorProps {
  locale: SupportedLocale;
  onChange: (locale: SupportedLocale) => void;
  ariaLabel: string;
  disabled?: boolean;
}

const LanguageSelector: React.FC<LanguageSelectorProps> = ({
  locale,
  onChange,
  ariaLabel,
  disabled = false,
}) => {
  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>): void => {
    const nextLocale = event.currentTarget.value;

    if (isSupportedLocale(nextLocale)) {
      onChange(nextLocale);
    }
  };

  return (
    <select
      className="language-selector"
      value={locale}
      aria-label={ariaLabel}
      disabled={disabled}
      onChange={handleChange}
    >
      <option value="en">English</option>
      <option value="zh-CN">中文</option>
    </select>
  );
};

export default LanguageSelector;
