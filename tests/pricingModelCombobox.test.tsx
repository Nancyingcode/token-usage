// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import PricingModelCombobox from '../src/renderer/components/PricingModelCombobox';
import type { PricingModelOption } from '../src/renderer/utils/pricingModelOptions';

const OPTIONS: PricingModelOption[] = [
  { kind: 'unknown', key: 'unknown', disabled: true },
  { kind: 'model', key: 'model:gpt-priced', modelId: 'gpt-priced', pricingState: 'priced' },
  {
    kind: 'model',
    key: 'model:future-model',
    modelId: 'future-model',
    pricingState: 'unpriced',
  },
];

const renderCombobox = (onChange = vi.fn(), error?: string) => {
  render(
    <PricingModelCombobox
      value=""
      options={OPTIONS}
      label="Model ID"
      pricedLabel="Priced"
      unpricedLabel="Unpriced"
      unknownModelLabel="Unknown model"
      unknownModelDescription="Missing Model ID; a price cannot be added."
      emptyLabel="No options available"
      error={error}
      onChange={onChange}
    />
  );

  return { input: screen.getByRole('combobox', { name: 'Model ID' }), onChange };
};

describe('PricingModelCombobox', () => {
  it('allows arbitrary new model IDs', () => {
    const { input, onChange } = renderCombobox();

    fireEvent.change(input, { target: { value: 'brand-new-model' } });

    expect(onChange).toHaveBeenLastCalledWith('brand-new-model');
  });

  it('skips the disabled unknown option and selects a model with the keyboard', () => {
    const { input, onChange } = renderCombobox();

    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowDown' });

    const activeOption = document.getElementById(input.getAttribute('aria-activedescendant') ?? '');
    expect(activeOption?.textContent).toContain('gpt-priced');

    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('gpt-priced');
    expect((input as HTMLInputElement).value).toBe('gpt-priced');
    expect(input.getAttribute('aria-expanded')).toBe('false');
  });

  it('selects a concrete option with the mouse but ignores the unknown option', () => {
    const { input, onChange } = renderCombobox();

    fireEvent.focus(input);
    const unknownOption = screen.getByRole('option', { name: /Unknown model/ });
    expect(unknownOption.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(unknownOption);
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('option', { name: /future-model/ }));
    expect(onChange).toHaveBeenCalledWith('future-model');
  });

  it('closes with Escape without changing the value', () => {
    const { input, onChange } = renderCombobox();

    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('announces an empty option list without exposing a fake option', () => {
    render(
      <PricingModelCombobox
        value="custom-model"
        options={[]}
        label="Model ID"
        pricedLabel="Priced"
        unpricedLabel="Unpriced"
        unknownModelLabel="Unknown model"
        unknownModelDescription="Missing Model ID; a price cannot be added."
        emptyLabel="No options available"
        onChange={vi.fn()}
      />
    );

    fireEvent.focus(screen.getByRole('combobox', { name: 'Model ID' }));
    expect(screen.getByRole('status').textContent).toBe('No options available');
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });

  it('exposes field errors through ARIA', () => {
    const { input } = renderCombobox(vi.fn(), 'Model ID is required.');
    const error = screen.getByText('Model ID is required.');

    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe(error.getAttribute('id'));
  });
});
