// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';
import LanguageSelector from '../src/renderer/components/LanguageSelector';
import { createTestI18n } from './helpers/renderWithI18n';

describe('LanguageSelector', () => {
  it('renders both supported languages and reports a valid selection', () => {
    const onChange = vi.fn();
    render(
      <I18nextProvider i18n={createTestI18n('en')}>
        <LanguageSelector locale="en" onChange={onChange} ariaLabel="Language" />
      </I18nextProvider>
    );

    const trigger = screen.getByRole('combobox', { name: 'Language' });
    expect(trigger.textContent).toContain('English');

    fireEvent.click(trigger);
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'English',
      '中文',
    ]);

    fireEvent.click(screen.getByRole('option', { name: '中文' }));
    expect(onChange).toHaveBeenCalledWith('zh-CN');
  });

  it('keeps the menu closed while disabled', () => {
    const onChange = vi.fn();
    render(
      <I18nextProvider i18n={createTestI18n('en')}>
        <LanguageSelector locale="en" onChange={onChange} ariaLabel="Language" disabled />
      </I18nextProvider>
    );

    const trigger = screen.getByRole('combobox', { name: 'Language' }) as HTMLButtonElement;
    expect(trigger.disabled).toBe(true);
    fireEvent.click(trigger);
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });
});
