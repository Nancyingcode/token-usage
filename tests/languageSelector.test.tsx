import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import LanguageSelector from '../src/renderer/components/LanguageSelector';

interface LanguageSelectorElementProps {
  value: string;
  children: React.ReactNode;
  onChange: (event: React.ChangeEvent<HTMLSelectElement>) => void;
}

describe('LanguageSelector', () => {
  it('renders both supported languages and reports a valid selection', () => {
    const onChange = vi.fn();
    const element = LanguageSelector({
      locale: 'en',
      onChange,
      ariaLabel: 'Language',
    }) as React.ReactElement<LanguageSelectorElementProps>;
    const options = React.Children.toArray(element.props.children);

    expect(element.props.value).toBe('en');
    expect(options.map((option) => (option as React.ReactElement).props.children)).toEqual([
      'English',
      '中文',
    ]);

    element.props.onChange({
      currentTarget: { value: 'zh-CN' },
    } as React.ChangeEvent<HTMLSelectElement>);
    expect(onChange).toHaveBeenCalledWith('zh-CN');
  });

  it('ignores unsupported values from the DOM', () => {
    const onChange = vi.fn();
    const element = LanguageSelector({
      locale: 'en',
      onChange,
      ariaLabel: 'Language',
    }) as React.ReactElement<LanguageSelectorElementProps>;

    element.props.onChange({
      currentTarget: { value: 'fr' },
    } as React.ChangeEvent<HTMLSelectElement>);
    expect(onChange).not.toHaveBeenCalled();
  });
});
