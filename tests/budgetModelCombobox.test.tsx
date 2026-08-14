// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import BudgetModelCombobox from '../src/renderer/components/BudgetModelCombobox';

const OPTIONS = [
  { key: 'all', target: { kind: 'all' as const } },
  { key: 'unknown', target: { kind: 'unknown' as const } },
  { key: 'model:gpt-test', target: { kind: 'model' as const, modelId: 'gpt-test' } },
];

const renderCombobox = (onChange = vi.fn()) => {
  render(
    <BudgetModelCombobox
      value={{ kind: 'all' }}
      options={OPTIONS}
      label="Model ID"
      allModelsLabel="All models"
      unknownModelLabel="Unknown model"
      emptyLabel="No options available"
      onChange={onChange}
    />
  );

  return { input: screen.getByRole('combobox', { name: 'Model ID' }), onChange };
};

describe('BudgetModelCombobox', () => {
  it('allows arbitrary model IDs', () => {
    const { input, onChange } = renderCombobox();

    fireEvent.change(input, { target: { value: 'future-model' } });

    expect(onChange).toHaveBeenLastCalledWith({ kind: 'model', modelId: 'future-model' });
  });

  it('exposes the active option and selects it with the keyboard', () => {
    const { input, onChange } = renderCombobox();

    fireEvent.focus(input);
    expect(input.getAttribute('aria-expanded')).toBe('true');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    const firstActiveId = input.getAttribute('aria-activedescendant');
    expect(firstActiveId).not.toBeNull();
    expect(document.getElementById(firstActiveId ?? '')?.getAttribute('aria-selected')).toBe(
      'true'
    );

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith({ kind: 'unknown' });
    expect(input.getAttribute('aria-expanded')).toBe('false');
  });

  it('closes with Escape without changing the target', () => {
    const { input, onChange } = renderCombobox();

    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('announces an empty option list without exposing a fake option', () => {
    render(
      <BudgetModelCombobox
        value={{ kind: 'model', modelId: 'custom-model' }}
        options={[]}
        label="Model ID"
        allModelsLabel="All models"
        unknownModelLabel="Unknown model"
        emptyLabel="No options available"
        onChange={vi.fn()}
      />
    );

    fireEvent.focus(screen.getByRole('combobox', { name: 'Model ID' }));
    expect(screen.getByRole('status').textContent).toBe('No options available');
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });

  it('exposes field errors through ARIA', () => {
    render(
      <BudgetModelCombobox
        value={{ kind: 'model', modelId: '' }}
        options={OPTIONS}
        label="Model ID"
        allModelsLabel="All models"
        unknownModelLabel="Unknown model"
        emptyLabel="No options available"
        error="Model ID is required."
        onChange={vi.fn()}
      />
    );

    const input = screen.getByRole('combobox');
    const error = screen.getByText('Model ID is required.');

    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe(error.getAttribute('id'));
  });
});
