import React from 'react';
import { useTranslation } from 'react-i18next';
import { isSupportedLocale, type SupportedLocale } from '../../shared/i18n/locale';
import SelectMenu, { type SelectMenuOption } from './SelectMenu';

interface LanguageSelectorProps {
  locale: SupportedLocale;
  onChange: (locale: SupportedLocale) => void;
  ariaLabel: string;
  disabled?: boolean;
}

const LANGUAGE_OPTIONS: ReadonlyArray<SelectMenuOption<SupportedLocale>> = [
  { value: 'en', label: 'English' },
  { value: 'zh-CN', label: '中文' },
];

const LanguageSelector: React.FC<LanguageSelectorProps> = ({
  locale,
  onChange,
  ariaLabel,
  disabled = false,
}) => {
  const { t } = useTranslation('common');

  const handleChange = (nextLocale: string): void => {
    if (isSupportedLocale(nextLocale)) {
      onChange(nextLocale);
    }
  };

  return (
    <SelectMenu
      className="language-selector"
      value={locale}
      options={LANGUAGE_OPTIONS}
      ariaLabel={ariaLabel}
      loadingLabel={t('state.loadingOptions')}
      emptyLabel={t('state.noOptions')}
      disabled={disabled}
      onChange={handleChange}
    />
  );
};

export default LanguageSelector;
